import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { RankedItemDto } from 'src/admin/dto/reorder.dto';
import { reorderRanks } from 'src/admin/rank-reorder.util';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { WorkflowCompilerService } from 'src/workflow-engine/workflow-compiler.service';
import type {
  WorkflowSourceConnection,
  WorkflowSourceNode,
} from 'src/workflow-engine/workflow-engine.types';
import {
  CreateWorkflowDto,
  UpdateWorkflowDto,
} from './dto';

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(
    WorkflowService.name,
  );
  private readonly TABLE = 'workflow_definition';

  constructor(
    private readonly tenantContext: TenantContext,
    private readonly compiler: WorkflowCompilerService,
  ) {}

  private get knex() {
    return this.tenantContext.knex;
  }

  async findAll() {
    const rows = await this.knex(
      `${this.TABLE} as workflow`,
    )
      .leftJoin(
        'workflow_revision as revision',
        'workflow.latest_revision_id',
        'revision.id_revision',
      )
      .select(
        'workflow.*',
        'revision.version as revision',
        'revision.is_valid',
        'revision.validation_errors',
      )
      .orderBy('workflow.rank', 'asc')
      .orderBy('workflow.date_created', 'asc');
    return { data: rows };
  }

  async findOne(id: string) {
    const row = await this.knex(
      `${this.TABLE} as workflow`,
    )
      .leftJoin(
        'workflow_revision as revision',
        'workflow.latest_revision_id',
        'revision.id_revision',
      )
      .where('workflow.id_workflow', id)
      .select(
        'workflow.*',
        'revision.version as revision',
        'revision.source_nodes as nodes',
        'revision.source_connections as connections',
        'revision.compiled_ir',
        'revision.is_valid',
        'revision.validation_errors',
      )
      .first();
    if (!row) {
      throw new NotFoundException(
        `Workflow-ul "${id}" nu a fost gasit.`,
      );
    }
    return {
      data: {
        ...row,
        irVersion:
          row.compiled_ir?.irVersion ?? null,
        isValid: Boolean(row.is_valid),
        validationErrors: this.parseArray(
          row.validation_errors,
        ),
        published:
          Boolean(row.active_revision_id) &&
          row.active_revision_id ===
            row.latest_revision_id,
      },
    };
  }

  async create(
    dto: CreateWorkflowDto,
    authorProfileId?: string,
  ) {
    const existing = await this.knex(this.TABLE)
      .where('slug', dto.slug)
      .first();
    if (existing) {
      throw new ConflictException(
        `Un workflow cu slug-ul "${dto.slug}" exista deja.`,
      );
    }
    const nodes = (dto.nodes ??
      []) as WorkflowSourceNode[];
    const connections = (dto.connections ??
      []) as WorkflowSourceConnection[];
    const compilation =
      await this.compiler.compile(
        nodes,
        connections,
      );
    const maxRank = await this.knex(this.TABLE)
      .max('rank as max_rank')
      .first();
    const result = await this.knex.transaction(
      async (trx) => {
        const [workflow] = await trx(this.TABLE)
          .insert({
            name: dto.name,
            slug: dto.slug,
            rank:
              Number(maxRank?.max_rank ?? 0) + 1,
          })
          .returning('*');
        const [revision] = await trx(
          'workflow_revision',
        )
          .insert({
            id_workflow: workflow.id_workflow,
            version: 1,
            source_nodes: JSON.stringify(nodes),
            source_connections:
              JSON.stringify(connections),
            compiled_ir: compilation.ir
              ? JSON.stringify(compilation.ir)
              : null,
            is_valid: compilation.valid,
            validation_errors: JSON.stringify(
              compilation.errors,
            ),
            id_created_by_profile:
              authorProfileId ?? null,
          })
          .returning('*');
        const [updated] = await trx(this.TABLE)
          .where(
            'id_workflow',
            workflow.id_workflow,
          )
          .update({
            latest_revision_id:
              revision.id_revision,
            version: 1,
          })
          .returning('*');
        return this.withRevision(
          updated,
          revision,
          false,
        );
      },
    );
    this.logger.log(
      `Workflow creat: ${result.slug} (${result.id_workflow})`,
    );
    return { data: result };
  }

  async update(
    id: string,
    dto: UpdateWorkflowDto,
    authorProfileId?: string,
  ) {
    const existing = await this.knex(this.TABLE)
      .where('id_workflow', id)
      .first();
    if (!existing) {
      throw new NotFoundException(
        `Workflow-ul "${id}" nu a fost gasit.`,
      );
    }
    if (
      dto.status === 'paused' ||
      dto.status === 'draft'
    ) {
      await this.assertNoLinkedSchedules(
        [existing],
        true,
      );
    }
    const changesGraph =
      dto.nodes !== undefined ||
      dto.connections !== undefined;
    let compilation: Awaited<
      ReturnType<
        WorkflowCompilerService['compile']
      >
    > | null = null;
    let sourceNodes: WorkflowSourceNode[] = [];
    let sourceConnections: WorkflowSourceConnection[] =
      [];

    if (changesGraph) {
      const latest = existing.latest_revision_id
        ? await this.knex('workflow_revision')
            .where(
              'id_revision',
              existing.latest_revision_id,
            )
            .first()
        : null;
      sourceNodes = (dto.nodes ??
        this.parseArray(
          latest?.source_nodes,
        )) as WorkflowSourceNode[];
      sourceConnections = (dto.connections ??
        this.parseArray(
          latest?.source_connections,
        )) as WorkflowSourceConnection[];
      compilation = await this.compiler.compile(
        sourceNodes,
        sourceConnections,
        { workflowId: id },
      );
    }

    const result = await this.knex.transaction(
      async (trx) => {
        const locked = await trx(this.TABLE)
          .where('id_workflow', id)
          .forUpdate()
          .first();
        const patch: Record<string, any> = {
          date_updated: new Date(),
        };
        if (dto.name !== undefined)
          patch.name = dto.name;
        let revision: Record<string, any> | null =
          null;
        let published = false;

        if (changesGraph && compilation) {
          const versionRow = await trx(
            'workflow_revision',
          )
            .where('id_workflow', id)
            .max('version as max_version')
            .first();
          const version =
            Number(versionRow?.max_version ?? 0) +
            1;
          const [insertedRevision] = await trx(
            'workflow_revision',
          )
            .insert({
              id_workflow: id,
              version,
              source_nodes:
                JSON.stringify(sourceNodes),
              source_connections: JSON.stringify(
                sourceConnections,
              ),
              compiled_ir: compilation.ir
                ? JSON.stringify(compilation.ir)
                : null,
              is_valid: compilation.valid,
              validation_errors: JSON.stringify(
                compilation.errors,
              ),
              id_created_by_profile:
                authorProfileId ?? null,
            })
            .returning('*');
          revision = insertedRevision;
          patch.latest_revision_id =
            insertedRevision.id_revision;
          patch.version = version;
          if (
            locked.status === 'active' &&
            compilation.valid
          ) {
            patch.active_revision_id =
              insertedRevision.id_revision;
            published = true;
          }
        }

        if (dto.status === 'active') {
          const validRevision = revision?.is_valid
            ? revision
            : await trx('workflow_revision')
                .where({
                  id_workflow: id,
                  is_valid: true,
                })
                .orderBy('version', 'desc')
                .first();
          if (!validRevision) {
            throw new BadRequestException(
              'Workflow-ul nu are nicio revizie valida care poate fi activata.',
            );
          }
          patch.status = 'active';
          patch.active_revision_id =
            validRevision.id_revision;
          published = true;
        } else if (
          dto.status === 'paused' ||
          dto.status === 'draft'
        ) {
          patch.status = dto.status;
          patch.active_revision_id = null;
        }

        const [updated] = await trx(this.TABLE)
          .where('id_workflow', id)
          .update(patch)
          .returning('*');
        if (
          !revision &&
          updated.latest_revision_id
        ) {
          revision = await trx(
            'workflow_revision',
          )
            .where(
              'id_revision',
              updated.latest_revision_id,
            )
            .first();
        }
        return this.withRevision(
          updated,
          revision,
          published,
        );
      },
    );

    this.logger.log(
      `Workflow actualizat: ${result.slug} revizia ${result.revision}`,
    );
    return { data: result };
  }

  async validate(
    nodes: WorkflowSourceNode[],
    connections: WorkflowSourceConnection[],
    workflowId?: string,
  ) {
    return this.compiler.compile(
      nodes,
      connections,
      { workflowId },
    );
  }

  async reorder(items: RankedItemDto[]) {
    await reorderRanks(this.knex, {
      table: this.TABLE,
      idColumn: 'id_workflow',
      items,
    });
    return this.findAll();
  }

  async remove(id: string) {
    const existing = await this.knex(this.TABLE)
      .where('id_workflow', id)
      .first();
    if (!existing) {
      throw new NotFoundException(
        `Workflow-ul "${id}" nu a fost gasit.`,
      );
    }
    await this.assertNoLinkedActions([existing]);
    await this.assertNoLinkedSchedules([
      existing,
    ]);
    await this.knex(this.TABLE)
      .where('id_workflow', id)
      .del();
    this.logger.log(
      `Workflow sters: ${existing.slug}`,
    );
  }

  async removeMany(ids: string[]) {
    if (!ids?.length) {
      throw new BadRequestException(
        'Lista de id-uri este goala.',
      );
    }
    const workflows = await this.knex(
      this.TABLE,
    ).whereIn('id_workflow', ids);
    await this.assertNoLinkedActions(workflows);
    await this.assertNoLinkedSchedules(workflows);
    const deletedCount = await this.knex(
      this.TABLE,
    )
      .whereIn('id_workflow', ids)
      .del();
    return {
      message: `${deletedCount} workflow-uri au fost sterse.`,
    };
  }

  async activate(id: string) {
    const result = await this.update(id, {
      status: 'active',
    });
    this.logger.log(
      `Workflow activat: ${result.data.slug}`,
    );
    return result;
  }

  async deactivate(id: string) {
    const existing = await this.knex(this.TABLE)
      .where('id_workflow', id)
      .first();
    if (!existing) {
      throw new NotFoundException(
        `Workflow-ul "${id}" nu a fost gasit.`,
      );
    }
    await this.assertNoLinkedSchedules(
      [existing],
      true,
    );
    await this.knex(this.TABLE)
      .where('id_workflow', id)
      .update({
        status: 'paused',
        active_revision_id: null,
        date_updated: new Date(),
      });
    this.logger.log(
      `Workflow dezactivat: ${existing.slug}`,
    );
    return this.findOne(id);
  }

  private async assertNoLinkedActions(
    workflows: Record<string, any>[],
  ) {
    const errors: string[] = [];
    for (const workflow of workflows) {
      const actions = await this.knex(
        'action_definition',
      )
        .select('name')
        .where(
          'id_workflow',
          workflow.id_workflow,
        );
      if (actions.length) {
        errors.push(
          `Workflow-ul "${workflow.name}" este asociat cu: ${actions
            .map((action) => `"${action.name}"`)
            .join(', ')}.`,
        );
      }
    }
    if (errors.length)
      throw new ConflictException(
        errors.join(' '),
      );
  }

  private async assertNoLinkedSchedules(
    workflows: Record<string, any>[],
    activeOnly = false,
  ) {
    const errors: string[] = [];
    for (const workflow of workflows) {
      let query = this.knex('workflow_schedule')
        .select('name')
        .where(
          'id_workflow',
          workflow.id_workflow,
        );
      if (activeOnly) {
        query = query.where('is_active', true);
      }
      const schedules = await query;
      if (schedules.length) {
        errors.push(
          `Workflow-ul "${workflow.name}" are programari ${activeOnly ? 'active' : 'asociate'}: ${schedules
            .map(
              (schedule) => `"${schedule.name}"`,
            )
            .join(', ')}.`,
        );
      }
    }
    if (errors.length) {
      throw new ConflictException(
        `${errors.join(' ')} Pune programarile in pauza sau sterge-le mai intai.`,
      );
    }
  }

  private withRevision(
    workflow: Record<string, any>,
    revision: Record<string, any> | null,
    published: boolean,
  ): Record<string, any> {
    return {
      ...workflow,
      revision:
        revision?.version ?? workflow.version,
      irVersion:
        revision?.compiled_ir?.irVersion ?? null,
      isValid: Boolean(revision?.is_valid),
      validationErrors: this.parseArray(
        revision?.validation_errors,
      ),
      published,
    };
  }

  private parseArray(value: unknown): any[] {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
