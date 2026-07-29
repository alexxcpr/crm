<script setup lang="ts">
import FullCalendar from '@fullcalendar/vue3'
import dayGridPlugin from '@fullcalendar/vue3/daygrid'
import interactionPlugin from '@fullcalendar/vue3/interaction'
import listPlugin from '@fullcalendar/vue3/list'
import timeGridPlugin from '@fullcalendar/vue3/timegrid'
import type { CalendarOptions, DatesSetInfo, EventInput } from '@fullcalendar/vue3'
import '@fullcalendar/vue3/skeleton.css'
import type { CalendarDefinition, CalendarQueryResult } from '~/types/calendar'

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
  color: event.color
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
  events: events.value,
  datesSet: (info: DatesSetInfo) => {
    range.value = { start: info.start, end: info.end }
    schedule()
  }
}))

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
  <div class="calendar-builder-preview relative rounded-xl border border-default bg-default p-3">
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
    <FullCalendar :options="options" />
  </div>
</template>

<style>
.calendar-builder-preview {
  --fc-border-color: var(--ui-border);
  --fc-page-bg-color: var(--ui-bg);
  --fc-neutral-bg-color: var(--ui-bg-elevated);
  --fc-today-bg-color: color-mix(in srgb, var(--ui-primary) 8%, transparent);
  color: var(--ui-text);
}
.calendar-builder-preview .fc {
  font-size: 0.78rem;
}
.calendar-builder-preview .fc a {
  color: inherit;
}
</style>
