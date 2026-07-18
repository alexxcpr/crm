import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { Entity, FieldWithRelation } from 'src/types/entities';
import { AuthorizationService } from 'src/security/authorization.service';
import { AuthenticatedUser } from 'src/security/security.types';
import { FilterParserService } from './filter-parser.service';
import { DynamicValidationService } from './dynamic-validation.service';
import { PaginatedResponse } from './dto/query.dto';
import { EntityEventsService } from 'src/events/entity-events.service';
import { EntityEvent } from 'src/events/entity-event.enum';
import { FileStorageService } from 'src/storage/file-storage.service';

const DELETE_CONFLICT_REFERENCE_ID_LIMIT = 3;

@Injectable()
export class DynamicDataService {
  private readonly logger = new Logger(DynamicDataService.name);

  constructor(
    private readonly tenantContext: TenantContext,
    private readonly filterParser: FilterParserService,
    private readonly validation: DynamicValidationService,
    private readonly entityEvents: EntityEventsService,
    private readonly authorization: AuthorizationService,
    private readonly files: FileStorageService,
  ) {}

  private get knex() { return this.tenantContext.knex; }

  private isForeignKeyViolation(error: unknown): error is { code: string; table?: string; constraint?: string } {
    return typeof error === 'object'
      && error !== null
      && (error as { code?: string }).code === '23503';
  }

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
    for (const field of fields.filter((item) => item.ui_type === 'file')) {
      const alias = `file_${field.column_name}`;
      query.leftJoin(`stored_file as ${alias}`, `${tableName}.${field.column_name}`, `${alias}.id_file`);
      selectColumns.push(`${alias}.original_name as ${field.column_name}_display`);
      selectColumns.push(`${alias}.status as ${field.column_name}_file_status`);
      selectColumns.push(`${alias}.size_bytes as ${field.column_name}_file_size`);
      selectColumns.push(`${alias}.mime_type as ${field.column_name}_file_mime`);
    }
    return query;
  }

  async findAll(
    entitySlug: string,
    query: Record<string, any>,
    actor: AuthenticatedUser,
    options: { tableOnly?: boolean } = {},
  ): Promise<PaginatedResponse<Record<string, any>>> {
    const { entity, fields } = await this.resolveEntity(entitySlug);
    const scope = await this.authorization.require(actor, entity.id_entity, 'read');
    const tableName = entity.table_name;
    const page = Math.max(1, parseInt(query.page) || 1);
    const fetchAll = query.limit === 'all';
    const parsedLimit = Number.parseInt(String(query.limit ?? ''), 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 25;
    const offset = (page - 1) * limit;
    const tableOnly = options.tableOnly ?? true;
    const relationFields = tableOnly ? fields.filter((field) => field.visible_in_table) : fields;
    const selectColumns = this.buildSelect(tableName, fields, tableOnly);
    let dataQuery = this.addRelationJoins(this.knex(tableName), tableName, relationFields, selectColumns)
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

    const pagedDataQuery = fetchAll ? dataQuery : dataQuery.limit(limit).offset(offset);
    const [data, [{ total }]] = await Promise.all([pagedDataQuery, countQuery]);
    const totalNumber = Number(total);
    if (fetchAll) {
      return { data, meta: { total: totalNumber, page, limit: totalNumber, totalPages: totalNumber > 0 ? 1 : 0 } };
    }
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
    const fileFields = fields.filter((field) => field.ui_type === 'file');
    for (const field of fileFields) {
      await this.files.validateFileForBinding(field, sanitized[field.column_name] ?? null, actor);
    }
    const insertData = { ...sanitized, id_profile: actor.profileId, date_created: new Date(), date_updated: new Date() };
    const eventCtx = this.eventContext(entity, entitySlug, null, insertData, actor);
    await this.entityEvents.emit(EntityEvent.BeforeInsert, eventCtx);
    insertData.id_profile = actor.profileId;
    for (const field of fileFields) {
      await this.files.validateFileForBinding(field, insertData[field.column_name] ?? null, actor);
    }
    let record: Record<string, any>;
    await this.knex.transaction(async (trx) => {
      [record] = await trx(entity.table_name).insert(insertData).returning('*');
      for (const field of fileFields) {
        const fileId = record[field.column_name];
        if (fileId) {
          await this.files.bindInTransaction(trx, fileId, entity.id_entity, field.id_field, record.id, actor);
        }
      }
    });
    record = record!;
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
    const fileFields = fields.filter((field) => field.ui_type === 'file');
    for (const field of fileFields) {
      if (Object.prototype.hasOwnProperty.call(sanitized, field.column_name)) {
        await this.files.validateFileForBinding(field, sanitized[field.column_name] ?? null, actor, id);
      }
    }
    delete sanitized.id_profile;
    if (requestedOwner && requestedOwner !== existing.id_profile) {
      await this.authorization.require(actor, entity.id_entity, 'change_ownership');
      const target = await this.knex('profile').where({ id_profile: requestedOwner, is_active: true }).first();
      if (!target) throw new ForbiddenException('Profilul owner selectat nu este activ.');
      sanitized.id_profile = requestedOwner;
    }
    const eventCtx = this.eventContext(entity, entitySlug, id, sanitized, actor, existing);
    await this.entityEvents.emit(EntityEvent.BeforeUpdate, eventCtx);
    for (const field of fileFields) {
      if (Object.prototype.hasOwnProperty.call(sanitized, field.column_name)) {
        await this.files.validateFileForBinding(field, sanitized[field.column_name] ?? null, actor, id);
      }
    }
    const filesToDelete: string[] = [];
    let record: Record<string, any>;
    await this.knex.transaction(async (trx) => {
      [record] = await trx(entity.table_name).where('id', id).update({ ...sanitized, date_updated: new Date() }).returning('*');
      for (const field of fileFields) {
        if (!Object.prototype.hasOwnProperty.call(sanitized, field.column_name)) continue;
        const previousFileId = existing[field.column_name] as string | null;
        const nextFileId = record[field.column_name] as string | null;
        if (nextFileId && nextFileId !== previousFileId) {
          await this.files.bindInTransaction(trx, nextFileId, entity.id_entity, field.id_field, id, actor);
        }
        if (previousFileId && previousFileId !== nextFileId) {
          await this.files.markForDeletionInTransaction(trx, previousFileId, id);
          filesToDelete.push(previousFileId);
        }
      }
    });
    record = record!;
    await this.entityEvents.emit(EntityEvent.AfterUpdate, { ...eventCtx, data: record });
    for (const fileId of filesToDelete) {
      this.files.finalizeDeletion(fileId).catch((error) => {
        this.logger.error(`Stergerea fisierului ${fileId} va fi reluata de job.`, error as Error);
      });
    }
    return { data: record };
  }

  async remove(entitySlug: string, id: string, actor: AuthenticatedUser) {
    const { entity, fields } = await this.resolveEntity(entitySlug);
    const scope = await this.authorization.require(actor, entity.id_entity, 'delete');
    const existingQuery = this.knex(entity.table_name).where('id', id);
    this.authorization.applyScope(existingQuery, entity.table_name, scope, actor.profileId);
    const existing = await existingQuery.first();
    if (!existing) throw new NotFoundException(`Inregistrarea cu id "${id}" nu a fost gasita.`);
    const eventCtx = this.eventContext(entity, entitySlug, id, existing, actor, existing);
    await this.entityEvents.emit(EntityEvent.BeforeDelete, eventCtx);
    const fileFields = fields.filter((field) => field.ui_type === 'file');
    const filesToDelete = fileFields
      .map((field) => existing[field.column_name] as string | null)
      .filter((fileId): fileId is string => Boolean(fileId));
    try {
      await this.knex.transaction(async (trx) => {
        await trx(entity.table_name).where('id', id).del();
        for (const fileId of filesToDelete) {
          await this.files.markForDeletionInTransaction(trx, fileId, id);
        }
      });
    } catch (error) {
      if (this.isForeignKeyViolation(error)) {
        throw new ConflictException(await this.buildDeleteConflictMessage(entity, id, error));
      }
      throw error;
    }
    await this.entityEvents.emit(EntityEvent.AfterDelete, eventCtx);
    for (const fileId of filesToDelete) {
      this.files.finalizeDeletion(fileId).catch((error) => {
        this.logger.error(`Stergerea fisierului ${fileId} va fi reluata de job.`, error as Error);
      });
    }
  }

  private async buildDeleteConflictMessage(
    entity: Entity,
    recordId: string,
    error: { table?: string; constraint?: string },
  ): Promise<string> {
    const relation = await this.findReferencingRelation(entity.id_entity, error);
    const targetLabel = entity.label_singular || entity.name || 'aceasta inregistrare';

    if (!relation) {
      return `Nu poti sterge aceasta inregistrare (${targetLabel}) deoarece este folosita de alte inregistrari. Sterge sau schimba mai intai acele referinte.`;
    }

    const usage = await this.getReferenceUsage(relation.table_name, relation.column_name, recordId);
    const sourceLabel = relation.label_plural || relation.entity_name || relation.slug || relation.table_name;
    const sourceSingular = relation.label_singular || relation.entity_name || relation.slug || relation.table_name;
    const usageText = usage === null
      ? `in ${sourceLabel}`
      : usage.total === 1
        ? `in ${sourceSingular}${usage.ids[0] ? ` cu id-ul: ${usage.ids[0]}` : ''}`
        : `in ${usage.total} inregistrari din ${sourceLabel}${this.formatReferenceIds(usage)}`;

    return `Nu poti sterge aceasta inregistrare (${targetLabel}) deoarece este folosita ${usageText}, prin campul "${relation.field_name}". Sterge sau schimba mai intai acele referinte.`;
  }

  private async findReferencingRelation(
    targetEntityId: string,
    error: { table?: string; constraint?: string },
  ): Promise<{
    field_name: string;
    column_name: string;
    table_name: string;
    entity_name: string;
    label_singular: string | null;
    label_plural: string | null;
    slug: string;
  } | null> {
    const query = this.knex('field as field')
      .join('entity as entity', 'entity.id_entity', 'field.id_entity')
      .where('field.id_relation_entity', targetEntityId)
      .select(
        'field.name as field_name',
        'field.column_name',
        'entity.table_name',
        'entity.name as entity_name',
        'entity.label_singular',
        'entity.label_plural',
        'entity.slug',
      );

    if (error.table) {
      query.andWhere('entity.table_name', error.table);
    }

    const relations = await query;
    if (!relations.length) return null;

    const constraintMatch = relations.find((relation) =>
      typeof error.constraint === 'string'
      && error.constraint.startsWith(`${relation.table_name}_`)
      && error.constraint.endsWith(`${relation.column_name}_foreign`),
    );

    return constraintMatch ?? relations[0];
  }

  private async getReferenceUsage(
    tableName: string,
    columnName: string,
    recordId: string,
  ): Promise<{ total: number; ids: string[] } | null> {
    try {
      const [countRow, rows] = await Promise.all([
        this.knex(tableName)
          .where(columnName, recordId)
          .count('* as total')
          .first(),
        this.knex(tableName)
          .where(columnName, recordId)
          .select('id')
          .limit(DELETE_CONFLICT_REFERENCE_ID_LIMIT),
      ]);
      return {
        total: Number(countRow?.total ?? 0),
        ids: rows.map((row: { id: string }) => row.id).filter(Boolean),
      };
    } catch {
      return null;
    }
  }

  private formatReferenceIds(usage: { total: number; ids: string[] }): string {
    if (!usage.ids.length) return '';

    const remaining = usage.total - usage.ids.length;
    const suffix = remaining > 0 ? ` si inca ${remaining}` : '';
    return ` (id-uri: ${usage.ids.join(', ')}${suffix})`;
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
