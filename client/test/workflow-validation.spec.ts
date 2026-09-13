import assert from 'node:assert/strict'
import test from 'node:test'
import { formatWorkflowValidationErrors } from '../app/utils/workflowValidation.ts'

test('formateaza erorile cu numele nodului si fallback la nodeId', () => {
  const result = formatWorkflowValidationErrors(
    [
      {
        code: 'relation_field_not_found',
        message: 'Campul relatie configurat nu exista.',
        nodeId: 'read-product'
      },
      {
        code: 'source_field_not_found',
        message: 'Campul sursa nu exista.',
        nodeId: 'missing-node'
      },
      {
        code: 'invalid_start_count',
        message: 'Workflow-ul trebuie sa aiba exact un nod START.'
      }
    ],
    [{ id: 'read-product', name: 'Citeste product' }]
  )

  assert.deepEqual(result, [
    'Citeste product: Campul relatie configurat nu exista.',
    'missing-node: Campul sursa nu exista.',
    'Workflow-ul trebuie sa aiba exact un nod START.'
  ])
})

test('elimina doar duplicatele exacte ale aceluiasi nod', () => {
  const issue = {
    code: 'relation_field_not_found',
    message: 'Campul relatie configurat nu exista.',
    nodeId: 'read-product'
  }
  const result = formatWorkflowValidationErrors(
    [
      issue,
      { ...issue },
      { ...issue, nodeId: 'read-product-type' }
    ],
    [
      { id: 'read-product', label: 'Citeste product' },
      { id: 'read-product-type', name: 'Citeste product_type' }
    ]
  )

  assert.deepEqual(result, [
    'Citeste product: Campul relatie configurat nu exista.',
    'Citeste product_type: Campul relatie configurat nu exista.'
  ])
})
