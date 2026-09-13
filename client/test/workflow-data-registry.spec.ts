import assert from 'node:assert/strict'
import test from 'node:test'
import { isTransparentDataContextNodeType } from '../app/composables/useWorkflowDataRegistry.ts'

test('pastreaza sursa de date prin nodurile logice transparente', () => {
  assert.equal(isTransparentDataContextNodeType('validate'), true)
  assert.equal(isTransparentDataContextNodeType('condition'), true)
  assert.equal(isTransparentDataContextNodeType('app_update_record'), true)
  assert.equal(isTransparentDataContextNodeType('set_data'), false)
})
