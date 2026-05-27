import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OnEvent } from '@nestjs/event-emitter';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { EntityEvent } from 'src/events/entity-event.enum';
import type { EntityEventPayload } from 'src/events/entity-event.payload';
import { WorkflowSyncService } from 'src/n8n/workflow-sync.service';
import { CreateActionDto, UpdateActionDto } from './dto';

@Injectable()
export class ActionService {
  private readonly logger = new Logger(ActionService.name);
  private readonly TABLE = 'action_definition';

  constructor(
    private readonly tenantContext: TenantContext,
    private readonly eventEmitter: EventEmitter2,
    private readonly workflowSync: WorkflowSyncService,
  ) {}

  private get knex() {
    return this.tenantContext.knex;
  }

  // ─── CRUD ───

  async findAll(entityId?: string) {
    let query = this.knex(this.TABLE)
      .select('action_definition.*', 'workflow_definition.name as workflow_name')
      .leftJoin(
        'workflow_definition',
        'action_definition.id_workflow',
        'workflow_definition.id_workflow',
      )
      .orderBy('action_definition.rank', 'asc');

    if (entityId) {
      query = query.where('action_definition.id_entity', entityId);
    }

    const rows = await query;
    return { data: rows };
  }

  async findByEntitySlug(entitySlug: string) {
    const entity = await this.knex('entity').where('slug', entitySlug).first();
    if (!entity) {
      throw new NotFoundException(`Entitatea "${entitySlug}" nu exista.`);
    }

    const rows = await this.knex(this.TABLE)
      .select('action_definition.*', 'workflow_definition.name as workflow_name')
      .leftJoin(
        'workflow_definition',
        'action_definition.id_workflow',
        'workflow_definition.id_workflow',
      )
      .where('action_definition.id_entity', entity.id_entity)
      .andWhere('action_definition.is_active', true)
      .andWhere('action_definition.show_in_ui', true)
      .orderBy('action_definition.rank', 'asc');

    return { data: rows };
  }

  async findOne(id: string) {
    const row = await this.knex(this.TABLE).where('id_action', id).first();
    if (!row) {
      throw new NotFoundException(`Actiunea "${id}" nu a fost gasita.`);
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
      const wf = await this.knex('workflow_definition')
        .where('id_workflow', dto.id_workflow)
        .first();
      if (!wf) {
        throw new NotFoundException(
          `Workflow-ul cu id "${dto.id_workflow}" nu exista.`,
        );
      }
    }

    const [row] = await this.knex(this.TABLE)
      .insert({
        id_entity: dto.id_entity,
        name: dto.name,
        slug: dto.slug,
        show_in_ui: dto.show_in_ui ?? true,
        trigger_events: JSON.stringify(dto.trigger_events ?? []),
        trigger_conditions: dto.trigger_conditions
          ? JSON.stringify(dto.trigger_conditions)
          : null,
        id_workflow: dto.id_workflow ?? null,
        config: JSON.stringify(dto.config ?? {}),
        is_active: dto.is_active ?? true,
        rank: dto.rank ?? 0,
      })
      .returning('*');

    this.logger.log(
      `Actiune creata: ${row.slug} pe entitate ${entity.slug}`,
    );
    return { data: row };
  }

  async update(id: string, dto: UpdateActionDto) {
    const existing = await this.knex(this.TABLE)
      .where('id_action', id)
      .first();
    if (!existing) {
      throw new NotFoundException(`Actiunea "${id}" nu a fost gasita.`);
    }

    if (dto.id_workflow) {
      const wf = await this.knex('workflow_definition')
        .where('id_workflow', dto.id_workflow)
        .first();
      if (!wf) {
        throw new NotFoundException(
          `Workflow-ul cu id "${dto.id_workflow}" nu exista.`,
        );
      }
    }

    const patch: Record<string, any> = { date_updated: new Date() };

    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.show_in_ui !== undefined) patch.show_in_ui = dto.show_in_ui;
    if (dto.trigger_events !== undefined)
      patch.trigger_events = JSON.stringify(dto.trigger_events);
    if (dto.trigger_conditions !== undefined)
      patch.trigger_conditions = JSON.stringify(dto.trigger_conditions);
    if (dto.id_workflow !== undefined) patch.id_workflow = dto.id_workflow;
    if (dto.config !== undefined) patch.config = JSON.stringify(dto.config);
    if (dto.is_active !== undefined) patch.is_active = dto.is_active;
    if (dto.rank !== undefined) patch.rank = dto.rank;

    const [row] = await this.knex(this.TABLE)
      .where('id_action', id)
      .update(patch)
      .returning('*');

