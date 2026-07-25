import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { EntityEvent } from 'src/events/entity-event.enum';
import type { EntityEventPayload } from 'src/events/entity-event.payload';
import {
  CreateActionDto,
  UpdateActionDto,
} from './dto';
import { AuthorizationService } from 'src/security/authorization.service';
import { AuthenticatedUser } from 'src/security/security.types';
import type { RankedItemDto } from 'src/admin/dto/reorder.dto';
import { reorderRanks } from 'src/admin/rank-reorder.util';
import { WorkflowRuntimeService } from 'src/workflow-engine/workflow-runtime.service';
import type { WorkflowExecutionInput } from 'src/workflow-engine/workflow-engine.types';
import { WorkflowCompilerService } from 'src/workflow-engine/workflow-compiler.service';

@Injectable()
export class ActionService {
  private readonly logger = new Logger(
    ActionService.name,
  );
  private readonly TABLE = 'action_definition';

  constructor(
    private readonly tenantContext: TenantContext,
    private readonly workflowRuntime: WorkflowRuntimeService,
    private readonly workflowCompiler: WorkflowCompilerService,
    private readonly authorization: AuthorizationService,
  ) {}

  private get knex() {
    return this.tenantContext.knex;
  }

  // ─── CRUD ───

  async findAll(entityId?: string) {
    let query = this.knex(this.TABLE)
      .select(
        'action_definition.*',
        'workflow_definition.name as workflow_name',
      )
      .leftJoin(
        'workflow_definition',
        'action_definition.id_workflow',
        'workflow_definition.id_workflow',
      )
      .orderBy('action_definition.rank', 'asc');

    if (entityId) {
      query = query.where(
        'action_definition.id_entity',
        entityId,
      );
    }

    const rows = await query;
    return { data: rows };
  }

  async findByEntitySlug(
    entitySlug: string,
    actor: AuthenticatedUser,
  ) {
    const entity = await this.knex('entity')
      .where('slug', entitySlug)
      .first();
    if (!entity) {
      throw new NotFoundException(
        `Entitatea "${entitySlug}" nu exista.`,
      );
    }
    await this.authorization.require(
      actor,
      entity.id_entity,
      'update',
    );

    const rows = await this.knex(this.TABLE)
      .select(
        'action_definition.*',
        'workflow_definition.name as workflow_name',
      )
      .leftJoin(
        'workflow_definition',
        'action_definition.id_workflow',
        'workflow_definition.id_workflow',
      )
      .where(
        'action_definition.id_entity',
        entity.id_entity,
      )
      .andWhere(
        'action_definition.is_active',
        true,
      )
      .andWhere(
        'action_definition.show_in_ui',
        true,
      )
      .orderBy('action_definition.rank', 'asc');

    return { data: rows };
  }

  async findOne(id: string) {
    const row = await this.knex(this.TABLE)
      .where('id_action', id)
      .first();
    if (!row) {
      throw new NotFoundException(
        `Actiunea "${id}" nu a fost gasita.`,
      );
    }
    return { data: row };
  }

  async create(dto: CreateActionDto) {
    const existing = await this.knex(this.TABLE)
      .where('slug', dto.slug)
      .first();
    if (existing) {
      throw new ConflictException(
        `O actiune cu slug-ul "${dto.slug}" exista deja.`,
      );
    }

    const entity = await this.knex('entity')
      .where('id_entity', dto.id_entity)
      .first();
    if (!entity) {
      throw new NotFoundException(
        `Entitatea cu id "${dto.id_entity}" nu exista.`,
      );
    }

    if (dto.id_workflow) {
      const wf = await this.knex(
        'workflow_definition',
      )
        .where('id_workflow', dto.id_workflow)
        .first();
      if (!wf) {
        throw new NotFoundException(
          `Workflow-ul cu id "${dto.id_workflow}" nu exista.`,
        );
      }
      if (dto.is_active !== false) {
        await this.assertWorkflowCompatible(
          dto.id_workflow,
          dto.trigger_events ?? [],
        );
      }
    }

    const maxRank = await this.knex(this.TABLE)
      .where('id_entity', dto.id_entity)
      .max('rank as max_rank')
      .first();

    const [row] = await this.knex(this.TABLE)
      .insert({
        id_entity: dto.id_entity,
        name: dto.name,
        slug: dto.slug,
        show_in_ui: dto.show_in_ui ?? true,
        trigger_events: JSON.stringify(
          dto.trigger_events ?? [],
        ),
        trigger_conditions: dto.trigger_conditions
          ? JSON.stringify(dto.trigger_conditions)
          : null,
        id_workflow: dto.id_workflow ?? null,
        config: JSON.stringify(dto.config ?? {}),
        is_active: dto.is_active ?? true,
        rank:
          dto.rank ??
          Number(maxRank?.max_rank ?? 0) + 1,
        description: dto.description ?? null,
      })
      .returning('*');

    this.logger.log(
      `Actiune creata: ${row.slug} pe entitate ${entity.slug}`,
    );
    return { data: row };
  }

