import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Knex } from 'knex';
import type { RankedItemDto } from 'src/admin/dto/reorder.dto';
import { reorderRanks } from 'src/admin/rank-reorder.util';
import { RecordAccessService } from 'src/security/record-access.service';
import type { AuthenticatedUser } from 'src/security/security.types';
import { TenantContext } from 'src/tenant/tenant-context.service';
import {
  CALENDAR_CATALOG,
  CALENDAR_FILTER_OPERATORS,
  CALENDAR_LIMITS,
} from './calendar.constants';
import { CalendarAccessService } from './calendar-access.service';
import {
  CalendarFilterDto,
  CalendarSourceDto,
  SaveCalendarDto,
} from './dto/calendar.dto';

export interface CalendarFieldRow {
  id_field: string;
  id_entity: string;
  name: string;
  slug: string;
  column_name: string;
  data_type: string;
  ui_type: string;
  is_filterable: boolean;
  is_readonly: boolean;
  visible_in_form: boolean;
  options: unknown;
  id_relation_entity: string | null;
  relation_display_field: string | null;
}

export interface CalendarSourceRow {
  id_ui_calendar_source: string;
  id_ui_calendar: string;
  id_entity: string;
  name: string;
  color: string;
  id_start_field: string;
  id_end_field: string;
  title_segments: Array<Record<string, unknown>>;
  filters: CalendarFilterDto[];
  allow_create: boolean;
  allow_update: boolean;
  rank: number;
  is_active: boolean;
  entity_slug: string;
  entity_label: string;
  entity_label_plural: string;
  table_name: string;
  start_field: CalendarFieldRow;
  end_field: CalendarFieldRow;
  fields: CalendarFieldRow[];
  popover_field_ids: string[];
  popover_fields: CalendarFieldRow[];
  capabilities?: {
    read: boolean;
    create: boolean;
    update: boolean;
  };
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly recordAccess: RecordAccessService,
    private readonly access: CalendarAccessService,
  ) {}

  private get knex() {
    return this.tenantContext.knex;
  }

  async catalog() {
    await this.access.requireEnabled();
    return CALENDAR_CATALOG;
  }

  async findAllAdmin() {
    await this.access.requireEnabled();
    return this.knex('ui_calendar as calendar')
      .leftJoin(
        'ui_calendar_source as source',
        'source.id_ui_calendar',
        'calendar.id_ui_calendar',
      )
      .select('calendar.*')
      .countDistinct(
        'source.id_ui_calendar_source as sources_count',
      )
      .countDistinct({
        active_sources_count: this.knex.raw(
          'CASE WHEN source.is_active THEN source.id_ui_calendar_source END',
        ),
      })
      .groupBy('calendar.id_ui_calendar')
      .orderBy('calendar.rank', 'asc');
  }

  async findOneAdmin(id: string) {
    await this.access.requireEnabled();
    return this.loadStructure(id, false);
  }

  async create(dto: SaveCalendarDto) {
    await this.access.requireEnabled();
    await this.assertSlugAvailable(dto.slug);

    const id = await this.knex.transaction(
      async (trx) => {
        await this.validateConfiguration(
          trx,
          dto,
        );
        const [calendar] = await trx(
          'ui_calendar',
        )
          .insert(this.calendarRecord(dto))
          .returning('id_ui_calendar');
        await this.replaceSources(
          trx,
          calendar.id_ui_calendar,
          dto.sources,
        );
        return calendar.id_ui_calendar as string;
      },
    );

    await this.ensureIndexes(id);
    return this.loadStructure(id, false);
  }

  async update(id: string, dto: SaveCalendarDto) {
    await this.access.requireEnabled();
    const current = await this.knex('ui_calendar')
      .where('id_ui_calendar', id)
      .first();
    if (!current) {
      throw new NotFoundException(
        `Calendarul cu id "${id}" nu există.`,
      );
    }
    await this.assertSlugAvailable(dto.slug, id);

    await this.knex.transaction(async (trx) => {
      await this.validateConfiguration(trx, dto);
      await trx('ui_calendar')
        .where('id_ui_calendar', id)
        .update({
          ...this.calendarRecord(dto),
          date_updated: trx.fn.now(),
        });
      await this.replaceSources(
        trx,
        id,
        dto.sources,
      );
    });

    await this.ensureIndexes(id);
    return this.loadStructure(id, false);
  }

  async remove(id: string) {
    await this.access.requireEnabled();
    const calendar = await this.knex(
      'ui_calendar',
    )
      .where('id_ui_calendar', id)
      .first();
    if (!calendar) {
      throw new NotFoundException(
        `Calendarul cu id "${id}" nu există.`,
      );
    }
    await this.knex('ui_calendar')
      .where('id_ui_calendar', id)
      .update({
        is_active: false,
        date_updated: this.knex.fn.now(),
      });
    return {
      message: `Calendarul "${calendar.name}" a fost dezactivat.`,
    };
  }

  async reorder(items: RankedItemDto[]) {
    await this.access.requireEnabled();
    await reorderRanks(this.knex, {
      table: 'ui_calendar',
      idColumn: 'id_ui_calendar',
      items,
    });
    return this.findAllAdmin();
  }

  async findBySlugPublic(
    slug: string,
    user: AuthenticatedUser,
  ) {
    await this.access.requireEnabled();
    const calendar = await this.knex(
      'ui_calendar',
    )
      .where({ slug, is_active: true })
      .first();
    if (!calendar) {
      throw new NotFoundException(
        `Calendarul "${slug}" nu există.`,
      );
    }
    return this.publicStructure(
      calendar.id_ui_calendar,
      user,
    );
  }

  async canViewCalendar(
    id: string,
    user: AuthenticatedUser,
  ): Promise<boolean> {
    if (!(await this.access.isEnabled()))
      return false;
    const calendar = await this.knex(
      'ui_calendar',
    )
      .where({
        id_ui_calendar: id,
        is_active: true,
      })
      .first();
    if (!calendar) return false;
    const sources = await this.knex(
      'ui_calendar_source',
    )
      .where({
        id_ui_calendar: id,
        is_active: true,
      })
      .select('id_entity');
    for (const source of sources) {
      const entity =
        await this.recordAccess.getEntity(
          source.id_entity,
        );
      if (
        await this.recordAccess.getPolicy(
          user,
          entity,
          'read',
        )
      )
        return true;
    }
    return false;
  }

  async resolveCalendarId(
    slug: string,
  ): Promise<string> {
    const calendar = await this.knex(
      'ui_calendar',
    )
      .where({ slug, is_active: true })
      .first();
    if (!calendar) {
      throw new NotFoundException(
        `Calendarul "${slug}" nu există.`,
      );
    }
    return calendar.id_ui_calendar;
  }

  async loadSourceRows(
    calendarId: string,
    sourceIds?: string[],
    activeOnly = true,
  ): Promise<CalendarSourceRow[]> {
    let query = this.knex(
      'ui_calendar_source as source',
    )
      .join(
        'entity',
        'entity.id_entity',
        'source.id_entity',
      )
      .where('source.id_ui_calendar', calendarId)
      .select(
        'source.*',
        'entity.slug as entity_slug',
        'entity.label_singular as entity_label',
        'entity.label_plural as entity_label_plural',
        'entity.table_name',
      );
    if (activeOnly)
      query = query.where(
        'source.is_active',
        true,
      );
    if (sourceIds?.length) {
      query = query.whereIn(
        'source.id_ui_calendar_source',
        sourceIds,
      );
    }
    const sources = await query.orderBy(
      'source.rank',
      'asc',
    );
    return this.enrichSources(this.knex, sources);
  }

  async publicDraft(
    dto: SaveCalendarDto,
    user: AuthenticatedUser,
  ) {
    await this.access.requireEnabled();
    await this.validateConfiguration(
      this.knex,
      dto,
    );
    const sourceRecords = dto.sources.map(
      (source) => ({
        ...source,
        id_ui_calendar_source:
          source.id_ui_calendar_source ??
          randomUUID(),
        id_ui_calendar: 'preview',
        title_segments: source.title_segments,
        filters: source.filters,
      }),
    );
    const entityIds = [
      ...new Set(
        sourceRecords.map(
          (source) => source.id_entity,
        ),
      ),
    ];
    const entities = await this.knex(
      'entity',
    ).whereIn('id_entity', entityIds);
    const entityById = new Map(
      entities.map((entity) => [
        entity.id_entity,
        entity,
      ]),
    );
    const rows = sourceRecords.map((source) => {
      const entity = entityById.get(
        source.id_entity,
      );
      return {
        ...source,
        entity_slug: entity.slug,
        entity_label: entity.label_singular,
        entity_label_plural: entity.label_plural,
        table_name: entity.table_name,
      };
    });
    const enriched = await this.enrichSources(
      this.knex,
      rows,
    );
    const accessible =
      await this.filterAccessibleSources(
        enriched,
        user,
      );
    if (!accessible.length) {
      throw new ForbiddenException(
        'Nu ai acces de citire la nicio sursă din acest calendar.',
      );
    }
    return {
      ...this.calendarRecord(dto),
      id_ui_calendar: 'preview',
      sources: accessible,
    };
  }

  private async publicStructure(
    id: string,
    user: AuthenticatedUser,
  ) {
    const structure = await this.loadStructure(
      id,
      true,
    );
    const sources =
      await this.filterAccessibleSources(
        structure.sources,
        user,
      );
    if (!sources.length) {
      throw new ForbiddenException(
        'Nu ai acces de citire la nicio sursă din acest calendar.',
      );
    }
    return { ...structure, sources };
  }

  private async filterAccessibleSources(
    sources: CalendarSourceRow[],
    user: AuthenticatedUser,
  ) {
    const result: CalendarSourceRow[] = [];
    for (const source of sources) {
      const entity =
        await this.recordAccess.getEntity(
          source.id_entity,
        );
      const read =
        await this.recordAccess.getPolicy(
          user,
          entity,
          'read',
        );
      if (!read) continue;
      const create = source.allow_create
        ? await this.recordAccess.getPolicy(
            user,
            entity,
            'create',
          )
        : null;
      const update = source.allow_update
        ? await this.recordAccess.getPolicy(
            user,
            entity,
            'update',
          )
        : null;
      result.push({
        ...source,
        capabilities: {
          read: true,
          create: Boolean(create),
          update: Boolean(update),
        },
      });
    }
    return result;
  }

  private async loadStructure(
    id: string,
    activeOnly: boolean,
  ) {
    let calendarQuery = this.knex(
      'ui_calendar',
    ).where('id_ui_calendar', id);
    if (activeOnly)
      calendarQuery = calendarQuery.where(
        'is_active',
        true,
      );
    const calendar = await calendarQuery.first();
    if (!calendar) {
      throw new NotFoundException(
        `Calendarul cu id "${id}" nu există.`,
      );
    }
    const sources = await this.loadSourceRows(
      id,
      undefined,
      activeOnly,
    );
    return { ...calendar, sources };
  }

  private async enrichSources(
    db: Knex | Knex.Transaction,
    sources: Array<Record<string, any>>,
  ): Promise<CalendarSourceRow[]> {
    if (!sources.length) return [];
    const entityIds = [
      ...new Set(
        sources.map((source) => source.id_entity),
      ),
    ];
    const fields: CalendarFieldRow[] = await db(
      'field',
    )
      .whereIn('id_entity', entityIds)
      .orderBy('rank', 'asc');
    const fieldsByEntity = new Map<
      string,
      CalendarFieldRow[]
    >();
    for (const field of fields) {
      const bucket =
        fieldsByEntity.get(field.id_entity) ?? [];
      bucket.push(field);
      fieldsByEntity.set(field.id_entity, bucket);
    }
    const sourceIds = sources.map(
      (source) => source.id_ui_calendar_source,
    );
    const popoverRows = sourceIds.length
      ? await db(
          'ui_calendar_source_popover_field as mapping',
        )
          .join(
            'field',
            'field.id_field',
            'mapping.id_field',
          )
          .whereIn(
            'mapping.id_ui_calendar_source',
            sourceIds,
          )
          .select(
            'mapping.id_ui_calendar_source',
            'field.*',
          )
          .orderBy('mapping.rank', 'asc')
      : [];

    return sources.map((source) => {
      const sourceFields =
        fieldsByEntity.get(source.id_entity) ??
        [];
      const storedPopoverFields =
        popoverRows.filter(
          (row) =>
            row.id_ui_calendar_source ===
            source.id_ui_calendar_source,
        );
      const configuredPopoverIds = Array.isArray(
        source.popover_field_ids,
      )
        ? source.popover_field_ids
        : storedPopoverFields.map(
            (field) => field.id_field,
          );
      const configuredPopoverFields =
        configuredPopoverIds
          .map((fieldId: string) =>
            sourceFields.find(
              (field) =>
                field.id_field === fieldId,
            ),
          )
          .filter(Boolean) as CalendarFieldRow[];
      return {
        ...source,
        title_segments: this.parseJson<
          Array<Record<string, unknown>>
        >(source.title_segments, []),
        filters: this.parseJson<
          CalendarFilterDto[]
        >(source.filters, []),
        start_field: sourceFields.find(
          (field) =>
            field.id_field ===
            source.id_start_field,
        )!,
        end_field: sourceFields.find(
          (field) =>
            field.id_field ===
            source.id_end_field,
        )!,
        fields: sourceFields,
        popover_field_ids: configuredPopoverIds,
        popover_fields: configuredPopoverFields,
      } as unknown as CalendarSourceRow;
    });
  }

  private calendarRecord(dto: SaveCalendarDto) {
    return {
      name: dto.name.trim(),
      slug: dto.slug.trim(),
      description:
        dto.description?.trim() || null,
      icon: dto.icon?.trim() || null,
      default_view: dto.default_view,
      allow_day: dto.allow_day,
      allow_week: dto.allow_week,
      allow_month: dto.allow_month,
      allow_list: dto.allow_list,
      list_range: dto.list_range,
      first_day: dto.first_day,
      show_weekends: dto.show_weekends,
      slot_min_time: dto.slot_min_time,
      slot_max_time: dto.slot_max_time,
      scroll_time: dto.scroll_time,
      slot_duration_minutes:
        dto.slot_duration_minutes,
      rank: dto.rank,
      is_active: dto.is_active,
    };
  }

  private async replaceSources(
    trx: Knex.Transaction,
    calendarId: string,
    sources: CalendarSourceDto[],
  ) {
    await trx('ui_calendar_source')
      .where('id_ui_calendar', calendarId)
      .del();
    for (const [
      index,
      source,
    ] of sources.entries()) {
      const id =
        source.id_ui_calendar_source ??
        randomUUID();
      await trx('ui_calendar_source').insert({
        id_ui_calendar_source: id,
        id_ui_calendar: calendarId,
        id_entity: source.id_entity,
        name: source.name.trim(),
        color: source.color.toLowerCase(),
        id_start_field: source.id_start_field,
        id_end_field: source.id_end_field,
        title_segments: JSON.stringify(
          source.title_segments,
        ),
        filters: JSON.stringify(
          source.filters ?? [],
        ),
        allow_create: source.allow_create,
        allow_update: source.allow_update,
        rank: source.rank ?? index,
        is_active: source.is_active,
      });
      for (const [
        rank,
        fieldId,
      ] of source.popover_field_ids.entries()) {
        await trx(
          'ui_calendar_source_popover_field',
        ).insert({
          id_ui_calendar_source: id,
          id_field: fieldId,
          rank,
        });
      }
    }
  }

  private async validateConfiguration(
    db: Knex | Knex.Transaction,
    dto: SaveCalendarDto,
  ) {
    const allowedViews = [
      dto.allow_day && 'day',
      dto.allow_week && 'week',
      dto.allow_month && 'month',
      dto.allow_list && 'list',
    ].filter(Boolean);
    if (
      !allowedViews.includes(dto.default_view)
    ) {
      throw new BadRequestException(
        'Vederea implicită trebuie să fie una dintre vederile active.',
      );
    }
    if (
      this.minutes(dto.slot_min_time) >=
      this.minutes(dto.slot_max_time)
    ) {
      throw new BadRequestException(
        'Ora de final a grilei trebuie să fie după ora de început.',
      );
    }
    const activeSources = dto.sources.filter(
      (source) => source.is_active,
    );
    if (
      activeSources.length >
      CALENDAR_LIMITS.activeSources
    ) {
      throw new BadRequestException(
        `Un calendar poate avea maximum ${CALENDAR_LIMITS.activeSources} surse active.`,
      );
    }
    if (
      dto.is_active &&
      activeSources.length === 0
    ) {
      throw new BadRequestException(
        'Un calendar activ trebuie să aibă cel puțin o sursă activă.',
      );
    }

    const entityIds = [
      ...new Set(
        dto.sources.map(
          (source) => source.id_entity,
        ),
      ),
    ];
    const entities = entityIds.length
      ? await db('entity').whereIn(
          'id_entity',
          entityIds,
        )
      : [];
    if (entities.length !== entityIds.length) {
      throw new BadRequestException(
        'Una dintre entitățile selectate nu există.',
      );
    }
    const fields: CalendarFieldRow[] =
      entityIds.length
        ? await db('field').whereIn(
            'id_entity',
            entityIds,
          )
        : [];
    const byId = new Map(
      fields.map((field) => [
        field.id_field,
        field,
      ]),
    );

    for (const source of dto.sources) {
      const start = byId.get(
        source.id_start_field,
      );
      const end = byId.get(source.id_end_field);
      if (
        !start ||
        !end ||
        start.id_entity !== source.id_entity ||
        end.id_entity !== source.id_entity
      ) {
        throw new BadRequestException(
          `Câmpurile start/end din sursa "${source.name}" trebuie să aparțină entității selectate.`,
        );
      }
      if (start.id_field === end.id_field) {
        throw new BadRequestException(
          `Sursa "${source.name}" necesită câmpuri start și end distincte.`,
        );
      }
      if (
        start.ui_type !== end.ui_type ||
        ![
          'datepicker',
          'datetimepicker',
        ].includes(start.ui_type)
      ) {
        throw new BadRequestException(
          `Câmpurile start/end din sursa "${source.name}" trebuie să fie ambele date sau ambele dată și oră.`,
        );
      }
      if (
        source.allow_create &&
        (!start.visible_in_form ||
          !end.visible_in_form)
      ) {
        throw new BadRequestException(
          `Sursa "${source.name}" nu poate permite creare: câmpurile intervalului nu sunt disponibile în formular.`,
        );
      }
      if (
        source.allow_update &&
        (!start.visible_in_form ||
          !end.visible_in_form ||
          start.is_readonly ||
          end.is_readonly)
      ) {
        throw new BadRequestException(
          `Sursa "${source.name}" nu poate permite mutare: câmpurile intervalului sunt readonly sau ascunse.`,
        );
      }

      if (
        !source.title_segments.some(
          (segment) => segment.type === 'field',
        )
      ) {
        throw new BadRequestException(
          `Titlul sursei "${source.name}" trebuie să includă cel puțin un câmp.`,
        );
      }
      for (const segment of source.title_segments) {
        if (
          segment.type === 'text' &&
          segment.value === undefined
        ) {
          throw new BadRequestException(
            'Un segment text trebuie să aibă o valoare.',
          );
        }
        if (segment.type === 'field') {
          const field = segment.id_field
            ? byId.get(segment.id_field)
            : null;
          if (
            !field ||
            field.id_entity !== source.id_entity
          ) {
            throw new BadRequestException(
              `Titlul sursei "${source.name}" conține un câmp invalid.`,
            );
          }
        }
      }
      if (
        new Set(source.popover_field_ids).size !==
        source.popover_field_ids.length
      ) {
        throw new BadRequestException(
          `Câmpurile popover din sursa "${source.name}" trebuie să fie unice.`,
        );
      }
      for (const id of source.popover_field_ids) {
        const field = byId.get(id);
        if (
          !field ||
          field.id_entity !== source.id_entity
        ) {
          throw new BadRequestException(
            `Popover-ul sursei "${source.name}" conține un câmp invalid.`,
          );
        }
      }
      for (const filter of source.filters ?? []) {
        this.validateFilter(
          filter,
          source.id_entity,
          byId,
          source.name,
        );
      }
    }
  }

  private validateFilter(
    filter: CalendarFilterDto,
    entityId: string,
    fields: Map<string, CalendarFieldRow>,
    sourceName: string,
  ) {
    const field = fields.get(filter.id_field);
    if (
      !field ||
      field.id_entity !== entityId ||
      !field.is_filterable
    ) {
      throw new BadRequestException(
        `Filtrul sursei "${sourceName}" folosește un câmp indisponibil pentru filtrare.`,
      );
    }
    if (
      !CALENDAR_FILTER_OPERATORS.includes(
        filter.operator as any,
      )
    ) {
      throw new BadRequestException(
        `Operator invalid în sursa "${sourceName}".`,
      );
    }
    if (
      filter.operator !== 'is_null' &&
      filter.value === undefined
    ) {
      throw new BadRequestException(
        `Filtrul "${field.name}" din sursa "${sourceName}" necesită o valoare.`,
      );
    }
    if (
      ['contains', 'starts_with'].includes(
        filter.operator,
      ) &&
      !['varchar', 'text'].includes(
        field.data_type,
      )
    ) {
      throw new BadRequestException(
        `Operatorul ${filter.operator} nu este compatibil cu "${field.name}".`,
      );
    }
    if (filter.operator === 'between') {
      const values = Array.isArray(filter.value)
        ? filter.value
        : String(filter.value ?? '').split(',');
      if (values.length !== 2) {
        throw new BadRequestException(
          `Operatorul between necesită două valori pentru "${field.name}".`,
        );
      }
    }
  }

  private async assertSlugAvailable(
    slug: string,
    ignoreId?: string,
  ) {
    let query = this.knex('ui_calendar').where(
      'slug',
      slug.trim(),
    );
    if (ignoreId)
      query = query.whereNot(
        'id_ui_calendar',
        ignoreId,
      );
    if (await query.first()) {
      throw new ConflictException(
        `Slug-ul "${slug}" este deja folosit.`,
      );
    }
  }

  private async ensureIndexes(
    calendarId: string,
  ) {
    const sources = await this.loadSourceRows(
      calendarId,
      undefined,
      false,
    );
    for (const source of sources) {
      for (const field of [
        source.start_field,
        source.end_field,
      ]) {
        const indexName = this.indexName(
          source.table_name,
          field.column_name,
        );
        await this.knex.raw(
          'CREATE INDEX IF NOT EXISTS ?? ON ?? (??)',
          [
            indexName,
            source.table_name,
            field.column_name,
          ],
        );
      }
    }
  }

  private indexName(
    table: string,
    column: string,
  ) {
    const compact =
      `idx_cal_${table}_${column}`.replace(
        /[^a-zA-Z0-9_]/g,
        '_',
      );
    if (compact.length <= 63) return compact;
    let hash = 0;
    for (const char of compact)
      hash =
        (hash * 31 + char.charCodeAt(0)) >>> 0;
    return `${compact.slice(0, 52)}_${hash.toString(16)}`;
  }

  private minutes(value: string) {
    const [hours, minutes] = value
      .split(':')
      .map(Number);
    return hours * 60 + minutes;
  }

  private parseJson<T>(
    value: unknown,
    fallback: T,
  ): T {
    if (value === null || value === undefined)
      return fallback;
    if (typeof value !== 'string')
      return value as T;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
}
