<script setup lang="ts">
import FullCalendar from '@fullcalendar/vue3'
import dayGridPlugin from '@fullcalendar/vue3/daygrid'
import interactionPlugin from '@fullcalendar/vue3/interaction'
import listPlugin from '@fullcalendar/vue3/list'
import timeGridPlugin from '@fullcalendar/vue3/timegrid'
import type {
  CalendarOptions,
  DateClickInfo,
  DateSelectInfo,
  DatesSetInfo,
  EventClickInfo,
  EventDropInfo,
  EventHoveringInfo,
  EventInput,
  EventResizeDoneInfo
} from '@fullcalendar/vue3'
import '@fullcalendar/vue3/skeleton.css'
import '~/assets/css/moduvis-calendar.css'
import { Temporal } from 'temporal-polyfill'
import type {
  CalendarEvent,
  CalendarFilter,
  CalendarRuntimeFilterGroup,
  CalendarSource,
  CalendarView
} from '~/types/calendar'

const props = defineProps<{
  slug: string
}>()

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { branding } = useTenantBranding()
const {
  calendar,
  result,
  loading,
  querying,
  error,
  fetchCalendar,
  queryCalendar,
  updateInterval
} = useCalendarData()

const calendarRef = ref<{ getApi: () => any } | null>(null)
const calendarTitle = ref('')
const currentView = ref<CalendarView>('month')
const visibleRange = shallowRef<{ start: Date, end: Date } | null>(null)
const activeSourceIds = ref<string[]>([])
const interactiveFilters = ref<Record<string, CalendarFilter[]>>({})
const createSourceModalOpen = ref(false)
const createModalOpen = ref(false)
const createSelection = shallowRef<{
  start: Date
  end: Date
  allDay: boolean
  isClick: boolean
} | null>(null)
const createSource = ref<CalendarSource | null>(null)
const createInitialValues = ref<Record<string, any>>({})
const hover = shallowRef<{
  event: CalendarEvent
  x: number
  y: number
} | null>(null)
const interaction = shallowRef<{
  type: 'drag' | 'resize'
  title: string
  eventId: string
} | null>(null)
const savingEventId = ref<string | null>(null)
let filterTimer: ReturnType<typeof setTimeout> | undefined

const allowedViews = computed(() => {
  if (!calendar.value) return [] as CalendarView[]
  return ([
    ['day', calendar.value.allow_day],
    ['week', calendar.value.allow_week],
    ['month', calendar.value.allow_month],
    ['list', calendar.value.allow_list]
  ] as const).filter(([, allowed]) => allowed).map(([view]) => view)
})

const sources = computed(() => calendar.value?.sources.filter(source => source.is_active) ?? [])
const activeSources = computed(() => sources.value.filter(
  source => source.id_ui_calendar_source && activeSourceIds.value.includes(source.id_ui_calendar_source)
))
const creatableSources = computed(() => activeSources.value.filter(
  source => source.allow_create && source.capabilities?.create
))
const totalEvents = computed(() => result.value?.events.length ?? 0)
const activeFilterCount = computed(() => Object.entries(interactiveFilters.value)
  .filter(([sourceId]) => activeSourceIds.value.includes(sourceId))
  .reduce((total, [, filters]) => total + filters.filter(filter =>
    filter.operator === 'is_null'
    || (filter.value !== '' && filter.value !== undefined)
  ).length, 0))
const sourceEventCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const event of result.value?.events ?? []) {
    counts[event.sourceId] = (counts[event.sourceId] ?? 0) + 1
  }
  return counts
})
const selectionSummary = computed(() => {
  if (!createSelection.value) return ''
  const formatter = new Intl.DateTimeFormat(branding.value.locale, {
    dateStyle: 'medium',
    ...(createSelection.value.allDay ? {} : { timeStyle: 'short' as const }),
    timeZone: branding.value.timezone
  })
  const start = formatter.format(createSelection.value.start)
  const exclusiveEnd = new Date(createSelection.value.end)
  if (createSelection.value.allDay) exclusiveEnd.setDate(exclusiveEnd.getDate() - 1)
  return `${start} – ${formatter.format(exclusiveEnd)}`
})
const currentEvents = computed<EventInput[]>(() => (result.value?.events ?? []).map(event => ({
  id: event.id,
  title: event.title,
  start: event.start,
  end: event.end,
  allDay: event.allDay,
  backgroundColor: 'transparent',
  borderColor: 'transparent',
  textColor: 'inherit',
  editable: event.editable,
  durationEditable: event.editable,
  startEditable: event.editable,
  extendedProps: { calendarEvent: event }
})))

const viewLabels: Record<CalendarView, string> = {
  day: 'Zi',
  week: 'Săptămână',
  month: 'Lună',
  list: 'Listă'
}

const viewIcons: Record<CalendarView, string> = {
  day: 'i-lucide-square',
  week: 'i-lucide-columns-3',
  month: 'i-lucide-calendar-days',
  list: 'i-lucide-list'
}

const operatorItems = [
  { label: 'Este egal cu', value: 'eq' },
  { label: 'Conține', value: 'contains' },
  { label: 'Începe cu', value: 'starts_with' },
  { label: 'Mai mare', value: 'gt' },
  { label: 'Mai mare sau egal', value: 'gte' },
  { label: 'Mai mic', value: 'lt' },
  { label: 'Mai mic sau egal', value: 'lte' },
  { label: 'Între', value: 'between' },
  { label: 'În listă', value: 'in' },
  { label: 'Este gol', value: 'is_null' }
]

function fullCalendarView(view: CalendarView) {
  if (view === 'day') return 'timeGridDay'
  if (view === 'week') return 'timeGridWeek'
  if (view === 'list') {
    return calendar.value?.list_range === 'day'
      ? 'listDay'
      : calendar.value?.list_range === 'week'
        ? 'listWeek'
        : 'listMonth'
  }
  return 'dayGridMonth'
}

function appView(viewType: string): CalendarView {
  if (viewType.startsWith('timeGridDay')) return 'day'
  if (viewType.startsWith('timeGridWeek')) return 'week'
  if (viewType.startsWith('list')) return 'list'
  return 'month'
}

