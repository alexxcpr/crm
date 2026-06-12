<script setup lang="ts">
import type { Field } from '~/types/schema'
import { CalendarDate, parseDate, getLocalTimeZone, fromDate } from '@internationalized/date'
import type { DateValue } from '@internationalized/date'
import { localDateTimeToISO } from '~/utils/dateFormat'

const props = defineProps<{
  field: Field
  modelValue: any
  autofocus?: boolean
}>()

const fieldRoot = ref<HTMLElement>()

onMounted(async () => {
  if (props.autofocus) {
    await nextTick()
    const target = fieldRoot.value?.querySelector('input, textarea') as HTMLElement | null
    target?.focus()
  }
})

const emit = defineEmits<{
  'update:modelValue': [value: any]
}>()

const value = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val)
})

const selectItems = computed(() => {
  if (!props.field.options) return []
  return props.field.options.map(o => ({ label: o.label, value: o.value }))
})

// Placeholder texts
const datePlaceholder = 'zz.ll.aaaa'
const dateTimePlaceholder = 'zz.ll.aaaa hh:mm:ss'

// ==================== DATE PICKER ====================
const calendarDate = ref<DateValue | undefined>(undefined)

// Convertește string la CalendarDate
const parseToCalendarDate = (val: string): DateValue | undefined => {
  try {
    // Încearcă mai întâi parseDate direct (format YYYY-MM-DD)
    try {
      return parseDate(val)
    } catch {
      // Dacă eșuează, folosește Date nativ și convertește
      const date = new Date(val)
      if (isNaN(date.getTime())) return undefined
      // Crează CalendarDate din componentele datei locale
      return new CalendarDate(
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate()
      )
    }
  } catch {
    return undefined
  }
}

// ─── Date text input ───
const dateText = ref('')

function parseDateFromText(text: string): DateValue | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  // Format: dd.mm.yyyy
  const match = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (match) {
    const day = parseInt(match[1]!, 10)
    const month = parseInt(match[2]!, 10)
    const year = parseInt(match[3]!, 10)
    try {
      return new CalendarDate(year, month, day)
    } catch {
      return null
    }
  }

  // Format: yyyy-mm-dd (ISO)
  try {
    return parseDate(trimmed)
  } catch {
    return null
  }
}

function formatDateForDisplay(dv: any): string {
  if (!dv) return ''
  return `${String(dv.day).padStart(2, '0')}.${String(dv.month).padStart(2, '0')}.${dv.year}`
}

function onDateTextBlur() {
  const trimmed = dateText.value.trim()
  if (!trimmed) {
    calendarDate.value = undefined
    return
  }
  const parsed = parseDateFromText(trimmed)
  if (parsed) {
    calendarDate.value = parsed
  }
  // Dacă textul nu e parsat, îl lăsăm așa — poate utilizatorul
  // nu a terminat de tastat. Validarea reală e la submit prin Zod.
}

// Watch pentru sincronizare date (date-only) — model → calendar
watch(() => props.modelValue, (newValue) => {
  if (props.field.ui_type !== 'datepicker') return
  calendarDate.value = newValue ? parseToCalendarDate(newValue) : undefined
}, { immediate: true })

// Watch pentru emitere date (date-only) — calendar → model
watch(calendarDate, (newValue) => {
  if (props.field.ui_type !== 'datepicker') return
  emit('update:modelValue', newValue ? newValue.toString() : null)
})

// Sync calendar → text input
watch(calendarDate, (newValue) => {
  if (props.field.ui_type !== 'datepicker') return
  dateText.value = formatDateForDisplay(newValue)
})

// Auto-commit: parsează textul pe măsură ce utilizatorul tastează
watch(dateText, (newVal) => {
  if (props.field.ui_type !== 'datepicker') return
  const parsed = parseDateFromText(newVal)
  if (parsed) {
    calendarDate.value = parsed
  }
})

// ==================== DATETIME PICKER ====================
const calendarDateTime = ref<DateValue | undefined>(undefined)
const selectedTime = ref<{ hour: number, minute: number, second: number }>({ hour: 0, minute: 0, second: 0 })
const popoverOpen = ref(false)
const isDateTimeTextFocused = ref(false)

// Convertește ISO string la CalendarDateTime
const parseToCalendarDateTime = (val: string): DateValue | undefined => {
  try {
    // Parsează ISO string (YYYY-MM-DDTHH:mm:ssZ) în Date
    const date = new Date(val)
    if (isNaN(date.getTime())) return undefined
    // Convertește la CalendarDateTime folosind timezone local
    return fromDate(date, getLocalTimeZone())
  } catch {
    return undefined
  }
}

// ─── DateTime text input ───
const dateTimeText = ref('')