  async reorder(items: RankedItemDto[]) {
    const ids = items.map((item) => item.id);
    const actions = await this.knex(this.TABLE)
      .select('id_action', 'id_entity')
      .whereIn('id_action', ids);

    if (actions.length !== items.length) {
      throw new BadRequestException(
        'Lista de reordonare contine actiuni inexistente.',
      );
    }

    const entityIds = new Set(
      actions.map((action) => action.id_entity),
    );
    if (entityIds.size !== 1) {
      throw new BadRequestException(
        'Actiunile pot fi reordonate doar in interiorul aceleiasi entitati.',
      );
    }

    const entityId = actions[0].id_entity;
    await reorderRanks(this.knex, {
      table: this.TABLE,
      idColumn: 'id_action',
      items,
      scope: { id_entity: entityId },
    });
    return this.findAll(entityId);
  }

  async update(id: string, dto: UpdateActionDto) {
    const existing = await this.knex(this.TABLE)
      .where('id_action', id)
      .first();
    if (!existing) {
      throw new NotFoundException(
        `Actiunea "${id}" nu a fost gasita.`,
      );
    }

    if (dto.id_workflow) {
      const wf = await this.knex(
        'workflow_definition',
      )
        .where('id_workflow', dto.id_workflow)
        .first();
      if (!wf) {
        throw new NotFoundException(
          `Workflow-ul cu id "${dto.id_workflow}" nu exista.`,
        );
      }
    }
    const nextWorkflowId =
      dto.id_workflow ?? existing.id_workflow;
    if (
      nextWorkflowId &&
      (dto.is_active ?? existing.is_active) &&
      (dto.id_workflow !== undefined ||
        dto.trigger_events !== undefined ||
        dto.is_active === true)
    ) {
      await this.assertWorkflowCompatible(
        nextWorkflowId,
        dto.trigger_events ??
          this.parseArray(
            existing.trigger_events,
          ),
        existing.id_action,
      );
    }

    const patch: Record<string, any> = {
      date_updated: new Date(),
    };

    if (dto.name !== undefined)
      patch.name = dto.name;
    if (dto.show_in_ui !== undefined)
      patch.show_in_ui = dto.show_in_ui;
    if (dto.trigger_events !== undefined)
      patch.trigger_events = JSON.stringify(
        dto.trigger_events,
      );
    if (dto.trigger_conditions !== undefined)
      patch.trigger_conditions = JSON.stringify(
        dto.trigger_conditions,
      );
    if (dto.id_workflow !== undefined)
      patch.id_workflow = dto.id_workflow;
    if (dto.config !== undefined)
      patch.config = JSON.stringify(dto.config);
    if (dto.is_active !== undefined)
      patch.is_active = dto.is_active;
    if (dto.rank !== undefined)
      patch.rank = dto.rank;
    if (dto.description !== undefined)
      patch.description = dto.description;

    const [row] = await this.knex(this.TABLE)
      .where('id_action', id)
      .update(patch)
      .returning('*');

    this.logger.log(
      `Actiune actualizata: ${row.slug}`,
    );
    return { data: row };
  }

  async remove(id: string) {
    const existing = await this.knex(this.TABLE)
      .where('id_action', id)
      .first();
    if (!existing) {
      throw new NotFoundException(
        `Actiunea "${id}" nu a fost gasita.`,
      );
    }

    await this.knex(this.TABLE)
      .where('id_action', id)
      .del();
    this.logger.log(
      `Actiune stearsa: ${existing.slug}`,
    );
  }

  async removeMany(ids: string[]) {
    if (!ids || ids.length === 0) {
      throw new BadRequestException(
        'Lista de id-uri este goala.',
      );
    }

    const deletedCount = await this.knex(
      this.TABLE,
    )
      .whereIn('id_action', ids)
      .del();

    this.logger.log(
      `${deletedCount} actiuni sterse in bulk`,
    );
    return {
      message: `${deletedCount} actiuni au fost sterse.`,
    };
  }

  // ─── Manual execution ───