const options = computed<CalendarOptions>(() => ({
  plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
  initialView: fullCalendarView(currentView.value),
  initialDate: String(route.query.date || new Date().toISOString().slice(0, 10)),
  locale: branding.value.locale,
  timeZone: branding.value.timezone,
  headerToolbar: false,
  height: 'auto',
  firstDay: calendar.value?.first_day ?? 1,
  weekends: calendar.value?.show_weekends ?? true,
  slotMinTime: `${calendar.value?.slot_min_time ?? '00:00'}:00`,
  slotMaxTime: `${calendar.value?.slot_max_time ?? '24:00'}:00`,
  scrollTime: `${calendar.value?.scroll_time ?? '08:00'}:00`,
  slotDuration: `00:${String(calendar.value?.slot_duration_minutes ?? 30).padStart(2, '0')}:00`,
  nowIndicator: true,
  navLinks: false,
  stickyHeaderDates: true,
  expandRows: true,
  dayMaxEvents: 4,
  eventMaxStack: 4,
  slotEventOverlap: false,
  eventMinHeight: 30,
  eventShortHeight: 24,
  eventOrder: 'start,-duration,title',
  allDayText: 'Toată ziua',
  moreLinkContent: args => `+${args.num} înregistrări`,
  noEventsContent: 'Nu există înregistrări în această perioadă.',
  selectable: currentView.value !== 'list' && creatableSources.value.length > 0,
  selectMirror: true,
  selectMinDistance: 4,
  selectLongPressDelay: 450,
  eventLongPressDelay: 450,
  unselectAuto: true,
  editable: true,
  eventStartEditable: true,
  eventDurationEditable: true,
  eventResizableFromStart: true,
  eventDisplay: 'block',
  events: currentEvents.value,
  datesSet: onDatesSet,
  eventClick: onEventClick,
  eventMouseEnter: onEventMouseEnter,
  eventMouseLeave: () => { hover.value = null },
  eventClass: (info: any) => {
    const item = slotCalendarEvent(info.event)
    if (!item) return 'moduvis-fc-selection'
    return [
      'moduvis-fc-event',
      item.editable ? 'is-editable' : 'is-readonly',
      item.allDay ? 'is-all-day' : 'is-timed',
      savingEventId.value === item.id ? 'is-saving' : ''
    ].filter(Boolean).join(' ')
  },
  eventBeforeClass: (info: any) => {
    const item = slotCalendarEvent(info.event)
    return item?.editable && info.isStartResizable
      ? 'moduvis-event-resizer moduvis-event-resizer--start'
      : ''
  },
  eventAfterClass: (info: any) => {
    const item = slotCalendarEvent(info.event)
    return item?.editable && info.isEndResizable
      ? 'moduvis-event-resizer moduvis-event-resizer--end'
      : ''
  },
  eventDidMount: (info: any) => {
    const item = slotCalendarEvent(info.event)
    if (!item) return
    info.el.tabIndex = 0
    info.el.setAttribute(
      'aria-label',
      `${item.title}, ${eventInterval(item)}, sursa ${item.sourceName}${item.editable ? ', poate fi mutat și redimensionat' : ''}`
    )
    info.el.addEventListener('focus', () => showHoverForElement(info.event, info.el))
    info.el.addEventListener('blur', () => {
      hover.value = null
    })
    info.el.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        navigateTo(item.url)
      }
    })
  },
  dateClick: onDateClick,
  select: onSelect,
  eventDrop: onEventDrop,
  eventResize: onEventResize,
  eventDragStart: (info: any) => {
    const item = slotCalendarEvent(info.event)
    if (!item) return
    hover.value = null
    interaction.value = { type: 'drag', title: item.title, eventId: item.id }
  },
  eventDragStop: () => {
    interaction.value = null
  },
  eventResizeStart: (info: any) => {
    const item = slotCalendarEvent(info.event)
    if (!item) return
    hover.value = null
    interaction.value = { type: 'resize', title: item.title, eventId: item.id }
  },
  eventResizeStop: () => {
    interaction.value = null
  },
  eventAllow: (_dropInfo: any, draggedEvent: any) => Boolean(draggedEvent.extendedProps.calendarEvent?.editable)
}))

function parseInitialState() {
  if (!calendar.value) return
  const queryView = String(route.query.view || calendar.value.default_view) as CalendarView
  currentView.value = allowedViews.value.includes(queryView)
    ? queryView
    : calendar.value.default_view

  const available = new Set(sources.value.map(source => source.id_ui_calendar_source!))
  const querySources = String(route.query.sources || '')
    .split(',')
    .filter(id => available.has(id))
  activeSourceIds.value = route.query.sources === undefined
    ? [...available]
    : querySources

  try {
    const parsed = JSON.parse(String(route.query.filters || '{}'))
    interactiveFilters.value = typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    interactiveFilters.value = {}
  }
}

async function load() {
  const definition = await fetchCalendar(props.slug)
  if (!definition) return
  parseInitialState()
}

async function refresh() {
  if (!visibleRange.value) return
  if (!activeSourceIds.value.length) {
    result.value = {
      calendarId: calendar.value?.id_ui_calendar ?? '',
      from: visibleRange.value.start.toISOString(),
      to: visibleRange.value.end.toISOString(),
      timeZone: branding.value.timezone,
      locale: branding.value.locale,
      events: []
    }
    return
  }
  await queryCalendar(
    visibleRange.value.start,
    visibleRange.value.end,
    activeSourceIds.value,
    runtimeFilterGroups()
  )
}

function runtimeFilterGroups(): CalendarRuntimeFilterGroup[] {
  return Object.entries(interactiveFilters.value)
    .filter(([sourceId, filters]) => activeSourceIds.value.includes(sourceId) && filters.length)
    .map(([source_id, filters]) => ({
      source_id,
      filters: filters
        .filter(filter =>
          filter.operator === 'is_null'
          || (filter.value !== '' && filter.value !== undefined)
        )
        .map(filter => ({
          ...filter,
          value: ['in', 'between'].includes(filter.operator) && typeof filter.value === 'string'
            ? filter.value.split(',').map(value => value.trim()).filter(Boolean)
            : filter.value
        }))
    }))
}

async function syncUrl() {
  const date = calendarRef.value?.getApi().getDate?.() as Date | undefined
  const filters = Object.fromEntries(
    Object.entries(interactiveFilters.value).filter(([, value]) => value.length)
  )
  await router.replace({
    query: {
      ...route.query,
      view: currentView.value,
      date: date ? formatDateOnly(date) : route.query.date,
      sources: activeSourceIds.value.join(','),
      filters: Object.keys(filters).length ? JSON.stringify(filters) : undefined
    }
  })
}

function onDatesSet(info: DatesSetInfo) {
  visibleRange.value = { start: info.start, end: info.end }
  calendarTitle.value = info.view.title
  currentView.value = appView(info.view.type)
  syncUrl()
  refresh()
}

function changeView(view: CalendarView) {
  currentView.value = view
  calendarRef.value?.getApi().changeView(fullCalendarView(view))
}

function navigate(direction: 'prev' | 'next' | 'today') {
  calendarRef.value?.getApi()[direction]()
}

function toggleSource(sourceId: string) {
  activeSourceIds.value = activeSourceIds.value.includes(sourceId)
    ? activeSourceIds.value.filter(id => id !== sourceId)
    : [...activeSourceIds.value, sourceId]
  syncUrl()
  refresh()
}

function activateAllSources() {
  activeSourceIds.value = sources.value
    .map(source => source.id_ui_calendar_source)
    .filter((sourceId): sourceId is string => Boolean(sourceId))
  syncUrl()
  refresh()
}

function deactivateAllSources() {
  activeSourceIds.value = []
  syncUrl()
  refresh()
}

function clearInteractiveFilters() {
  interactiveFilters.value = {}
}

function sourceChipStyle(source: CalendarSource) {
  return {
    '--calendar-source-color': source.color
  }
}

function slotCalendarEvent(eventApi: any): CalendarEvent | undefined {
  return eventApi.extendedProps.calendarEvent as CalendarEvent | undefined
}

