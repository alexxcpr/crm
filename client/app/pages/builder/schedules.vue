<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { Temporal } from 'temporal-polyfill'
import type {
  WorkflowSchedule,
  WorkflowScheduleExecution,
  WorkflowSchedulePayload
} from '~/composables/useWorkflowSchedules'
import {
  buildWorkflowScheduleCron,
  detectWorkflowSchedulePreset,
  validateWorkflowScheduleDraft,
  workflowScheduleActionAvailability,
  type WorkflowSchedulePreset
} from '~/utils/workflowSchedule'

definePageMeta({ middleware: ['capability'], requiredCapability: 'builder.manage' })

const toast = useToast()
const {
  schedules,
  loading,
  error,
  fetchSchedules,
  createSchedule,
  updateSchedule,
  removeSchedule,
  setActive,
  runNow,
  preview,
  fetchExecutions
} = useWorkflowSchedules()
const { workflows, fetchWorkflows } = useAdminWorkflows()
const { branding, fetchBranding } = useTenantBranding()

await Promise.all([
  fetchSchedules(),
  fetchWorkflows(),
  fetchBranding()
])

const workflowOptions = computed(() =>
  workflows.value
    .filter(workflow => workflow.status === 'active' && workflow.isValid)
    .map(workflow => ({ label: workflow.name, value: workflow.id_workflow }))
)
const timezoneOptions = (typeof Intl.supportedValuesOf === 'function'
  ? Intl.supportedValuesOf('timeZone')
  : ['Europe/Bucharest', 'Europe/London', 'UTC'])
  .map(value => ({ label: value, value }))
const presetOptions = [
  { label: 'La fiecare N minute', value: 'minutes' },
  { label: 'La fiecare N ore', value: 'hours' },
  { label: 'Zilnic', value: 'daily' },
  { label: 'Saptamanal', value: 'weekly' },
  { label: 'Lunar', value: 'monthly' },
  { label: 'Cron avansat', value: 'custom' },
  { label: 'O singura data', value: 'once' }
]
const weekdayOptions = [
  { label: 'L', value: 1 },
  { label: 'Ma', value: 2 },
  { label: 'Mi', value: 3 },
  { label: 'J', value: 4 },
  { label: 'V', value: 5 },
  { label: 'S', value: 6 },
  { label: 'D', value: 0 }
]

const showForm = ref(false)
const editing = ref<WorkflowSchedule | null>(null)
const formName = ref('')
const formWorkflowId = ref('')
const formPreset = ref<WorkflowSchedulePreset>('daily')
const formTimezone = ref(branding.value.timezone)
const formActive = ref(true)
const formMinutes = ref(15)
const formHours = ref(1)
const formTime = ref('09:00')
const formWeekdays = ref<number[]>([1])
const formMonthDay = ref(1)
const formCustomCron = ref('0 9 * * 1-5')
const formRunAt = ref('')
const previewLoading = ref(false)
const previewError = ref('')
const previewOccurrences = ref<Array<{ utc: string, local: string }>>([])

const cronExpression = computed(() => buildWorkflowScheduleCron({
  preset: formPreset.value,
  minutes: formMinutes.value,
  hours: formHours.value,
  time: formTime.value,
  weekdays: formWeekdays.value,
  monthDay: formMonthDay.value,
  customCron: formCustomCron.value
}))

const refreshPreview = useDebounceFn(async () => {
  previewOccurrences.value = []
  previewError.value = ''
  if (formPreset.value === 'once') return
  if (!cronExpression.value || !formTimezone.value) return
  previewLoading.value = true
  try {
    const result = await preview(cronExpression.value, formTimezone.value)
    previewOccurrences.value = result.occurrences
  } catch (err: any) {
    previewError.value = err?.data?.message || err?.message || 'Expresia cron nu este valida.'
  } finally {
    previewLoading.value = false
  }
}, 300)

watch(
  [cronExpression, formTimezone, formPreset],
  () => refreshPreview(),
  { immediate: true }
)

function resetForm() {
  editing.value = null
  formName.value = ''
  formWorkflowId.value = workflowOptions.value[0]?.value ?? ''
  formPreset.value = 'daily'
  formTimezone.value = branding.value.timezone
  formActive.value = true
  formMinutes.value = 15
  formHours.value = 1
  formTime.value = '09:00'
  formWeekdays.value = [1]
  formMonthDay.value = 1
  formCustomCron.value = '0 9 * * 1-5'
  formRunAt.value = ''
  previewError.value = ''
  previewOccurrences.value = []
}