type ParsedDateTime = {
  date: DateValue
  time: { hour: number, minute: number, second: number }
  dateOnly: boolean
}

function parseDateTimeFromText(text: string): ParsedDateTime | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  // Format: dd.mm.yyyy plus ora opțională (hh:mm sau hh:mm:ss)
  const match = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/)
  if (match) {
    const day = parseInt(match[1]!, 10)
    const month = parseInt(match[2]!, 10)
    const year = parseInt(match[3]!, 10)
    const hasTime = match[4] !== undefined
    const hour = hasTime ? parseInt(match[4]!, 10) : 0
    const minute = hasTime && match[5] !== undefined ? parseInt(match[5], 10) : 0
    const second = hasTime && match[6] !== undefined ? parseInt(match[6], 10) : 0

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null

    try {
      const d = new CalendarDate(year, month, day)
      return {
        date: d,
        time: { hour, minute, second },
        dateOnly: !hasTime
      }
    } catch {
      return null
    }
  }

  return null
}

function formatDateTimeForDisplay(dv: any, time: { hour: number, minute: number, second: number }): string {
  if (!dv) return ''
  const hh = String(time.hour).padStart(2, '0')
  const mm = String(time.minute).padStart(2, '0')
  const ss = String(time.second).padStart(2, '0')
  return `${String(dv.day).padStart(2, '0')}.${String(dv.month).padStart(2, '0')}.${dv.year} ${hh}:${mm}:${ss}`
}

function onDateTimeTextBlur() {
  isDateTimeTextFocused.value = false
  const trimmed = dateTimeText.value.trim()
  if (!trimmed) {
    clearDateTime()
    return
  }
  const parsed = parseDateTimeFromText(trimmed)
  if (parsed) {
    calendarDateTime.value = parsed.date
    selectedTime.value = parsed.time
    if (parsed.dateOnly) {
      // Doar data — serverul completează ora la salvare; nu autocomplete în input
      emitDateOnlyValue()
      dateTimeText.value = formatDateForDisplay(parsed.date)
    } else {
      emitDateTimeValue()
      dateTimeText.value = formatDateTimeForDisplay(parsed.date, parsed.time)
    }
  }
}

function clearDateTime() {
  calendarDateTime.value = undefined
  dateTimeText.value = ''
  emit('update:modelValue', null)
}

/** Emite ISO la miezul nopții locale — nu YYYY-MM-DD (PG interpretează ca UTC midnight) */
function emitDateOnlyValue() {
  if (!calendarDateTime.value) {
    emit('update:modelValue', null)
    return
  }
  const date = calendarDateTime.value as CalendarDate
  emit('update:modelValue', localDateTimeToISO(date.year, date.month, date.day, 0, 0, 0))
}

/** Construiește ISO string din calendarDateTime + selectedTime și emite */
function emitDateTimeValue() {
  if (!calendarDateTime.value) {
    emit('update:modelValue', null)
    return
  }
  const date = calendarDateTime.value as CalendarDate
  emit('update:modelValue', localDateTimeToISO(
    date.year,
    date.month,
    date.day,
    selectedTime.value.hour,
    selectedTime.value.minute,
    selectedTime.value.second
  ))
}

// Watch pentru sincronizare datetime — model → calendar + time + text (ex. după save)
watch(() => props.modelValue, (newValue) => {
  if (props.field.ui_type !== 'datetimepicker') return
  if (isDateTimeTextFocused.value) return

  if (newValue) {
    // Date-only YYYY-MM-DD (legacy) — nu autocomplete ora în input
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(newValue))) {
      try {
        const dateOnly = parseDate(String(newValue))
        calendarDateTime.value = dateOnly
        selectedTime.value = { hour: 0, minute: 0, second: 0 }
        dateTimeText.value = formatDateForDisplay(dateOnly)
      } catch {
        calendarDateTime.value = undefined
        dateTimeText.value = String(newValue)
      }
    } else if (/^\d{4}-\d{2}-\d{2}T00:00:00([+-]\d{2}:\d{2}|Z)$/.test(String(newValue))) {
      // Miezul nopții local sau UTC — afișăm doar data până la save explicit cu ora
      const parsed = parseToCalendarDateTime(String(newValue))
      calendarDateTime.value = parsed
      selectedTime.value = { hour: 0, minute: 0, second: 0 }
      if (parsed) {
        dateTimeText.value = formatDateForDisplay(parsed)
      }
    } else {
      const parsed = parseToCalendarDateTime(String(newValue))
      calendarDateTime.value = parsed
      if (parsed && 'hour' in parsed) {
        selectedTime.value = {
          hour: parsed.hour,
          minute: parsed.minute,
          second: (parsed as any).second ?? 0
        }
        dateTimeText.value = formatDateTimeForDisplay(parsed, selectedTime.value)
      } else if (parsed) {
        selectedTime.value = { hour: 0, minute: 0, second: 0 }
        dateTimeText.value = formatDateForDisplay(parsed)
      }
    }
  } else {
    calendarDateTime.value = undefined
    dateTimeText.value = ''
  }
}, { immediate: true })

