<script setup lang="ts">
import FullCalendar from '@fullcalendar/vue3'
import dayGridPlugin from '@fullcalendar/vue3/daygrid'
import interactionPlugin from '@fullcalendar/vue3/interaction'
import listPlugin from '@fullcalendar/vue3/list'
import timeGridPlugin from '@fullcalendar/vue3/timegrid'
import type { CalendarOptions, DatesSetInfo, EventInput } from '@fullcalendar/vue3'
import '@fullcalendar/vue3/skeleton.css'
import '~/assets/css/moduvis-calendar.css'
import type { CalendarDefinition, CalendarEvent, CalendarQueryResult } from '~/types/calendar'

const props = defineProps<{
  calendar: CalendarDefinition
}>()

const { previewCalendar } = useAdminCalendars()
const { branding } = useTenantBranding()
const result = ref<CalendarQueryResult | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)
const range = shallowRef<{ start: Date, end: Date } | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
let controller: AbortController | undefined

const events = computed<EventInput[]>(() => (result.value?.events ?? []).map(event => ({
  id: event.id,
  title: event.title,
  start: event.start,
  end: event.end,
  allDay: event.allDay,
  backgroundColor: 'transparent',
  borderColor: 'transparent',
  textColor: 'inherit',
  extendedProps: { calendarEvent: event }
})))

const options = computed<CalendarOptions>(() => ({
  plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
  initialView: 'dayGridMonth',
  headerToolbar: { left: 'prev,next today', center: 'title', right: '' },
  locale: branding.value.locale,
  timeZone: branding.value.timezone,
  firstDay: props.calendar.first_day,
  weekends: props.calendar.show_weekends,
  slotMinTime: `${props.calendar.slot_min_time}:00`,
  slotMaxTime: `${props.calendar.slot_max_time}:00`,
  slotDuration: `00:${String(props.calendar.slot_duration_minutes).padStart(2, '0')}:00`,
  scrollTime: `${props.calendar.scroll_time}:00`,
  height: 560,
  editable: false,
  selectable: false,
  dayMaxEvents: 4,
  eventMaxStack: 4,
  slotEventOverlap: false,
  eventOrder: 'start,-duration,title',
  eventClass: 'moduvis-fc-event is-readonly',
  moreLinkContent: args => `+${args.num} înregistrări`,
  events: events.value,
  datesSet: (info: DatesSetInfo) => {
    range.value = { start: info.start, end: info.end }
    schedule()
  }
}))

function slotCalendarEvent(eventApi: any): CalendarEvent | undefined {
  return eventApi.extendedProps.calendarEvent as CalendarEvent | undefined
}

function schedule() {
  clearTimeout(timer)
  controller?.abort()
  timer = setTimeout(loadPreview, 450)
}

async function loadPreview() {
  if (!range.value) return
  const active = props.calendar.sources.filter(source => source.is_active)
  if (!props.calendar.name || !props.calendar.slug || !active.length) {
    result.value = null
    return
  }
  controller = new AbortController()
  loading.value = true
  error.value = null
  try {
    result.value = await previewCalendar(
      props.calendar,
      range.value.start,
      range.value.end,
      controller.signal
    )
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      error.value = err?.data?.message || err?.message || 'Preview-ul nu a putut fi încărcat.'
    }
  } finally {
    loading.value = false
  }
}

watch(() => props.calendar, schedule, { deep: true })
onBeforeUnmount(() => {
  clearTimeout(timer)
  controller?.abort()
})
</script>

<template>
  <div class="calendar-builder-preview moduvis-calendar-surface is-month-view relative">
    <UProgress
      v-if="loading"
      animation="carousel"
      size="xs"
      class="absolute inset-x-0 top-0 z-10"
    />
    <UAlert
      v-if="error"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Preview incomplet"
      :description="error"
      class="mb-3"
    />
    <FullCalendar :options="options">
      <template #eventContent="arg">
        <CalendarEventContent
          :event="slotCalendarEvent(arg.event)"
          :time-text="arg.timeText"
          :view-type="arg.view.type"
          preview
        />
      </template>
    </FullCalendar>
  </div>
</template>

<style>
.calendar-builder-preview {
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: 1rem;
  background-color: var(--ui-bg);
  box-shadow: 0 10px 35px color-mix(in srgb, black 5%, transparent);
  padding: 0.85rem;
}
</style>