function eventVisualState(eventApi: any): 'drag' | 'resize' | 'saving' | undefined {
  const event = slotCalendarEvent(eventApi)
  if (!event) return undefined
  if (savingEventId.value === event.id) return 'saving'
  if (interaction.value?.eventId === event.id) return interaction.value.type
  return undefined
}

function addFilter(source: CalendarSource) {
  if (!source.id_ui_calendar_source) return
  const field = source.fields?.find(item => item.is_filterable)
  if (!field) return
  interactiveFilters.value[source.id_ui_calendar_source] = [
    ...(interactiveFilters.value[source.id_ui_calendar_source] ?? []),
    { id_field: field.id_field, operator: 'eq', value: '' }
  ]
}

function removeFilter(sourceId: string, index: number) {
  interactiveFilters.value[sourceId] = (interactiveFilters.value[sourceId] ?? [])
    .filter((_, itemIndex) => itemIndex !== index)
}

function filterFields(source: CalendarSource) {
  return (source.fields ?? [])
    .filter(field => field.is_filterable)
    .map(field => ({ label: field.name, value: field.id_field }))
}

function onDateClick(info: DateClickInfo) {
  if (currentView.value === 'list' || !creatableSources.value.length) return
  const end = new Date(info.date)
  if (info.allDay) end.setDate(end.getDate() + 1)
  else end.setHours(end.getHours() + 1)
  requestCreate({
    start: info.date,
    end,
    allDay: info.allDay,
    isClick: true
  })
}

function onSelect(info: DateSelectInfo) {
  if (currentView.value === 'list' || !creatableSources.value.length) return
  requestCreate({
    start: info.start,
    end: info.end,
    allDay: info.allDay,
    isClick: false
  })
}

function requestCreate(selection: NonNullable<typeof createSelection.value>) {
  // FullCalendar păstrează selecția ca un eveniment-mirror până la unselect().
  // Capturăm intervalul în starea modalului și eliberăm imediat grila, astfel
  // încât anularea formularului să nu blocheze următoarea selecție.
  createSelection.value = selection
  createSource.value = null
  createInitialValues.value = {}
  calendarRef.value?.getApi().unselect()
  if (creatableSources.value.length === 1) {
    selectCreateSource(creatableSources.value[0]!)
  } else {
    createSourceModalOpen.value = true
  }
}

function selectCreateSource(source: CalendarSource) {
  if (!createSelection.value || !source.start_field || !source.end_field) return
  createSource.value = source
  createInitialValues.value = initialValuesFor(source, createSelection.value)
  createSourceModalOpen.value = false
  createModalOpen.value = true
}

function initialValuesFor(
  source: CalendarSource,
  selection: NonNullable<typeof createSelection.value>
) {
  const values: Record<string, any> = {}
  const isAllDaySource = source.start_field?.ui_type === 'datepicker'
  if (isAllDaySource) {
    const startDay = formatDateOnly(selection.start)
    let endDay = formatDateOnly(selection.end)
    if (endDay <= startDay) endDay = addDays(startDay, 1)
    values[source.start_field!.slug] = startDay
    values[source.end_field!.slug] = endDay
  } else if (selection.allDay) {
    const startDay = formatDateOnly(selection.start)
    if (selection.isClick) {
      values[source.start_field!.slug] = zonedInstant(startDay, 9)
      values[source.end_field!.slug] = zonedInstant(startDay, 10)
    } else {
      values[source.start_field!.slug] = zonedInstant(startDay, 9)
      values[source.end_field!.slug] = zonedInstant(formatDateOnly(selection.end), 9)
    }
  } else {
    values[source.start_field!.slug] = selection.start.toISOString()
    values[source.end_field!.slug] = selection.end.toISOString()
  }

  for (const filter of source.filters) {
    if (filter.operator !== 'eq') continue
    const field = source.fields?.find(item => item.id_field === filter.id_field)
    if (field) values[field.slug] = filter.value
  }
  return values
}

async function onCreated(record: Record<string, any>) {
  createModalOpen.value = false
  const refreshed = await refreshAndReturn()
  const visible = refreshed?.events.some(event => event.recordId === record.id)
  if (!visible) {
    toast.add({
      title: 'Înregistrarea a fost creată',
      description: 'Nu este vizibilă în calendar deoarece nu respectă toate filtrele sursei.',
      color: 'warning',
      icon: 'i-lucide-eye-off'
    })
  }
}

async function refreshAndReturn() {
  if (!visibleRange.value || !activeSourceIds.value.length) return null
  return queryCalendar(
    visibleRange.value.start,
    visibleRange.value.end,
    activeSourceIds.value,
    runtimeFilterGroups()
  )
}

function onEventClick(info: EventClickInfo) {
  info.jsEvent.preventDefault()
  const event = slotCalendarEvent(info.event)
  if (!event) return
  navigateTo(event.url)
}

function onEventMouseEnter(info: EventHoveringInfo) {
  if (interaction.value) return
  const event = slotCalendarEvent(info.event)
  if (!event) return
  hover.value = {
    event,
    x: Math.min(info.jsEvent.clientX + 12, window.innerWidth - 340),
    y: Math.min(info.jsEvent.clientY + 12, window.innerHeight - 260)
  }
}

function showHoverForElement(eventApi: any, element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  hover.value = {
    event: eventApi.extendedProps.calendarEvent as CalendarEvent,
    x: Math.min(rect.left, window.innerWidth - 340),
    y: rect.bottom + 8
  }
}

