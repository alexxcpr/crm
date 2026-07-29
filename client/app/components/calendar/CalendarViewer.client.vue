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
const currentEvents = computed<EventInput[]>(() => (result.value?.events ?? []).map(event => ({
  id: event.id,
  title: event.title,
  start: event.start,
  end: event.end,
  allDay: event.allDay,
  color: event.color,
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
  selectable: currentView.value !== 'list' && creatableSources.value.length > 0,
  selectMirror: true,
  selectLongPressDelay: 450,
  eventLongPressDelay: 450,
  editable: true,
  eventStartEditable: true,
  eventDurationEditable: true,
  eventDisplay: 'block',
  events: currentEvents.value,
  datesSet: onDatesSet,
  eventClick: onEventClick,
  eventMouseEnter: onEventMouseEnter,
  eventMouseLeave: () => { hover.value = null },
  eventDidMount: (info: any) => {
    info.el.tabIndex = 0
    info.el.addEventListener('focus', () => showHoverForElement(info.event, info.el))
    info.el.addEventListener('blur', () => {
      hover.value = null
    })
    info.el.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        const item = info.event.extendedProps.calendarEvent as CalendarEvent
        navigateTo(item.url)
      }
    })
  },
  dateClick: onDateClick,
  select: onSelect,
  eventDrop: onEventDrop,
  eventResize: onEventResize,
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
  createSelection.value = selection
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
  const event = info.event.extendedProps.calendarEvent as CalendarEvent
  navigateTo(event.url)
}

