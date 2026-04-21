<script setup lang="ts">
import type { Field } from '~/types/schema'
import { CalendarDate, DateFormatter, parseDate, now, getLocalTimeZone, fromDate } from '@internationalized/date'
import type { DateValue } from '@internationalized/date'

const props = defineProps<{
  field: Field
  modelValue: any
}>()

const emit = defineEmits<{
  'update:modelValue': [value: any]
}>()

const value = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const selectItems = computed(() => {
  if (!props.field.options) return []
  return props.field.options.map(o => ({ label: o.label, value: o.value }))
})

// Placeholder texts
const datePlaceholder = 'Selectează data'
const dateTimePlaceholder = 'Selectează data și ora'

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

// Watch pentru sincronizare date
watch(() => props.modelValue, (newValue) => {
  if (props.field.ui_type !== 'datepicker' || props.field.data_type !== 'date') return
  calendarDate.value = newValue ? parseToCalendarDate(newValue) : undefined
}, { immediate: true })

// Watch pentru emitere date
watch(calendarDate, (newValue) => {
  if (props.field.ui_type !== 'datepicker' || props.field.data_type !== 'date') return
  emit('update:modelValue', newValue ? newValue.toString() : null)
})

// ==================== DATETIME PICKER ====================
const calendarDateTime = ref<DateValue | undefined>(undefined)
const selectedTime = ref<{ hour: number; minute: number }>({ hour: 12, minute: 0 })
const popoverOpen = ref(false)

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

// Watch pentru sincronizare datetime
watch(() => props.modelValue, (newValue) => {
  if (props.field.ui_type !== 'datepicker' || props.field.data_type !== 'timestamp') return
  if (newValue) {
    const parsed = parseToCalendarDateTime(newValue)
    calendarDateTime.value = parsed
    if (parsed && 'hour' in parsed) {
      selectedTime.value = { hour: parsed.hour, minute: parsed.minute }
    }
  } else {
    calendarDateTime.value = undefined
  }
}, { immediate: true })

