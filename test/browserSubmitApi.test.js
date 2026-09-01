import test from 'node:test'
import assert from 'node:assert/strict'

import handler from '../api/browser/submit.js'

const SESSION_ID = 'abcdefghijklmnopqrstuvwxyzABCDEFGH12345678'

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function withEnv(values, fn) {
  const env = globalThis.process.env
  const previous = {}
  for (const [key, value] of Object.entries(values)) {
    previous[key] = env[key]
    if (value == null) delete env[key]
    else env[key] = value
  }
  try {
    return await fn()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete env[key]
      else env[key] = value
    }
  }
}

function request(body, origin = 'https://offerclaw.example') {
  return {
    method: 'POST',
    body,
    headers: {
      host: 'offerclaw.example',
      origin,
    },
  }
}

function approval(overrides = {}) {
  const now = Date.now()
  return {
    version: 1,
    id: 'approval-api-test',
    scope: 'submit_once',
    decision: 'explicit_user_approval',
    connectorId: 'lever',
    jobId: 'job-1',
    jobUrl: 'https://jobs.lever.co/example/abc',
    sessionId: SESSION_ID,
    approvedAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 120_000).toISOString(),
    consumed: false,
    ...overrides,
  }
}

function workerOutcome(overrides = {}) {
  return {
    version: 1,
    status: 'submitted_confirmed',
    attempted: true,
    confirmed: true,
    connectorId: 'lever',
    approvalId: 'approval-api-test',
    sessionId: SESSION_ID,
    finalUrl: 'https://jobs.lever.co/example/abc/success',
    confirmationSignal: 'thank_you',
    blockers: [],
    network: {
      allowedRequestCount: 2,
      postRequestCount: 1,
      navigationRequestCount: 1,
      preflightRequestCount: 0,
      blockedRequestCount: 0,
      lastPostStatus: 200,
    },
    sessionClosed: true,
    completedAt: new Date().toISOString(),
    ...overrides,
  }
}

test('foreign-origin submit is rejected before worker access', async () => {
  const originalFetch = globalThis.fetch
  let called = false
  globalThis.fetch = async () => { called = true; throw new Error('should not run') }

  try {
    await withEnv({
      BROWSER_WORKER_URL: 'https://worker.example',
      BROWSER_WORKER_TOKEN: 'worker-secret',
    }, async () => {
      const res = mockResponse()
      await handler(request({ approval: approval() }, 'https://evil.example'), res)
      assert.equal(res.statusCode, 403)
      assert.equal(res.body.error, 'browser_submit_origin_rejected')
      assert.equal(called, false)
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('invalid or consumed approval is rejected before worker access', async () => {
  const originalFetch = globalThis.fetch
  let called = false
  globalThis.fetch = async () => { called = true; throw new Error('should not run') }

  try {
    await withEnv({
      BROWSER_WORKER_URL: 'https://worker.example',
      BROWSER_WORKER_TOKEN: 'worker-secret',
    }, async () => {
      const res = mockResponse()
      await handler(request({ approval: approval({ consumed: true }) }), res)
      assert.equal(res.statusCode, 400)
      assert.equal(res.body.error, 'submit_approval_already_consumed')
      assert.equal(called, false)
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('valid submit forwards only to fixed worker endpoint and returns bounded outcome', async () => {
  const originalFetch = globalThis.fetch
  let captured = null
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        ...workerOutcome(),
        rawHtml: '<h1>private</h1>',
        candidate: { email: 'asha@example.com' },
      }),
    }
  }

  try {
    await withEnv({
      BROWSER_WORKER_URL: 'https://worker.example/api',
      BROWSER_WORKER_TOKEN: 'worker-secret',
    }, async () => {
      const res = mockResponse()
      await handler(request({ approval: approval() }), res)

      assert.equal(res.statusCode, 200)
      assert.equal(captured.url, 'https://worker.example/api/v1/submit')
      assert.equal(captured.options.redirect, 'error')
      assert.equal(captured.options.headers.Authorization, 'Bearer worker-secret')

      const sent = JSON.parse(captured.options.body)
      assert.equal(sent.task.action, 'submit_application')
      assert.equal(sent.task.approvalScope, 'submit_once')
      assert.equal(sent.policy.networkPolicy, 'connector_submission_only')
      assert.equal(sent.policy.singleSubmitAttempt, true)
      assert.equal(sent.approval.sessionId, SESSION_ID)
      assert.equal(Object.hasOwn(sent, 'profile'), false)
      assert.equal(Object.hasOwn(sent, 'resume'), false)

      assert.equal(res.body.outcome.status, 'submitted_confirmed')
      assert.equal(res.body.outcome.sessionClosed, true)
      assert.equal(Object.hasOwn(res.body.outcome, 'rawHtml'), false)
      assert.equal(Object.hasOwn(res.body.outcome, 'candidate'), false)
      assert.equal(JSON.stringify(res.body).includes('asha@example.com'), false)
      assert.equal(res.headers['cache-control'], 'no-store')
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('gateway rejects attempted worker outcome that leaves retained session alive', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => workerOutcome({ sessionClosed: false }),
  })

  try {
    await withEnv({
      BROWSER_WORKER_URL: 'https://worker.example',
      BROWSER_WORKER_TOKEN: 'worker-secret',
    }, async () => {
      const res = mockResponse()
      await handler(request({ approval: approval() }), res)
      assert.equal(res.statusCode, 502)
      assert.equal(res.body.error, 'browser_worker_submit_session_violation')
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('worker replay/session conflicts surface as submit session rejection without retry', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return {
      ok: false,
      status: 409,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'submit_approval_replayed' }),
    }
  }

  try {
    await withEnv({
      BROWSER_WORKER_URL: 'https://worker.example',
      BROWSER_WORKER_TOKEN: 'worker-secret',
    }, async () => {
      const res = mockResponse()
      await handler(request({ approval: approval() }), res)
      assert.equal(res.statusCode, 409)
      assert.equal(res.body.error, 'browser_submit_session_rejected')
      assert.equal(calls, 1)
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})
