import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TenantContext } from 'src/tenant/tenant-context.service';
import {
  Entity,
  FieldWithRelation,
} from 'src/types/entities';
import { AuthorizationService } from 'src/security/authorization.service';
import { AuthenticatedUser } from 'src/security/security.types';
import { FilterParserService } from './filter-parser.service';
import { DynamicValidationService } from './dynamic-validation.service';
import { PaginatedResponse } from './dto/query.dto';
import { EntityEventsService } from 'src/events/entity-events.service';
import { EntityEvent } from 'src/events/entity-event.enum';
import { FileStorageService } from 'src/storage/file-storage.service';
import { RecordAccessService } from 'src/security/record-access.service';

const DELETE_CONFLICT_REFERENCE_ID_LIMIT = 3;
const DEFAULT_COMPOSITION_DELETE_MAX_DEPTH = 10;
const DEFAULT_COMPOSITION_DELETE_MAX_RECORDS = 1000;

interface CompositionDeleteNode {
  entity: Entity;
  fields: FieldWithRelation[];
  record: Record<string, any>;
  depth: number;
}

@Injectable()
export class DynamicDataService {
  private readonly logger = new Logger(
    DynamicDataService.name,
  );

  constructor(
    private readonly tenantContext: TenantContext,
    private readonly filterParser: FilterParserService,
    private readonly validation: DynamicValidationService,
    private readonly entityEvents: EntityEventsService,
    private readonly authorization: AuthorizationService,
    private readonly recordAccess: RecordAccessService,
    private readonly files: FileStorageService,
  ) {}

  private get knex() {
    return this.tenantContext.knex;
  }

