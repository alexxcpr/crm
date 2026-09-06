import assert from 'node:assert/strict'
import test from 'node:test'
import { SingleFlightCache } from '../server/utils/singleFlight.ts'

test('deduplica cererile simultane si reutilizeaza rezultatul intarziat', async () => {
  const coordinator = new SingleFlightCache<{ token: string }>(10_000)
  let calls = 0
  const factory = async () => {
    calls++
    await Promise.resolve()
    return { token: 'token-nou' }
  }
  const [first, second] = await Promise.all([
    coordinator.run('refresh-vechi', factory), coordinator.run('refresh-vechi', factory)
  ])
  const late = await coordinator.run('refresh-vechi', factory)
  assert.equal(calls, 1)
  assert.deepEqual(first, second)
  assert.deepEqual(second, late)
})

test('permite retry dupa un refresh esuat', async () => {
  const coordinator = new SingleFlightCache<string>(10_000)
  let calls = 0
  await assert.rejects(() => coordinator.run('token', async () => {
    calls++
    throw new Error('backend indisponibil')
  }))
  const result = await coordinator.run('token', async () => {
    calls++
    return 'ok'
  })
  assert.equal(result, 'ok')
  assert.equal(calls, 2)
})
