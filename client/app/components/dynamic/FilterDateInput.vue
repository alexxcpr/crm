<script setup lang="ts">
import { CalendarDate, fromDate, getLocalTimeZone, parseDate } from '@internationalized/date'
import type { DateValue } from '@internationalized/date'
import { localDateTimeToISO } from '~/utils/dateFormat'

const props = defineProps<{
  modelValue?: string | number
  mode: 'date' | 'datetime'
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const datePlaceholder = computed(() => props.placeholder ?? (props.mode === 'datetime' ? 'zz.ll.aaaa hh:mm:ss' : 'zz.ll.aaaa'))
const calendarValue = ref<DateValue | undefined>(undefined)
const textValue = ref('')
const selectedTime = ref({ hour: 0, minute: 0, second: 0 })
const popoverOpen = ref(false)
const isTextFocused = ref(false)

type CalendarDisplayValue = {
  day: number
  month: number
  year: number
  hour?: number
  minute?: number
  second?: number
}

watch(() => props.modelValue, (newValue) => {
  if (isTextFocused.value) return
  syncFromModel(newValue)
}, { immediate: true })

watch(calendarValue, (newValue) => {
  if (props.mode !== 'date') return
  textValue.value = formatDateForDisplay(newValue)
  emit('update:modelValue', newValue ? newValue.toString() : '')
})

function syncFromModel(value: string | number | undefined) {
  const raw = value === undefined ? '' : String(value)
  if (!raw) {
    calendarValue.value = undefined
    textValue.value = ''
    selectedTime.value = { hour: 0, minute: 0, second: 0 }
    return
  }

  if (props.mode === 'date') {
    const parsed = parseToCalendarDate(raw)
    calendarValue.value = parsed
    textValue.value = parsed ? formatDateForDisplay(parsed) : raw
    return
  }

  const parsed = parseToCalendarDateTime(raw)
  calendarValue.value = parsed
  if (parsed && 'hour' in parsed) {
    selectedTime.value = {
      hour: parsed.hour,
      minute: parsed.minute,
      second: parsed.second ?? 0
    }
    textValue.value = formatDateTimeForDisplay(parsed, selectedTime.value)
  } else if (parsed) {
    selectedTime.value = { hour: 0, minute: 0, second: 0 }
    textValue.value = formatDateForDisplay(parsed)
  } else {
    textValue.value = raw
  }
}

function parseToCalendarDate(value: string): DateValue | undefined {
  try {
    return parseDate(value)
  } catch {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return undefined
    return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate())
  }
}

function parseToCalendarDateTime(value: string): DateValue | undefined {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return parseToCalendarDate(value)

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return fromDate(date, getLocalTimeZone())
}

function parseDateFromText(text: string): DateValue | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const roMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (roMatch) {
    try {
      return new CalendarDate(
        parseInt(roMatch[3]!, 10),
        parseInt(roMatch[2]!, 10),
        parseInt(roMatch[1]!, 10)
      )
    } catch {
      return null
    }
  }

  try {
    return parseDate(trimmed)
  } catch {
    return null
  }
}

type ParsedDateTime = {
  date: DateValue
  time: { hour: number, minute: number, second: number }
  dateOnly: boolean
}

function parseDateTimeFromText(text: string): ParsedDateTime | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const match = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/)
  if (!match) return null

  const hour = match[4] ? parseInt(match[4], 10) : 0
  const minute = match[5] ? parseInt(match[5], 10) : 0
  const second = match[6] ? parseInt(match[6], 10) : 0
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null

  try {
    return {
      date: new CalendarDate(
        parseInt(match[3]!, 10),
        parseInt(match[2]!, 10),
        parseInt(match[1]!, 10)
      ),
      time: { hour, minute, second },
      dateOnly: !match[4]
    }
  } catch {
    return null
  }
}

function formatDateForDisplay(value: CalendarDisplayValue | undefined): string {
  if (!value) return ''
  return `${String(value.day).padStart(2, '0')}.${String(value.month).padStart(2, '0')}.${value.year}`
}