function openCreate() {
  resetForm()
  showForm.value = true
}

function timeParts(expression: string) {
  const [minute, hour] = expression.split(' ')
  return `${String(Number(hour)).padStart(2, '0')}:${String(Number(minute)).padStart(2, '0')}`
}

function openEdit(schedule: WorkflowSchedule) {
  editing.value = schedule
  formName.value = schedule.name
  formWorkflowId.value = schedule.id_workflow
  formTimezone.value = schedule.timezone
  formActive.value = schedule.is_active
  formPreset.value = detectWorkflowSchedulePreset(schedule)
  const expression = schedule.cron_expression ?? ''
  if (formPreset.value === 'minutes') formMinutes.value = Number(expression.match(/^\*\/(\d+)/)?.[1] ?? 15)
  if (formPreset.value === 'hours') formHours.value = Number(expression.match(/^0 \*\/(\d+)/)?.[1] ?? 1)
  if (['daily', 'weekly', 'monthly'].includes(formPreset.value)) formTime.value = timeParts(expression)
  if (formPreset.value === 'weekly') {
    formWeekdays.value = (expression.split(' ')[4] ?? '1').split(',').map(Number)
  }
  if (formPreset.value === 'monthly') formMonthDay.value = Number(expression.split(' ')[2] ?? 1)
  if (formPreset.value === 'custom') formCustomCron.value = expression
  if (schedule.run_at) {
    formRunAt.value = Temporal.Instant.from(schedule.run_at)
      .toZonedDateTimeISO(schedule.timezone)
      .toPlainDateTime()
      .toString({ smallestUnit: 'minute' })
  }
  showForm.value = true
}

function onceInstant() {
  if (!formRunAt.value) return undefined
  return Temporal.ZonedDateTime.from(
    `${formRunAt.value}:00[${formTimezone.value}]`
  ).toInstant().toString()
}

async function submit() {
  const validationError = validateWorkflowScheduleDraft({
    name: formName.value,
    workflowId: formWorkflowId.value,
    timezone: formTimezone.value,
    preset: formPreset.value,
    runAt: formRunAt.value,
    previewError: previewError.value
  })
  if (validationError) {
    toast.add({ title: validationError, color: 'error' })
    return
  }
  let runAt: string | undefined
  try {
    runAt = formPreset.value === 'once' ? onceInstant() : undefined
  } catch {
    toast.add({ title: 'Data sau timezone invalid', color: 'error' })
    return
  }
  const payload: WorkflowSchedulePayload = {
    name: formName.value.trim(),
    workflowId: formWorkflowId.value,
    scheduleType: formPreset.value === 'once' ? 'once' : 'cron',
    cronExpression: formPreset.value === 'once' ? undefined : cronExpression.value,
    runAt,
    timezone: formTimezone.value,
    isActive: formActive.value
  }
  const result = editing.value
    ? await updateSchedule(editing.value.id_schedule, payload)
    : await createSchedule(payload)
  if (result) {
    toast.add({
      title: editing.value ? 'Programare actualizata' : 'Programare creata',
      color: 'success'
    })
    showForm.value = false
  } else {
    toast.add({ title: 'Programarea nu a fost salvata', description: error.value ?? '', color: 'error' })
  }
}

const runningId = ref('')
async function executeNow(schedule: WorkflowSchedule) {
  runningId.value = schedule.id_schedule
  const result = await runNow(schedule.id_schedule)
  runningId.value = ''
  toast.add({
    title: result ? 'Workflow executat' : 'Executia a esuat',
    description: result ? `Executie ${result.executionId}` : error.value ?? '',
    color: result ? 'success' : 'error'
  })
}

async function toggle(schedule: WorkflowSchedule) {
  const result = await setActive(schedule.id_schedule, !schedule.is_active)
  toast.add({
    title: result
      ? schedule.is_active ? 'Programare pusa in pauza' : 'Programare activata'
      : 'Statusul nu a fost schimbat',
    description: result ? undefined : error.value ?? '',
    color: result ? 'success' : 'error'
  })
}