// Funcție pentru aplicarea datei și timpului din widget
const applyDateTime = () => {
  const isMidnight = selectedTime.value.hour === 0
    && selectedTime.value.minute === 0
    && selectedTime.value.second === 0

  if (isMidnight) {
    emitDateOnlyValue()
    dateTimeText.value = formatDateForDisplay(calendarDateTime.value)
  } else {
    emitDateTimeValue()
    dateTimeText.value = formatDateTimeForDisplay(calendarDateTime.value, selectedTime.value)
  }
  popoverOpen.value = false
}

</script>

<template>
  <div
    ref="fieldRoot"
    :class="[
      'dynamic-field-wrapper',
      { 'dynamic-field-wrapper--checkbox': field.ui_type === 'checkbox' },
      { 'dynamic-field-wrapper--readonly': field.is_readonly }
    ]"
  >
    <UFormField
      :name="field.slug"
      :label="field.name"
      :required="field.is_required"
      :help="field.help_text ?? undefined"
      :description="undefined"
    >
    <!-- text -->
    <UInput
      v-if="field.ui_type === 'text'"
      v-model="value"
      type="text"
      :placeholder="field.placeholder ?? undefined"
      :disabled="field.is_readonly"
      class="w-full"
    />

    <!-- textarea -->
    <UTextarea
      v-else-if="field.ui_type === 'textarea'"
      v-model="value"
      :placeholder="field.placeholder ?? undefined"
      :rows="4"
      :disabled="field.is_readonly"
      class="w-full"
    />

    <!-- number -->
    <UInput
      v-else-if="field.ui_type === 'number'"
      v-model="value"
      type="number"
      :placeholder="field.placeholder ?? undefined"
      :disabled="field.is_readonly"
      class="w-full"
    />

    <!-- currency -->
    <UInput
      v-else-if="field.ui_type === 'currency'"
      v-model="value"
      type="number"
      :placeholder="field.placeholder ?? '0.00'"
      :disabled="field.is_readonly"
      class="w-full currency-input"
    >
      <template #trailing>
        <span class="text-dimmed text-sm ml-2">RON</span>
      </template>
    </UInput>

    <!-- email -->
    <UInput
      v-else-if="field.ui_type === 'email'"
      v-model="value"
      type="email"
      :placeholder="field.placeholder ?? 'email@exemplu.ro'"
      :disabled="field.is_readonly"
      class="w-full"
    />

    <!-- phone -->
    <UInput
      v-else-if="field.ui_type === 'phone'"
      v-model="value"
      type="tel"
      :placeholder="field.placeholder ?? '+40 XXX XXX XXX'"
      :disabled="field.is_readonly"
      class="w-full"
    />

    <!-- select -->
    <USelect
      v-else-if="field.ui_type === 'select'"
      v-model="value"
      :items="selectItems"
      :placeholder="field.placeholder ?? `Selecteaza ${field.name.toLowerCase()}`"
      :disabled="field.is_readonly"
      value-key="value"
      class="w-full"
    />

    <!-- checkbox (boolean) -->
    <UCheckbox
      v-else-if="field.ui_type === 'checkbox'"
      v-model="value"
      :label="field.placeholder ?? 'Da'"
      :disabled="field.is_readonly"
      size="lg"
    />

    <!-- datepicker (date-only) — Input text + buton calendar -->
    <div
      v-else-if="field.ui_type === 'datepicker'"
      class="flex items-center gap-1.5 w-full"
    >
      <UInput
        v-model="dateText"
        type="text"
        :placeholder="datePlaceholder"
        :disabled="field.is_readonly"
        class="flex-1"
        @blur="onDateTextBlur"
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
          icon="i-lucide-calendar"
          :disabled="field.is_readonly"
          size="sm"
        />
        <template #content>
          <div class="p-2">
            <UCalendar :model-value="(calendarDate as any)" class="p-2" @update:model-value="calendarDate = $event as DateValue" />
          </div>
        </template>
      </UPopover>
      <UButton
        v-if="calendarDate && !field.is_readonly"
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        size="sm"
        class="shrink-0"
        @click="calendarDate = undefined"
      />
    </div>

    <!-- datetimepicker (timestamp) — Input text + buton calendar -->
    <div
      v-else-if="field.ui_type === 'datetimepicker'"
      class="flex items-center gap-1.5 w-full"
    >
      <UInput
        v-model="dateTimeText"
        type="text"
        :placeholder="dateTimePlaceholder"
        :disabled="field.is_readonly"
        class="flex-1"
        @blur="onDateTimeTextBlur"
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
          icon="i-lucide-calendar-clock"
          :disabled="field.is_readonly"
          size="sm"
        />
        <template #content>
          <div class="p-3 space-y-3">
            <!-- Calendar -->
            <UCalendar :model-value="(calendarDateTime as any)" class="p-2" @update:model-value="calendarDateTime = $event as DateValue" />

            <!-- Time Selection -->
            <div class="flex items-center gap-3 pt-2 border-t border-default">
              <span class="text-sm text-muted">Ora:</span>
              <div class="flex items-center gap-1.5">
                <!-- Hour -->
                <USelect
                  v-model="selectedTime.hour"
                  :items="Array.from({ length: 24 }, (_, i) => ({ label: String(i).padStart(2, '0'), value: i }))"
                  class="w-16"
                  size="sm"
                />
                <span class="text-lg">:</span>
                <!-- Minute -->
                <USelect
                  v-model="selectedTime.minute"
                  :items="Array.from({ length: 60 }, (_, i) => ({ label: String(i).padStart(2, '0'), value: i }))"
                  class="w-16"
                  size="sm"
                />
                <span class="text-lg">:</span>
                <!-- Second -->
                <USelect
                  v-model="selectedTime.second"
                  :items="Array.from({ length: 60 }, (_, i) => ({ label: String(i).padStart(2, '0'), value: i }))"
                  class="w-16"
                  size="sm"
                />
              </div>
            </div>

            <!-- Apply Button -->
            <UButton
              color="primary"
              variant="solid"
              size="sm"
              class="w-full"
              @click="applyDateTime"
            >
              Aplică
            </UButton>
          </div>
        </template>
      </UPopover>
      <UButton
        v-if="calendarDateTime && !field.is_readonly"
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        size="sm"
        class="shrink-0"
        @click="clearDateTime"
      />
    </div>

    <!-- relation -->
    <DynamicRelationSelect
      v-else-if="field.ui_type === 'relation'"
      :field="field"
      :model-value="value"
      :disabled="field.is_readonly"
      @update:model-value="value = $event"
    />

    <!-- fallback -->
    <UInput
      v-else
      v-model="value"
      type="text"
      :placeholder="field.placeholder ?? undefined"
      :disabled="field.is_readonly"
      class="w-full"
    />
  </UFormField>
  </div>