function formatDateTimeForDisplay(value: CalendarDisplayValue | undefined, time: { hour: number, minute: number, second: number }): string {
  if (!value) return ''
  return `${formatDateForDisplay(value)} ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}:${String(time.second).padStart(2, '0')}`
}

function onTextBlur() {
  isTextFocused.value = false
  const trimmed = textValue.value.trim()
  if (!trimmed) {
    clearValue()
    return
  }

  if (props.mode === 'date') {
    const parsed = parseDateFromText(trimmed)
    if (parsed) calendarValue.value = parsed
    return
  }

  const parsed = parseDateTimeFromText(trimmed)
  if (!parsed) return

  calendarValue.value = parsed.date
  selectedTime.value = parsed.time
  emitDateTimeValue()
  textValue.value = parsed.dateOnly
    ? formatDateForDisplay(parsed.date)
    : formatDateTimeForDisplay(parsed.date, parsed.time)
}

function clearValue() {
  calendarValue.value = undefined
  textValue.value = ''
  selectedTime.value = { hour: 0, minute: 0, second: 0 }
  emit('update:modelValue', '')
}

function emitDateTimeValue() {
  if (!calendarValue.value) {
    emit('update:modelValue', '')
    return
  }

  const date = calendarValue.value as CalendarDate
  emit('update:modelValue', localDateTimeToISO(
    date.year,
    date.month,
    date.day,
    selectedTime.value.hour,
    selectedTime.value.minute,
    selectedTime.value.second
  ))
}

function applyDateTime() {
  emitDateTimeValue()
  textValue.value = formatDateTimeForDisplay(calendarValue.value, selectedTime.value)
  popoverOpen.value = false
}
</script>

<template>
  <div class="flex w-full items-center gap-1.5">
    <UInput
      v-model="textValue"
      type="text"
      :placeholder="datePlaceholder"
      size="sm"
      class="min-w-0 flex-1"
      @focus="isTextFocused = true"
      @blur="onTextBlur"
      @keydown.enter="($event.target as HTMLInputElement).blur()"
    />

    <UPopover
      v-model:open="popoverOpen"
      :content="{ align: 'start' }"
      :modal="true"
      :ui="{ content: 'max-h-(--reka-popover-content-available-height,100vh) max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain' }"
    >
      <UButton
        color="neutral"
        variant="outline"
        :icon="mode === 'datetime' ? 'i-lucide-calendar-clock' : 'i-lucide-calendar'"
        size="sm"
      />

      <template #content>
        <div v-if="mode === 'date'" class="p-2">
          <UCalendar :model-value="(calendarValue as any)" class="p-2" @update:model-value="calendarValue = $event as DateValue" />
        </div>

        <div v-else class="space-y-3 p-3">
          <UCalendar :model-value="(calendarValue as any)" class="p-2" @update:model-value="calendarValue = $event as DateValue" />

          <div class="flex items-center gap-3 border-t border-default pt-2">
            <span class="text-sm text-muted">Ora:</span>
            <div class="flex items-center gap-1.5">
              <USelect
                v-model="selectedTime.hour"
                :items="Array.from({ length: 24 }, (_, i) => ({ label: String(i).padStart(2, '0'), value: i }))"
                class="w-16"
                size="sm"
              />
              <span class="text-lg">:</span>
              <USelect
                v-model="selectedTime.minute"
                :items="Array.from({ length: 60 }, (_, i) => ({ label: String(i).padStart(2, '0'), value: i }))"
                class="w-16"
                size="sm"
              />
              <span class="text-lg">:</span>
              <USelect
                v-model="selectedTime.second"
                :items="Array.from({ length: 60 }, (_, i) => ({ label: String(i).padStart(2, '0'), value: i }))"
                class="w-16"
                size="sm"
              />
            </div>
          </div>

          <UButton
            color="primary"
            variant="solid"
            size="sm"
            class="w-full justify-center"
            @click="applyDateTime"
          >
            Aplică
          </UButton>
        </div>
      </template>
    </UPopover>

    <UButton
      v-if="calendarValue"
      color="neutral"
      variant="ghost"
      icon="i-lucide-x"
      size="sm"
      class="shrink-0"
      @click="clearValue"
    />
  </div>
</template>