const showDelete = ref(false)
const deleting = ref<WorkflowSchedule | null>(null)
function confirmDelete(schedule: WorkflowSchedule) {
  deleting.value = schedule
  showDelete.value = true
}
async function performDelete() {
  if (!deleting.value) return
  const success = await removeSchedule(deleting.value.id_schedule)
  toast.add({
    title: success ? 'Programare stearsa' : 'Programarea nu a fost stearsa',
    description: success ? undefined : error.value ?? '',
    color: success ? 'success' : 'error'
  })
  showDelete.value = false
  deleting.value = null
}

const showHistory = ref(false)
const historySchedule = ref<WorkflowSchedule | null>(null)
const history = ref<WorkflowScheduleExecution[]>([])
const historyLoading = ref(false)
const historyPage = ref(1)
const historyMeta = ref({ total: 0, page: 1, limit: 10, totalPages: 0 })
async function loadHistory(page = 1) {
  if (!historySchedule.value) return
  historyLoading.value = true
  try {
    const result = await fetchExecutions(historySchedule.value.id_schedule, page, 10)
    history.value = result.data
    historyMeta.value = result.meta
    historyPage.value = page
  } finally {
    historyLoading.value = false
  }
}
async function openHistory(schedule: WorkflowSchedule) {
  historySchedule.value = schedule
  showHistory.value = true
  await loadHistory()
}

