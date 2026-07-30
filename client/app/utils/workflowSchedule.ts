import type { WorkflowSchedule } from '~/composables/useWorkflowSchedules'

export type WorkflowSchedulePreset =
  | 'minutes'
  | 'hours'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'custom'
  | 'once'

interface CronPresetInput {
  preset: WorkflowSchedulePreset
  minutes: number
  hours: number
  time: string
  weekdays: number[]
  monthDay: number
  customCron: string
}

interface ScheduleDraftInput {
  name: string
  workflowId: string
  timezone: string
  preset: WorkflowSchedulePreset
  runAt: string
  previewError: string
}

export function buildWorkflowScheduleCron(input: CronPresetInput) {
  const [hour, minute] = input.time.split(':').map(Number)
  if (input.preset === 'minutes') {
    return `*/${Math.min(59, Math.max(1, Number(input.minutes) || 1))} * * * *`
  }
  if (input.preset === 'hours') {
    return `0 */${Math.min(23, Math.max(1, Number(input.hours) || 1))} * * *`
  }
  if (input.preset === 'daily') {
    return `${minute || 0} ${hour || 0} * * *`
  }
  if (input.preset === 'weekly') {
    const weekdays = input.weekdays.length
      ? [...input.weekdays].sort().join(',')
      : '1'
    return `${minute || 0} ${hour || 0} * * ${weekdays}`
  }
  if (input.preset === 'monthly') {
    const day = Math.min(28, Math.max(1, Number(input.monthDay) || 1))
    return `${minute || 0} ${hour || 0} ${day} * *`
  }
  return input.customCron.trim()
}

export function detectWorkflowSchedulePreset(
  schedule: Pick<WorkflowSchedule, 'schedule_type' | 'cron_expression'>
): WorkflowSchedulePreset {
  if (schedule.schedule_type === 'once') return 'once'
  const expression = schedule.cron_expression ?? ''
  if (/^\*\/\d+ \* \* \* \*$/.test(expression)) return 'minutes'
  if (/^0 \*\/\d+ \* \* \*$/.test(expression)) return 'hours'
  if (/^\d+ \d+ \* \* \*$/.test(expression)) return 'daily'
  if (/^\d+ \d+ \* \* [\d,]+$/.test(expression)) return 'weekly'
  if (/^\d+ \d+ \d+ \* \*$/.test(expression)) return 'monthly'
  return 'custom'
}

export function validateWorkflowScheduleDraft(input: ScheduleDraftInput) {
  if (!input.name.trim() || !input.workflowId || !input.timezone) {
    return 'Completeaza campurile obligatorii'
  }
  if (input.preset === 'once' && !input.runAt) {
    return 'Alege data si ora rularii'
  }
  if (input.preset !== 'once' && input.previewError) {
    return input.previewError
  }
  return null
}

export function workflowScheduleActionAvailability(
  schedule: Pick<WorkflowSchedule, 'schedule_status' | 'is_running'>
) {
  const completed = schedule.schedule_status === 'completed'
  return {
    canEdit: !completed,
    canRunNow: !schedule.is_running,
    canToggle: !completed,
    canDelete: !schedule.is_running
  }
}