  async executeManual(
    entitySlug: string,
    actionSlug: string,
    recordId: string,
    actor: AuthenticatedUser,
  ) {
    const entity = await this.knex('entity')
      .where('slug', entitySlug)
      .first();
    if (!entity) {
      throw new NotFoundException(
        `Entitatea "${entitySlug}" nu exista.`,
      );
    }
    const scope =
      await this.authorization.require(
        actor,
        entity.id_entity,
        'update',
      );

    const action = await this.knex(this.TABLE)
      .where('slug', actionSlug)
      .andWhere('id_entity', entity.id_entity)
      .andWhere('is_active', true)
      .first();

    if (!action) {
      throw new NotFoundException(
        `Actiunea "${actionSlug}" nu exista sau nu este activa pe entitatea "${entitySlug}".`,
      );
    }

    const recordQuery = this.knex(
      entity.table_name,
    ).where('id', recordId);
    this.authorization.applyScope(
      recordQuery,
      entity.table_name,
      scope,
      actor.profileId,
    );
    const record = await recordQuery.first();
    if (!record) {
      throw new NotFoundException(
        `Inregistrarea "${recordId}" nu exista in "${entitySlug}".`,
      );
    }

    this.logger.log(
      `Executare manuala: ${actionSlug} pe ${entitySlug}#${recordId} de profilul ${actor.profileId}`,
    );

    if (!action.id_workflow) {
      throw new BadRequestException(
        `Actiunea "${actionSlug}" nu are un workflow asociat.`,
      );
    }

    try {
      const result =
        await this.workflowRuntime.execute(
          action.id_workflow,
          {
            trigger: 'manual',
            triggerName: actionSlug,
            entitySlug,
            entityId: entity.id_entity,
            recordId,
            record,
            actor,
          },
        );

      return {
        executed: true,
        action: action.slug,
        recordId,
        executionId: result.executionId,
        status: result.status,
        output: result.output,
      };
    } catch (err) {
      const msg =
        (err as Error)?.message ??
        'Eroare necunoscuta';
      const executionId = (err as any)
        ?.executionId;
      if (executionId) {
        throw new BadRequestException({
          message: msg,
          executionId,
          status: 'failed',
        });
      }
      if (
        err instanceof BadRequestException ||
        err instanceof NotFoundException
      ) {
        throw err;
      }
      this.logger.error(
        `Eroare la executia workflow-ului "${action.id_workflow}" / ${action.slug}: ${msg}`,
      );
      throw new BadRequestException(msg);
    }
  }

  // ─── Auto-trigger listeners ───

  @OnEvent('entity.after_insert.*')
  async onAfterInsert(payload: unknown) {
    await this.evaluateAutoTriggers(
      EntityEvent.AfterInsert,
      payload as EntityEventPayload,
    );
  }

  @OnEvent('entity.after_update.*')
  async onAfterUpdate(payload: unknown) {
    await this.evaluateAutoTriggers(
      EntityEvent.AfterUpdate,
      payload as EntityEventPayload,
    );
  }

  @OnEvent('entity.after_delete.*')
  async onAfterDelete(payload: unknown) {
    await this.evaluateAutoTriggers(
      EntityEvent.AfterDelete,
      payload as EntityEventPayload,
    );
  }

  @OnEvent('entity.before_insert.*')
  async onBeforeInsert(payload: unknown) {
    await this.evaluateAutoTriggers(
      EntityEvent.BeforeInsert,
      payload as EntityEventPayload,
    );
  }

  @OnEvent('entity.before_update.*')
  async onBeforeUpdate(payload: unknown) {
    await this.evaluateAutoTriggers(
      EntityEvent.BeforeUpdate,
      payload as EntityEventPayload,
    );
  }

  @OnEvent('entity.before_delete.*')
  async onBeforeDelete(payload: unknown) {
    await this.evaluateAutoTriggers(
      EntityEvent.BeforeDelete,
      payload as EntityEventPayload,
    );
  }

  private async evaluateAutoTriggers(
    event: EntityEvent,
    payload: EntityEventPayload,
  ) {
    if (!this.tenantContext.isAvailable) return;

    const allActions = await this.knex(this.TABLE)
      .where('id_entity', payload.entityId)
      .andWhere('is_active', true);

    const matched = allActions.filter(
      (action) => {
        const events: string[] =
          action.trigger_events ?? [];
        const shortEvent = event.replace(
          'entity.',
          '',
        ); // backward compat: 'entity.before_insert' → 'before_insert'
        return (
          events.includes(event) ||
          events.includes(shortEvent)
        );
      },
    );

    const isBeforeEvent = [
      EntityEvent.BeforeInsert,
      EntityEvent.BeforeUpdate,
      EntityEvent.BeforeDelete,
    ].includes(event);

    for (const action of matched) {
      if (
        !this.matchesConditions(
          action.trigger_conditions,
          payload,
        )
      ) {
        continue;
      }

      this.logger.log(
        `Auto-trigger: ${action.slug} (${event}) pe ${payload.entitySlug}#${payload.recordId}`,
      );

      if (!action.id_workflow) continue;

      if (isBeforeEvent) {
        try {
          const result =
            await this.workflowRuntime.execute(
              action.id_workflow,
              this.buildWorkflowInput(
                action,
                payload,
                event,
              ),
            );
          const normalized =
            await this.normalizeWorkflowOutput(
              payload.entityId,
              result.output,
            );
          if (
            event !== EntityEvent.BeforeDelete
          ) {
            Object.assign(
              payload.data,
              normalized,
            );
          }
          this.logger.log(
            `Before workflow: ${action.slug} -> ${Object.keys(normalized).join(', ')}`,
          );
        } catch (err) {
          const msg =
            (err as Error)?.message ??
            'Eroare necunoscuta';
          const executionId = (err as any)
            ?.executionId;
          this.logger.error(
            `Before workflow "${action.slug}" a esuat: ${msg}`,
          );
          throw new BadRequestException(
            executionId
              ? {
                  message: `Actiunea automata "${action.name}" a esuat: ${msg}`,
                  executionId,
                  status: 'failed',
                }
              : `Actiunea automata "${action.name}" a esuat: ${msg}`,
          );
        }
      } else {
        try {
          await this.workflowRuntime.execute(
            action.id_workflow,
            this.buildWorkflowInput(
              action,
              payload,
              event,
            ),
          );
        } catch (error) {
          this.logger.error(
            `After workflow "${action.slug}" a esuat, dar operatia CRUD ramane reusita: ${(error as Error)?.message ?? 'Eroare necunoscuta'}`,
          );
        }
      }
    }
  }

