import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Knex } from 'knex';
import { DynamicDataService } from 'src/dynamic-data/dynamic-data.service';
import { RecordAccessService } from 'src/security/record-access.service';
import type { AuthenticatedUser } from 'src/security/security.types';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { TenantSettingsService } from 'src/tenant-settings/tenant-settings.service';
import {
  CALENDAR_FILTER_OPERATORS,
  CALENDAR_LIMITS,
  CalendarFilterOperator,
} from './calendar.constants';
import { CalendarAccessService } from './calendar-access.service';
import {
  CalendarFieldRow,
  CalendarService,
  CalendarSourceRow,
} from './calendar.service';
import {
  CalendarFilterDto,
  CalendarQueryDto,
  PreviewCalendarDto,
  UpdateCalendarIntervalDto,
} from './dto/calendar.dto';

@Injectable()
export class CalendarQueryService {
  private readonly logger = new Logger(
    CalendarQueryService.name,
  );

  constructor(
    private readonly tenantContext: TenantContext,
    private readonly recordAccess: RecordAccessService,
    private readonly access: CalendarAccessService,
    private readonly calendars: CalendarService,
    private readonly dynamicData: DynamicDataService,
    private readonly tenantSettings: TenantSettingsService,
  ) {}

  private get knex() {
    return this.tenantContext.knex;
  }

  async query(
    slug: string,
    dto: CalendarQueryDto,
    user: AuthenticatedUser,
  ) {
    await this.access.requireEnabled();
    const structure =
      await this.calendars.findBySlugPublic(
        slug,
        user,
      );
    return this.queryStructure(
      structure,
      dto,
      user,
    );
  }

  async preview(
    dto: PreviewCalendarDto,
    user: AuthenticatedUser,
  ) {
    await this.access.requireEnabled();
    const structure =
      await this.calendars.publicDraft(
        dto.calendar,
        user,
      );
    return this.queryStructure(
      structure,
      dto.query,
      user,
    );
  }

  async updateInterval(
    slug: string,
    sourceId: string,
    recordId: string,
    dto: UpdateCalendarIntervalDto,
    user: AuthenticatedUser,
  ) {
    await this.access.requireEnabled();
    const structure =
      await this.calendars.findBySlugPublic(
        slug,
        user,
      );
    const source = (
      structure.sources as CalendarSourceRow[]
    ).find(
      (item) =>
        item.id_ui_calendar_source === sourceId,
    );
    if (!source) {
      throw new ForbiddenException(
        'Sursa calendarului nu există sau nu este accesibilă.',
      );
    }
    if (
      !source.allow_update ||
      !source.capabilities?.update
    ) {
      throw new ForbiddenException(
        'Nu ai permisiunea de a muta evenimente din această sursă.',
      );
    }
    const allDay =
      source.start_field.ui_type === 'datepicker';
    if (dto.all_day !== allDay) {
      throw new BadRequestException(
        'Conversia între evenimente all-day și evenimente cu oră nu este permisă.',
      );
    }
    this.assertInterval(dto.start, dto.end);

    const result = await this.dynamicData.update(
      source.entity_slug,
      recordId,
      {
        [source.start_field.slug]: dto.start,
        [source.end_field.slug]: dto.end,
      },
      user,
    );
    return {
      message: 'Intervalul a fost actualizat.',
      record: result,
    };
  }

