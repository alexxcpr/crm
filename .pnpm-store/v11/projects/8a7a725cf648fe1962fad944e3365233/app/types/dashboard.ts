export type DashboardWidgetType = 'kpi' | 'chart'
export type DashboardChartType = 'line' | 'area' | 'bar' | 'donut'
export type DashboardAggregation = 'count' | 'sum' | 'avg' | 'min' | 'max'
export type DashboardGroupMode = 'time' | 'category'
export type DashboardDateSource = 'date_created' | 'date_updated' | 'field'
export type DashboardDateGranularity = 'auto' | 'day' | 'week' | 'month'
export type DashboardDatePreset = 'today' | 'last_7_days' | 'last_30_days' | 'this_month' | 'custom'
export type DashboardValueFormat = 'auto' | 'number' | 'currency'

export interface DashboardFilter {
  id_field: string
  operator: string
  value: unknown
}

export interface DashboardWidget {
  id_ui_widget?: string
  id_ui_block?: string
  id_entity: string
  entity_slug?: string
  entity_name?: string
  entity_label?: string | null
  widget_type: DashboardWidgetType
  chart_type: DashboardChartType | null
  title: string
  subtitle: string | null
  icon: string | null
  aggregation: DashboardAggregation
  id_value_field: string | null
  group_mode: DashboardGroupMode | null
  id_group_field: string | null
  id_series_field: string | null
  date_source: DashboardDateSource | null
  id_date_field: string | null
  date_granularity: DashboardDateGranularity
  filters: DashboardFilter[]
  comparison_enabled: boolean
  value_format: DashboardValueFormat
  currency_code: string
  top_n: number
  col_span: 3 | 4 | 6 | 8 | 12
  rank: number
  drilldown_enabled: boolean
  is_active: boolean
}

export interface DashboardBlock {
  id_ui_block?: string
  id_ui_dashboard?: string
  title: string
  subtitle: string | null
  rank: number
  is_active: boolean
  widgets: DashboardWidget[]
}

export interface DashboardDefinition {
  id_ui_dashboard?: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  default_date_preset: DashboardDatePreset
  is_default: boolean
  is_active: boolean
  rank: number
  blocks: DashboardBlock[]
  blocks_count?: string | number
  widgets_count?: string | number
}

export interface DashboardCatalog {
  widgetTypes: { value: DashboardWidgetType, label: string }[]
  chartTypes: { value: DashboardChartType, label: string }[]
  aggregations: { value: DashboardAggregation, label: string }[]
  groupModes: { value: DashboardGroupMode, label: string }[]
  dateGranularities: { value: DashboardDateGranularity, label: string }[]
  datePresets: { value: DashboardDatePreset, label: string }[]
  layoutSpans: (3 | 4 | 6 | 8 | 12)[]
}

export interface DashboardDrilldown {
  entitySlug: string
  filters: { field: string, op: string, value: unknown }[]
}

export interface DashboardKpiResult {
  widgetId: string
  kind: 'kpi'
  value: number
  previousValue: number | null
  changePercent: number | null
  isNew: boolean
  drilldown: DashboardDrilldown | null
  error?: { code: string, message: string }
}

export interface DashboardChartPoint {
  key: string
  label: string
  value: number
  drilldown: DashboardDrilldown | null
}

export interface DashboardChartResult {
  widgetId: string
  kind: 'chart'
  chartType: DashboardChartType
  effectiveGranularity: Exclude<DashboardDateGranularity, 'auto'> | null
  series: { key: string, label: string, points: DashboardChartPoint[] }[]
  error?: { code: string, message: string }
}

export type DashboardWidgetResult = DashboardKpiResult | DashboardChartResult

export interface DashboardQueryResult {
  dashboardId: string
  from: string
  to: string
  timeZone: string
  widgets: DashboardWidgetResult[]
}