  private async normalizeWorkflowOutput(
    entityId: string,
    collected: Record<string, any>,
  ): Promise<Record<string, any>> {
    const fields = await this.knex('field')
      .select('slug', 'column_name')
      .where('id_entity', entityId);

    const slugToColumn = new Map<
      string,
      string
    >();
    const columnNames = new Set<string>();
    for (const field of fields) {
      slugToColumn.set(
        field.slug,
        field.column_name,
      );
      columnNames.add(field.column_name);
    }

    const normalized: Record<string, any> = {};
    for (const [key, value] of Object.entries(
      collected,
    )) {
      const columnName = columnNames.has(key)
        ? key
        : slugToColumn.get(key);
      if (!columnName) continue;
      normalized[columnName] = value;
    }

    return normalized;
  }

  private buildWorkflowInput(
    action: Record<string, any>,
    payload: EntityEventPayload,
    event: EntityEvent,
  ): WorkflowExecutionInput {
    return {
      trigger: event,
      triggerName: action.slug,
      entitySlug: payload.entitySlug,
      entityId: payload.entityId,
      recordId: payload.recordId,
      record: this.buildWorkflowRecord(payload),
      previousData: payload.previousData,
      actor: payload.actor,
    };
  }

  private buildWorkflowRecord(
    payload: EntityEventPayload,
  ): Record<string, any> {
    if (payload.previousData) {
      return {
        ...payload.previousData,
        ...payload.data,
      };
    }
    return payload.data;
  }

  private async assertWorkflowCompatible(
    workflowId: string,
    triggerEvents: string[],
    excludedActionId?: string,
  ) {
    const workflow = await this.knex(
      'workflow_definition',
    )
      .where('id_workflow', workflowId)
      .first();
    if (!workflow?.latest_revision_id) return;
    const revision = await this.knex(
      'workflow_revision',
    )
      .where(
        'id_revision',
        workflow.latest_revision_id,
      )
      .first();
    if (!revision) return;
    let query = this.knex('action_definition')
      .where({
        id_workflow: workflowId,
        is_active: true,
      })
      .select('trigger_events');
    if (excludedActionId) {
      query = query.whereNot(
        'id_action',
        excludedActionId,
      );
    }
    const linked = await query;
    const allEvents = [
      ...linked.flatMap((action) =>
        this.parseArray(action.trigger_events),
      ),
      ...triggerEvents,
    ];
    const result =
      await this.workflowCompiler.compile(
        this.parseArray(revision.source_nodes),
        this.parseArray(
          revision.source_connections,
        ),
        { triggerEvents: allEvents },
      );
    if (!result.valid) {
      throw new BadRequestException(
        result.errors.map(
          (error) => error.message,
        ),
      );
    }
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

  private matchesConditions(
    conditions: any,
    payload: EntityEventPayload,
  ): boolean {
    if (!conditions) return true;

    const condList = Array.isArray(conditions)
      ? conditions
      : [conditions];
    const data = payload.data ?? {};

    return condList.every((cond: any) => {
      if (!cond.field || !cond.operator)
        return true;

      const fieldValue = data[cond.field];

      switch (cond.operator) {
        case 'eq':
          return fieldValue === cond.value;
        case 'neq':
          return fieldValue !== cond.value;
        case 'in':
          return (
            Array.isArray(cond.value) &&
            cond.value.includes(fieldValue)
          );
        case 'contains':
          return (
            typeof fieldValue === 'string' &&
            fieldValue.includes(
              String(cond.value),
            )
          );
        default:
          return true;
      }
    });
  }
}