  private async validateCalendarIntervals(
    entityId: string,
    candidate: Record<string, any>,
    changedColumns?: Set<string>,
  ) {
    if (
      !this.knex.schema?.hasTable ||
      !await this.knex.schema.hasTable(
        'ui_calendar_source',
      )
    ) {
      return;
    }
    const mappings = await this.knex(
      'ui_calendar_source as source',
    )
      .join(
        'ui_calendar as calendar',
        'calendar.id_ui_calendar',
        'source.id_ui_calendar',
      )
      .join(
        'field as start_field',
        'start_field.id_field',
        'source.id_start_field',
      )
      .join(
        'field as end_field',
        'end_field.id_field',
        'source.id_end_field',
      )
      .where({
        'source.id_entity': entityId,
        'source.is_active': true,
        'calendar.is_active': true,
      })
      .select(
        'start_field.column_name as start_column',
        'start_field.name as start_name',
        'end_field.column_name as end_column',
        'end_field.name as end_name',
      );

    for (const mapping of mappings) {
      if (
        changedColumns &&
        !changedColumns.has(mapping.start_column) &&
        !changedColumns.has(mapping.end_column)
      ) {
        continue;
      }
      const startValue =
        candidate[mapping.start_column];
      const endValue = candidate[mapping.end_column];
      if (
        startValue === null ||
        startValue === undefined ||
        startValue === '' ||
        endValue === null ||
        endValue === undefined ||
        endValue === ''
      ) {
        continue;
      }
      const start = new Date(startValue);
      const end = new Date(endValue);
      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        end <= start
      ) {
        throw new BadRequestException(
          `Intervalul "${mapping.start_name} – ${mapping.end_name}" este invalid: data de final trebuie să fie strict după data de început.`,
        );
      }
    }
  }

  private isForeignKeyViolation(
    error: unknown,
  ): error is {
    code: string;
    table?: string;
    constraint?: string;
  } {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code ===
        '23503'
    );
  }

  private async resolveEntity(
    entitySlug: string,
  ): Promise<{
    entity: Entity;
    fields: FieldWithRelation[];
  }> {
    const entity =
      await this.authorization.getEntity(
        entitySlug,
      );
    const rawFields = await this.knex('field')
      .where('id_entity', entity.id_entity)
      .orderBy('rank', 'asc');
    const fields: FieldWithRelation[] = [];
    for (const field of rawFields) {
      const relationEntity =
        field.id_relation_entity
          ? await this.knex('entity')
              .where(
                'id_entity',
                field.id_relation_entity,
              )
              .first()
          : null;
      fields.push({
        ...field,
        relation_entity: relationEntity,
      });
    }
    return { entity, fields };
  }

  private buildSelect(
    tableName: string,
    fields: FieldWithRelation[],
    tableOnly: boolean,
  ) {
    const systemColumns = [
      'id',
      'date_created',
      'date_updated',
      'id_profile',
    ];
    const selectedFields = tableOnly
      ? fields.filter(
          (field) => field.visible_in_table,
        )
      : fields;
    return [
      ...systemColumns.map(
        (column) => `${tableName}.${column}`,
      ),
      ...selectedFields.map(
        (field) =>
          `${tableName}.${field.column_name}`,
      ),
    ];
  }

  private addRelationJoins(
    query: any,
    tableName: string,
    fields: FieldWithRelation[],
    selectColumns: any[],
  ) {
    for (const field of fields.filter(
      (item) =>
        item.ui_type === 'relation' &&
        item.relation_entity,
    )) {
      const alias = `rel_${field.column_name}`;
      query.leftJoin(
        `${field.relation_entity!.table_name} as ${alias}`,
        `${tableName}.${field.column_name}`,
        `${alias}.id`,
      );
      if (field.relation_display_field)
        selectColumns.push(
          `${alias}.${field.relation_display_field} as ${field.column_name}_display`,
        );
    }
    for (const field of fields.filter(
      (item) => item.ui_type === 'file',
    )) {
      const alias = `file_${field.column_name}`;
      query.leftJoin(
        `stored_file as ${alias}`,
        `${tableName}.${field.column_name}`,
        `${alias}.id_file`,
      );
      selectColumns.push(
        `${alias}.original_name as ${field.column_name}_display`,
      );
      selectColumns.push(
        `${alias}.status as ${field.column_name}_file_status`,
      );
      selectColumns.push(
        `${alias}.size_bytes as ${field.column_name}_file_size`,
      );
      selectColumns.push(
        `${alias}.mime_type as ${field.column_name}_file_mime`,
      );
    }
    return query;
  }

  async findAll(
    entitySlug: string,
    query: Record<string, any>,
    actor: AuthenticatedUser,
    options: {
      tableOnly?: boolean;
      fixedWhere?: Record<string, any>;
    } = {},
  ): Promise<
    PaginatedResponse<Record<string, any>>
  > {
    const { entity, fields } =
      await this.resolveEntity(entitySlug);
    const policy =
      await this.recordAccess.require(
        actor,
        entity,
        'read',
      );
    const tableName = entity.table_name;
    const page = Math.max(
      1,
      parseInt(query.page) || 1,
    );
    const fetchAll = query.limit === 'all';
    const parsedLimit = Number.parseInt(
      String(query.limit ?? ''),
      10,
    );
    const limit =
      Number.isFinite(parsedLimit) &&
      parsedLimit > 0
        ? parsedLimit
        : 25;
    const offset = (page - 1) * limit;
    const tableOnly = options.tableOnly ?? true;
    const relationFields = tableOnly
      ? fields.filter(
          (field) => field.visible_in_table,
        )
      : fields;
    const selectColumns = this.buildSelect(
      tableName,
      fields,
      tableOnly,
    );
    let dataQuery = this.addRelationJoins(
      this.knex(tableName),
      tableName,
      relationFields,
      selectColumns,
    ).select(selectColumns);
    let countQuery = this.knex(tableName).count(
      `${tableName}.id as total`,
    );
    this.recordAccess.applyScope(
      dataQuery,
      tableName,
      policy,
      actor.profileId,
    );
    this.recordAccess.applyScope(
      countQuery,
      tableName,
      policy,
      actor.profileId,
    );
    for (const [column, value] of Object.entries(
      options.fixedWhere ?? {},
    )) {
      dataQuery.where(
        `${tableName}.${column}`,
        value,
      );
      countQuery.where(
        `${tableName}.${column}`,
        value,
      );
    }

    const filters = this.filterParser.parse(
      query,
      fields,
      tableName,
    );
    for (const filter of filters) {
      dataQuery = this.filterParser.apply(
        dataQuery,
        filter,
      );
      countQuery = this.filterParser.apply(
        countQuery,
        filter,
      );
    }

    const systemColumns = [
      'id',
      'date_created',
      'date_updated',
      'id_profile',
    ];
    if (query.sort) {
      const orderBy = String(query.sort)
        .split(',')
        .map((item) => {
          const desc = item.startsWith('-');
          const requested = desc
            ? item.slice(1)
            : item;
          const field = fields.find(
            (candidate) =>
              candidate.slug === requested ||
              candidate.column_name === requested,
          );
          const column =
            field?.column_name ?? requested;
          if (
            !field &&
            !systemColumns.includes(column)
          )
            return null;
          return {
            column: `${tableName}.${column}`,
            order: desc ? 'desc' : 'asc',
          };
        })
        .filter(Boolean);
      if (orderBy.length)
        dataQuery.orderBy(orderBy as any);
    } else
      dataQuery.orderBy(
        `${tableName}.date_created`,
        'desc',
      );

    const pagedDataQuery = fetchAll
      ? dataQuery
      : dataQuery.limit(limit).offset(offset);
    const [data, [{ total }]] = await Promise.all(
      [pagedDataQuery, countQuery],
    );
    const totalNumber = Number(total);
    if (fetchAll) {
      return {
        data,
        meta: {
          total: totalNumber,
          page,
          limit: totalNumber,
          totalPages: totalNumber > 0 ? 1 : 0,
        },
      };
    }
    return {
      data,
      meta: {
        total: totalNumber,
        page,
        limit,
        totalPages: Math.ceil(
          totalNumber / limit,
        ),
      },
    };
  }

  async findOne(
    entitySlug: string,
    id: string,
    actor: AuthenticatedUser,
  ) {
    const { entity, fields } =
      await this.resolveEntity(entitySlug);
    const policy =
      await this.recordAccess.require(
        actor,
        entity,
        'read',
      );
    const selectColumns = this.buildSelect(
      entity.table_name,
      fields,
      false,
    );
    const query = this.addRelationJoins(
      this.knex(entity.table_name),
      entity.table_name,
      fields,
      selectColumns,
    )
      .select(selectColumns)
      .where(`${entity.table_name}.id`, id);
    this.recordAccess.applyScope(
      query,
      entity.table_name,
      policy,
      actor.profileId,
    );
    const record = await query.first();
    if (!record)
      throw new NotFoundException(
        `Inregistrarea cu id "${id}" nu a fost gasita.`,
      );
    if (record.id_profile) {
      const owner = await this.knex('profile')
        .where('id_profile', record.id_profile)
        .first();
      record.profile_display =
        owner?.display_name ||
        owner?.username ||
        owner?.email ||
        null;
    }
    return { data: record };
  }

  async create(
    entitySlug: string,
    body: Record<string, any>,
    actor: AuthenticatedUser,
  ) {
    const { entity, fields } =
      await this.resolveEntity(entitySlug);
    await this.recordAccess.require(
      actor,
      entity,
      'create',
    );
    const sanitized =
      await this.validation.validateAndSanitize(
        body,
        fields,
        entity.table_name,
        'create',
        undefined,
      );
    const composition =
      await this.recordAccess.compositionChain(
        entity,
      );
    if (composition.steps.length) {
      const parentStep = composition.steps[0];
      const parentId =
        sanitized[
          parentStep.relationField.column_name
        ];
      if (!parentId) {
        throw new ForbiddenException(
          'Parintele composition este obligatoriu.',
        );
      }
      await this.recordAccess.assertRecord(
        actor,
        parentStep.parentEntity,
        String(parentId),
        'update',
      );
    }
    const fileFields = fields.filter(
      (field) => field.ui_type === 'file',
    );
    for (const field of fileFields) {
      await this.files.validateFileForBinding(
        field,
        sanitized[field.column_name] ?? null,
        actor,
      );
    }
    const insertData = {
      ...sanitized,
      id_profile: actor.profileId,
      date_created: new Date(),
      date_updated: new Date(),
    };
    const eventCtx = this.eventContext(
      entity,
      entitySlug,
      null,
      insertData,
      actor,
    );
    await this.entityEvents.emit(
      EntityEvent.BeforeInsert,
      eventCtx,
    );
    insertData.id_profile = actor.profileId;
    if (composition.steps.length) {
      const parentStep = composition.steps[0];
      const parentId =
        insertData[
          parentStep.relationField.column_name
        ];
      if (!parentId) {
        throw new ForbiddenException(
          'Parintele composition este obligatoriu.',
        );
      }
      await this.recordAccess.assertRecord(
        actor,
        parentStep.parentEntity,
        String(parentId),
        'update',
      );
    }
    for (const field of fileFields) {
      await this.files.validateFileForBinding(
        field,
        insertData[field.column_name] ?? null,
        actor,
      );
    }
    await this.validateCalendarIntervals(
      entity.id_entity,
      insertData,
    );
    let record: Record<string, any>;
    await this.knex.transaction(async (trx) => {
      [record] = await trx(entity.table_name)
        .insert(insertData)
        .returning('*');
      for (const field of fileFields) {
        const fileId = record[field.column_name];
        if (fileId) {
          await this.files.bindInTransaction(
            trx,
            fileId,
            entity.id_entity,
            field.id_field,
            record.id,
            actor,
          );
        }
      }
    });
    record = record!;
    await this.entityEvents.emit(
      EntityEvent.AfterInsert,
      {
        ...eventCtx,
        recordId: record.id,
        data: record,
      },
    );
    return { data: record };
  }

  async update(
    entitySlug: string,
    id: string,
    body: Record<string, any>,
    actor: AuthenticatedUser,
  ) {
    const { entity, fields } =
      await this.resolveEntity(entitySlug);
    const { record: existing, policy } =
      await this.recordAccess.assertRecord(
        actor,
        entity,
        id,
        'update',
      );

    const requestedOwner = body.id_profile;
    const sanitized =
      await this.validation.validateAndSanitize(
        body,
        fields,
        entity.table_name,
        'update',
        id,
      );
    if (policy.composition.length) {
      const relationField =
        policy.composition[0].relationField;
      const relationColumn =
        relationField.column_name;
      for (const key of [
        relationField.slug,
        relationColumn,
      ]) {
        if (
          Object.prototype.hasOwnProperty.call(
            body,
            key,
          ) &&
          body[key] !== existing[relationColumn]
        ) {
          throw new ConflictException(
            'Parintele unui copil composition nu poate fi schimbat.',
          );
        }
      }
      if (
        Object.prototype.hasOwnProperty.call(
          sanitized,
          relationColumn,
        ) &&
        sanitized[relationColumn] !==
          existing[relationColumn]
      ) {
        throw new ConflictException(
          'Parintele unui copil composition nu poate fi schimbat.',
        );
      }
      delete sanitized[relationColumn];
    }
    const fileFields = fields.filter(
      (field) => field.ui_type === 'file',
    );
    for (const field of fileFields) {
      if (
        Object.prototype.hasOwnProperty.call(
          sanitized,
          field.column_name,
        )
      ) {
        await this.files.validateFileForBinding(
          field,
          sanitized[field.column_name] ?? null,
          actor,
          id,
        );
      }
    }
    delete sanitized.id_profile;
    if (
      requestedOwner &&
      requestedOwner !== existing.id_profile
    ) {
      if (policy.composition.length) {
        throw new ForbiddenException(
          'Ownerul unui copil composition este mostenit de la radacina si nu poate fi schimbat.',
        );
      }
      await this.authorization.require(
        actor,
        entity.id_entity,
        'change_ownership',
      );
      const target = await this.knex('profile')
        .where({
          id_profile: requestedOwner,
          is_active: true,
        })
        .whereNot(
          'access_level',
          'platform_owner',
        )
        .first();
      if (!target)
        throw new ForbiddenException(
          'Profilul owner selectat nu este activ.',
        );
      sanitized.id_profile = requestedOwner;
    }
    const eventCtx = this.eventContext(
      entity,
      entitySlug,
      id,
      sanitized,
      actor,
      existing,
    );
    await this.entityEvents.emit(
      EntityEvent.BeforeUpdate,
      eventCtx,
    );
    if (policy.composition.length) {
      const relationField =
        policy.composition[0].relationField;
      const relationColumn =
        relationField.column_name;
      if (
        Object.prototype.hasOwnProperty.call(
          sanitized,
          relationColumn,
        ) &&
        sanitized[relationColumn] !==
          existing[relationColumn]
      ) {
        throw new ConflictException(
          'Parintele unui copil composition nu poate fi schimbat.',
        );
      }
      if (
        Object.prototype.hasOwnProperty.call(
          sanitized,
          'id_profile',
        ) &&
        sanitized.id_profile !==
          existing.id_profile
      ) {
        throw new ForbiddenException(
          'Ownerul unui copil composition este mostenit de la radacina si nu poate fi schimbat.',
        );
      }
      delete sanitized[relationColumn];
      delete sanitized.id_profile;
    }
    for (const field of fileFields) {
      if (
        Object.prototype.hasOwnProperty.call(
          sanitized,
          field.column_name,
        )
      ) {
        await this.files.validateFileForBinding(
          field,
          sanitized[field.column_name] ?? null,
          actor,
          id,
        );
      }
    }
    await this.validateCalendarIntervals(
      entity.id_entity,
      { ...existing, ...sanitized },
      new Set(Object.keys(sanitized)),
    );
    const filesToDelete: string[] = [];
    let record: Record<string, any>;
    await this.knex.transaction(async (trx) => {
      [record] = await trx(entity.table_name)
        .where('id', id)
        .update({
          ...sanitized,
          date_updated: new Date(),
        })
        .returning('*');
      for (const field of fileFields) {
        if (
          !Object.prototype.hasOwnProperty.call(
            sanitized,
            field.column_name,
          )
        )
          continue;
        const previousFileId = existing[
          field.column_name
        ] as string | null;
        const nextFileId = record[
          field.column_name
        ] as string | null;
        if (
          nextFileId &&
          nextFileId !== previousFileId
        ) {
          await this.files.bindInTransaction(
            trx,
            nextFileId,
            entity.id_entity,
            field.id_field,
            id,
            actor,
          );
        }
        if (
          previousFileId &&
          previousFileId !== nextFileId
        ) {
          await this.files.markForDeletionInTransaction(
            trx,
            previousFileId,
            id,
          );
          filesToDelete.push(previousFileId);
        }
      }
    });
    record = record!;
    await this.entityEvents.emit(
      EntityEvent.AfterUpdate,
      { ...eventCtx, data: record },
    );
    for (const fileId of filesToDelete) {
      this.files
        .finalizeDeletion(fileId)
        .catch((error) => {
          this.logger.error(
            `Stergerea fisierului ${fileId} va fi reluata de job.`,
            error as Error,
          );
        });
    }
    return { data: record };
  }

  async remove(
    entitySlug: string,
    id: string,
    actor: AuthenticatedUser,
  ) {
    const { entity, fields } =
      await this.resolveEntity(entitySlug);
    const { record: existing } =
      await this.recordAccess.assertRecord(
        actor,
        entity,
        id,
        'delete',
        (
          await this.recordAccess.compositionChain(
            entity,
          )
        ).steps.length === 0,
      );
    const deletePlan =
      await this.buildCompositionDeletePlan(
        entity,
        fields,
        existing,
      );
    await this.assertNoExternalReferenceBlockers(
      deletePlan,
    );
    const eventContexts = deletePlan.map((node) =>
      this.eventContext(
        node.entity,
        node.entity.slug,
        node.record.id,
        node.record,
        actor,
        node.record,
      ),
    );
    for (const eventCtx of eventContexts) {
      await this.entityEvents.emit(
        EntityEvent.BeforeDelete,
        eventCtx,
      );
    }

    const filesToDelete: string[] = [];
    try {
      await this.knex.transaction(async (trx) => {
        for (const node of deletePlan) {
          const fileIds = node.fields
            .filter(
              (field) => field.ui_type === 'file',
            )
            .map(
              (field) =>
                node.record[field.column_name] as
                  | string
                  | null,
            )
            .filter((fileId): fileId is string =>
              Boolean(fileId),
            );
          await trx(node.entity.table_name)
            .where('id', node.record.id)
            .del();
          for (const fileId of fileIds) {
            await this.files.markForDeletionInTransaction(
              trx,
              fileId,
              node.record.id,
            );
            filesToDelete.push(fileId);
          }
        }
      });
    } catch (error) {
      if (this.isForeignKeyViolation(error)) {
        throw new ConflictException(
          await this.buildDeleteConflictMessage(
            entity,
            id,
            error,
          ),
        );
      }
      throw error;
    }
    for (const eventCtx of eventContexts) {
      await this.entityEvents.emit(
        EntityEvent.AfterDelete,
        eventCtx,
      );
    }
    for (const fileId of filesToDelete) {
      this.files
        .finalizeDeletion(fileId)
        .catch((error) => {
          this.logger.error(
            `Stergerea fisierului ${fileId} va fi reluata de job.`,
            error as Error,
          );
        });
    }
  }

  private compositionDeleteLimit(
    envName: string,
    fallback: number,
  ) {
    const value = Number.parseInt(
      process.env[envName] ?? '',
      10,
    );
    return Number.isFinite(value) && value > 0
      ? value
      : fallback;
  }

  private async buildCompositionDeletePlan(
    rootEntity: Entity,
    rootFields: FieldWithRelation[],
    rootRecord: Record<string, any>,
  ): Promise<CompositionDeleteNode[]> {
    const maxDepth = this.compositionDeleteLimit(
      'COMPOSITION_DELETE_MAX_DEPTH',
      DEFAULT_COMPOSITION_DELETE_MAX_DEPTH,
    );
    const maxRecords =
      this.compositionDeleteLimit(
        'COMPOSITION_DELETE_MAX_RECORDS',
        DEFAULT_COMPOSITION_DELETE_MAX_RECORDS,
      );
    const plan: CompositionDeleteNode[] = [];
    const fieldCache = new Map<
      string,
      FieldWithRelation[]
    >([[rootEntity.id_entity, rootFields]]);
    let discovered = 0;
    const walk = async (
      entity: Entity,
      record: Record<string, any>,
      depth: number,
    ): Promise<void> => {
      if (depth > maxDepth) {
        throw new ConflictException(
          `Stergerea depaseste limita de ${maxDepth} niveluri composition.`,
        );
      }
      discovered += 1;
      if (discovered > maxRecords) {
        throw new ConflictException(
          `Stergerea depaseste limita de ${maxRecords} inregistrari.`,
        );
      }

      const relations = await this.knex(
        'field as relation_field',
      )
        .join(
          'entity as child',
          'child.id_entity',
          'relation_field.id_entity',
        )
        .where({
          'relation_field.ui_type': 'relation',
          'relation_field.relation_kind':
            'composition',
          'relation_field.id_relation_entity':
            entity.id_entity,
        })
        .orderBy([
          {
            column: 'child.rank',
            order: 'asc',
          },
          {
            column: 'relation_field.rank',
            order: 'asc',
          },
        ])
        .select(
          'relation_field.column_name',
          'child.id_entity',
          'child.slug',
        );

      for (const relation of relations) {
        const childEntity =
          await this.recordAccess.getEntity(
            relation.id_entity,
          );
        const children = await this.knex(
          childEntity.table_name,
        )
          .where(relation.column_name, record.id)
          .orderBy('id', 'asc');
        let childFields = fieldCache.get(
          childEntity.id_entity,
        );
        if (!childFields) {
          childFields = (
            await this.resolveEntity(
              childEntity.slug,
            )
          ).fields;
          fieldCache.set(
            childEntity.id_entity,
            childFields,
          );
        }
        for (const child of children) {
          await walk(
            childEntity,
            child,
            depth + 1,
          );
        }
      }

      plan.push({
        entity,
        fields:
          fieldCache.get(entity.id_entity) ?? [],
        record,
        depth,
      });
    };

    await walk(rootEntity, rootRecord, 1);
    return plan;
  }

  private async assertNoExternalReferenceBlockers(
    plan: CompositionDeleteNode[],
  ) {
    const idsByEntity = new Map<
      string,
      Set<string>
    >();
    for (const node of plan) {
      const ids =
        idsByEntity.get(node.entity.id_entity) ??
        new Set<string>();
      ids.add(node.record.id);
      idsByEntity.set(node.entity.id_entity, ids);
    }
    const targetEntityIds = [
      ...idsByEntity.keys(),
    ];
    const referenceFields = await this.knex(
      'field as relation_field',
    )
      .join(
        'entity as source',
        'source.id_entity',
        'relation_field.id_entity',
      )
      .whereIn(
        'relation_field.id_relation_entity',
        targetEntityIds,
      )
      .where({
        'relation_field.ui_type': 'relation',
        'relation_field.relation_kind':
          'reference',
      })
      .select(
        'relation_field.id_relation_entity',
        'relation_field.column_name',
        'relation_field.name as field_name',
        'source.id_entity as source_entity_id',
        'source.table_name as source_table_name',
        'source.label_plural as source_label_plural',
        'source.name as source_name',
      );

    for (const relation of referenceFields) {
      const targetIds = [
        ...(idsByEntity.get(
          relation.id_relation_entity,
        ) ?? []),
      ];
      if (!targetIds.length) continue;
      const references = await this.knex(
        relation.source_table_name,
      )
        .whereIn(relation.column_name, targetIds)
        .select('id');
      const internalIds =
        idsByEntity.get(
          relation.source_entity_id,
        ) ?? new Set<string>();
      const blocker = references.find(
        (reference) =>
          !internalIds.has(reference.id),
      );
      if (blocker) {
        throw new ConflictException(
          `Agregatul nu poate fi sters deoarece exista o referinta externa in ${relation.source_label_plural ?? relation.source_name}, prin campul "${relation.field_name}" (id: ${blocker.id}).`,
        );
      }
    }
  }

  private async buildDeleteConflictMessage(
    entity: Entity,
    recordId: string,
    error: {
      table?: string;
      constraint?: string;
    },
  ): Promise<string> {
    const relation =
      await this.findReferencingRelation(
        entity.id_entity,
        error,
      );
    const targetLabel =
      entity.label_singular ||
      entity.name ||
      'aceasta inregistrare';

    if (!relation) {
      return `Nu poti sterge aceasta inregistrare (${targetLabel}) deoarece este folosita de alte inregistrari. Sterge sau schimba mai intai acele referinte.`;
    }

    const usage = await this.getReferenceUsage(
      relation.table_name,
      relation.column_name,
      recordId,
    );
    const sourceLabel =
      relation.label_plural ||
      relation.entity_name ||
      relation.slug ||
      relation.table_name;
    const sourceSingular =
      relation.label_singular ||
      relation.entity_name ||
      relation.slug ||
      relation.table_name;
    const usageText =
      usage === null
        ? `in ${sourceLabel}`
        : usage.total === 1
          ? `in ${sourceSingular}${usage.ids[0] ? ` cu id-ul: ${usage.ids[0]}` : ''}`
          : `in ${usage.total} inregistrari din ${sourceLabel}${this.formatReferenceIds(usage)}`;

    return `Nu poti sterge aceasta inregistrare (${targetLabel}) deoarece este folosita ${usageText}, prin campul "${relation.field_name}". Sterge sau schimba mai intai acele referinte.`;
  }

  private async findReferencingRelation(
    targetEntityId: string,
    error: {
      table?: string;
      constraint?: string;
    },
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
      .join(
        'entity as entity',
        'entity.id_entity',
        'field.id_entity',
      )
      .where(
        'field.id_relation_entity',
        targetEntityId,
      )
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
      query.andWhere(
        'entity.table_name',
        error.table,
      );
    }

    const relations = await query;
    if (!relations.length) return null;

    const constraintMatch = relations.find(
      (relation) =>
        typeof error.constraint === 'string' &&
        error.constraint.startsWith(
          `${relation.table_name}_`,
        ) &&
        error.constraint.endsWith(
          `${relation.column_name}_foreign`,
        ),
    );

    return constraintMatch ?? relations[0];
  }

  private async getReferenceUsage(
    tableName: string,
    columnName: string,
    recordId: string,
  ): Promise<{
    total: number;
    ids: string[];
  } | null> {
    try {
      const [countRow, rows] = await Promise.all([
        this.knex(tableName)
          .where(columnName, recordId)
          .count('* as total')
          .first(),
        this.knex(tableName)
          .where(columnName, recordId)
          .select('id')
          .limit(
            DELETE_CONFLICT_REFERENCE_ID_LIMIT,
          ),
      ]);
      return {
        total: Number(countRow?.total ?? 0),
        ids: rows
          .map((row: { id: string }) => row.id)
          .filter(Boolean),
      };
    } catch {
      return null;
    }
  }

  private formatReferenceIds(usage: {
    total: number;
    ids: string[];
  }): string {
    if (!usage.ids.length) return '';

    const remaining =
      usage.total - usage.ids.length;
    const suffix =
      remaining > 0
        ? ` si inca ${remaining}`
        : '';
    return ` (id-uri: ${usage.ids.join(', ')}${suffix})`;
  }

  private eventContext(
    entity: Entity,
    entitySlug: string,
    recordId: string | null,
    data: Record<string, any>,
    actor: AuthenticatedUser,
    previousData?: Record<string, any>,
  ) {
    return {
      entitySlug,
      tableName: entity.table_name,
      entityId: entity.id_entity,
      recordId,
      data,
      previousData,
      userId: actor.id,
      profileId: actor.profileId,
      actor,
    };
  }
}