  private async queryStructure(
    structure: Record<string, any>,
    dto: CalendarQueryDto,
    user: AuthenticatedUser,
  ) {
    const startedAt = Date.now();
    const range = this.validateRange(dto);
    const branding =
      await this.tenantSettings.getPublicBranding();
    const allSources =
      structure.sources as CalendarSourceRow[];
    const sourceById = new Map(
      allSources.map((source) => [
        source.id_ui_calendar_source,
        source,
      ]),
    );
    if (
      dto.source_ids?.some(
        (sourceId) => !sourceById.has(sourceId),
      )
    ) {
      throw new BadRequestException(
        'Lista surselor conține o sursă inexistentă sau inaccesibilă.',
      );
    }
    const sources = dto.source_ids?.length
      ? dto.source_ids.map(
          (sourceId) => sourceById.get(sourceId)!,
        )
      : allSources;
    const runtimeBySource =
      this.validateRuntimeFilters(
        dto.filters ?? [],
        sourceById,
      );

    try {
      const eventGroups =
        await this.mapConcurrent(
          sources,
          CALENDAR_LIMITS.queryConcurrency,
          (source) =>
            this.querySource(
              source,
              user,
              range.from,
              range.to,
              runtimeBySource.get(
                source.id_ui_calendar_source,
              ) ?? [],
              branding.timezone,
              branding.locale,
            ),
        );
      const events = eventGroups.flat();
      if (
        events.length > CALENDAR_LIMITS.events
      ) {
        this.logger.warn(
          `Calendar limit exceeded sources=${sources.length} events=${events.length} durationMs=${Date.now() - startedAt}`,
        );
        throw new BadRequestException(
          `Intervalul returnează peste ${CALENDAR_LIMITS.events.toLocaleString('ro-RO')} de evenimente. Restrânge perioada, sursele sau filtrele.`,
        );
      }
      this.logger.log(
        `Calendar query sources=${sources.length} events=${events.length} durationMs=${Date.now() - startedAt}`,
      );
      return {
        calendarId: structure.id_ui_calendar,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        timeZone: branding.timezone,
        locale: branding.locale,
        events,
      };
    } catch (error) {
      const isTimeout =
        error instanceof Error &&
        (error.name
          .toLowerCase()
          .includes('timeout') ||
          error.message
            .toLowerCase()
            .includes('timeout') ||
          ('code' in error &&
            String(
              (error as { code?: unknown }).code,
            )
              .toLowerCase()
              .includes('timeout')));
      if (isTimeout) {
        this.logger.warn(
          `Calendar timeout sources=${sources.length} durationMs=${Date.now() - startedAt}`,
        );
        throw new BadRequestException(
          'Interogarea calendarului a depășit limita de 5 secunde. Restrânge perioada sau filtrele.',
        );
      }
      throw error;
    }
  }

  private async querySource(
    source: CalendarSourceRow,
    user: AuthenticatedUser,
    from: Date,
    to: Date,
    runtimeFilters: CalendarFilterDto[],
    timeZone: string,
    locale: string,
  ) {
    const entity =
      await this.recordAccess.getEntity(
        source.id_entity,
      );
    const readPolicy =
      await this.recordAccess.require(
        user,
        entity,
        'read',
      );
    const fieldMap = new Map(
      source.fields.map((field) => [
        field.id_field,
        field,
      ]),
    );
    const query = this.knex(
      `${source.table_name} as source`,
    ).select('source.*');
    this.recordAccess.applyScope(
      query,
      'source',
      readPolicy,
      user.profileId,
    );
    query
      .whereNotNull(
        `source.${source.start_field.column_name}`,
      )
      .whereNotNull(
        `source.${source.end_field.column_name}`,
      )
      .where(
        `source.${source.start_field.column_name}`,
        '<',
        to,
      )
      .where(
        `source.${source.end_field.column_name}`,
        '>',
        from,
      )
      .whereRaw('?? > ??', [
        `source.${source.end_field.column_name}`,
        `source.${source.start_field.column_name}`,
      ]);

    this.applyFilters(
      query,
      source.filters ?? [],
      fieldMap,
    );
    this.applyFilters(
      query,
      runtimeFilters,
      fieldMap,
    );
    await this.addRelationDisplayJoins(
      query,
      source,
    );

    const rows = await query
      .limit(CALENDAR_LIMITS.events + 1)
      .timeout(CALENDAR_LIMITS.queryTimeoutMs, {
        cancel: true,
      });
    const editableIds =
      await this.editableRecordIds(
        source,
        entity,
        rows.map((row) => row.id),
        user,
      );
    return rows.map((row) =>
      this.toEvent(
        source,
        row,
        timeZone,
        locale,
        editableIds.has(row.id),
      ),
    );
  }

  private async editableRecordIds(
    source: CalendarSourceRow,
    entity: Awaited<
      ReturnType<RecordAccessService['getEntity']>
    >,
    recordIds: string[],
    user: AuthenticatedUser,
  ) {
    if (!source.allow_update || !recordIds.length)
      return new Set<string>();
    const policy =
      await this.recordAccess.getPolicy(
        user,
        entity,
        'update',
      );
    if (!policy) return new Set<string>();
    if (policy.scope === 'all')
      return new Set(recordIds);
    const query = this.knex(
      `${source.table_name} as edit_record`,
    )
      .whereIn('edit_record.id', recordIds)
      .select('edit_record.id');
    this.recordAccess.applyScope(
      query,
      'edit_record',
      policy,
      user.profileId,
    );
    const accessible = await query;
    return new Set<string>(
      accessible.map((row) => row.id),
    );
  }

