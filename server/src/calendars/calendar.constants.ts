export const CALENDAR_VIEWS = [
  'day',
  'week',
  'month',
  'list',
] as const;
export const CALENDAR_LIST_RANGES = [
  'day',
  'week',
  'month',
] as const;
export const CALENDAR_SLOT_DURATIONS = [
  5, 10, 15, 30, 60,
] as const;
export const CALENDAR_FILTER_OPERATORS = [
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

export const CALENDAR_LIMITS = {
  activeSources: 10,
  popoverFields: 5,
  events: 5_000,
  rangeDays: 62,
  queryTimeoutMs: 5_000,
  queryConcurrency: 4,
} as const;

export const CALENDAR_DEFAULTS = {
  defaultView: 'month',
  listRange: 'month',
  firstDay: 1,
  showWeekends: true,
  slotMinTime: '00:00',
  slotMaxTime: '24:00',
  scrollTime: '08:00',
  slotDurationMinutes: 30,
} as const;

export type CalendarView =
  (typeof CALENDAR_VIEWS)[number];
export type CalendarListRange =
  (typeof CALENDAR_LIST_RANGES)[number];
export type CalendarFilterOperator =
  (typeof CALENDAR_FILTER_OPERATORS)[number];

export const CALENDAR_CATALOG = {
  views: [
    { value: 'day', label: 'Zi' },
    { value: 'week', label: 'Saptamana' },
    { value: 'month', label: 'Luna' },
    { value: 'list', label: 'Lista' },
  ],
  listRanges: [
    { value: 'day', label: 'Zi' },
    { value: 'week', label: 'Saptamana' },
    { value: 'month', label: 'Luna' },
  ],
  slotDurations: CALENDAR_SLOT_DURATIONS,
  filterOperators: CALENDAR_FILTER_OPERATORS,
  defaults: CALENDAR_DEFAULTS,
  limits: CALENDAR_LIMITS,
} as const;
