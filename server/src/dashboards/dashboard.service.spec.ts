import { BadRequestException } from '@nestjs/common';
import { DashboardWidgetDto } from './dto/dashboard.dto';
import { DashboardService } from './dashboard.service';

describe('DashboardService validation', () => {
  const service = new DashboardService({} as any, {} as any, {} as any);
  const categoryField = {
    id_field: 'field-category',
    id_entity: 'entity-id',
    name: 'Status',
    slug: 'status',
    column_name: 'cf_status',
    data_type: 'varchar',
    ui_type: 'select',
    is_filterable: true,
    options: [],
    id_relation_entity: null,
    relation_display_field: null,
  };

  const widget = (overrides: Partial<DashboardWidgetDto> = {}): DashboardWidgetDto => ({
    widget_type: 'chart',
    chart_type: 'bar',
    title: 'Vanzari',
    id_entity: 'entity-id',
    aggregation: 'count',
    group_mode: 'category',
    id_group_field: 'field-category',
    date_granularity: 'auto',
    filters: [],
    comparison_enabled: false,
    value_format: 'number',
    currency_code: 'RON',
    top_n: 12,
    col_span: 6,
    rank: 0,
    drilldown_enabled: true,
    is_active: true,
    ...overrides,
  });

  const field = (id?: string | null) => id === categoryField.id_field ? categoryField : undefined;

  it('accepta barele grupate categorial', () => {
    expect(() => (service as any).validateChart(widget(), field)).not.toThrow();
  });

  it('respinge graficele linie fara grupare temporala', () => {
    expect(() => (service as any).validateChart(widget({ chart_type: 'line' }), field))
      .toThrow(BadRequestException);
  });

  it('respinge seriile multiple pentru donut', () => {
    expect(() => (service as any).validateChart(widget({
      chart_type: 'donut',
      id_series_field: 'field-category',
    }), field)).toThrow('Graficul donut nu accepta serii multiple.');
  });

  it('serializeaza filtrele ca JSON array pentru PostgreSQL', () => {
    const record = (service as any).widgetRecord('block-id', widget(), 0);
    expect(record.filters).toBe('[]');
  });

  it('normalizeaza filtrele JSONB vechi care au fost salvate ca obiect', () => {
    expect((service as any).normalizeFilters({})).toEqual([]);
    expect((service as any).normalizeFilters('[{"id_field":"field-id"}]')).toEqual([{ id_field: 'field-id' }]);
  });
});