  private async addRelationDisplayJoins(
    query: Knex.QueryBuilder,
    source: CalendarSourceRow,
  ) {
    const referencedIds = new Set<string>();
    for (const segment of source.title_segments) {
      if (
        segment.type === 'field' &&
        typeof segment.id_field === 'string'
      ) {
        referencedIds.add(segment.id_field);
      }
    }
    for (const field of source.popover_fields) {
      referencedIds.add(field.id_field);
    }
    const relationFields = source.fields.filter(
      (field) =>
        referencedIds.has(field.id_field) &&
        field.ui_type === 'relation' &&
        field.id_relation_entity &&
        field.relation_display_field,
    );
    if (!relationFields.length) return;
    const entities = await this.knex('entity')
      .whereIn(
        'id_entity',
        relationFields.map(
          (field) => field.id_relation_entity!,
        ),
      )
      .select('id_entity', 'table_name');
    const tables = new Map(
      entities.map((entity) => [
        entity.id_entity,
        entity.table_name,
      ]),
    );
    for (const field of relationFields) {
      const table = tables.get(
        field.id_relation_entity!,
      );
      if (!table) continue;
      const alias = `calendar_rel_${field.column_name}`;
      query.leftJoin(
        `${table} as ${alias}`,
        `source.${field.column_name}`,
        `${alias}.id`,
      );
      query.select({
        [`${field.column_name}_display`]: `${alias}.${field.relation_display_field}`,
      });
    }
  }

  private toEvent(
    source: CalendarSourceRow,
    row: Record<string, any>,
    timeZone: string,
    locale: string,
    editable: boolean,
  ) {
    const allDay =
      source.start_field.ui_type === 'datepicker';
    const start = allDay
      ? this.formatDateOnly(
          row[source.start_field.column_name],
          timeZone,
        )
      : this.toIso(
          row[source.start_field.column_name],
        );
    const end = allDay
      ? this.formatDateOnly(
          row[source.end_field.column_name],
          timeZone,
        )
      : this.toIso(
          row[source.end_field.column_name],
        );
    const title = source.title_segments
      .map((segment) => {
        if (segment.type === 'text')
          return String(segment.value ?? '');
        const field = source.fields.find(
          (item) =>
            item.id_field === segment.id_field,
        );
        return field
          ? this.displayValue(
              field,
              row,
              locale,
              timeZone,
            )
          : '';
      })
      .join('')
      .trim();
    const fallback = `${source.entity_label || source.entity_slug} ${String(row.id).slice(0, 8)}`;

    return {
      id: `${source.id_ui_calendar_source}:${row.id}`,
      sourceId: source.id_ui_calendar_source,
      sourceName: source.name,
      entitySlug: source.entity_slug,
      recordId: row.id,
      title: title || fallback,
      start,
      end,
      allDay,
      color: source.color,
      popover: source.popover_fields.map(
        (field) => ({
          fieldId: field.id_field,
          label: field.name,
          value: this.displayValue(
            field,
            row,
            locale,
            timeZone,
          ),
        }),
      ),
      url: `/${source.entity_slug}/${row.id}`,
      editable: Boolean(
        source.allow_update &&
        source.capabilities?.update &&
        editable &&
        !source.start_field.is_readonly &&
        !source.end_field.is_readonly,
      ),
    };
  }

  private displayValue(
    field: CalendarFieldRow,
    row: Record<string, any>,
    locale: string,
    timeZone: string,
  ) {
    const raw =
      field.ui_type === 'relation'
        ? (row[`${field.column_name}_display`] ??
          row[field.column_name])
        : row[field.column_name];
    if (raw === null || raw === undefined)
      return '';
    if (field.ui_type === 'checkbox')
      return raw ? 'Da' : 'Nu';
    if (
      ['datepicker', 'datetimepicker'].includes(
        field.ui_type,
      )
    ) {
      const date = new Date(raw);
      if (!Number.isNaN(date.getTime())) {
        return new Intl.DateTimeFormat(
          locale || 'ro-RO',
          {
            dateStyle: 'medium',
            ...(field.ui_type === 'datetimepicker'
              ? { timeStyle: 'short' as const }
              : {}),
            timeZone,
          },
        ).format(date);
      }
    }
    const options = this.parseOptions(
      field.options,
    );
    const option = options.find(
      (item) =>
        String(item.value ?? item) ===
        String(raw),
    );
    return String(
      option?.label ??
        option?.value ??
        option ??
        raw,
    );
  }

