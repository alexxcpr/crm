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
import { extractValidationError } from 'src/n8n/workflow-error.utils';
import { CreateActionDto, UpdateActionDto } from './dto';
import { AuthorizationService } from 'src/security/authorization.service';
import { AuthenticatedUser } from 'src/security/security.types';

@Injectable()
export class ActionService {
  private readonly logger = new Logger(ActionService.name);
  private readonly TABLE = 'action_definition';

  constructor(
    private readonly tenantContext: TenantContext,
    private readonly eventEmitter: EventEmitter2,
    private readonly workflowSync: WorkflowSyncService,
    private readonly authorization: AuthorizationService,
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

  async findByEntitySlug(entitySlug: string, actor: AuthenticatedUser) {
    const entity = await this.knex('entity').where('slug', entitySlug).first();
    if (!entity) {
      throw new NotFoundException(`Entitatea "${entitySlug}" nu exista.`);
    }
    await this.authorization.require(actor, entity.id_entity, 'update');

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
        description: dto.description ?? null,
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
    if (dto.description !== undefined) patch.description = dto.description;

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

  async removeMany(ids: string[]) {
    if (!ids || ids.length === 0) {
      throw new BadRequestException('Lista de id-uri este goala.');
    }

    const deletedCount = await this.knex(this.TABLE)
      .whereIn('id_action', ids)
      .del();

    this.logger.log(`${deletedCount} actiuni sterse in bulk`);
    return { message: `${deletedCount} actiuni au fost sterse.` };
  }

  // ─── Manual execution ───

  async executeManual(
    entitySlug: string,
    actionSlug: string,
    recordId: string,
    actor: AuthenticatedUser,
  ) {
    const entity = await this.knex('entity').where('slug', entitySlug).first();
    if (!entity) {
      throw new NotFoundException(`Entitatea "${entitySlug}" nu exista.`);
    }
    const scope = await this.authorization.require(actor, entity.id_entity, 'update');

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

    const recordQuery = this.knex(entity.table_name).where('id', recordId);
    this.authorization.applyScope(recordQuery, entity.table_name, scope, actor.profileId);
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
      const { result } = await this.workflowSync.executeWorkflow(
        action.id_workflow,
        {
          trigger: 'action',
          action: actionSlug,
          entity: entitySlug,
          entityId: entity.id_entity,
          recordId,
          record,
          userId: actor.id,
          profileId: actor.profileId,
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
      const validationMessage = extractValidationError(msg);
      const isN8nInfra = msg.startsWith('n8n') || msg.includes('workflow');
      this.logger.error(
        `Eroare la executia workflow-ului "${action.id_workflow}" / ${action.slug}: ${msg}`,
      );
      if (validationMessage) {
        throw new BadRequestException(validationMessage);
      }
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

    const matched = allActions.filter((action) => {
      const events: string[] = action.trigger_events ?? [];
      const shortEvent = event.replace('entity.', ''); // backward compat: 'entity.before_insert' → 'before_insert'
      return events.includes(event) || events.includes(shortEvent);
    });

    const isBeforeEvent = [
      EntityEvent.BeforeInsert,
      EntityEvent.BeforeUpdate,
      EntityEvent.BeforeDelete,
    ].includes(event);

    for (const action of matched) {
      if (!this.matchesConditions(action.trigger_conditions, payload)) {
        continue;
      }

      this.logger.log(
        `Auto-trigger: ${action.slug} (${event}) pe ${payload.entitySlug}#${payload.recordId}`,
      );

      if (!action.id_workflow) continue;

      if (isBeforeEvent) {
        // Before events run synchronously so validation workflows can block CRUD.
        try {
          const collected = await this.workflowSync.executeAndCollect(
            action.id_workflow,
            this.buildWorkflowInput(action, payload),
          );
          const normalized = await this.normalizeWorkflowOutput(
            payload.entityId,
            collected,
          );
          if (event !== EntityEvent.BeforeDelete) {
            Object.assign(payload.data, normalized);
          }
          this.logger.log(
            `Before workflow: ${action.slug} -> ${Object.keys(normalized).join(', ')}`,
          );
        } catch (err) {
          const msg = err.message ?? 'Eroare necunoscuta';
          const validationMessage = extractValidationError(msg);
          this.logger.error(
            `Before workflow "${action.slug}" a esuat: ${msg}`,
          );
          if (validationMessage) {
            throw new BadRequestException(validationMessage);
          }
          throw new BadRequestException(
            `Actiunea automata "${action.name}" a esuat: ${msg}`,
          );
        }
      } else {
        // After events: emit async (comportament existent)
        await this.emitActionExecuted(action, {
          entitySlug: payload.entitySlug,
          entityId: payload.entityId,
          recordId: payload.recordId,
          record: payload.data,
          userId: payload.userId,
          profileId: payload.profileId,
        });
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

    const slugToColumn = new Map<string, string>();
    const columnNames = new Set<string>();
    for (const field of fields) {
      slugToColumn.set(field.slug, field.column_name);
      columnNames.add(field.column_name);
    }

    const normalized: Record<string, any> = {};
    for (const [key, value] of Object.entries(collected)) {
      const columnName = columnNames.has(key) ? key : slugToColumn.get(key);
      if (!columnName) continue;
      normalized[columnName] = value;
    }

    return normalized;
  }

  private buildWorkflowInput(
    action: Record<string, any>,
    payload: EntityEventPayload,
  ): Record<string, any> {
    return {
      trigger: 'action',
      action: action.slug,
      entity: payload.entitySlug,
      entityId: payload.entityId,
      recordId: payload.recordId,
      record: payload.data,
      previousData: payload.previousData,
      userId: payload.userId,
      profileId: payload.profileId,
      tenant: this.tenantContext.slug,
      dbName: this.tenantContext.dbName,
      timestamp: new Date().toISOString(),
    };
  }

  private async emitActionExecuted(
    action: Record<string, any>,
    context: {
      entitySlug: string;
      entityId: string;
      recordId: string | null;
      record: Record<string, any>;
      userId: string | null;
      profileId: string | null;
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
      profileId: context.profileId,
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
