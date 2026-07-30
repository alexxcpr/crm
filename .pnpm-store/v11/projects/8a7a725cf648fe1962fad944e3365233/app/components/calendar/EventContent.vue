<script setup lang="ts">
import type { CalendarEvent } from '~/types/calendar'

const props = withDefaults(defineProps<{
  event?: CalendarEvent
  timeText?: string
  preview?: boolean
  state?: 'drag' | 'resize' | 'saving'
  viewType?: string
}>(), {
  timeText: '',
  preview: false,
  state: undefined,
  viewType: ''
})

const eventStyle = computed(() => ({
  '--calendar-event-color': props.event?.color ?? 'var(--ui-primary)'
}))
</script>

<template>
  <div
    v-if="event"
    class="moduvis-calendar-event"
    :class="{
      'is-all-day': event.allDay,
      'is-timed': !event.allDay,
      'is-editable': event.editable,
      'is-preview': preview,
      'is-day-grid': viewType.includes('dayGrid'),
      'is-time-grid': viewType.includes('timeGrid'),
      'is-list': viewType.includes('list'),
      'is-dragging': state === 'drag',
      'is-resizing': state === 'resize',
      'is-saving': state === 'saving'
    }"
    :style="eventStyle"
  >
    <span class="moduvis-calendar-event__accent" aria-hidden="true" />

    <div class="moduvis-calendar-event__body">
      <div class="moduvis-calendar-event__primary">
        <span v-if="timeText" class="moduvis-calendar-event__time">
          {{ timeText }}
        </span>
        <span class="moduvis-calendar-event__title">
          {{ event.title }}
        </span>
      </div>

      <div class="moduvis-calendar-event__meta">
        <span class="moduvis-calendar-event__dot" aria-hidden="true" />
        <span class="moduvis-calendar-event__source">
          {{ event.sourceName }}
        </span>
      </div>
    </div>

    <UIcon
      v-if="event.editable && !preview"
      :name="state === 'saving'
        ? 'i-lucide-loader-circle'
        : state === 'resize'
          ? 'i-lucide-move-vertical'
          : 'i-lucide-grip-vertical'"
      class="moduvis-calendar-event__move"
      :class="{ 'animate-spin': state === 'saving' }"
      aria-hidden="true"
    />
    <span
      v-if="event.editable && !preview"
      class="moduvis-calendar-event__resize-cue"
      :class="{ 'is-horizontal': event.allDay }"
      aria-hidden="true"
    />
  </div>

  <div
    v-else
    class="moduvis-calendar-event moduvis-calendar-event--selection"
    :class="{
      'is-day-grid': viewType.includes('dayGrid'),
      'is-time-grid': viewType.includes('timeGrid'),
      'is-list': viewType.includes('list')
    }"
    :style="eventStyle"
  >
    <span class="moduvis-calendar-event__accent" aria-hidden="true" />
    <div class="moduvis-calendar-event__body">
      <div class="moduvis-calendar-event__primary">
        <span class="moduvis-calendar-event__time">
          {{ timeText }}
        </span>
        <span class="moduvis-calendar-event__title">
          Interval nou
        </span>
      </div>
      <div class="moduvis-calendar-event__meta">
        <span class="moduvis-calendar-event__dot" aria-hidden="true" />
        <span class="moduvis-calendar-event__source">Eliberează pentru a crea</span>
      </div>
    </div>
    <UIcon name="i-lucide-plus" class="mr-2 size-4 self-center text-primary" aria-hidden="true" />
  </div>
</template>
