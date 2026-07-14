export const DASHBOARD_WIDGET_TYPES = ['kpi', 'chart'] as const;
export const DASHBOARD_CHART_TYPES = ['line', 'area', 'bar', 'donut'] as const;
export const DASHBOARD_AGGREGATIONS = ['count', 'sum', 'avg', 'min', 'max'] as const;
export const DASHBOARD_GROUP_MODES = ['time', 'category'] as const;
export const DASHBOARD_DATE_SOURCES = ['date_created', 'date_updated', 'field'] as const;
export const DASHBOARD_DATE_GRANULARITIES = ['auto', 'day', 'week', 'month'] as const;
export const DASHBOARD_VALUE_FORMATS = ['auto', 'number', 'currency'] as const;
export const DASHBOARD_DATE_PRESETS = [
  'today',
  'last_7_days',
  'last_30_days',
  'this_month',
  'custom',
] as const;
export const DASHBOARD_LAYOUT_SPANS = [3, 4, 6, 8, 12] as const;

export const DASHBOARD_FILTER_OPERATORS = [
  'eq',
  'contains',
  'starts_with',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'in',
  'is_null',
] as const;

export type DashboardWidgetType = typeof DASHBOARD_WIDGET_TYPES[number];
export type DashboardChartType = typeof DASHBOARD_CHART_TYPES[number];
export type DashboardAggregation = typeof DASHBOARD_AGGREGATIONS[number];
export type DashboardGroupMode = typeof DASHBOARD_GROUP_MODES[number];
export type DashboardDateSource = typeof DASHBOARD_DATE_SOURCES[number];
export type DashboardDateGranularity = typeof DASHBOARD_DATE_GRANULARITIES[number];
export type DashboardFilterOperator = typeof DASHBOARD_FILTER_OPERATORS[number];

export const DASHBOARD_LIMITS = {
  widgets: 40,
  categories: 25,
  defaultCategories: 12,
  series: 8,
  points: 100,
  queryTimeoutMs: 5000,
  queryConcurrency: 4,
} as const;

export const DASHBOARD_CATALOG = {
  widgetTypes: [
    { value: 'kpi', label: 'Indicator KPI' },
    { value: 'chart', label: 'Grafic' },
  ],
  chartTypes: [
    { value: 'line', label: 'Linie' },
    { value: 'area', label: 'Arie' },
    { value: 'bar', label: 'Bare' },
    { value: 'donut', label: 'Donut' },
  ],
  aggregations: [
    { value: 'count', label: 'Numar de inregistrari' },
    { value: 'sum', label: 'Suma' },
    { value: 'avg', label: 'Medie' },
    { value: 'min', label: 'Minim' },
    { value: 'max', label: 'Maxim' },
  ],
  groupModes: [
    { value: 'time', label: 'In timp' },
    { value: 'category', label: 'Pe categorie' },
  ],
  dateGranularities: [
    { value: 'auto', label: 'Automat' },
    { value: 'day', label: 'Zi' },
    { value: 'week', label: 'Saptamana' },
    { value: 'month', label: 'Luna' },
  ],
  datePresets: [
    { value: 'today', label: 'Astazi' },
    { value: 'last_7_days', label: 'Ultimele 7 zile' },
    { value: 'last_30_days', label: 'Ultimele 30 de zile' },
    { value: 'this_month', label: 'Luna curenta' },
    { value: 'custom', label: 'Interval personalizat' },
  ],
  layoutSpans: DASHBOARD_LAYOUT_SPANS,
} as const;
