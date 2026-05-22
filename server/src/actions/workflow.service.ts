import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { WorkflowSyncService } from 'src/n8n/workflow-sync.service';
import { CreateWorkflowDto, UpdateWorkflowDto } from './dto';

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);
  private readonly TABLE = 'workflow_definition';

  constructor(
    private readonly tenantContext: TenantContext,
    private readonly syncService: WorkflowSyncService,
  ) {}

  private get knex() {
    return this.tenantContext.knex;
  }

  async findAll() {
    const rows = await this.knex(this.TABLE)
      .select('*')
      .orderBy('date_created', 'desc');
    return { data: rows };
  }

  async findOne(id: string) {
    const row = await this.knex(this.TABLE).where('id_workflow', id).first();
    if (!row) {
      throw new NotFoundException(`Workflow-ul "${id}" nu a fost gasit.`);
    }
    return { data: row };
  }

  async create(dto: CreateWorkflowDto) {
    const existing = await this.knex(this.TABLE)
      .where('slug', dto.slug)
      .first();
    if (existing) {
      throw new ConflictException(
        `Un workflow cu slug-ul "${dto.slug}" exista deja.`,
      );
    }

    const [row] = await this.knex(this.TABLE)
      .insert({
        name: dto.name,
        slug: dto.slug,
        nodes: JSON.stringify(dto.nodes ?? []),
        connections: JSON.stringify(dto.connections ?? []),
      })
      .returning('*');

    this.logger.log(`Workflow creat: ${row.slug} (${row.id_workflow})`);
    return { data: row };
  }

  async update(id: string, dto: UpdateWorkflowDto) {
    const existing = await this.knex(this.TABLE)
      .where('id_workflow', id)
      .first();
    if (!existing) {
      throw new NotFoundException(`Workflow-ul "${id}" nu a fost gasit.`);
    }

    const patch: Record<string, any> = { date_updated: new Date() };

    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.status !== undefined) patch.status = dto.status;
    if (dto.nodes !== undefined) patch.nodes = JSON.stringify(dto.nodes);
    if (dto.connections !== undefined)
      patch.connections = JSON.stringify(dto.connections);

    if (dto.nodes !== undefined || dto.connections !== undefined) {
      patch.version = existing.version + 1;
    }

    const [row] = await this.knex(this.TABLE)
      .where('id_workflow', id)
      .update(patch)
      .returning('*');

    if (existing.n8n_workflow_id && (dto.nodes || dto.connections)) {
      await this.syncService.syncWorkflow(id);
    }

    this.logger.log(`Workflow actualizat: ${row.slug} v${row.version}`);
    return { data: row };
  }

  async remove(id: string) {
    const existing = await this.knex(this.TABLE)
      .where('id_workflow', id)
      .first();
    if (!existing) {
      throw new NotFoundException(`Workflow-ul "${id}" nu a fost gasit.`);
    }

    await this.syncService.deleteWorkflow(id);
    await this.knex(this.TABLE).where('id_workflow', id).del();
    this.logger.log(`Workflow sters: ${existing.slug}`);
  }

  async activate(id: string) {
    const existing = await this.knex(this.TABLE)
      .where('id_workflow', id)
      .first();
    if (!existing) {
      throw new NotFoundException(`Workflow-ul "${id}" nu a fost gasit.`);
    }

    const nodes =
      typeof existing.nodes === 'string'
        ? JSON.parse(existing.nodes)
        : existing.nodes;
    if (!nodes || nodes.length === 0) {
      throw new BadRequestException(
        'Workflow-ul nu are noduri definite. Adauga cel putin un nod inainte de activare.',
      );
    }

    await this.syncService.activateWorkflow(id);
    const row = await this.knex(this.TABLE).where('id_workflow', id).first();
    this.logger.log(`Workflow activat: ${existing.slug}`);
    return { data: row };
  }

  async deactivate(id: string) {
    const existing = await this.knex(this.TABLE)
      .where('id_workflow', id)
      .first();
    if (!existing) {
      throw new NotFoundException(`Workflow-ul "${id}" nu a fost gasit.`);
    }

    await this.syncService.deactivateWorkflow(id);
    const row = await this.knex(this.TABLE).where('id_workflow', id).first();
    this.logger.log(`Workflow dezactivat: ${existing.slug}`);
    return { data: row };
  }

  async sync(id: string) {
    const existing = await this.knex(this.TABLE)
      .where('id_workflow', id)
      .first();
    if (!existing) {
      throw new NotFoundException(`Workflow-ul "${id}" nu a fost gasit.`);
    }

    const n8nId = await this.syncService.syncWorkflow(id);
    const row = await this.knex(this.TABLE).where('id_workflow', id).first();
    this.logger.log(`Workflow sincronizat: ${existing.slug} → n8n:${n8nId}`);
    return { data: row };
  }
}
