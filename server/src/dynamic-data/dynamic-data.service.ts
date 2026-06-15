import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { Entity, FieldWithRelation } from 'src/types/entities';
import { AuthorizationService } from 'src/security/authorization.service';
import { AuthenticatedUser } from 'src/security/security.types';
import { FilterParserService } from './filter-parser.service';
import { DynamicValidationService } from './dynamic-validation.service';
import { PaginatedResponse } from './dto/query.dto';
import { EntityEventsService } from 'src/events/entity-events.service';
import { EntityEvent } from 'src/events/entity-event.enum';

@Injectable()
export class DynamicDataService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly filterParser: FilterParserService,
    private readonly validation: DynamicValidationService,
    private readonly entityEvents: EntityEventsService,
    private readonly authorization: AuthorizationService,
  ) {}

  private get knex() { return this.tenantContext.knex; }

  private async resolveEntity(entitySlug: string): Promise<{ entity: Entity; fields: FieldWithRelation[] }> {
    const entity = await this.authorization.getEntity(entitySlug);
    const rawFields = await this.knex('field').where('id_entity', entity.id_entity).orderBy('rank', 'asc');
    const fields: FieldWithRelation[] = [];
    for (const field of rawFields) {
      const relationEntity = field.id_relation_entity
        ? await this.knex('entity').where('id_entity', field.id_relation_entity).first()
        : null;
      fields.push({ ...field, relation_entity: relationEntity });
    }
    return { entity, fields };
  }

  private buildSelect(tableName: string, fields: FieldWithRelation[], tableOnly: boolean) {
    const systemColumns = ['id', 'date_created', 'date_updated', 'id_profile'];
    const selectedFields = tableOnly ? fields.filter((field) => field.visible_in_table) : fields;
    return [
      ...systemColumns.map((column) => `${tableName}.${column}`),
      ...selectedFields.map((field) => `${tableName}.${field.column_name}`),
    ];
  }

  private addRelationJoins(query: any, tableName: string, fields: FieldWithRelation[], selectColumns: any[]) {
    for (const field of fields.filter((item) => item.ui_type === 'relation' && item.relation_entity)) {
      const alias = `rel_${field.column_name}`;
      query.leftJoin(`${field.relation_entity!.table_name} as ${alias}`, `${tableName}.${field.column_name}`, `${alias}.id`);
      if (field.relation_display_field) selectColumns.push(`${alias}.${field.relation_display_field} as ${field.column_name}_display`);
    }
    return query;
  }

  async findAll(entitySlug: string, query: Record<string, any>, actor: AuthenticatedUser): Promise<PaginatedResponse<Record<string, any>>> {
    const { entity, fields } = await this.resolveEntity(entitySlug);
    const scope = await this.authorization.require(actor, entity.id_entity, 'read');
    const tableName = entity.table_name;
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 25));
    const offset = (page - 1) * limit;
    const selectColumns = this.buildSelect(tableName, fields, true);
    let dataQuery = this.addRelationJoins(this.knex(tableName), tableName, fields.filter((field) => field.visible_in_table), selectColumns)
      .select(selectColumns);
    let countQuery = this.knex(tableName).count(`${tableName}.id as total`);
    this.authorization.applyScope(dataQuery, tableName, scope, actor.profileId);
    this.authorization.applyScope(countQuery, tableName, scope, actor.profileId);

    const filters = this.filterParser.parse(query, fields, tableName);
    for (const filter of filters) {
      dataQuery = this.filterParser.apply(dataQuery, filter);
      countQuery = this.filterParser.apply(countQuery, filter);
    }

    const systemColumns = ['id', 'date_created', 'date_updated', 'id_profile'];
    if (query.sort) {
      const orderBy = String(query.sort).split(',').map((item) => {
        const desc = item.startsWith('-');
        const requested = desc ? item.slice(1) : item;
        const field = fields.find((candidate) => candidate.slug === requested || candidate.column_name === requested);
        const column = field?.column_name ?? requested;
        if (!field && !systemColumns.includes(column)) return null;
        return { column: `${tableName}.${column}`, order: desc ? 'desc' : 'asc' };
      }).filter(Boolean);
      if (orderBy.length) dataQuery.orderBy(orderBy as any);
    } else dataQuery.orderBy(`${tableName}.date_created`, 'desc');

    const [data, [{ total }]] = await Promise.all([dataQuery.limit(limit).offset(offset), countQuery]);
    const totalNumber = Number(total);
    return { data, meta: { total: totalNumber, page, limit, totalPages: Math.ceil(totalNumber / limit) } };
  }

  async findOne(entitySlug: string, id: string, actor: AuthenticatedUser) {
    const { entity, fields } = await this.resolveEntity(entitySlug);
    const scope = await this.authorization.require(actor, entity.id_entity, 'read');
    const selectColumns = this.buildSelect(entity.table_name, fields, false);
    const query = this.addRelationJoins(this.knex(entity.table_name), entity.table_name, fields, selectColumns)
      .select(selectColumns)
      .where(`${entity.table_name}.id`, id);
    this.authorization.applyScope(query, entity.table_name, scope, actor.profileId);
    const record = await query.first();
    if (!record) throw new NotFoundException(`Inregistrarea cu id "${id}" nu a fost gasita.`);
    if (record.id_profile) {
      const owner = await this.knex('profile').where('id_profile', record.id_profile).first();
      record.profile_display = owner?.display_name || owner?.username || owner?.email || null;
    }
    return { data: record };
  }

  async create(entitySlug: string, body: Record<string, any>, actor: AuthenticatedUser) {
    const { entity, fields } = await this.resolveEntity(entitySlug);
    await this.authorization.require(actor, entity.id_entity, 'create');
    const sanitized = await this.validation.validateAndSanitize(body, fields, entity.table_name, 'create', undefined);
    const insertData = { ...sanitized, id_profile: actor.profileId, date_created: new Date(), date_updated: new Date() };
    const eventCtx = this.eventContext(entity, entitySlug, null, insertData, actor);
    await this.entityEvents.emit(EntityEvent.BeforeInsert, eventCtx);
    insertData.id_profile = actor.profileId;
    const [record] = await this.knex(entity.table_name).insert(insertData).returning('*');
    await this.entityEvents.emit(EntityEvent.AfterInsert, { ...eventCtx, recordId: record.id, data: record });
    return { data: record };
  }

  async update(entitySlug: string, id: string, body: Record<string, any>, actor: AuthenticatedUser) {
    const { entity, fields } = await this.resolveEntity(entitySlug);
    const scope = await this.authorization.require(actor, entity.id_entity, 'update');
    const existingQuery = this.knex(entity.table_name).where('id', id);
    this.authorization.applyScope(existingQuery, entity.table_name, scope, actor.profileId);
    const existing = await existingQuery.first();
    if (!existing) throw new NotFoundException(`Inregistrarea cu id "${id}" nu a fost gasita.`);

    const requestedOwner = body.id_profile;
    const sanitized = await this.validation.validateAndSanitize(body, fields, entity.table_name, 'update', id);
    delete sanitized.id_profile;
    if (requestedOwner && requestedOwner !== existing.id_profile) {
      await this.authorization.require(actor, entity.id_entity, 'change_ownership');
      const target = await this.knex('profile').where({ id_profile: requestedOwner, is_active: true }).first();
      if (!target) throw new ForbiddenException('Profilul owner selectat nu este activ.');
      sanitized.id_profile = requestedOwner;
    }
    const eventCtx = this.eventContext(entity, entitySlug, id, sanitized, actor, existing);
    await this.entityEvents.emit(EntityEvent.BeforeUpdate, eventCtx);
    const [record] = await this.knex(entity.table_name).where('id', id).update({ ...sanitized, date_updated: new Date() }).returning('*');
    await this.entityEvents.emit(EntityEvent.AfterUpdate, { ...eventCtx, data: record });
    return { data: record };
  }

  async remove(entitySlug: string, id: string, actor: AuthenticatedUser) {
    const { entity } = await this.resolveEntity(entitySlug);
    const scope = await this.authorization.require(actor, entity.id_entity, 'delete');
    const existingQuery = this.knex(entity.table_name).where('id', id);
    this.authorization.applyScope(existingQuery, entity.table_name, scope, actor.profileId);
    const existing = await existingQuery.first();
    if (!existing) throw new NotFoundException(`Inregistrarea cu id "${id}" nu a fost gasita.`);
    const eventCtx = this.eventContext(entity, entitySlug, id, existing, actor, existing);
    await this.entityEvents.emit(EntityEvent.BeforeDelete, eventCtx);
    await this.knex(entity.table_name).where('id', id).del();
    await this.entityEvents.emit(EntityEvent.AfterDelete, eventCtx);
  }

  private eventContext(entity: Entity, entitySlug: string, recordId: string | null, data: Record<string, any>, actor: AuthenticatedUser, previousData?: Record<string, any>) {
    return {
      entitySlug,
      tableName: entity.table_name,
      entityId: entity.id_entity,
      recordId,
      data,
      previousData,
      userId: actor.id,
      profileId: actor.profileId,
    };
  }
}
