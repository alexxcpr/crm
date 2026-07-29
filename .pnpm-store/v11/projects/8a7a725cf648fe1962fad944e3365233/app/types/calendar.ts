import type { Field } from './schema'

export type CalendarView = 'day' | 'week' | 'month' | 'list'
export type CalendarListRange = 'day' | 'week' | 'month'

export type CalendarTitleSegment
  = | { type: 'text', value: string, id_field?: never }
    | { type: 'field', id_field: string, value?: never }

export interface CalendarFilter {
  id_field: string
  operator: string
  value?: unknown
}

export interface CalendarSource {
  id_ui_calendar_source?: string
  id_ui_calendar?: string
  id_entity: string
  entity_slug?: string
  entity_label?: string | null
  entity_label_plural?: string | null
  table_name?: string
  name: string
  color: string
  id_start_field: string
  id_end_field: string
  start_field?: Field
  end_field?: Field
  fields?: Field[]
  title_segments: CalendarTitleSegment[]
  filters: CalendarFilter[]
  popover_field_ids: string[]
  popover_fields?: Field[]
  allow_create: boolean
  allow_update: boolean
  rank: number
  is_active: boolean
  capabilities?: {
    read: boolean
    create: boolean
    update: boolean
  }
}

export interface CalendarDefinition {
  id_ui_calendar?: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  default_view: CalendarView
  allow_day: boolean
  allow_week: boolean
  allow_month: boolean
  allow_list: boolean
  list_range: CalendarListRange
  first_day: number
  show_weekends: boolean
  slot_min_time: string
  slot_max_time: string
  scroll_time: string
  slot_duration_minutes: 5 | 10 | 15 | 30 | 60
  rank: number
  is_active: boolean
  sources: CalendarSource[]
  sources_count?: string | number
  active_sources_count?: string | number
}

export interface CalendarCatalog {
  views: { value: CalendarView, label: string }[]
  listRanges: { value: CalendarListRange, label: string }[]
  slotDurations: number[]
  filterOperators: string[]
  defaults: {
    defaultView: CalendarView
    listRange: CalendarListRange
    firstDay: number
    showWeekends: boolean
    slotMinTime: string
    slotMaxTime: string
    scrollTime: string
    slotDurationMinutes: number
  }
  limits: {
    activeSources: number
    popoverFields: number
    events: number
    rangeDays: number
  }
}

export interface CalendarEvent {
  id: string
  sourceId: string
  sourceName: string
  entitySlug: string
  recordId: string
  title: string
  start: string
  end: string
  allDay: boolean
  color: string
  popover: { fieldId: string, label: string, value: string }[]
  url: string
  editable: boolean
}

export interface CalendarQueryResult {
  calendarId: string
  from: string
  to: string
  timeZone: string
  locale: string
  events: CalendarEvent[]
}

export interface CalendarRuntimeFilterGroup {
  source_id: string
  filters: CalendarFilter[]
}
