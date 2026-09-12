import assert from 'node:assert/strict'
import test from 'node:test'
import {
  renderSequencePreview,
  suggestSequenceKey,
  validateSequenceConfiguration,
  type SequenceConfiguration
} from '../app/utils/sequenceManifest.ts'

const validConfiguration: SequenceConfiguration = {
  key: 'store_configuration',
  scope: 'entity',
  reset: 'none',
  format: '{prefix}{number}',
  prefix: 'CFG-',
  padding: 8,
  start_value: 1
}

function fieldsFor(configuration: SequenceConfiguration) {
  return validateSequenceConfiguration(configuration).map(issue => issue.field)
}

test('genereaza preview cu toate tokenurile folosind data locala primita', () => {
  const date = new Date(2026, 8, 7, 12)
  assert.equal(
    renderSequencePreview({
      ...validConfiguration,
      format: '{prefix}{year}-{month}-{day}-{number}',
      padding: 4,
      start_value: 23
    }, date),
    'CFG-2026-09-07-0023'
  )
})

test('aplica paddingul fara sa scurteze numerele mai lungi', () => {
  assert.equal(renderSequencePreview(validConfiguration), 'CFG-00000001')
  assert.equal(
    renderSequencePreview({ ...validConfiguration, padding: 2, start_value: 123 }),
    'CFG-123'
  )
})

test('propune cheia din slugurile entitatii si campului', () => {
  assert.equal(suggestSequenceKey('product_configurations', 'configuration_code'), 'product_configurations_configuration_code')
  assert.equal(suggestSequenceKey(null, 'configuration_code'), 'configuration_code')
  assert.equal(suggestSequenceKey('a'.repeat(40), 'b'.repeat(40)).length, 51)
})

test('accepta o configuratie completa valida', () => {
  assert.deepEqual(validateSequenceConfiguration(validConfiguration), [])
  assert.deepEqual(validateSequenceConfiguration({
    ...validConfiguration,
    reset: 'yearly',
    format: '{year}-{number}'
  }), [])
})

test('respinge cheile invalide', () => {
  for (const key of ['', 'a', '1_sequence', 'Store', `a${'b'.repeat(51)}`]) {
    assert.ok(fieldsFor({ ...validConfiguration, key }).includes('key'), key)
  }
})

test('respinge scope-ul si resetarea necunoscute', () => {
  assert.ok(fieldsFor({ ...validConfiguration, scope: 'tenant' as 'entity' }).includes('scope'))
  assert.ok(fieldsFor({ ...validConfiguration, reset: 'monthly' as 'none' }).includes('reset'))
})

test('formatul necesita exact un token number', () => {
  assert.ok(fieldsFor({ ...validConfiguration, format: '{prefix}' }).includes('format'))
  assert.ok(fieldsFor({ ...validConfiguration, format: '{number}-{number}' }).includes('format'))
})

test('respinge tokenurile necunoscute si acoladele incorecte', () => {
  for (const format of ['{number}-{tenant}', '{number', 'number}', '{{number}}']) {
    assert.ok(fieldsFor({ ...validConfiguration, format }).includes('format'), format)
  }
})

test('resetarea anuala necesita tokenul year', () => {
  assert.ok(fieldsFor({ ...validConfiguration, reset: 'yearly' }).includes('format'))
})

test('respinge formatul gol, prea lung sau cu rezultat peste limita', () => {
  assert.ok(fieldsFor({ ...validConfiguration, format: '' }).includes('format'))
  assert.ok(fieldsFor({ ...validConfiguration, format: `${'x'.repeat(248)}{number}` }).includes('format'))
  assert.ok(fieldsFor({ ...validConfiguration, format: `${'x'.repeat(247)}{number}` }).includes('format'))
})

test('respinge prefixul prea lung sau cu acolade', () => {
  assert.ok(fieldsFor({ ...validConfiguration, prefix: 'x'.repeat(101) }).includes('prefix'))
  assert.ok(fieldsFor({ ...validConfiguration, prefix: 'CFG-{x}' }).includes('prefix'))
})

test('paddingul trebuie sa fie un intreg intre 1 si 18', () => {
  for (const padding of [0, 1.5, 19, Number.NaN]) {
    assert.ok(fieldsFor({ ...validConfiguration, padding }).includes('padding'), String(padding))
  }
})

test('valoarea initiala trebuie sa fie un intreg pozitiv sigur', () => {
  for (const start_value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.ok(fieldsFor({ ...validConfiguration, start_value }).includes('start_value'), String(start_value))
  }
})
