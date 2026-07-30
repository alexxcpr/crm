import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildWorkflowScheduleCron,
  detectWorkflowSchedulePreset,
  validateWorkflowScheduleDraft,
  workflowScheduleActionAvailability
} from '../app/utils/workflowSchedule.ts'

const presetInput = {
  minutes: 15,
  hours: 2,
  time: '09:30',
  weekdays: [5, 1, 3],
  monthDay: 12,
  customCron: ' 0 7 * * 1-5 '
}

test('construieste cron pentru toate preseturile recurente', () => {
  assert.equal(
    buildWorkflowScheduleCron({ ...presetInput, preset: 'minutes' }),
    '*/15 * * * *'
  )
  assert.equal(
    buildWorkflowScheduleCron({ ...presetInput, preset: 'hours' }),
    '0 */2 * * *'
  )
  assert.equal(
    buildWorkflowScheduleCron({ ...presetInput, preset: 'daily' }),
    '30 9 * * *'
  )
  assert.equal(
    buildWorkflowScheduleCron({ ...presetInput, preset: 'weekly' }),
    '30 9 * * 1,3,5'
  )
  assert.equal(
    buildWorkflowScheduleCron({ ...presetInput, preset: 'monthly' }),
    '30 9 12 * *'
  )
  assert.equal(
    buildWorkflowScheduleCron({ ...presetInput, preset: 'custom' }),
    '0 7 * * 1-5'
  )
})

test('limiteaza intervalele presetate la valori valide', () => {
  assert.equal(
    buildWorkflowScheduleCron({
      ...presetInput,
      preset: 'minutes',
      minutes: 0
    }),
    '*/1 * * * *'
  )
  assert.equal(
    buildWorkflowScheduleCron({
      ...presetInput,
      preset: 'monthly',
      monthDay: 31
    }),
    '30 9 28 * *'
  )
})

test('detecteaza presetul unei programari existente', () => {
  assert.equal(
    detectWorkflowSchedulePreset({
      schedule_type: 'cron',
      cron_expression: '0 9 * * 1,3,5'
    }),
    'weekly'
  )
  assert.equal(
    detectWorkflowSchedulePreset({
      schedule_type: 'once',
      cron_expression: null
    }),
    'once'
  )
})

test('valideaza campurile, rularea unica si eroarea de preview', () => {
  const valid = {
    name: 'Raport',
    workflowId: 'workflow-id',
    timezone: 'Europe/Bucharest',
    preset: 'daily' as const,
    runAt: '',
    previewError: ''
  }
  assert.equal(validateWorkflowScheduleDraft(valid), null)
  assert.equal(
    validateWorkflowScheduleDraft({ ...valid, name: ' ' }),
    'Completeaza campurile obligatorii'
  )
  assert.equal(
    validateWorkflowScheduleDraft({ ...valid, preset: 'once' }),
    'Alege data si ora rularii'
  )
  assert.equal(
    validateWorkflowScheduleDraft({
      ...valid,
      previewError: 'Cron invalid'
    }),
    'Cron invalid'
  )
})

test('statusurile dezactiveaza actiunile incompatibile', () => {
  assert.deepEqual(
    workflowScheduleActionAvailability({
      schedule_status: 'completed',
      is_running: false
    }),
    {
      canEdit: false,
      canRunNow: true,
      canToggle: false,
      canDelete: true
    }
  )
  assert.deepEqual(
    workflowScheduleActionAvailability({
      schedule_status: 'active',
      is_running: true
    }),
    {
      canEdit: true,
      canRunNow: false,
      canToggle: true,
      canDelete: false
    }
  )
})