async function persistEventChange(
  info: EventDropInfo | EventResizeDoneInfo
) {
  const event = info.event.extendedProps.calendarEvent as CalendarEvent
  if (info.oldEvent.allDay !== info.event.allDay) {
    info.revert()
    toast.add({
      title: 'Mutare nepermisă',
      description: 'Conversia între all-day și evenimente cu oră nu este disponibilă.',
      color: 'warning'
    })
    return
  }
  if (!info.event.start || !info.event.end) {
    info.revert()
    return
  }
  savingEventId.value = event.id
  try {
    await updateInterval(event.sourceId, event.recordId, {
      start: info.event.allDay ? info.event.startStr : info.event.start.toISOString(),
      end: info.event.allDay ? info.event.endStr : info.event.end.toISOString(),
      all_day: info.event.allDay
    })
    await refresh()
    toast.add({
      title: 'Interval actualizat',
      description: event.title,
      color: 'success',
      icon: 'i-lucide-calendar-check'
    })
  } catch (err: any) {
    info.revert()
    toast.add({
      title: 'Intervalul nu a fost salvat',
      description: err?.data?.message || err?.message || 'Modificarea a fost anulată.',
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  } finally {
    savingEventId.value = null
    interaction.value = null
  }
}

function onEventDrop(info: EventDropInfo) {
  persistEventChange(info)
}

function onEventResize(info: EventResizeDoneInfo) {
  persistEventChange(info)
}

function formatDateOnly(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: branding.value.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

function addDays(value: string, days: number) {
  return Temporal.PlainDate.from(value).add({ days }).toString()
}

function zonedInstant(value: string, hour: number) {
  return Temporal.ZonedDateTime.from(
    `${value}T${String(hour).padStart(2, '0')}:00:00[${branding.value.timezone}]`
  ).toInstant().toString()
}

function eventInterval(event: CalendarEvent) {
  const formatter = new Intl.DateTimeFormat(branding.value.locale, {
    dateStyle: 'medium',
    ...(event.allDay ? {} : { timeStyle: 'short' as const }),
    timeZone: branding.value.timezone
  })
  const eventDate = (value: string) => new Date(
    event.allDay && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T12:00:00.000Z`
      : value
  )
  const start = formatter.format(eventDate(event.start))
  const exclusiveEnd = eventDate(event.end)
  if (event.allDay) exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() - 1)
  return `${start} – ${formatter.format(exclusiveEnd)}`
}

function handleWindowFocus() {
  if (document.visibilityState === 'visible') refresh()
}

watch(() => props.slug, load, { immediate: true })
watch(interactiveFilters, () => {
  clearTimeout(filterTimer)
  filterTimer = setTimeout(() => {
    syncUrl()
    refresh()
  }, 400)
}, { deep: true })
watch([createSourceModalOpen, createModalOpen], ([choosingSource, creating]) => {
  if (choosingSource || creating || !createSelection.value) return
  calendarRef.value?.getApi().unselect()
  createSelection.value = null
  createSource.value = null
})

onMounted(() => {
  window.addEventListener('focus', handleWindowFocus)
  document.addEventListener('visibilitychange', handleWindowFocus)
})

onBeforeUnmount(() => {
  clearTimeout(filterTimer)
  window.removeEventListener('focus', handleWindowFocus)
  document.removeEventListener('visibilitychange', handleWindowFocus)
})
</script>

<template>
  <UDashboardPanel :id="`calendar-${slug}`" :ui="{ body: 'p-3 sm:p-5' }">
    <template #header>
      <UDashboardNavbar :title="calendar?.name ?? 'Calendar'">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div v-if="calendar" class="hidden items-center gap-2 sm:flex">
            <UBadge color="neutral" variant="subtle">
              {{ totalEvents }} {{ totalEvents === 1 ? 'înregistrare' : 'înregistrări' }}
            </UBadge>
            <UButton
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="ghost"
              :loading="querying"
              aria-label="Reîncarcă evenimentele"
              @click="refresh"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="loading" class="calendar-loading">
        <USkeleton class="h-32 w-full rounded-2xl" />
        <USkeleton class="h-[640px] w-full rounded-2xl" />
      </div>

      <UAlert
        v-else-if="error && !calendar"
        color="error"
        variant="subtle"
        icon="i-lucide-calendar-x"
        title="Calendar indisponibil"
        :description="error"
      />

      <div v-else-if="calendar" class="calendar-workspace">
        <section class="calendar-command-center">
          <div class="calendar-command-center__main">
            <div class="calendar-period-navigation">
              <UButtonGroup>
                <UButton
                  icon="i-lucide-chevron-left"
                  color="neutral"
                  variant="ghost"
                  aria-label="Perioada anterioară"
                  @click="navigate('prev')"
                />
                <UButton
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-locate-fixed"
                  @click="navigate('today')"
                >
                  Astăzi
                </UButton>
                <UButton
                  icon="i-lucide-chevron-right"
                  color="neutral"
                  variant="ghost"
                  aria-label="Perioada următoare"
                  @click="navigate('next')"
                />
              </UButtonGroup>

              <div class="calendar-period-title">
                <span class="calendar-period-title__eyebrow">{{ viewLabels[currentView] }}</span>
                <h1>{{ calendarTitle }}</h1>
              </div>
            </div>

            <div class="calendar-view-switch" role="group" aria-label="Vedere calendar">
              <button
                v-for="view in allowedViews"
                :key="view"
                type="button"
                class="calendar-view-switch__item"
                :class="{ 'is-active': currentView === view }"
                :aria-pressed="currentView === view"
                @click="changeView(view)"
              >
                <UIcon :name="viewIcons[view]" class="size-4" />
                <span>{{ viewLabels[view] }}</span>
              </button>
            </div>
          </div>

          <div class="calendar-command-center__sources">
            <div class="calendar-source-heading">
              <div>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-layers-3" class="size-4 text-muted" />
                  <span class="text-sm font-semibold text-highlighted">Surse calendar</span>
                  <UBadge color="neutral" variant="subtle" size="sm">
                    {{ activeSourceIds.length }}/{{ sources.length }}
                  </UBadge>
                </div>
                <p class="mt-0.5 text-xs text-muted">
                  Activează sursele pe care vrei să le compari în aceeași perioadă.
                </p>
              </div>

              <div class="flex items-center gap-1">
                <UButton
                  v-if="activeSourceIds.length < sources.length"
                  label="Toate"
                  icon="i-lucide-eye"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  @click="activateAllSources"
                />
                <UButton
                  v-else-if="sources.length > 1"
                  label="Ascunde"
                  icon="i-lucide-eye-off"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  @click="deactivateAllSources"
                />
              </div>
            </div>

            <div class="calendar-source-row">
              <button
                v-for="source in sources"
                :key="source.id_ui_calendar_source"
                type="button"
                class="calendar-source-chip"
                :class="{ 'is-active': activeSourceIds.includes(source.id_ui_calendar_source!) }"
                :style="sourceChipStyle(source)"
                :aria-pressed="activeSourceIds.includes(source.id_ui_calendar_source!)"
                @click="toggleSource(source.id_ui_calendar_source!)"
              >
                <span class="calendar-source-chip__check">
                  <UIcon
                    :name="activeSourceIds.includes(source.id_ui_calendar_source!) ? 'i-lucide-check' : 'i-lucide-plus'"
                    class="size-3"
                  />
                </span>
                <span class="calendar-source-chip__dot" />
                <span class="truncate">{{ source.name }}</span>
                <span class="calendar-source-chip__count">
                  {{ sourceEventCounts[source.id_ui_calendar_source!] ?? 0 }}
                </span>
              </button>

              <UPopover v-if="activeSources.some(source => filterFields(source).length)">
                <UButton
                  color="neutral"
                  :variant="activeFilterCount ? 'soft' : 'outline'"
                  size="sm"
                  icon="i-lucide-list-filter"
                  class="shrink-0"
                >
                  Filtre
                  <UBadge
                    v-if="activeFilterCount"
                    color="primary"
                    variant="solid"
                    size="sm"
                  >
                    {{ activeFilterCount }}
                  </UBadge>
                </UButton>

                <template #content>
                  <div class="calendar-filter-panel">
                    <div class="calendar-filter-panel__header">
                      <div>
                        <p class="font-semibold text-highlighted">
                          Filtre interactive
                        </p>
                        <p class="text-xs text-muted">
                          Filtrele restrâng doar rezultatele tale curente.
                        </p>
                      </div>
                      <UButton
                        v-if="activeFilterCount"
                        label="Resetează"
                        icon="i-lucide-rotate-ccw"
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        @click="clearInteractiveFilters"
                      />
                    </div>

                    <div class="calendar-filter-panel__body">
                      <section
                        v-for="source in activeSources.filter(item => filterFields(item).length)"
                        :key="source.id_ui_calendar_source"
                        class="calendar-filter-source"
                        :style="sourceChipStyle(source)"
                      >
                        <div class="flex items-center justify-between gap-3">
                          <p class="flex min-w-0 items-center gap-2 text-sm font-semibold">
                            <span class="calendar-filter-source__dot" />
                            <span class="truncate">{{ source.name }}</span>
                          </p>
                          <UButton
                            size="xs"
                            color="neutral"
                            variant="soft"
                            icon="i-lucide-plus"
                            @click="addFilter(source)"
                          >
                            Adaugă
                          </UButton>
                        </div>

                        <div
                          v-for="(filter, index) in interactiveFilters[source.id_ui_calendar_source!] ?? []"
                          :key="index"
                          class="calendar-filter-row"
                        >
                          <USelect
                            v-model="filter.id_field"
                            :items="filterFields(source)"
                            value-key="value"
                          />
                          <USelect
                            v-model="filter.operator"
                            :items="operatorItems"
                            value-key="value"
                          />
                          <UInput
                            v-if="filter.operator !== 'is_null'"
                            v-model="filter.value as any"
                            :placeholder="filter.operator === 'in' || filter.operator === 'between' ? 'Valori separate prin virgulă' : 'Valoare'"
                          />
                          <USelect
                            v-else
                            v-model="filter.value as any"
                            :items="[{ label: 'Este gol', value: true }, { label: 'Nu este gol', value: false }]"
                            value-key="value"
                          />
                          <UButton
                            icon="i-lucide-trash-2"
                            color="error"
                            variant="ghost"
                            aria-label="Elimină filtrul"
                            @click="removeFilter(source.id_ui_calendar_source!, index)"
                          />
                        </div>

                        <button
                          v-if="!(interactiveFilters[source.id_ui_calendar_source!]?.length)"
                          type="button"
                          class="calendar-filter-empty"
                          @click="addFilter(source)"
                        >
                          <UIcon name="i-lucide-plus" class="size-4" />
                          Adaugă primul filtru pentru această sursă
                        </button>
                      </section>
                    </div>
                  </div>
                </template>
              </UPopover>
            </div>
          </div>
        </section>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="Evenimentele nu au putut fi încărcate"
          :description="error"
        />

        <section class="calendar-canvas">
          <header class="calendar-canvas__header">
            <div class="calendar-interaction-guide">
              <span class="calendar-interaction-guide__icon">
                <UIcon
                  :name="creatableSources.length ? 'i-lucide-mouse-pointer-2' : 'i-lucide-calendar-search'"
                  class="size-4"
                />
              </span>
              <div>
                <p class="text-xs font-semibold text-highlighted">
                  <template v-if="creatableSources.length && currentView !== 'list'">
                    Selectează un interval pentru a crea
                  </template>
                  <template v-else>
                    Deschide o înregistrare prin click
                  </template>
                </p>
                <p class="text-[11px] text-muted">
                  Evenimentele editabile pot fi mutate și redimensionate direct în grilă.
                </p>
              </div>
            </div>

            <div class="calendar-canvas__status">
              <span v-if="querying" class="calendar-live-status">
                <span class="calendar-live-status__pulse" />
                Se actualizează
              </span>
              <span v-else>
                {{ totalEvents }} {{ totalEvents === 1 ? 'rezultat' : 'rezultate' }}
              </span>
            </div>
          </header>

          <div
            class="calendar-shell moduvis-calendar-surface"
            :class="`is-${currentView}-view`"
          >
            <div
              v-if="querying"
              class="calendar-query-progress"
            >
              <UProgress animation="carousel" size="xs" />
            </div>

            <Transition name="calendar-action">
              <div v-if="interaction || savingEventId" class="calendar-action-banner">
                <span class="calendar-action-banner__icon">
                  <UIcon
                    :name="savingEventId
                      ? 'i-lucide-loader-circle'
                      : interaction?.type === 'resize'
                        ? 'i-lucide-move-vertical'
                        : 'i-lucide-move'"
                    class="size-4"
                    :class="{ 'animate-spin': savingEventId }"
                  />
                </span>
                <div>
                  <p>
                    {{ savingEventId
                      ? 'Salvez modificarea…'
                      : interaction?.type === 'resize'
                        ? `Redimensionezi „${interaction.title}”`
                        : `Muți „${interaction?.title}”` }}
                  </p>
                  <span v-if="!savingEventId">Eliberează pentru a confirma noul interval</span>
                </div>
              </div>
            </Transition>

            <FullCalendar ref="calendarRef" :options="options">
              <template #eventContent="arg">
                <CalendarEventContent
                  :event="slotCalendarEvent(arg.event)"
                  :time-text="arg.timeText"
                  :state="eventVisualState(arg.event)"
                  :view-type="arg.view.type"
                />
              </template>
            </FullCalendar>

            <div v-if="!activeSourceIds.length" class="calendar-blocking-empty">
              <span class="calendar-blocking-empty__icon">
                <UIcon name="i-lucide-layers-3" class="size-6" />
              </span>
              <h3>Nicio sursă activă</h3>
              <p>Activează cel puțin o sursă pentru a vedea înregistrările în calendar.</p>
              <UButton
                label="Activează toate sursele"
                icon="i-lucide-eye"
                size="sm"
                @click="activateAllSources"
              />
            </div>

            <div
              v-else-if="!querying && !totalEvents"
              class="calendar-zero-results"
            >
              <UIcon name="i-lucide-calendar-search" class="size-4" />
              <span>Nicio înregistrare în această perioadă</span>
              <span v-if="creatableSources.length && currentView !== 'list'" class="text-dimmed">
                — selectează un interval pentru a crea una.
              </span>
            </div>
          </div>
        </section>
      </div>
    </template>
  </UDashboardPanel>

  <Teleport to="body">
    <Transition name="calendar-popover">
      <div
        v-if="hover"
        class="calendar-event-popover"
        :style="{
          '--calendar-event-color': hover.event.color,
          'left': `${Math.max(16, hover.x)}px`,
          'top': `${Math.max(16, hover.y)}px`
        }"
      >
        <div class="calendar-event-popover__accent" />
        <div class="calendar-event-popover__header">
          <span class="calendar-event-popover__icon">
            <UIcon name="i-lucide-calendar-clock" class="size-4" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-highlighted">
              {{ hover.event.title }}
            </p>
            <p class="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
              <span class="size-1.5 rounded-full" :style="{ backgroundColor: hover.event.color }" />
              {{ hover.event.sourceName }}
            </p>
          </div>
          <UBadge
            v-if="hover.event.editable"
            color="neutral"
            variant="subtle"
            size="sm"
          >
            Editabil
          </UBadge>
        </div>

        <div class="calendar-event-popover__interval">
          <UIcon name="i-lucide-clock-3" class="size-4" />
          <span>{{ eventInterval(hover.event) }}</span>
        </div>

        <dl v-if="hover.event.popover.length" class="calendar-event-popover__fields">
          <div v-for="field in hover.event.popover" :key="field.fieldId">
            <dt>{{ field.label }}</dt>
            <dd>{{ field.value || '—' }}</dd>
          </div>
        </dl>

        <div class="calendar-event-popover__footer">
          <span><UIcon name="i-lucide-mouse-pointer-click" class="size-3.5" /> Click pentru deschidere</span>
          <span v-if="hover.event.editable"><UIcon name="i-lucide-move" class="size-3.5" /> Trage pentru mutare</span>
        </div>
      </div>
    </Transition>
  </Teleport>

  <UModal v-model:open="createSourceModalOpen" title="În ce sursă creezi înregistrarea?">
    <template #body>
      <div class="space-y-4">
        <div class="calendar-create-summary">
          <span class="calendar-create-summary__icon">
            <UIcon name="i-lucide-calendar-plus" class="size-5" />
          </span>
          <div>
            <p class="text-xs font-medium text-muted">
              Interval selectat
            </p>
            <p class="mt-0.5 text-sm font-semibold text-highlighted">
              {{ selectionSummary }}
            </p>
          </div>
        </div>

        <div class="grid gap-2">
          <button
            v-for="source in creatableSources"
            :key="source.id_ui_calendar_source"
            type="button"
            class="calendar-create-source"
            :style="sourceChipStyle(source)"
            @click="selectCreateSource(source)"
          >
            <span class="calendar-create-source__icon">
              <span />
            </span>
            <span class="min-w-0 flex-1 text-left">
              <strong>{{ source.name }}</strong>
              <small>{{ source.entity_label_plural ?? source.entity_label ?? 'Înregistrare' }}</small>
            </span>
            <UIcon name="i-lucide-arrow-right" class="size-4 text-muted" />
          </button>
        </div>
      </div>
    </template>
  </UModal>

  <DynamicInlineCreateModal
    v-if="createSource?.entity_slug"
    v-model:open="createModalOpen"
    :entity-slug="createSource.entity_slug"
    :entity-label="createSource.entity_label ?? createSource.name"
    :initial-values="createInitialValues"
    @created="onCreated"
  />
</template>

<style>
.calendar-loading,
.calendar-workspace {
  display: grid;
  gap: 1rem;
}

.calendar-command-center {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--ui-border) 88%, transparent);
  border-radius: 1rem;
  background:
    radial-gradient(
      circle at 8% 0%,
      color-mix(in srgb, var(--ui-primary) 8%, transparent),
      transparent 32%
    ),
    var(--ui-bg);
  box-shadow:
    0 1px 2px color-mix(in srgb, black 4%, transparent),
    0 10px 30px color-mix(in srgb, black 3%, transparent);
}

.calendar-command-center__main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
}

.calendar-period-navigation {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 1rem;
}

.calendar-period-title {
  min-width: 0;
}

.calendar-period-title__eyebrow {
  display: block;
  margin-bottom: 0.1rem;
  color: var(--ui-text-muted);
  font-size: 0.625rem;
  font-weight: 750;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
}

.calendar-period-title h1 {
  overflow: hidden;
  color: var(--ui-text-highlighted);
  font-size: clamp(1rem, 1.8vw, 1.35rem);
  font-weight: 760;
  letter-spacing: -0.025em;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calendar-view-switch {
  display: inline-flex;
  flex: none;
  gap: 0.2rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.75rem;
  background-color: color-mix(in srgb, var(--ui-bg-elevated) 72%, transparent);
  padding: 0.22rem;
}

.calendar-view-switch__item {
  display: inline-flex;
  min-height: 2.15rem;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  border-radius: 0.55rem;
  color: var(--ui-text-muted);
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 650;
  padding: 0.42rem 0.7rem;
  transition:
    background-color 150ms ease,
    box-shadow 150ms ease,
    color 150ms ease,
    transform 150ms ease;
}

.calendar-view-switch__item:hover {
  background-color: var(--ui-bg);
  color: var(--ui-text-highlighted);
}

.calendar-view-switch__item.is-active {
  background-color: var(--ui-bg);
  box-shadow:
    0 1px 2px color-mix(in srgb, black 9%, transparent),
    0 3px 9px color-mix(in srgb, black 6%, transparent);
  color: var(--ui-primary);
}

.calendar-view-switch__item:active {
  transform: scale(0.98);
}

.calendar-view-switch__item:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}

.calendar-command-center__sources {
  border-top: 1px solid color-mix(in srgb, var(--ui-border) 78%, transparent);
  background-color: color-mix(in srgb, var(--ui-bg-elevated) 28%, transparent);
  padding: 0.8rem 1rem 0.9rem;
}

.calendar-source-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.7rem;
}

.calendar-source-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  overflow-x: auto;
  padding: 0.15rem 0.1rem 0.2rem;
  scrollbar-color: color-mix(in srgb, var(--ui-border) 75%, transparent) transparent;
  scrollbar-width: thin;
}

.calendar-source-chip {
  --calendar-source-color: var(--ui-primary);
  display: inline-flex;
  max-width: 15rem;
  min-height: 2.1rem;
  flex: none;
  align-items: center;
  gap: 0.42rem;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  background-color: color-mix(in srgb, var(--ui-bg) 84%, transparent);
  color: var(--ui-text-muted);
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 650;
  padding: 0.32rem 0.45rem 0.32rem 0.35rem;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease,
    opacity 160ms ease,
    transform 160ms ease;
}

.calendar-source-chip:hover {
  border-color: color-mix(in srgb, var(--calendar-source-color) 48%, var(--ui-border));
  color: var(--ui-text-highlighted);
  transform: translateY(-1px);
}

.calendar-source-chip.is-active {
  border-color: color-mix(in srgb, var(--calendar-source-color) 44%, var(--ui-border));
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--calendar-source-color) 11%, var(--ui-bg)),
      color-mix(in srgb, var(--calendar-source-color) 4%, var(--ui-bg))
    );
  box-shadow: 0 2px 8px color-mix(in srgb, var(--calendar-source-color) 10%, transparent);
  color: var(--ui-text-highlighted);
}

.calendar-source-chip:not(.is-active) {
  opacity: 0.62;
}

.calendar-source-chip__check {
  display: grid;
  height: 1.25rem;
  width: 1.25rem;
  flex: none;
  place-items: center;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  background-color: var(--ui-bg-elevated);
  color: var(--ui-text-dimmed);
}

.calendar-source-chip.is-active .calendar-source-chip__check {
  border-color: var(--calendar-source-color);
  background-color: var(--calendar-source-color);
  color: white;
}

.calendar-source-chip__dot {
  height: 0.45rem;
  width: 0.45rem;
  flex: none;
  border-radius: 999px;
  background-color: var(--calendar-source-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--calendar-source-color) 13%, transparent);
}

.calendar-source-chip__count {
  display: grid;
  min-height: 1.15rem;
  min-width: 1.15rem;
  place-items: center;
  border-radius: 999px;
  background-color: color-mix(in srgb, var(--ui-text) 7%, transparent);
  color: var(--ui-text-muted);
  font-size: 0.625rem;
  font-variant-numeric: tabular-nums;
  padding-inline: 0.25rem;
}

.calendar-filter-panel {
  width: min(94vw, 680px);
}

.calendar-filter-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--ui-border);
  padding: 1rem;
}

.calendar-filter-panel__body {
  display: grid;
  max-height: min(68vh, 620px);
  gap: 0.75rem;
  overflow-y: auto;
  padding: 0.75rem;
}

.calendar-filter-source {
  --calendar-source-color: var(--ui-primary);
  display: grid;
  gap: 0.65rem;
  border: 1px solid var(--ui-border);
  border-left: 3px solid var(--calendar-source-color);
  border-radius: 0.75rem;
  background-color: color-mix(in srgb, var(--ui-bg-elevated) 48%, transparent);
  padding: 0.75rem;
}

.calendar-filter-source__dot {
  height: 0.55rem;
  width: 0.55rem;
  flex: none;
  border-radius: 999px;
  background-color: var(--calendar-source-color);
}

.calendar-filter-row {
  display: grid;
  grid-template-columns: minmax(130px, 1fr) minmax(120px, 0.75fr) minmax(130px, 1fr) auto;
  gap: 0.45rem;
}

.calendar-filter-empty {
  display: flex;
  min-height: 2.45rem;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  border: 1px dashed var(--ui-border);
  border-radius: 0.6rem;
  color: var(--ui-text-muted);
  cursor: pointer;
  font-size: 0.72rem;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    color 150ms ease;
}

.calendar-filter-empty:hover {
  border-color: color-mix(in srgb, var(--calendar-source-color) 44%, var(--ui-border));
  background-color: color-mix(in srgb, var(--calendar-source-color) 6%, transparent);
  color: var(--ui-text-highlighted);
}

.calendar-canvas {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--ui-border) 88%, transparent);
  border-radius: 1rem;
  background-color: var(--ui-bg);
  box-shadow:
    0 1px 2px color-mix(in srgb, black 5%, transparent),
    0 18px 50px color-mix(in srgb, black 4%, transparent);
}

.calendar-canvas__header {
  display: flex;
  min-height: 3.75rem;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--ui-border);
  background:
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--ui-primary) 5%, var(--ui-bg-elevated)),
      var(--ui-bg-elevated) 38%
    );
  padding: 0.65rem 0.9rem;
}

.calendar-interaction-guide {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.65rem;
}

.calendar-interaction-guide__icon {
  display: grid;
  height: 2rem;
  width: 2rem;
  flex: none;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--ui-primary) 20%, var(--ui-border));
  border-radius: 0.65rem;
  background-color: color-mix(in srgb, var(--ui-primary) 8%, var(--ui-bg));
  color: var(--ui-primary);
}

.calendar-canvas__status {
  flex: none;
  color: var(--ui-text-muted);
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
}

.calendar-live-status {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--ui-primary);
}

.calendar-live-status__pulse {
  height: 0.45rem;
  width: 0.45rem;
  border-radius: 999px;
  background-color: currentColor;
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--ui-primary) 45%, transparent);
  animation: calendar-live-pulse 1.5s ease-out infinite;
}

.calendar-shell {
  position: relative;
  min-height: 30rem;
  padding: 0.8rem;
}

.calendar-query-progress {
  position: absolute;
  z-index: 40;
  top: 0;
  right: 0;
  left: 0;
  height: 2px;
  overflow: hidden;
}

.calendar-action-banner {
  position: absolute;
  z-index: 50;
  top: 1.35rem;
  left: 50%;
  display: flex;
  max-width: calc(100% - 2rem);
  align-items: center;
  gap: 0.65rem;
  border: 1px solid color-mix(in srgb, var(--ui-primary) 32%, var(--ui-border));
  border-radius: 0.8rem;
  background-color: color-mix(in srgb, var(--ui-bg) 92%, transparent);
  box-shadow:
    0 12px 35px color-mix(in srgb, black 20%, transparent),
    0 0 0 1px color-mix(in srgb, white 20%, transparent) inset;
  color: var(--ui-text-highlighted);
  padding: 0.55rem 0.75rem;
  pointer-events: none;
  transform: translateX(-50%);
  backdrop-filter: blur(18px);
}

.calendar-action-banner__icon {
  display: grid;
  height: 1.8rem;
  width: 1.8rem;
  flex: none;
  place-items: center;
  border-radius: 0.55rem;
  background-color: color-mix(in srgb, var(--ui-primary) 11%, var(--ui-bg-elevated));
  color: var(--ui-primary);
}

.calendar-action-banner p {
  overflow: hidden;
  font-size: 0.75rem;
  font-weight: 750;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calendar-action-banner span {
  display: block;
  margin-top: 0.1rem;
  color: var(--ui-text-muted);
  font-size: 0.625rem;
}

.calendar-blocking-empty {
  position: absolute;
  z-index: 30;
  inset: 0.8rem;
  display: grid;
  align-content: center;
  justify-items: center;
  border-radius: 0.8rem;
  background-color: color-mix(in srgb, var(--ui-bg) 87%, transparent);
  padding: 2rem;
  text-align: center;
  backdrop-filter: blur(7px);
}

.calendar-blocking-empty__icon {
  display: grid;
  height: 3.25rem;
  width: 3.25rem;
  place-items: center;
  border: 1px solid var(--ui-border);
  border-radius: 1rem;
  background-color: var(--ui-bg-elevated);
  color: var(--ui-text-muted);
  box-shadow: 0 8px 25px color-mix(in srgb, black 7%, transparent);
}

.calendar-blocking-empty h3 {
  margin-top: 0.9rem;
  color: var(--ui-text-highlighted);
  font-size: 0.95rem;
  font-weight: 750;
}

.calendar-blocking-empty p {
  max-width: 24rem;
  margin: 0.25rem 0 1rem;
  color: var(--ui-text-muted);
  font-size: 0.75rem;
}

.calendar-zero-results {
  position: absolute;
  z-index: 12;
  right: 50%;
  bottom: 1.35rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  background-color: color-mix(in srgb, var(--ui-bg) 88%, transparent);
  box-shadow: 0 5px 20px color-mix(in srgb, black 8%, transparent);
  color: var(--ui-text-muted);
  font-size: 0.675rem;
  font-weight: 600;
  padding: 0.4rem 0.65rem;
  pointer-events: none;
  transform: translateX(50%);
  backdrop-filter: blur(12px);
}

.calendar-event-popover {
  --calendar-event-color: var(--ui-primary);
  position: fixed;
  z-index: 1000;
  overflow: hidden;
  width: min(21rem, calc(100vw - 2rem));
  border: 1px solid color-mix(in srgb, var(--calendar-event-color) 28%, var(--ui-border));
  border-radius: 0.9rem;
  background-color: color-mix(in srgb, var(--ui-bg) 94%, transparent);
  box-shadow:
    0 20px 50px color-mix(in srgb, black 22%, transparent),
    0 0 0 1px color-mix(in srgb, white 15%, transparent) inset;
  color: var(--ui-text);
  pointer-events: none;
  backdrop-filter: blur(20px);
}

.calendar-event-popover__accent {
  height: 0.22rem;
  background:
    linear-gradient(
      90deg,
      var(--calendar-event-color),
      color-mix(in srgb, var(--calendar-event-color) 34%, transparent)
    );
}

.calendar-event-popover__header {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0.85rem 0.85rem 0.65rem;
}

.calendar-event-popover__icon {
  display: grid;
  height: 2rem;
  width: 2rem;
  flex: none;
  place-items: center;
  border-radius: 0.6rem;
  background-color: color-mix(in srgb, var(--calendar-event-color) 11%, var(--ui-bg-elevated));
  color: var(--calendar-event-color);
}

.calendar-event-popover__interval {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0.85rem;
  border: 1px solid color-mix(in srgb, var(--calendar-event-color) 17%, var(--ui-border));
  border-radius: 0.65rem;
  background-color: color-mix(in srgb, var(--calendar-event-color) 6%, var(--ui-bg-elevated));
  color: var(--ui-text-highlighted);
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  padding: 0.55rem 0.65rem;
}

.calendar-event-popover__interval svg {
  flex: none;
  color: var(--calendar-event-color);
}

.calendar-event-popover__fields {
  display: grid;
  gap: 0.42rem;
  padding: 0.75rem 0.85rem;
}

.calendar-event-popover__fields > div {
  display: grid;
  grid-template-columns: minmax(5.5rem, 0.7fr) minmax(0, 1fr);
  gap: 0.7rem;
  font-size: 0.7rem;
}

.calendar-event-popover__fields dt {
  overflow: hidden;
  color: var(--ui-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calendar-event-popover__fields dd {
  overflow: hidden;
  color: var(--ui-text-highlighted);
  font-weight: 620;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calendar-event-popover__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  border-top: 1px solid var(--ui-border);
  background-color: color-mix(in srgb, var(--ui-bg-elevated) 62%, transparent);
  color: var(--ui-text-muted);
  font-size: 0.625rem;
  padding: 0.55rem 0.85rem;
}

.calendar-event-popover__footer span {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
}

.calendar-create-summary {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border: 1px solid color-mix(in srgb, var(--ui-primary) 18%, var(--ui-border));
  border-radius: 0.75rem;
  background-color: color-mix(in srgb, var(--ui-primary) 6%, var(--ui-bg-elevated));
  padding: 0.75rem;
}

.calendar-create-summary__icon {
  display: grid;
  height: 2.4rem;
  width: 2.4rem;
  flex: none;
  place-items: center;
  border-radius: 0.7rem;
  background-color: color-mix(in srgb, var(--ui-primary) 13%, var(--ui-bg));
  color: var(--ui-primary);
}

.calendar-create-source {
  --calendar-source-color: var(--ui-primary);
  display: flex;
  min-height: 4rem;
  width: 100%;
  align-items: center;
  gap: 0.75rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.75rem;
  background-color: var(--ui-bg);
  cursor: pointer;
  padding: 0.65rem 0.75rem;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.calendar-create-source:hover {
  border-color: color-mix(in srgb, var(--calendar-source-color) 46%, var(--ui-border));
  background-color: color-mix(in srgb, var(--calendar-source-color) 5%, var(--ui-bg));
  box-shadow: 0 8px 22px color-mix(in srgb, var(--calendar-source-color) 10%, transparent);
  transform: translateY(-1px);
}

.calendar-create-source__icon {
  display: grid;
  height: 2.3rem;
  width: 2.3rem;
  flex: none;
  place-items: center;
  border-radius: 0.7rem;
  background-color: color-mix(in srgb, var(--calendar-source-color) 11%, var(--ui-bg-elevated));
}

.calendar-create-source__icon span {
  height: 0.7rem;
  width: 0.7rem;
  border-radius: 999px;
  background-color: var(--calendar-source-color);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--calendar-source-color) 14%, transparent);
}

.calendar-create-source strong,
.calendar-create-source small {
  display: block;
}

.calendar-create-source strong {
  overflow: hidden;
  color: var(--ui-text-highlighted);
  font-size: 0.8rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calendar-create-source small {
  margin-top: 0.15rem;
  color: var(--ui-text-muted);
  font-size: 0.68rem;
}

.calendar-popover-enter-active,
.calendar-popover-leave-active,
.calendar-action-enter-active,
.calendar-action-leave-active {
  transition:
    opacity 140ms ease,
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.calendar-popover-enter-from,
.calendar-popover-leave-to {
  opacity: 0;
  transform: translateY(5px) scale(0.98);
}

.calendar-action-enter-from,
.calendar-action-leave-to {
  opacity: 0;
  transform: translate(-50%, -8px) scale(0.98);
}

@keyframes calendar-live-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--ui-primary) 45%, transparent);
  }

  70% {
    box-shadow: 0 0 0 6px color-mix(in srgb, var(--ui-primary) 0%, transparent);
  }

  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--ui-primary) 0%, transparent);
  }
}

@media (max-width: 820px) {
  .calendar-command-center__main {
    align-items: stretch;
    flex-direction: column;
  }

  .calendar-view-switch {
    align-self: flex-start;
    max-width: 100%;
    overflow-x: auto;
  }

  .calendar-source-heading p {
    display: none;
  }

  .calendar-filter-row {
    grid-template-columns: 1fr 1fr auto;
  }

  .calendar-filter-row > :nth-child(3) {
    grid-column: 1 / 3;
  }

  .calendar-filter-row > :last-child {
    grid-column: 3;
    grid-row: 1 / 3;
  }
}

@media (max-width: 640px) {
  .calendar-command-center__main,
  .calendar-command-center__sources {
    padding-inline: 0.75rem;
  }

  .calendar-period-navigation {
    align-items: flex-start;
    flex-direction: column-reverse;
    gap: 0.65rem;
  }

  .calendar-period-title h1 {
    max-width: calc(100vw - 3rem);
  }

  .calendar-view-switch {
    width: 100%;
  }

  .calendar-view-switch__item {
    min-width: 3.2rem;
    flex: 1;
    padding-inline: 0.4rem;
  }

  .calendar-view-switch__item span {
    display: none;
  }

  .calendar-source-heading {
    margin-bottom: 0.55rem;
  }

  .calendar-canvas__header {
    min-height: 3.2rem;
    padding: 0.55rem 0.65rem;
  }

  .calendar-interaction-guide__icon,
  .calendar-interaction-guide p:last-child {
    display: none;
  }

  .calendar-shell {
    min-height: 27rem;
    padding: 0.35rem;
  }

  .calendar-zero-results {
    max-width: calc(100% - 1rem);
    justify-content: center;
    text-align: center;
  }

  .calendar-zero-results .text-dimmed {
    display: none;
  }

  .calendar-filter-panel__header,
  .calendar-filter-panel__body {
    padding-inline: 0.65rem;
  }

  .calendar-filter-row {
    grid-template-columns: 1fr auto;
  }

  .calendar-filter-row > :nth-child(1),
  .calendar-filter-row > :nth-child(2),
  .calendar-filter-row > :nth-child(3) {
    grid-column: 1;
  }

  .calendar-filter-row > :last-child {
    grid-column: 2;
    grid-row: 1 / 4;
  }

  .calendar-action-banner {
    top: 0.65rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .calendar-command-center *,
  .calendar-event-popover,
  .calendar-action-banner {
    transition-duration: 0.01ms !important;
  }
}
</style>