    this.logger.log(`Actiune actualizata: ${row.slug}`);
    return { data: row };
  }

  async remove(id: string) {
    const existing = await this.knex(this.TABLE)
      .where('id_action', id)
      .first();
    if (!existing) {
      throw new NotFoundException(`Actiunea "${id}" nu a fost gasita.`);
    }

    await this.knex(this.TABLE).where('id_action', id).del();
    this.logger.log(`Actiune stearsa: ${existing.slug}`);
  }

  // ─── Manual execution ───

  async executeManual(
    entitySlug: string,
    actionSlug: string,
    recordId: string,
    userId: string,
  ) {
    const entity = await this.knex('entity').where('slug', entitySlug).first();
    if (!entity) {
      throw new NotFoundException(`Entitatea "${entitySlug}" nu exista.`);
    }

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

    const record = await this.knex(entity.table_name)
      .where('id', recordId)
      .first();
    if (!record) {
      throw new NotFoundException(
        `Inregistrarea "${recordId}" nu exista in "${entitySlug}".`,
      );
    }

    this.logger.log(
      `Executare manuala: ${actionSlug} pe ${entitySlug}#${recordId} de ${userId}`,
    );

    if (!action.id_workflow) {
      throw new BadRequestException(
        `Actiunea "${actionSlug}" nu are un workflow asociat.`,
      );
    }

    try {
      const { result } = await this.workflowSync.executeWorkflow(
        action.id_workflow,
        {
          trigger: 'action',
          action: actionSlug,
          entity: entitySlug,
          entityId: entity.id_entity,
          recordId,
          record,
          userId,
          tenant: this.tenantContext.slug,
          dbName: this.tenantContext.dbName,
          timestamp: new Date().toISOString(),
        },
      );

      // Check n8n response for CRM errors propagated through HTTP Request nodes
      const errorMessages = this.extractCrmErrors(result);
      if (errorMessages.length > 0) {
        throw new BadRequestException(errorMessages);
      }

      return {
        executed: true,
        action: action.slug,
        recordId,
      };
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof NotFoundException) {
        throw err;
      }
      // If the error message looks like a CRM business error (not an n8n infra error),
      // pass it through cleanly so the user sees the validation message directly.
      const msg = err.message ?? '';
      const isN8nInfra = msg.startsWith('n8n') || msg.includes('workflow');
      this.logger.error(
        `Eroare la executia workflow-ului "${action.id_workflow}": ${msg}`,
      );
      throw new BadRequestException(
        isN8nInfra ? `Eroare la executia workflow-ului: ${msg}` : msg,
      );
    }
  }

  /**
   * Parse n8n webhook response (array of items from last node) looking for
   * CRM error patterns like { success: false, message: "..." }.
   */
  private extractCrmErrors(n8nResult: any): string[] {
    const messages: string[] = [];
    const items = Array.isArray(n8nResult) ? n8nResult : [n8nResult];

    for (const item of items) {
      const json = item?.json ?? item;
      if (!json || typeof json !== 'object') continue;

      if (json.success === false) {
        if (Array.isArray(json.message)) {
          messages.push(...json.message);
        } else if (typeof json.message === 'string') {
          messages.push(json.message);
        }
      }
    }

    return messages;
  }

  // ─── Auto-trigger listeners ───

  @OnEvent('entity.after_insert.**')
  async onAfterInsert(payload: unknown) {
    await this.evaluateAutoTriggers(
      EntityEvent.AfterInsert,
      payload as EntityEventPayload,
    );
  }

  @OnEvent('entity.after_update.**')
  async onAfterUpdate(payload: unknown) {
    await this.evaluateAutoTriggers(
      EntityEvent.AfterUpdate,
      payload as EntityEventPayload,
    );
  }

  @OnEvent('entity.after_delete.**')
  async onAfterDelete(payload: unknown) {
    await this.evaluateAutoTriggers(
      EntityEvent.AfterDelete,
      payload as EntityEventPayload,
    );
  }

  @OnEvent('entity.before_insert.**')
  async onBeforeInsert(payload: unknown) {
    await this.evaluateAutoTriggers(
      EntityEvent.BeforeInsert,
      payload as EntityEventPayload,
    );
  }

  @OnEvent('entity.before_update.**')
  async onBeforeUpdate(payload: unknown) {
    await this.evaluateAutoTriggers(
      EntityEvent.BeforeUpdate,
      payload as EntityEventPayload,
    );
  }

  @OnEvent('entity.before_delete.**')
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

    const matched = allActions.filter((action) => {
      const events: string[] = action.trigger_events ?? [];
      return events.includes(event);
    });

    for (const action of matched) {
      if (!this.matchesConditions(action.trigger_conditions, payload)) {
        continue;
      }

      this.logger.log(
        `Auto-trigger: ${action.slug} (${event}) pe ${payload.entitySlug}#${payload.recordId}`,
      );

      await this.emitActionExecuted(action, {
        entitySlug: payload.entitySlug,
        entityId: payload.entityId,
        recordId: payload.recordId,
        record: payload.data,
        userId: payload.userId,
      });
    }
  }

  private async emitActionExecuted(
    action: Record<string, any>,
    context: {
      entitySlug: string;
      entityId: string;
      recordId: string | null;
      record: Record<string, any>;
      userId: string | null;
    },
  ) {
    await this.eventEmitter.emitAsync('action.executed', {
      actionId: action.id_action,
      actionSlug: action.slug,
      workflowId: action.id_workflow,
      entitySlug: context.entitySlug,
      entityId: context.entityId,
      recordId: context.recordId,
      record: context.record,
      userId: context.userId,
      tenantSlug: this.tenantContext.slug,
      tenantDb: this.tenantContext.dbName,
      timestamp: new Date(),
    });
  }

  private matchesConditions(
    conditions: any,
    payload: EntityEventPayload,
  ): boolean {
    if (!conditions) return true;

    const condList = Array.isArray(conditions) ? conditions : [conditions];
    const data = payload.data ?? {};

    return condList.every((cond: any) => {
      if (!cond.field || !cond.operator) return true;

      const fieldValue = data[cond.field];

      switch (cond.operator) {
        case 'eq':
          return fieldValue === cond.value;
        case 'neq':
          return fieldValue !== cond.value;
        case 'in':
          return Array.isArray(cond.value) && cond.value.includes(fieldValue);
        case 'contains':
          return (
            typeof fieldValue === 'string' &&
            fieldValue.includes(String(cond.value))
          );
        default:
          return true;
      }
    });
  }
}