function formatDate(value?: string | null, timezone?: string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('ro-RO', {
    timeZone: timezone,
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

const statusLabels: Record<string, string> = {
  active: 'Activa',
  paused: 'Pauza',
  completed: 'Finalizata',
  running: 'In curs',
  failed: 'Esuata',
  skipped: 'Omisa'
}
const statusColors: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'info'> = {
  active: 'success',
  paused: 'neutral',
  completed: 'info',
  running: 'info',
  failed: 'error',
  skipped: 'warning'
}

const columns: TableColumn<WorkflowSchedule>[] = [
  { accessorKey: 'name', header: 'Nume' },
  { accessorKey: 'workflow_name', header: 'Workflow' },
  { accessorKey: 'description', header: 'Frecventa' },
  { accessorKey: 'timezone', header: 'Timezone' },
  { accessorKey: 'schedule_status', header: 'Status' },
  { accessorKey: 'last_execution', header: 'Ultima rulare' },
  { accessorKey: 'next_run_at', header: 'Urmatoarea rulare' },
  { id: 'actions', header: '' }
]

function actions(schedule: WorkflowSchedule) {
  const availability = workflowScheduleActionAvailability(schedule)
  return [[{
    label: 'Editeaza',
    icon: 'i-lucide-pencil',
    disabled: !availability.canEdit,
    onClick: () => openEdit(schedule)
  }, {
    label: 'Ruleaza acum',
    icon: 'i-lucide-play',
    disabled: !availability.canRunNow || runningId.value === schedule.id_schedule,
    onClick: () => executeNow(schedule)
  }, {
    label: 'Istoric',
    icon: 'i-lucide-history',
    onClick: () => openHistory(schedule)
  }, {
    label: schedule.is_active ? 'Pune in pauza' : 'Activeaza',
    icon: schedule.is_active ? 'i-lucide-pause' : 'i-lucide-circle-play',
    disabled: !availability.canToggle,
    onClick: () => toggle(schedule)
  }], [{
    label: 'Sterge',
    icon: 'i-lucide-trash-2',
    color: 'error' as const,
    disabled: !availability.canDelete,
    onClick: () => confirmDelete(schedule)
  }]]
}
</script>

<template>
  <div>
    <div class="mb-4 flex items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-semibold">
          Programari
        </h2>
        <p class="text-sm text-muted">
          Ruleaza workflow-uri automat, in fusul orar ales.
        </p>
      </div>
      <UButton label="Programare noua" icon="i-lucide-plus" @click="openCreate" />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Eroare"
      :description="error"
      class="mb-4"
    />

    <UTable :data="schedules" :columns="columns" :loading="loading">
      <template #name-cell="{ row }">
        <button type="button" class="font-medium text-primary hover:underline" @click="openEdit(row.original)">
          {{ row.original.name }}
        </button>
      </template>
      <template #description-cell="{ row }">
        <div>
          <p class="text-sm">
            {{ row.original.description }}
          </p>
          <code v-if="row.original.cron_expression" class="text-xs text-muted">{{ row.original.cron_expression }}</code>
        </div>
      </template>
      <template #schedule_status-cell="{ row }">
        <div class="flex items-center gap-2">
          <UBadge
            :label="row.original.is_running ? 'In curs' : statusLabels[row.original.schedule_status]"
            :color="row.original.is_running ? 'info' : statusColors[row.original.schedule_status]"
            variant="subtle"
          />
        </div>
      </template>
      <template #last_execution-cell="{ row }">
        <div v-if="row.original.last_execution" class="space-y-1">
          <UBadge
            :label="statusLabels[row.original.last_execution.status] ?? row.original.last_execution.status"
            :color="statusColors[row.original.last_execution.status] ?? 'neutral'"
            variant="subtle"
            size="xs"
          />
          <p class="text-xs text-muted">
            {{ formatDate(row.original.last_execution.date_started, row.original.timezone) }}
          </p>
        </div>
        <span v-else class="text-muted">—</span>
      </template>
      <template #next_run_at-cell="{ row }">
        <span class="text-sm">{{ formatDate(row.original.next_run_at, row.original.timezone) }}</span>
      </template>
      <template #actions-cell="{ row }">
        <UDropdownMenu :items="actions(row.original)">
          <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" />
        </UDropdownMenu>
      </template>
    </UTable>

    <UEmpty
      v-if="!loading && !schedules.length"
      icon="i-lucide-clock-3"
      title="Nicio programare"
      description="Programeaza un workflow activ pentru prima executie automata."
      class="py-12"
    >
      <template #actions>
        <UButton label="Programare noua" icon="i-lucide-plus" @click="openCreate" />
      </template>
    </UEmpty>

    <UModal
      v-model:open="showForm"
      :title="editing ? 'Editeaza programarea' : 'Programare noua'"
      :ui="{ content: 'sm:max-w-3xl' }"
    >
      <template #body>
        <div class="space-y-5">
          <div class="grid gap-4 md:grid-cols-2">
            <UFormField label="Nume" required>
              <UInput v-model="formName" maxlength="200" class="w-full" placeholder="Ex: Sincronizare clienti" />
            </UFormField>
            <UFormField label="Workflow" required>
              <USelect
                v-model="formWorkflowId"
                :items="workflowOptions"
                value-key="value"
                placeholder="Alege un workflow activ"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Tip programare" required>
              <USelect v-model="formPreset" :items="presetOptions" value-key="value" class="w-full" />
            </UFormField>
            <UFormField label="Timezone" required>
              <USelectMenu
                v-model="formTimezone"
                :items="timezoneOptions"
                value-key="value"
                class="w-full"
              />
            </UFormField>
          </div>

          <div v-if="formPreset === 'minutes'" class="max-w-xs">
            <UFormField label="Interval in minute" description="Intre 1 si 59 de minute.">
              <UInput v-model.number="formMinutes" type="number" :min="1" :max="59" class="w-full" />
            </UFormField>
          </div>
          <div v-else-if="formPreset === 'hours'" class="max-w-xs">
            <UFormField label="Interval in ore" description="Intre 1 si 23 de ore, la minutul 00.">
              <UInput v-model.number="formHours" type="number" :min="1" :max="23" class="w-full" />
            </UFormField>
          </div>
          <div v-else-if="formPreset === 'daily'" class="max-w-xs">
            <UFormField label="Ora">
              <UInput v-model="formTime" type="time" class="w-full" />
            </UFormField>
          </div>
          <div v-else-if="formPreset === 'weekly'" class="space-y-3">
            <UFormField label="Zile">
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-for="day in weekdayOptions"
                  :key="day.value"
                  :label="day.label"
                  size="xs"
                  :variant="formWeekdays.includes(day.value) ? 'solid' : 'outline'"
                  :color="formWeekdays.includes(day.value) ? 'primary' : 'neutral'"
                  @click="formWeekdays = formWeekdays.includes(day.value)
                    ? formWeekdays.filter(value => value !== day.value)
                    : [...formWeekdays, day.value]"
                />
              </div>
            </UFormField>
            <UFormField label="Ora" class="max-w-xs">
              <UInput v-model="formTime" type="time" class="w-full" />
            </UFormField>
          </div>
          <div v-else-if="formPreset === 'monthly'" class="grid gap-4 md:grid-cols-2">
            <UFormField label="Ziua lunii" description="1–28, pentru a exista in fiecare luna.">
              <UInput v-model.number="formMonthDay" type="number" :min="1" :max="28" class="w-full" />
            </UFormField>
            <UFormField label="Ora">
              <UInput v-model="formTime" type="time" class="w-full" />
            </UFormField>
          </div>
          <UFormField
            v-else-if="formPreset === 'custom'"
            label="Expresie cron"
            description="5 campuri: minut, ora, ziua lunii, luna, ziua saptamanii. Secundele nu sunt acceptate."
          >
            <UInput v-model="formCustomCron" class="w-full font-mono" placeholder="0 9 * * 1-5" />
          </UFormField>
          <UFormField v-else label="Data si ora locala" required>
            <UInput v-model="formRunAt" type="datetime-local" class="w-full" />
          </UFormField>

          <UPageCard
            v-if="formPreset !== 'once'"
            title="Urmatoarele rulari"
            :description="`Cron: ${cronExpression}`"
            variant="subtle"
          >
            <div v-if="previewLoading" class="space-y-2">
              <USkeleton v-for="index in 3" :key="index" class="h-5" />
            </div>
            <UAlert v-else-if="previewError" color="error" variant="subtle" :description="previewError" />
            <ol v-else class="grid gap-2 text-sm md:grid-cols-2">
              <li v-for="occurrence in previewOccurrences" :key="occurrence.utc" class="rounded-md border border-default px-3 py-2">
                {{ occurrence.local }}
              </li>
            </ol>
          </UPageCard>

          <div class="flex items-center justify-between gap-4 border-t border-default pt-4">
            <UFormField label="Activa">
              <USwitch v-model="formActive" />
            </UFormField>
            <div class="flex gap-2">
              <UButton label="Anuleaza" color="neutral" variant="outline" @click="showForm = false" />
              <UButton
                :label="editing ? 'Salveaza' : 'Creeaza'"
                icon="i-lucide-check"
                :loading="loading"
                @click="submit"
              />
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="showHistory" :title="`Istoric: ${historySchedule?.name ?? ''}`" :ui="{ content: 'sm:max-w-4xl' }">
      <template #body>
        <div class="space-y-4">
          <UTable
            :loading="historyLoading"
            :data="history"
            :columns="[
              { accessorKey: 'status', header: 'Status' },
              { accessorKey: 'scheduled_for', header: 'Scadenta' },
              { accessorKey: 'date_started', header: 'Pornire' },
              { accessorKey: 'duration_ms', header: 'Durata' },
              { accessorKey: 'error_message', header: 'Detalii' }
            ]"
          >
            <template #status-cell="{ row }">
              <UBadge
                :label="statusLabels[row.original.status] ?? row.original.status"
                :color="statusColors[row.original.status] ?? 'neutral'"
                variant="subtle"
              />
            </template>
            <template #scheduled_for-cell="{ row }">
              {{ formatDate(row.original.scheduled_for, historySchedule?.timezone) }}
            </template>
            <template #date_started-cell="{ row }">
              {{ formatDate(row.original.date_started, historySchedule?.timezone) }}
            </template>
            <template #duration_ms-cell="{ row }">
              {{ row.original.duration_ms == null ? '—' : `${row.original.duration_ms} ms` }}
            </template>
            <template #error_message-cell="{ row }">
              <span class="line-clamp-2 text-xs text-muted">{{ row.original.error_message || '—' }}</span>
            </template>
          </UTable>
          <div v-if="historyMeta.totalPages > 1" class="flex justify-end">
            <UPagination
              v-model:page="historyPage"
              :total="historyMeta.total"
              :items-per-page="historyMeta.limit"
              @update:page="loadHistory"
            />
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="showDelete" title="Sterge programarea">
      <template #body>
        <p>
          Stergi programarea <strong>{{ deleting?.name }}</strong>? Istoricul workflow-ului va ramane disponibil.
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <UButton label="Anuleaza" color="neutral" variant="outline" @click="showDelete = false" />
          <UButton label="Sterge" color="error" icon="i-lucide-trash-2" :loading="loading" @click="performDelete" />
        </div>
      </template>
    </UModal>
  </div>
</template>