function onEventMouseEnter(info: EventHoveringInfo) {
  const event = info.event.extendedProps.calendarEvent as CalendarEvent
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
  try {
    await updateInterval(event.sourceId, event.recordId, {
      start: info.event.allDay ? info.event.startStr : info.event.start.toISOString(),
      end: info.event.allDay ? info.event.endStr : info.event.end.toISOString(),
      all_day: info.event.allDay
    })
    await refresh()
  } catch (err: any) {
    info.revert()
    toast.add({
      title: 'Intervalul nu a fost salvat',
      description: err?.data?.message || err?.message || 'Modificarea a fost anulată.',
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
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
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="querying"
            aria-label="Reîncarcă"
            @click="refresh"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar v-if="calendar">
        <template #left>
          <div class="flex flex-wrap items-center gap-2">
            <UButtonGroup>
              <UButton
                icon="i-lucide-chevron-left"
                color="neutral"
                variant="outline"
                aria-label="Perioada anterioară"
                @click="navigate('prev')"
              />
              <UButton
                color="neutral"
                variant="outline"
                @click="navigate('today')"
              >
                Astăzi
              </UButton>
              <UButton
                icon="i-lucide-chevron-right"
                color="neutral"
                variant="outline"
                aria-label="Perioada următoare"
                @click="navigate('next')"
              />
            </UButtonGroup>
            <span class="min-w-40 text-sm font-semibold text-highlighted">
              {{ calendarTitle }}
            </span>
          </div>
        </template>

        <template #right>
          <UButtonGroup>
            <UButton
              v-for="view in allowedViews"
              :key="view"
              :color="currentView === view ? 'primary' : 'neutral'"
              :variant="currentView === view ? 'solid' : 'outline'"
              size="sm"
              @click="changeView(view)"
            >
              {{ viewLabels[view] }}
            </UButton>
          </UButtonGroup>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div v-if="loading" class="space-y-4">
        <USkeleton class="h-10 w-full" />
        <USkeleton class="h-[620px] w-full" />
      </div>

      <UAlert
        v-else-if="error && !calendar"
        color="error"
        variant="subtle"
        icon="i-lucide-calendar-x"
        title="Calendar indisponibil"
        :description="error"
      />

      <div v-else-if="calendar" class="space-y-4">
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="Evenimentele nu au putut fi încărcate"
          :description="error"
        />

        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="source in sources"
            :key="source.id_ui_calendar_source"
            type="button"
            class="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition"
            :class="activeSourceIds.includes(source.id_ui_calendar_source!) ? 'border-default bg-elevated text-highlighted' : 'border-muted bg-muted/40 text-dimmed opacity-60'"
            @click="toggleSource(source.id_ui_calendar_source!)"
          >
            <span class="size-2.5 rounded-full" :style="{ backgroundColor: source.color }" />
            {{ source.name }}
            <UIcon
              :name="activeSourceIds.includes(source.id_ui_calendar_source!) ? 'i-lucide-eye' : 'i-lucide-eye-off'"
              class="size-3.5"
            />
          </button>

          <UPopover v-if="activeSources.some(source => filterFields(source).length)">
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              icon="i-lucide-list-filter"
            >
              Filtre
            </UButton>
            <template #content>
              <div class="max-h-[70vh] w-[min(92vw,620px)] space-y-5 overflow-y-auto p-4">
                <section
                  v-for="source in activeSources.filter(item => filterFields(item).length)"
                  :key="source.id_ui_calendar_source"
                  class="space-y-3"
                >
                  <div class="flex items-center justify-between gap-3">
                    <p class="flex items-center gap-2 text-sm font-semibold">
                      <span class="size-2.5 rounded-full" :style="{ backgroundColor: source.color }" />
                      {{ source.name }}
                    </p>
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-plus"
                      @click="addFilter(source)"
                    >
                      Adaugă filtru
                    </UButton>
                  </div>

                  <div
                    v-for="(filter, index) in interactiveFilters[source.id_ui_calendar_source!] ?? []"
                    :key="index"
                    class="grid gap-2 rounded-lg border border-default p-2 sm:grid-cols-[1fr_150px_1fr_auto]"
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
                      :placeholder="filter.operator === 'in' || filter.operator === 'between' ? 'valori separate prin virgulă' : 'Valoare'"
                    />
                    <USelect
                      v-else
                      v-model="filter.value as any"
                      :items="[{ label: 'Este gol', value: true }, { label: 'Nu este gol', value: false }]"
                      value-key="value"
                    />
                    <UButton
                      icon="i-lucide-x"
                      color="error"
                      variant="ghost"
                      aria-label="Elimină filtrul"
                      @click="removeFilter(source.id_ui_calendar_source!, index)"
                    />
                  </div>
                  <p
                    v-if="!(interactiveFilters[source.id_ui_calendar_source!]?.length)"
                    class="text-xs text-muted"
                  >
                    Nu există filtre interactive pentru această sursă.
                  </p>
                </section>
              </div>
            </template>
          </UPopover>
        </div>

        <div class="calendar-shell relative rounded-xl border border-default bg-default p-2 sm:p-4">
          <div
            v-if="querying"
            class="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden rounded-t-xl"
          >
            <UProgress animation="carousel" size="xs" />
          </div>
          <FullCalendar ref="calendarRef" :options="options" />
        </div>
      </div>

      <div
        v-if="hover"
        class="pointer-events-none fixed z-[100] w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-default bg-default p-3 shadow-xl"
        :style="{ left: `${Math.max(16, hover.x)}px`, top: `${Math.max(16, hover.y)}px` }"
      >
        <div class="flex items-start gap-2">
          <span class="mt-1 size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: hover.event.color }" />
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-highlighted">
              {{ hover.event.title }}
            </p>
            <p class="text-xs text-muted">
              {{ hover.event.sourceName }}
            </p>
          </div>
        </div>
        <p class="mt-2 text-xs text-muted">
          {{ eventInterval(hover.event) }}
        </p>
        <dl v-if="hover.event.popover.length" class="mt-3 space-y-1.5 text-xs">
          <div v-for="field in hover.event.popover" :key="field.fieldId" class="grid grid-cols-[110px_1fr] gap-2">
            <dt class="truncate text-muted">
              {{ field.label }}
            </dt>
            <dd class="truncate text-highlighted">
              {{ field.value || '—' }}
            </dd>
          </div>
        </dl>
      </div>
    </template>
  </UDashboardPanel>

  <UModal v-model:open="createSourceModalOpen" title="Alege sursa">
    <template #body>
      <div class="space-y-2">
        <UButton
          v-for="source in creatableSources"
          :key="source.id_ui_calendar_source"
          block
          color="neutral"
          variant="outline"
          class="justify-start"
          @click="selectCreateSource(source)"
        >
          <span class="size-3 rounded-full" :style="{ backgroundColor: source.color }" />
          {{ source.name }}
        </UButton>
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
.calendar-shell {
  --fc-border-color: var(--ui-border);
  --fc-page-bg-color: var(--ui-bg);
  --fc-neutral-bg-color: var(--ui-bg-elevated);
  --fc-neutral-text-color: var(--ui-text-muted);
  --fc-list-event-hover-bg-color: var(--ui-bg-elevated);
  --fc-today-bg-color: color-mix(in srgb, var(--ui-primary) 8%, transparent);
  --fc-now-indicator-color: var(--ui-primary);
  color: var(--ui-text);
}

.calendar-shell .fc {
  font-size: 0.875rem;
}

.calendar-shell .fc a {
  color: inherit;
}

.calendar-shell .fc-event {
  cursor: pointer;
  border-radius: 0.375rem;
}

.calendar-shell .fc-event:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}

@media (max-width: 640px) {
  .calendar-shell .fc {
    font-size: 0.75rem;
  }
}
</style>
