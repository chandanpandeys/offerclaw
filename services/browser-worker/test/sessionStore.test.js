import test from 'node:test'
import assert from 'node:assert/strict'

import {
  claimPrefillSessionForSubmit,
  closeAllPrefillSessions,
  closePrefillSession,
  getPrefillSession,
  markSubmitNetworkAttempt,
  prefillSessionStats,
  releasePrefillSubmitClaim,
  retainPrefillSession,
} from '../sessionStore.js'

function fakeContext() {
  let closed = 0
  return {
    context: {
      close: async () => { closed += 1 },
      setOffline: async () => {},
    },
    page: {},
    closed: () => closed,
  }
}

async function retain(fake, options = {}, overrides = {}) {
  return retainPrefillSession({
    context: fake.context,
    page: fake.page,
    connectorId: 'greenhouse',
    targetUrl: 'https://job-boards.greenhouse.io/example/jobs/123',
    targetOrigin: 'https://job-boards.greenhouse.io',
    approvedFieldKeys: ['name', 'email'],
    requestId: 'req-1',
    networkState: { mode: 'frozen', browserOffline: true },
    ...overrides,
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

test('submit claims are atomic and the same approval cannot be replayed after safe release', async () => {
  await closeAllPrefillSessions()
  const fake = fakeContext()
  const session = await retain(fake, { now: 1_000 })
  const targetUrl = 'https://job-boards.greenhouse.io/example/jobs/123'

  const first = await claimPrefillSessionForSubmit(session.id, {
    approvalId: 'approval-1',
    connectorId: 'greenhouse',
    targetUrl,
    now: 2_000,
  })
  assert.equal(first.ok, true)
  assert.equal(first.record.state, 'submitting')
  assert.equal(releasePrefillSubmitClaim(first.record, 'approval-1'), true)
  assert.equal(first.record.state, 'prefilled')

  const replay = await claimPrefillSessionForSubmit(session.id, {
    approvalId: 'approval-1',
    connectorId: 'greenhouse',
    targetUrl,
    now: 3_000,
  })
  assert.equal(replay.ok, false)
  assert.equal(replay.reason, 'submit_approval_replayed')

  const second = await claimPrefillSessionForSubmit(session.id, {
    approvalId: 'approval-2',
    connectorId: 'greenhouse',
    targetUrl,
    now: 4_000,
  })
  assert.equal(second.ok, true)
  assert.equal(second.record.activeApprovalId, 'approval-2')

  await closeAllPrefillSessions()
})

test('a network-attempted submit claim cannot be released back to prefilled state', async () => {
  await closeAllPrefillSessions()
  const fake = fakeContext()
  const session = await retain(fake, { now: 1_000 })
  const claim = await claimPrefillSessionForSubmit(session.id, {
    approvalId: 'approval-network',
    connectorId: 'greenhouse',
    targetUrl: 'https://job-boards.greenhouse.io/example/jobs/123',
    now: 2_000,
  })

  assert.equal(claim.ok, true)
  assert.equal(markSubmitNetworkAttempt(claim.record, 'approval-network'), true)
  assert.equal(releasePrefillSubmitClaim(claim.record, 'approval-network'), false)
  assert.equal(claim.record.submitAttempted, true)
  assert.equal(claim.record.state, 'submitting')

  await closeAllPrefillSessions()
})

test('submit claim requires exact connector URL and frozen offline state', async () => {
  await closeAllPrefillSessions()
  const fake = fakeContext()
  const session = await retain(fake, { now: 1_000 })

  const wrongUrl = await claimPrefillSessionForSubmit(session.id, {
    approvalId: 'approval-url',
    connectorId: 'greenhouse',
    targetUrl: 'https://job-boards.greenhouse.io/example/jobs/999',
    now: 2_000,
  })
  assert.equal(wrongUrl.reason, 'submit_session_url_mismatch')

  const record = await getPrefillSession(session.id, { now: 2_001 })
  record.networkState.browserOffline = false
  const online = await claimPrefillSessionForSubmit(session.id, {
    approvalId: 'approval-online',
    connectorId: 'greenhouse',
    targetUrl: 'https://job-boards.greenhouse.io/example/jobs/123',
    now: 2_002,
  })
  assert.equal(online.reason, 'submit_session_not_frozen')

  await closeAllPrefillSessions()
})