// Funcție pentru aplicarea datei și timpului
const applyDateTime = () => {
  if (!calendarDateTime.value) {
    emit('update:modelValue', null)
    popoverOpen.value = false
    return
  }
  // Extragem data - calendarDateTime poate fi CalendarDate sau CalendarDateTime
  const date = calendarDateTime.value as CalendarDate
  const year = date.year
  const month = String(date.month).padStart(2, '0')
  const day = String(date.day).padStart(2, '0')
  const hour = String(selectedTime.value.hour).padStart(2, '0')
  const minute = String(selectedTime.value.minute).padStart(2, '0')
  const second = '00'

  // Construim ISO string cu offset de timezone local
  // Format: YYYY-MM-DDTHH:mm:ss+HH:mm (cu offset local, nu UTC)
  const now = new Date()
  const offset = -now.getTimezoneOffset()  // în minute, inversat pentru semn corect
  const offsetHours = Math.abs(Math.floor(offset / 60))
  const offsetMinutes = Math.abs(offset % 60)
  const offsetSign = offset >= 0 ? '+' : '-'
  const offsetString = `${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMinutes).padStart(2, '0')}`

  const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}${offsetString}`
  emit('update:modelValue', isoString)
  popoverOpen.value = false
}

// Format pentru afișare date
const displayDate = computed(() => {
  return formatDate(calendarDate.value as DateValue | undefined, datePlaceholder)
})

// Format pentru afișare datetime
const displayDateTime = computed(() => {
  return formatDateTime(calendarDateTime.value as DateValue | undefined, selectedTime.value, dateTimePlaceholder)
})
</script>

<template>
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
      class="w-full"
    />

    <!-- textarea -->
    <UTextarea
      v-else-if="field.ui_type === 'textarea'"
      v-model="value"
      :placeholder="field.placeholder ?? undefined"
      :rows="4"
      class="w-full"
    />

    <!-- number -->
    <UInput
      v-else-if="field.ui_type === 'number'"
      v-model="value"
      type="number"
      :placeholder="field.placeholder ?? undefined"
      class="w-full"
    />

    <!-- currency -->
    <UInput
      v-else-if="field.ui_type === 'currency'"
      v-model="value"
      type="number"
      :placeholder="field.placeholder ?? '0.00'"
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
      class="w-full"
    />

    <!-- phone -->
    <UInput
      v-else-if="field.ui_type === 'phone'"
      v-model="value"
      type="tel"
      :placeholder="field.placeholder ?? '+40 XXX XXX XXX'"
      class="w-full"
    />

    <!-- select -->
    <USelect
      v-else-if="field.ui_type === 'select'"
      v-model="value"
      :items="selectItems"
      :placeholder="field.placeholder ?? `Selecteaza ${field.name.toLowerCase()}`"
      value-key="value"
      class="w-full"
    />

    <!-- multi-select -->
    <USelectMenu
      v-else-if="field.ui_type === 'multi-select'"
      v-model="value"
      multiple
      :items="selectItems"
      value-key="value"
      :placeholder="field.placeholder ?? `Selecteaza ${field.name.toLowerCase()}`"
      class="w-full"
    />

    <!-- checkbox (boolean) -->
    <USwitch
      v-else-if="field.ui_type === 'checkbox'"
      v-model="value"
    />

    <!-- radio -->
    <URadioGroup
      v-else-if="field.ui_type === 'radio'"
      v-model="value"
      :items="selectItems"
      orientation="horizontal"
    />

    <!-- datepicker (date) - Popover + Calendar -->
    <div
      v-else-if="field.ui_type === 'datepicker' && field.data_type === 'date'"
      class="flex items-center gap-2 w-full"
    >
      <UPopover
        v-model:open="popoverOpen"
        :content="{ align: 'start' }"
        :modal="true"
        :ui="{ content: 'max-h-(--reka-popover-content-available-height,100vh) max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain' }"
        class="flex-1"
      >
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-calendar"
          class="w-full justify-between"
          trailing-icon="i-lucide-chevron-down"
        >
          <span class="truncate">{{ displayDate }}</span>
        </UButton>

        <template #content>
          <div class="p-2">
            <UCalendar :model-value="(calendarDate as any)" @update:model-value="calendarDate = $event as DateValue" class="p-2" />
          </div>
        </template>
      </UPopover>

      <!-- Clear button -->
      <UButton
        v-if="calendarDate"
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        size="sm"
        class="shrink-0"
        @click="calendarDate = undefined"
      />
    </div>

    <!-- datepicker (timestamp) - Popover + Calendar + Time -->
    <div
      v-else-if="field.ui_type === 'datepicker' && field.data_type === 'timestamp'"
      class="flex items-center gap-2 w-full"
    >
      <UPopover
        v-model:open="popoverOpen"
        :content="{ align: 'start' }"
        :modal="true"
        :ui="{ content: 'max-h-(--reka-popover-content-available-height,100vh) max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain' }"
        class="flex-1"
      >
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-calendar-clock"
          class="w-full justify-between"
          trailing-icon="i-lucide-chevron-down"
        >
          <span class="truncate">{{ displayDateTime }}</span>
        </UButton>

        <template #content>
          <div class="p-3 space-y-3">
            <!-- Calendar -->
            <UCalendar :model-value="(calendarDateTime as any)" @update:model-value="calendarDateTime = $event as DateValue" class="p-2" />

            <!-- Time Selection -->
            <div class="flex items-center gap-3 pt-2 border-t border-default">
              <span class="text-sm text-muted">Ora:</span>
              <div class="flex items-center gap-2">
                <!-- Hour -->
                <USelect
                  v-model="selectedTime.hour"
                  :items="Array.from({ length: 24 }, (_, i) => ({ label: String(i).padStart(2, '0'), value: i }))"
                  class="w-20"
                  size="sm"
                />
                <span class="text-lg">:</span>
                <!-- Minute -->
                <USelect
                  v-model="selectedTime.minute"
                  :items="Array.from({ length: 60 }, (_, i) => ({ label: String(i).padStart(2, '0'), value: i }))"
                  class="w-20"
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

      <!-- Clear button -->
      <UButton
        v-if="calendarDateTime"
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        size="sm"
        class="shrink-0"
        @click="calendarDateTime = undefined"
      />
    </div>

    <!-- relation -->
    <DynamicRelationSelect
      v-else-if="field.ui_type === 'relation'"
      :field="field"
      :model-value="value"
      @update:model-value="value = $event"
    />

    <!-- fallback -->
    <UInput
      v-else
      v-model="value"
      type="text"
      :placeholder="field.placeholder ?? undefined"
      class="w-full"
    />
  </UFormField>
</template>

<style scoped>
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
</style>
