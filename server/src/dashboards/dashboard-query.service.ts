import { BadRequestException, Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import { AuthorizationService } from 'src/security/authorization.service';
import { AuthenticatedUser, PermissionScope } from 'src/security/security.types';
import { TenantContext } from 'src/tenant/tenant-context.service';
import {
  DASHBOARD_LIMITS,
  DashboardAggregation,
  DashboardDateGranularity,
  DashboardFilterOperator,
} from './dashboard.constants';
import { DashboardAccessService } from './dashboard-access.service';
import { DashboardQueryDto } from './dto/dashboard.dto';
import { DashboardService } from './dashboard.service';

interface QueryField {
  id_field: string;
  id_entity: string;
  name: string;
  slug: string;
  column_name: string;
  data_type: string;
  ui_type: string;
  options: unknown;
  id_relation_entity: string | null;
  relation_display_field: string | null;
  relation_table?: string | null;
}

interface StoredFilter {
  id_field: string;
  operator: DashboardFilterOperator;
  value: unknown;
}

@Injectable()
export class DashboardQueryService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly authorization: AuthorizationService,
    private readonly access: DashboardAccessService,
    private readonly dashboards: DashboardService,
  ) {}

  private get knex() { return this.tenantContext.knex; }

  async query(slug: string, dto: DashboardQueryDto, user: AuthenticatedUser) {
    await this.access.requireEnabled();
    const range = this.validateRange(dto);
    const structure = await this.dashboards.findBySlugPublic(slug, user);
    const accessibleIds = new Set<string>(
      structure.blocks.flatMap((block: any) => block.widgets.map((widget: any) => widget.id_ui_widget)),
    );
    const selectedIds = dto.widgetIds?.length
      ? dto.widgetIds.filter((id) => accessibleIds.has(id))
      : [...accessibleIds];
    const rows = await this.dashboards.loadWidgetRows(structure.id_ui_dashboard, selectedIds);

    const widgets = await this.mapConcurrent(rows, DASHBOARD_LIMITS.queryConcurrency, async (widget) => {
      try {
        return await this.queryWidget(widget, user, range.from, range.to, dto.timeZone);
      } catch (error) {
        return {
          widgetId: widget.id_ui_widget,
          kind: widget.widget_type,
          error: {
            code: 'WIDGET_QUERY_FAILED',
            message: error instanceof Error ? error.message : 'Widget-ul nu a putut fi calculat.',
          },
        };
      }
    });

    return {
      dashboardId: structure.id_ui_dashboard,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      timeZone: dto.timeZone,
      widgets,
    };
  }

  private async queryWidget(
    widget: any,
    user: AuthenticatedUser,
    from: Date,
    to: Date,
    timeZone: string,
  ) {
    const scope = await this.authorization.require(user, widget.id_entity, 'read');
    const fields = await this.knex<QueryField>('field').where('id_entity', widget.id_entity);
    await this.attachRelationTables(fields);
    const fieldMap = new Map(fields.map((field) => [field.id_field, field]));
    const filters = this.parseFilters(widget.filters);

    if (widget.widget_type === 'kpi') {
      return this.queryKpi(widget, fields, fieldMap, filters, scope, user, from, to);
    }
    return this.queryChart(widget, fields, fieldMap, filters, scope, user, from, to, timeZone);
  }

  private async queryKpi(
    widget: any,
    fields: QueryField[],
    fieldMap: Map<string, QueryField>,
    filters: StoredFilter[],
    scope: PermissionScope,
    user: AuthenticatedUser,
    from: Date,
    to: Date,
  ) {
    const value = await this.aggregate(widget, fieldMap, filters, scope, user, from, to);
    let previousValue: number | null = null;
    let changePercent: number | null = null;
    let isNew = false;

    if (widget.comparison_enabled && widget.date_source) {
      const duration = to.getTime() - from.getTime();
      const previousFrom = new Date(from.getTime() - duration);
      previousValue = await this.aggregate(widget, fieldMap, filters, scope, user, previousFrom, from);
      if (previousValue === 0) {
        isNew = value > 0;
        changePercent = value === 0 ? 0 : null;
      } else {
        changePercent = ((value - previousValue) / Math.abs(previousValue)) * 100;
      }
    }

    return {
      widgetId: widget.id_ui_widget,
      kind: 'kpi',
      value,
      previousValue,
      changePercent,
      isNew,
      drilldown: widget.drilldown_enabled
        ? this.buildDrilldown(widget, fields, filters, from, to)
        : null,
    };
  }

  private async aggregate(
    widget: any,
    fieldMap: Map<string, QueryField>,
    filters: StoredFilter[],
    scope: PermissionScope,
    user: AuthenticatedUser,
    from: Date,
    to: Date,
  ): Promise<number> {
    const query = this.baseQuery(widget, fieldMap, filters, scope, user, from, to);
    this.selectAggregate(query, widget.aggregation, this.valueColumn(widget, fieldMap));
    const row = await query.first().timeout(DASHBOARD_LIMITS.queryTimeoutMs, { cancel: true });
    return Number(row?.value ?? 0);
  }

  private async queryChart(
    widget: any,
    fields: QueryField[],
    fieldMap: Map<string, QueryField>,
    filters: StoredFilter[],
    scope: PermissionScope,
    user: AuthenticatedUser,
    from: Date,
    to: Date,
    timeZone: string,
  ) {
    const query = this.baseQuery(widget, fieldMap, filters, scope, user, from, to);
    const groupField = widget.id_group_field ? fieldMap.get(widget.id_group_field) : undefined;
    const seriesField = widget.id_series_field ? fieldMap.get(widget.id_series_field) : undefined;
    const granularity = this.effectiveGranularity(widget.date_granularity, from, to);
    let groupStartExpression: Knex.Raw | null = null;
    let groupEndExpression: Knex.Raw | null = null;

    if (widget.group_mode === 'time') {
      const dateColumn = this.dateColumn(widget, fieldMap);
      if (!dateColumn) throw new BadRequestException('Graficul temporal nu are un camp de data valid.');
      const interval = ({ day: '1 day', week: '1 week', month: '1 month' } as const)[granularity];
      groupStartExpression = this.knex.raw(
        'date_trunc(?::text, ?? AT TIME ZONE ?) AT TIME ZONE ?',
        [granularity, `source.${dateColumn}`, timeZone, timeZone],
      );
      groupEndExpression = this.knex.raw(
        '(date_trunc(?::text, ?? AT TIME ZONE ?) + ?::interval) AT TIME ZONE ?',
        [granularity, `source.${dateColumn}`, timeZone, interval, timeZone],
      );
      query.select({ group_key: groupStartExpression, group_end: groupEndExpression });
      // PostgreSQL treats repeated parameterized expressions as different expressions
      // because Knex assigns new placeholders in GROUP BY. Group by the selected
      // positions so the exact timezone/date_trunc expressions are reused.
      query.groupByRaw('1, 2');
      query.orderBy('group_key', 'asc');
    } else {
      if (!groupField) throw new BadRequestException('Graficul categorial nu are camp de grupare.');
      this.addDimension(query, groupField, 'group');
      query.orderBy('value', 'desc');
    }

    if (seriesField) this.addDimension(query, seriesField, 'series');
    this.selectAggregate(query, widget.aggregation, this.valueColumn(widget, fieldMap));

    const rawRows = await query.limit(1000).timeout(DASHBOARD_LIMITS.queryTimeoutMs, { cancel: true });
    const rows = rawRows.map((row: any) => ({
      ...row,
      value: Number(row.value ?? 0),
      group_key: this.normalizeKey(row.group_key),
      group_end: this.normalizeKey(row.group_end),
      group_label: row.group_label ?? this.labelForField(groupField, row.group_key),
      series_key: row.series_key == null ? '__value__' : String(row.series_key),
      series_label: seriesField
        ? row.series_label ?? this.labelForField(seriesField, row.series_key)
        : widget.title,
    }));

    const limitedRows = this.limitChartRows(rows, widget.group_mode, widget.top_n, Boolean(seriesField));
    const seriesMap = new Map<string, { key: string; label: string; points: any[] }>();
    for (const row of limitedRows) {
      const seriesKey = row.series_key ?? '__value__';
      if (!seriesMap.has(seriesKey)) {
        seriesMap.set(seriesKey, {
          key: seriesKey,
          label: row.series_label || (seriesField ? 'Fara valoare' : widget.title),
          points: [],
        });
      }
      seriesMap.get(seriesKey)!.points.push({
        key: row.group_key == null ? '__empty__' : String(row.group_key),
        label: row.group_label || 'Fara valoare',
        value: row.value,
        drilldown: widget.drilldown_enabled
          ? this.buildDrilldown(widget, fields, filters, from, to, {
              groupField,
              groupKey: row.group_key,
              groupEnd: row.group_end,
              seriesField,
              seriesKey: row.series_key === '__value__' ? null : row.series_key,
            })
          : null,
      });
    }

    return {
      widgetId: widget.id_ui_widget,
      kind: 'chart',
      chartType: widget.chart_type,
      effectiveGranularity: widget.group_mode === 'time' ? granularity : null,
      series: [...seriesMap.values()],
    };
  }

  private baseQuery(
    widget: any,
    fieldMap: Map<string, QueryField>,
    filters: StoredFilter[],
    scope: PermissionScope,
    user: AuthenticatedUser,
    from: Date,
    to: Date,
  ) {
    const query = this.knex(`${widget.table_name} as source`);
    this.authorization.applyScope(query, 'source', scope, user.profileId);
    const dateColumn = this.dateColumn(widget, fieldMap);
    if (dateColumn) query.where(`source.${dateColumn}`, '>=', from).where(`source.${dateColumn}`, '<', to);
    this.applyFilters(query, filters, fieldMap);
    return query;
  }

  private selectAggregate(query: Knex.QueryBuilder, aggregation: DashboardAggregation, column: string | null) {
    switch (aggregation) {
      case 'count': query.count({ value: 'source.id' }); break;
      case 'sum': query.sum({ value: column! }); break;
      case 'avg': query.avg({ value: column! }); break;
      case 'min': query.min({ value: column! }); break;
      case 'max': query.max({ value: column! }); break;
    }
  }

  private valueColumn(widget: any, fieldMap: Map<string, QueryField>) {
    if (widget.aggregation === 'count') return null;
    const field = fieldMap.get(widget.id_value_field);
    if (!field) throw new BadRequestException('Campul numeric al widget-ului nu mai exista.');
    return `source.${field.column_name}`;
  }

  private dateColumn(widget: any, fieldMap: Map<string, QueryField>) {
    if (widget.date_source === 'date_created' || widget.date_source === 'date_updated') return widget.date_source;
    if (widget.date_source === 'field') return fieldMap.get(widget.id_date_field)?.column_name ?? null;
    return null;
  }

  private addDimension(query: Knex.QueryBuilder, field: QueryField, prefix: 'group' | 'series') {
    const sourceColumn = `source.${field.column_name}`;
    query.select({ [`${prefix}_key`]: sourceColumn });
    query.groupBy(sourceColumn);

    if (field.ui_type === 'relation' && field.relation_table && field.relation_display_field) {
      const alias = `${prefix}_relation`;
      query.leftJoin(`${field.relation_table} as ${alias}`, sourceColumn, `${alias}.id`);
      query.select({ [`${prefix}_label`]: `${alias}.${field.relation_display_field}` });
      query.groupBy(`${alias}.${field.relation_display_field}`);
    }
  }

  private async attachRelationTables(fields: QueryField[]) {
    const ids = [...new Set(fields.map((field) => field.id_relation_entity).filter(Boolean) as string[])];
    if (!ids.length) return;
    const entities = await this.knex('entity').whereIn('id_entity', ids).select('id_entity', 'table_name');
    const tableMap = new Map(entities.map((entity) => [entity.id_entity, entity.table_name]));
    for (const field of fields) field.relation_table = field.id_relation_entity ? tableMap.get(field.id_relation_entity) ?? null : null;
  }

  private applyFilters(query: Knex.QueryBuilder, filters: StoredFilter[], fieldMap: Map<string, QueryField>) {
    const grouped = new Map<string, StoredFilter[]>();
    for (const filter of filters) {
      if (!grouped.has(filter.id_field)) grouped.set(filter.id_field, []);
      grouped.get(filter.id_field)!.push(filter);
    }

    for (const [fieldId, conditions] of grouped) {
      const field = fieldMap.get(fieldId);
      if (!field) continue;
      const column = `source.${field.column_name}`;
      query.where((builder) => {
        conditions.forEach((condition, index) => this.applyCondition(builder, column, condition, index > 0));
      });
    }
  }

  private applyCondition(query: Knex.QueryBuilder, column: string, filter: StoredFilter, useOr: boolean) {
    const value = filter.value as any;
    switch (filter.operator) {
      case 'eq': useOr ? query.orWhere(column, value) : query.where(column, value); break;
      case 'contains': useOr ? query.orWhereILike(column, `%${value}%`) : query.whereILike(column, `%${value}%`); break;
      case 'starts_with': useOr ? query.orWhereILike(column, `${value}%`) : query.whereILike(column, `${value}%`); break;
      case 'gt': useOr ? query.orWhere(column, '>', value) : query.where(column, '>', value); break;
      case 'gte': useOr ? query.orWhere(column, '>=', value) : query.where(column, '>=', value); break;
      case 'lt': useOr ? query.orWhere(column, '<', value) : query.where(column, '<', value); break;
      case 'lte': useOr ? query.orWhere(column, '<=', value) : query.where(column, '<=', value); break;
      case 'between': {
        const range = value as [any, any];
        useOr ? query.orWhereBetween(column, range) : query.whereBetween(column, range);
        break;
      }
      case 'in': useOr ? query.orWhereIn(column, value as any[]) : query.whereIn(column, value as any[]); break;
      case 'is_null':
        if (value) useOr ? query.orWhereNull(column) : query.whereNull(column);
        else useOr ? query.orWhereNotNull(column) : query.whereNotNull(column);
        break;
    }
  }

  private buildDrilldown(
    widget: any,
    fields: QueryField[],
    filters: StoredFilter[],
    from: Date,
    to: Date,
    point?: {
      groupField?: QueryField;
      groupKey?: unknown;
      groupEnd?: unknown;
      seriesField?: QueryField;
      seriesKey?: unknown;
    },
  ) {
    const fieldMap = new Map(fields.map((field) => [field.id_field, field]));
    const output = filters.flatMap((filter) => {
      const field = fieldMap.get(filter.id_field);
      return field ? [{ field: field.column_name, op: filter.operator, value: filter.value }] : [];
    });
    const dateColumn = this.dateColumn(widget, fieldMap);
    if (dateColumn) {
      const rangeStart = point?.groupEnd ? point.groupKey : from.toISOString();
      const rangeEnd = point?.groupEnd ? point.groupEnd : to.toISOString();
      output.push({
        field: dateColumn,
        op: 'between',
        value: [rangeStart, new Date(new Date(String(rangeEnd)).getTime() - 1).toISOString()],
      });
    }
    if (point?.groupField && point.groupKey !== null && point.groupKey !== undefined) {
      output.push({ field: point.groupField.column_name, op: 'eq', value: point.groupKey });
    }
    if (point?.seriesField && point.seriesKey !== null && point.seriesKey !== undefined) {
      output.push({ field: point.seriesField.column_name, op: 'eq', value: point.seriesKey });
    }
    return { entitySlug: widget.entity_slug, filters: output };
  }

  private limitChartRows(rows: any[], groupMode: string, topN: number, hasSeries: boolean) {
    let output = rows;
    if (hasSeries) {
      const totals = new Map<string, number>();
      for (const row of output) totals.set(row.series_key, (totals.get(row.series_key) ?? 0) + Math.abs(row.value));
      const allowed = new Set([...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, DASHBOARD_LIMITS.series)
        .map(([key]) => key));
      output = output.filter((row) => allowed.has(row.series_key));
    }
    if (groupMode === 'category') {
      const totals = new Map<string, number>();
      for (const row of output) totals.set(String(row.group_key), (totals.get(String(row.group_key)) ?? 0) + Math.abs(row.value));
      const allowed = new Set([...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([key]) => key));
      output = output.filter((row) => allowed.has(String(row.group_key)));
    }
    return output.slice(0, DASHBOARD_LIMITS.points * Math.max(1, DASHBOARD_LIMITS.series));
  }

  private effectiveGranularity(requested: DashboardDateGranularity, from: Date, to: Date): Exclude<DashboardDateGranularity, 'auto'> {
    const days = Math.max(1, (to.getTime() - from.getTime()) / 86_400_000);
    const minimum = days <= 45 ? 'day' : days <= 365 ? 'week' : 'month';
    if (requested === 'auto') return minimum;
    const estimate = requested === 'day' ? days : requested === 'week' ? days / 7 : days / 30;
    return estimate <= DASHBOARD_LIMITS.points ? requested : minimum;
  }

  private labelForField(field: QueryField | undefined, value: unknown) {
    if (value === null || value === undefined || value === '') return 'Fara valoare';
    if (!field) return String(value);
    const options = this.parseOptions(field.options);
    const option = options.find((item: any) => String(item.value ?? item) === String(value));
    return option ? String(option.label ?? option.value ?? option) : String(value);
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

  private parseFilters(value: unknown): StoredFilter[] {
    if (Array.isArray(value)) return value as StoredFilter[];
    if (typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private normalizeKey(value: unknown) {
    if (value instanceof Date) return value.toISOString();
    return value;
  }

  private validateRange(dto: DashboardQueryDto) {
    const from = new Date(dto.from);
    const to = new Date(dto.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      throw new BadRequestException('Intervalul de date nu este valid.');
    }
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: dto.timeZone }).format(from);
    } catch {
      throw new BadRequestException('Timezone-ul nu este valid.');
    }
    return { from, to };
  }

  private async mapConcurrent<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
    const result = new Array<R>(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        result[index] = await mapper(items[index]);
      }
    });
    await Promise.all(workers);
    return result;
  }
}
