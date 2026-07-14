import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Knex } from 'knex';
import { AuthorizationService } from 'src/security/authorization.service';
import { AuthenticatedUser } from 'src/security/security.types';
import { TenantContext } from 'src/tenant/tenant-context.service';
import {
  DASHBOARD_CATALOG,
  DASHBOARD_LIMITS,
  DashboardAggregation,
  DashboardChartType,
  DashboardFilterOperator,
  DashboardGroupMode,
} from './dashboard.constants';
import { DashboardAccessService } from './dashboard-access.service';
import { DashboardFilterDto, DashboardWidgetDto, SaveDashboardDto } from './dto/dashboard.dto';

interface DashboardFieldRow {
  id_field: string;
  id_entity: string;
  name: string;
  slug: string;
  column_name: string;
  data_type: string;
  ui_type: string;
  is_filterable: boolean;
  options: unknown;
  id_relation_entity: string | null;
  relation_display_field: string | null;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly authorization: AuthorizationService,
    private readonly access: DashboardAccessService,
  ) {}

  private get knex() { return this.tenantContext.knex; }

  async catalog() {
    await this.access.requireEnabled();
    return DASHBOARD_CATALOG;
  }

  async findAllAdmin() {
    await this.access.requireEnabled();
    return this.knex('ui_dashboard as dashboard')
      .leftJoin('ui_block as block', 'block.id_ui_dashboard', 'dashboard.id_ui_dashboard')
      .leftJoin('ui_widget as widget', 'widget.id_ui_block', 'block.id_ui_block')
      .select('dashboard.*')
      .countDistinct('block.id_ui_block as blocks_count')
      .countDistinct('widget.id_ui_widget as widgets_count')
      .groupBy('dashboard.id_ui_dashboard')
      .orderBy('dashboard.rank', 'asc');
  }

  async findOneAdmin(id: string) {
    await this.access.requireEnabled();
    return this.loadStructure({ id, activeOnly: false });
  }

  async create(dto: SaveDashboardDto) {
    await this.access.requireEnabled();
    await this.assertSlugAvailable(dto.slug);

    const id = await this.knex.transaction(async (trx) => {
      await this.validateConfiguration(trx, dto);
      if (dto.is_default && dto.is_active) {
        await trx('ui_dashboard').update({ is_default: false, date_updated: trx.fn.now() });
      }

      const [dashboard] = await trx('ui_dashboard')
        .insert(this.dashboardRecord(dto))
        .returning('id_ui_dashboard');
      await this.replaceBlocks(trx, dashboard.id_ui_dashboard, dto);
      return dashboard.id_ui_dashboard as string;
    });

    return this.loadStructure({ id, activeOnly: false });
  }

  async update(id: string, dto: SaveDashboardDto) {
    await this.access.requireEnabled();
    const current = await this.knex('ui_dashboard').where('id_ui_dashboard', id).first();
    if (!current) throw new NotFoundException(`Dashboard-ul cu id "${id}" nu exista.`);
    await this.assertSlugAvailable(dto.slug, id);

    await this.knex.transaction(async (trx) => {
      await this.validateConfiguration(trx, dto);
      if (current.is_default && (!dto.is_default || !dto.is_active)) {
        const alternative = await trx('ui_dashboard')
          .whereNot('id_ui_dashboard', id)
          .where({ is_default: true, is_active: true })
          .first();
        if (!alternative) {
          throw new BadRequestException('Selecteaza mai intai un alt dashboard implicit.');
        }
      }

      if (dto.is_default && dto.is_active) {
        await trx('ui_dashboard')
          .whereNot('id_ui_dashboard', id)
          .update({ is_default: false, date_updated: trx.fn.now() });
      }

      await trx('ui_dashboard')
        .where('id_ui_dashboard', id)
        .update({ ...this.dashboardRecord(dto), date_updated: trx.fn.now() });
      await this.replaceBlocks(trx, id, dto);
    });

    return this.loadStructure({ id, activeOnly: false });
  }

  async remove(id: string) {
    await this.access.requireEnabled();
    const dashboard = await this.knex('ui_dashboard').where('id_ui_dashboard', id).first();
    if (!dashboard) throw new NotFoundException(`Dashboard-ul cu id "${id}" nu exista.`);
    if (dashboard.is_default) {
      throw new BadRequestException('Dashboard-ul implicit nu poate fi dezactivat. Selecteaza mai intai altul.');
    }

    await this.knex('ui_dashboard')
      .where('id_ui_dashboard', id)
      .update({ is_active: false, date_updated: this.knex.fn.now() });
    return { message: `Dashboard-ul "${dashboard.name}" a fost dezactivat.` };
  }

  async findDefaultPublic(user: AuthenticatedUser) {
    await this.access.requireEnabled();
    const dashboard = await this.knex('ui_dashboard')
      .where({ is_default: true, is_active: true })
      .first();
    if (!dashboard) throw new NotFoundException('Nu exista un dashboard implicit activ.');
    return this.publicStructure(dashboard.id_ui_dashboard, user);
  }

  async findBySlugPublic(slug: string, user: AuthenticatedUser) {
    await this.access.requireEnabled();
    const dashboard = await this.knex('ui_dashboard').where({ slug, is_active: true }).first();
    if (!dashboard) throw new NotFoundException(`Dashboard-ul "${slug}" nu exista.`);
    return this.publicStructure(dashboard.id_ui_dashboard, user);
  }

  async canViewDashboard(id: string, user: AuthenticatedUser): Promise<boolean> {
    if (!await this.access.isEnabled()) return false;
    const dashboard = await this.knex('ui_dashboard').where({ id_ui_dashboard: id, is_active: true }).first();
    if (!dashboard) return false;
    const widgets = await this.knex('ui_widget as widget')
      .join('ui_block as block', 'block.id_ui_block', 'widget.id_ui_block')
      .where({ 'block.id_ui_dashboard': id, 'block.is_active': true, 'widget.is_active': true })
      .select('widget.id_entity');
    for (const widget of widgets) {
      if (await this.authorization.getScope(user, widget.id_entity, 'read')) return true;
    }
    return false;
  }

  async loadWidgetRows(dashboardId: string, widgetIds?: string[]) {
    let query = this.knex('ui_widget as widget')
      .join('ui_block as block', 'block.id_ui_block', 'widget.id_ui_block')
      .join('ui_dashboard as dashboard', 'dashboard.id_ui_dashboard', 'block.id_ui_dashboard')
      .join('entity', 'entity.id_entity', 'widget.id_entity')
      .where({
        'dashboard.id_ui_dashboard': dashboardId,
        'dashboard.is_active': true,
        'block.is_active': true,
        'widget.is_active': true,
      })
      .select('widget.*', 'entity.slug as entity_slug', 'entity.table_name', 'entity.label_plural as entity_label');
    if (widgetIds?.length) query = query.whereIn('widget.id_ui_widget', widgetIds);
    return query.orderBy(['block.rank', 'widget.rank']);
  }

  async resolveDashboardId(slug: string): Promise<string> {
    const dashboard = await this.knex('ui_dashboard').where({ slug, is_active: true }).first();
    if (!dashboard) throw new NotFoundException(`Dashboard-ul "${slug}" nu exista.`);
    return dashboard.id_ui_dashboard;
  }

  private dashboardRecord(dto: SaveDashboardDto) {
    return {
      name: dto.name.trim(),
      slug: dto.slug.trim(),
      description: dto.description?.trim() || null,
      icon: dto.icon?.trim() || null,
      default_date_preset: dto.default_date_preset,
      is_default: dto.is_default,
      is_active: dto.is_active,
      rank: dto.rank,
    };
  }

  private async replaceBlocks(trx: Knex.Transaction, dashboardId: string, dto: SaveDashboardDto) {
    await trx('ui_block').where('id_ui_dashboard', dashboardId).del();

    for (const [blockIndex, block] of dto.blocks.entries()) {
      const [createdBlock] = await trx('ui_block').insert({
        id_ui_dashboard: dashboardId,
        title: block.title.trim(),
        subtitle: block.subtitle?.trim() || null,
        rank: blockIndex,
        is_active: block.is_active,
      }).returning('id_ui_block');

      for (const [widgetIndex, widget] of block.widgets.entries()) {
        await trx('ui_widget').insert(this.widgetRecord(createdBlock.id_ui_block, widget, widgetIndex));
      }
    }
  }

  private widgetRecord(blockId: string, widget: DashboardWidgetDto, rank: number) {
    const isKpi = widget.widget_type === 'kpi';
    const isCount = widget.aggregation === 'count';
    return {
      id_ui_block: blockId,
      id_entity: widget.id_entity,
      widget_type: widget.widget_type,
      chart_type: isKpi ? null : widget.chart_type,
      title: widget.title.trim(),
      subtitle: widget.subtitle?.trim() || null,
      icon: widget.icon?.trim() || null,
      aggregation: widget.aggregation,
      id_value_field: isCount ? null : widget.id_value_field || null,
      group_mode: isKpi ? null : widget.group_mode || null,
      id_group_field: !isKpi && widget.group_mode === 'category' ? widget.id_group_field || null : null,
      id_series_field: !isKpi && widget.chart_type !== 'donut' ? widget.id_series_field || null : null,
      date_source: widget.date_source || null,
      id_date_field: widget.date_source === 'field' ? widget.id_date_field || null : null,
      date_granularity: widget.date_granularity,
      filters: JSON.stringify(widget.filters ?? []),
      comparison_enabled: isKpi && Boolean(widget.date_source) ? widget.comparison_enabled : false,
      value_format: widget.value_format,
      currency_code: widget.currency_code.toUpperCase(),
      top_n: widget.top_n,
      col_span: widget.col_span,
      rank,
      drilldown_enabled: widget.drilldown_enabled,
      is_active: widget.is_active,
    };
  }

  private async validateConfiguration(trx: Knex.Transaction, dto: SaveDashboardDto) {
    const widgets = dto.blocks.flatMap((block) => block.widgets);
    if (widgets.length > DASHBOARD_LIMITS.widgets) {
      throw new BadRequestException(`Un dashboard poate contine maximum ${DASHBOARD_LIMITS.widgets} widget-uri.`);
    }

    for (const widget of widgets) await this.validateWidget(trx, widget);
  }

  private async validateWidget(trx: Knex.Transaction, widget: DashboardWidgetDto) {
    const entity = await trx('entity').where('id_entity', widget.id_entity).first();
    if (!entity) throw new BadRequestException(`Entitatea widget-ului "${widget.title}" nu exista.`);

    const fields = await trx<DashboardFieldRow>('field').where('id_entity', widget.id_entity);
    const fieldMap = new Map(fields.map((field) => [field.id_field, field]));
    const field = (id?: string | null) => id ? fieldMap.get(id) : undefined;

    const aggregation = widget.aggregation as DashboardAggregation;
    if (aggregation !== 'count') {
      const valueField = field(widget.id_value_field);
      if (!valueField || !['integer', 'numeric'].includes(valueField.data_type)) {
        throw new BadRequestException(`Widget-ul "${widget.title}" necesita un camp numeric pentru ${aggregation}.`);
      }
    }

    if (widget.date_source === 'field') {
      const dateField = field(widget.id_date_field);
      if (!dateField || dateField.data_type !== 'datetime') {
        throw new BadRequestException(`Campul de data al widget-ului "${widget.title}" nu este valid.`);
      }
    }

    if (widget.comparison_enabled && !widget.date_source) {
      throw new BadRequestException(`Comparatia KPI-ului "${widget.title}" necesita un camp de data.`);
    }

    if (widget.widget_type === 'chart') {
      this.validateChart(widget, field);
    }

    for (const filter of widget.filters ?? []) {
      const filterField = field(filter.id_field);
      if (!filterField || !filterField.is_filterable) {
        throw new BadRequestException(`Un filtru din widget-ul "${widget.title}" foloseste un camp nefiltrabil.`);
      }
      if (!this.operatorAllowed(filter.operator as DashboardFilterOperator, filterField)) {
        throw new BadRequestException(`Operatorul filtrului din widget-ul "${widget.title}" nu este compatibil cu acel camp.`);
      }
      this.validateFilterValue(filter, widget.title);
    }
  }

  private validateChart(
    widget: DashboardWidgetDto,
    field: (id?: string | null) => DashboardFieldRow | undefined,
  ) {
    const chartType = widget.chart_type as DashboardChartType | undefined;
    const groupMode = widget.group_mode as DashboardGroupMode | undefined;
    if (!chartType) throw new BadRequestException(`Widget-ul "${widget.title}" necesita un tip de grafic.`);
    if (!groupMode) throw new BadRequestException(`Widget-ul "${widget.title}" necesita un mod de grupare.`);

    if (['line', 'area'].includes(chartType) && groupMode !== 'time') {
      throw new BadRequestException('Graficele linie si arie necesita grupare in timp.');
    }
    if (chartType === 'donut' && groupMode !== 'category') {
      throw new BadRequestException('Graficul donut necesita grupare pe categorie.');
    }
    if (groupMode === 'time' && !widget.date_source) {
      throw new BadRequestException(`Widget-ul "${widget.title}" necesita un camp de data pentru gruparea in timp.`);
    }
    if (groupMode === 'category') {
      const groupField = field(widget.id_group_field);
      if (!groupField || !this.isCategoryField(groupField)) {
        throw new BadRequestException(`Campul de grupare al widget-ului "${widget.title}" nu este categorial.`);
      }
    }
    if (widget.id_series_field) {
      if (chartType === 'donut') throw new BadRequestException('Graficul donut nu accepta serii multiple.');
      const seriesField = field(widget.id_series_field);
      if (!seriesField || !this.isCategoryField(seriesField)) {
        throw new BadRequestException(`Campul de serie al widget-ului "${widget.title}" nu este categorial.`);
      }
    }
  }

  private isCategoryField(field: DashboardFieldRow) {
    return field.ui_type === 'relation'
      || field.ui_type === 'select'
      || ['varchar', 'boolean', 'uuid'].includes(field.data_type);
  }

  private operatorAllowed(operator: DashboardFilterOperator, field: DashboardFieldRow) {
    if (field.ui_type === 'relation') return ['eq', 'in', 'is_null'].includes(operator);
    if (field.data_type === 'boolean') return ['eq', 'is_null'].includes(operator);
    if (['integer', 'numeric', 'datetime'].includes(field.data_type)) {
      return ['eq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null'].includes(operator);
    }
    return ['eq', 'contains', 'starts_with', 'is_null'].includes(operator);
  }

  private validateFilterValue(filter: DashboardFilterDto, title: string) {
    if (filter.operator === 'is_null') {
      if (typeof filter.value !== 'boolean') throw new BadRequestException(`Filtrul is_null din "${title}" necesita true sau false.`);
      return;
    }
    if (filter.operator === 'between') {
      if (!Array.isArray(filter.value) || filter.value.length !== 2) {
        throw new BadRequestException(`Filtrul between din "${title}" necesita doua valori.`);
      }
      return;
    }
    if (filter.operator === 'in') {
      if (!Array.isArray(filter.value) || filter.value.length === 0) {
        throw new BadRequestException(`Filtrul in din "${title}" necesita cel putin o valoare.`);
      }
      return;
    }
    if (filter.value === null || filter.value === undefined || filter.value === '') {
      throw new BadRequestException(`Un filtru din "${title}" nu are valoare.`);
    }
  }

  private async publicStructure(id: string, user: AuthenticatedUser) {
    const structure = await this.loadStructure({ id, activeOnly: true });
    const configuredWidgetCount = structure.blocks.reduce((total: number, block: any) => total + block.widgets.length, 0);
    const blocks: any[] = [];

    for (const block of structure.blocks) {
      const widgets: any[] = [];
      for (const widget of block.widgets) {
        if (await this.authorization.getScope(user, widget.id_entity, 'read')) widgets.push(widget);
      }
      if (widgets.length) blocks.push({ ...block, widgets });
    }

    if (!blocks.length && configuredWidgetCount > 0) {
      throw new NotFoundException('Nu ai acces la datele acestui dashboard.');
    }
    return { ...structure, blocks };
  }

  private async loadStructure(options: { id: string; activeOnly: boolean }) {
    const dashboardQuery = this.knex('ui_dashboard').where('id_ui_dashboard', options.id);
    if (options.activeOnly) dashboardQuery.where('is_active', true);
    const dashboard = await dashboardQuery.first();
    if (!dashboard) throw new NotFoundException(`Dashboard-ul cu id "${options.id}" nu exista.`);

    const blocksQuery = this.knex('ui_block')
      .where('id_ui_dashboard', dashboard.id_ui_dashboard)
      .orderBy('rank', 'asc');
    if (options.activeOnly) blocksQuery.where('is_active', true);
    const blockRows = await blocksQuery;
    const blocks: any[] = [];

    for (const block of blockRows) {
      let widgetsQuery = this.knex('ui_widget as widget')
        .join('entity', 'entity.id_entity', 'widget.id_entity')
        .where('widget.id_ui_block', block.id_ui_block)
        .select('widget.*', 'entity.slug as entity_slug', 'entity.name as entity_name', 'entity.label_plural as entity_label')
        .orderBy('widget.rank', 'asc');
      if (options.activeOnly) widgetsQuery = widgetsQuery.where('widget.is_active', true);
      const widgets = await widgetsQuery;
      blocks.push({
        ...block,
        widgets: widgets.map((widget) => ({
          ...widget,
          filters: this.normalizeFilters(widget.filters),
        })),
      });
    }

    return { ...dashboard, blocks };
  }

  private async assertSlugAvailable(slug: string, excludeId?: string) {
    let query = this.knex('ui_dashboard').where('slug', slug);
    if (excludeId) query = query.whereNot('id_ui_dashboard', excludeId);
    if (await query.first()) throw new BadRequestException(`Slug-ul "${slug}" este deja folosit.`);
  }

  private normalizeFilters(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
