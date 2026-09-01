import test from 'node:test'
import assert from 'node:assert/strict'

import {
  closeAllPrefillSessions,
  closePrefillSession,
  getPrefillSession,
  prefillSessionStats,
  retainPrefillSession,
} from '../sessionStore.js'

function fakeContext() {
  let closed = 0
  return {
    context: { close: async () => { closed += 1 } },
    page: {},
    closed: () => closed,
  }
}

async function retain(fake, options = {}) {
  return retainPrefillSession({
    context: fake.context,
    page: fake.page,
    connectorId: 'greenhouse',
    targetUrl: 'https://job-boards.greenhouse.io/example/jobs/123',
    targetOrigin: 'https://job-boards.greenhouse.io',
    approvedFieldKeys: ['name', 'email'],
    requestId: 'req-1',
  }, options)
}

test('retained session uses opaque capability and explicit close destroys context', async () => {
  await closeAllPrefillSessions()
  const fake = fakeContext()
  const session = await retain(fake, { now: 1_000 })

  assert.match(session.id, /^[A-Za-z0-9_-]{32,120}$/)
  assert.equal(prefillSessionStats().active, 1)
  assert.ok(await getPrefillSession(session.id, { now: 2_000 }))
  assert.equal(await closePrefillSession(session.id), true)
  assert.equal(fake.closed(), 1)
  assert.equal(await getPrefillSession(session.id), null)
  assert.equal(prefillSessionStats().active, 0)
})

test('expired sessions are pruned and context is destroyed', async () => {
  await closeAllPrefillSessions()
  const fake = fakeContext()
  const session = await retain(fake, { now: 10_000, ttlMs: 60_000 })

  assert.equal(await getPrefillSession(session.id, { now: 69_999 }) != null, true)
  assert.equal(await getPrefillSession(session.id, { now: 70_001 }), null)
  assert.equal(fake.closed(), 1)
  assert.equal(prefillSessionStats().active, 0)
})

test('session cap evicts the oldest retained browser context', async () => {
  await closeAllPrefillSessions()
  const first = fakeContext()
  const second = fakeContext()
  const firstSession = await retain(first, { now: 1_000, maxSessions: 1 })
  const secondSession = await retain(second, { now: 2_000, maxSessions: 1 })

  assert.equal(first.closed(), 1)
  assert.equal(await getPrefillSession(firstSession.id, { now: 2_001 }), null)
  assert.ok(await getPrefillSession(secondSession.id, { now: 2_001 }))

  await closeAllPrefillSessions()
  assert.equal(second.closed(), 1)
  assert.equal(prefillSessionStats().active, 0)
})
