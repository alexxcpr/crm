import assert from 'node:assert/strict'
import test from 'node:test'
import { withSingleAuthRetry } from '../app/utils/authRetry.ts'

function httpError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { statusCode: status })
}

test('reincearca o singura data dupa 401 si returneaza raspunsul', async () => {
  let requests = 0
  let refreshes = 0
  const response = await withSingleAuthRetry({
    execute: async () => {
      requests++
      if (requests === 1) throw httpError(401)
      return 'ok'
    },
    refresh: async () => { refreshes++ },
    onDefinitiveUnauthorized: () => assert.fail('sesiunea nu trebuie stearsa')
  })

  assert.equal(response, 'ok')
  assert.equal(requests, 2)
  assert.equal(refreshes, 1)
})

test('un al doilea 401 sterge sesiunea fara alta bucla de refresh', async () => {
  let requests = 0
  let refreshes = 0
  let clears = 0
  await assert.rejects(() => withSingleAuthRetry({
    execute: async () => {
      requests++
      throw httpError(401)
    },
    refresh: async () => { refreshes++ },
    onDefinitiveUnauthorized: () => { clears++ }
  }), { statusCode: 401 })

  assert.equal(requests, 2)
  assert.equal(refreshes, 1)
  assert.equal(clears, 1)
})

test('5xx pastreaza sesiunea si nu porneste refresh', async () => {
  let refreshes = 0
  let clears = 0
  await assert.rejects(() => withSingleAuthRetry({
    execute: async () => { throw httpError(503) },
    refresh: async () => { refreshes++ },
    onDefinitiveUnauthorized: () => { clears++ }
  }), { statusCode: 503 })

  assert.equal(refreshes, 0)
  assert.equal(clears, 0)
})

test('un 5xx la refresh pastreaza sesiunea existenta', async () => {
  let clears = 0
  await assert.rejects(() => withSingleAuthRetry({
    execute: async () => { throw httpError(401) },
    refresh: async () => { throw httpError(503) },
    onDefinitiveUnauthorized: () => { clears++ }
  }), { statusCode: 503 })

  assert.equal(clears, 0)
})