</template>

<style scoped>
.dynamic-field-wrapper {
  background: var(--ui-bg-elevated, hsl(var(--muted) / 0.15));
  border: 1px solid var(--ui-border, hsl(var(--border) / 0.3));
  border-radius: 0.5rem;
  padding: 0.375rem 0.625rem;
  transition: border-color 0.15s;
}

.dynamic-field-wrapper:focus-within {
  border-color: var(--ui-border-accent, hsl(var(--ring)));
}

/* Checkbox: tratament subtire — doar border-bottom */
.dynamic-field-wrapper--checkbox {
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--ui-border, hsl(var(--border) / 0.3));
  border-radius: 0;
  padding: 0.25rem 0;
}

.dynamic-field-wrapper--checkbox:focus-within {
  border-bottom-color: var(--ui-border-accent, hsl(var(--ring)));
}

/* Readonly: fundal estompat */
.dynamic-field-wrapper--readonly {
  background: hsl(var(--muted) / 0.08);
  border-style: dashed;
}

/* Input-uri transparente doar pe readonly — wrapper-ul preia rolul vizual */
.dynamic-field-wrapper--readonly :deep(input),
.dynamic-field-wrapper--readonly :deep(textarea),
.dynamic-field-wrapper--readonly :deep(select),
.dynamic-field-wrapper--readonly :deep(.select-trigger),
.dynamic-field-wrapper--readonly :deep(.menu-trigger) {
  background: transparent !important;
  --ui-bg: transparent;
}

/* Ascunde săgețile native ale input-ului number pentru câmpul currency */
.currency-input :deep(input[type="number"]) {
  -moz-appearance: textfield;
  appearance: textfield;
}

.currency-input :deep(input[type="number"]::-webkit-outer-spin-button),
.currency-input :deep(input[type="number"]::-webkit-inner-spin-button) {
  -webkit-appearance: none;
  margin: 0;
}

/* Împiedică wrapper-ul să dubleze border-ul când conține un input readonly */
.dynamic-field-wrapper--readonly :deep(input:focus-visible),
.dynamic-field-wrapper--readonly :deep(textarea:focus-visible) {
  outline: none;
  box-shadow: none;
}
</style>