  private validateRuntimeFilters(
    groups: CalendarQueryDto['filters'],
    sourceById: Map<string, CalendarSourceRow>,
  ) {
    const result = new Map<
      string,
      CalendarFilterDto[]
    >();
    for (const group of groups ?? []) {
      const source = sourceById.get(
        group.source_id,
      );
      if (!source) {
        throw new BadRequestException(
          'Un filtru interactiv indică o sursă inexistentă sau inaccesibilă.',
        );
      }
      const fieldMap = new Map(
        source.fields.map((field) => [
          field.id_field,
          field,
        ]),
      );
      for (const filter of group.filters) {
        const field = fieldMap.get(
          filter.id_field,
        );
        if (!field || !field.is_filterable) {
          throw new BadRequestException(
            `Câmpul filtrului nu este disponibil în sursa "${source.name}".`,
          );
        }
        this.validateFilterOperator(
          filter,
          field,
        );
      }
      result.set(
        source.id_ui_calendar_source,
        group.filters,
      );
    }
    return result;
  }

  private validateFilterOperator(
    filter: CalendarFilterDto,
    field: CalendarFieldRow,
  ) {
    if (
      !CALENDAR_FILTER_OPERATORS.includes(
        filter.operator as any,
      )
    ) {
      throw new BadRequestException(
        'Operatorul filtrului nu este valid.',
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
    if (
      filter.operator !== 'is_null' &&
      filter.value === undefined
    ) {
      throw new BadRequestException(
        `Filtrul "${field.name}" necesită o valoare.`,
      );
    }
  }

  private applyFilters(
    query: Knex.QueryBuilder,
    filters: CalendarFilterDto[],
    fieldMap: Map<string, CalendarFieldRow>,
  ) {
    for (const filter of filters) {
      const field = fieldMap.get(filter.id_field);
      if (!field) continue;
      this.applyCondition(
        query,
        `source.${field.column_name}`,
        filter.operator as CalendarFilterOperator,
        filter.value,
      );
    }
  }

  private applyCondition(
    query: Knex.QueryBuilder,
    column: string,
    operator: CalendarFilterOperator,
    value: unknown,
  ) {
    switch (operator) {
      case 'eq':
        query.where(column, value as any);
        break;
      case 'contains':
        query.whereILike(
          column,
          `%${String(value)}%`,
        );
        break;
      case 'starts_with':
        query.whereILike(
          column,
          `${String(value)}%`,
        );
        break;
      case 'gt':
        query.where(column, '>', value as any);
        break;
      case 'gte':
        query.where(column, '>=', value as any);
        break;
      case 'lt':
        query.where(column, '<', value as any);
        break;
      case 'lte':
        query.where(column, '<=', value as any);
        break;
      case 'between': {
        const range = Array.isArray(value)
          ? value
          : String(value ?? '').split(',');
        query.whereBetween(
          column,
          range as [any, any],
        );
        break;
      }
      case 'in': {
        const values = Array.isArray(value)
          ? value
          : String(value ?? '')
              .split(',')
              .filter(Boolean);
        query.whereIn(column, values);
        break;
      }
      case 'is_null':
        if (value === false || value === 'false')
          query.whereNotNull(column);
        else query.whereNull(column);
        break;
    }
  }

  private validateRange(dto: CalendarQueryDto) {
    const from = new Date(dto.from);
    const to = new Date(dto.to);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from >= to
    ) {
      throw new BadRequestException(
        'Intervalul de date nu este valid.',
      );
    }
    const days =
      (to.getTime() - from.getTime()) /
      86_400_000;
    if (days > CALENDAR_LIMITS.rangeDays) {
      throw new BadRequestException(
        `O cerere de calendar poate acoperi maximum ${CALENDAR_LIMITS.rangeDays} de zile.`,
      );
    }
    return { from, to };
  }

  private assertInterval(
    startValue: string,
    endValue: string,
  ) {
    const start = new Date(startValue);
    const end = new Date(endValue);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      throw new BadRequestException(
        'Data de final trebuie să fie strict după data de început.',
      );
    }
  }

  private formatDateOnly(
    value: unknown,
    timeZone: string,
  ) {
    if (
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
      return value;
    }
    const date = new Date(value as any);
    const parts = new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      },
    ).formatToParts(date);
    const get = (
      type: Intl.DateTimeFormatPartTypes,
    ) =>
      parts.find((part) => part.type === type)
        ?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  private toIso(value: unknown) {
    const date = new Date(value as any);
    return date.toISOString();
  }

  private parseOptions(value: unknown): any[] {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async mapConcurrent<T, R>(
    items: T[],
    limit: number,
    mapper: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const result = new Array<R>(items.length);
    let next = 0;
    const workers = Array.from(
      { length: Math.min(limit, items.length) },
      async () => {
        while (next < items.length) {
          const index = next++;
          result[index] = await mapper(
            items[index],
          );
        }
      },
    );
    await Promise.all(workers);
    return result;
  }
}
