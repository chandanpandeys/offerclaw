import test from 'node:test'
import assert from 'node:assert/strict'

import handler from '../api/browser/prefill.js'
import { APPROVAL_SCOPE, BROWSER_ACTION, createBrowserTask } from '../src/browserTasks.js'
import { FIELD_KIND } from '../src/formPlanner.js'

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
  try { return await fn() } finally {
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
    headers: { host: 'offerclaw.example', origin },
  }
}

function prefillTask() {
  return createBrowserTask({
    connectorId: 'lever',
    action: BROWSER_ACTION.PREFILL_APPLICATION,
    jobUrl: 'https://jobs.lever.co/example/abc',
    approvalScope: APPROVAL_SCOPE.PREFILL_ONLY,
    evidenceSnapshotId: 'evidence-1',
  })
}

function approvedFields() {
  return [{
    key: 'email',
    label: 'Email',
    inputType: 'email',
    kind: FIELD_KIND.CONTACT,
    value: 'asha@example.com',
    evidenceSource: 'profile.email',
  }]
}

function reviewableWorkerResult(overrides = {}) {
  return {
    url: 'https://jobs.lever.co/example/abc',
    connectorId: 'lever',
    fields: [{
      key: 'email',
      status: 'filled',
      kind: 'contact',
      inputType: 'email',
      evidenceSource: 'profile.email',
      reason: 'filled_from_approved_evidence',
      value: 'asha@example.com',
    }],
    session: {
      id: SESSION_ID,
      expiresAt: '2026-09-01T12:00:00Z',
      ttlSeconds: 600,
    },
    preview: {
      mimeType: 'image/png',
      base64: 'iVBORw0KGgo=',
      width: 1280,
      height: 900,
    },
    metadata: {
      filledCount: 1,
      rejectedCount: 0,
      networkFrozen: true,
      submitAttempted: false,
      workerVersion: '0.3.0',
    },
    ...overrides,
  }
}

test('prefill rejects foreign-origin mutation before remote worker access', async () => {
  const originalFetch = globalThis.fetch
  let called = false
  globalThis.fetch = async () => { called = true; throw new Error('should not run') }

  try {
    await withEnv({ BROWSER_WORKER_URL: 'https://worker.example', BROWSER_WORKER_TOKEN: 'secret' }, async () => {
      const res = mockResponse()
      await handler(request({ task: prefillTask(), approvedFields: approvedFields() }, 'https://evil.example'), res)
      assert.equal(res.statusCode, 403)
      assert.equal(res.body.error, 'browser_prefill_origin_rejected')
      assert.equal(called, false)
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('invalid approved fields are rejected before worker access', async () => {
  const originalFetch = globalThis.fetch
  let called = false
  globalThis.fetch = async () => { called = true; throw new Error('should not run') }

  try {
    await withEnv({ BROWSER_WORKER_URL: 'https://worker.example', BROWSER_WORKER_TOKEN: 'secret' }, async () => {
      const res = mockResponse()
      await handler(request({
        task: prefillTask(),
        approvedFields: [{
          key: 'salary',
          label: 'Expected salary',
          inputType: 'text',
          kind: FIELD_KIND.SALARY,
          value: '25 LPA',
          evidenceSource: 'explicit_preference',
        }],
      }), res)
      assert.equal(res.statusCode, 400)
      assert.equal(res.body.error, 'prefill_field_kind_not_allowed')
      assert.equal(called, false)
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('valid prefill forwards approved values only to fixed worker endpoint and returns review capability', async () => {
  const originalFetch = globalThis.fetch
  let captured = null
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => reviewableWorkerResult(),
    }
  }

  try {
    await withEnv({ BROWSER_WORKER_URL: 'https://worker.example/api', BROWSER_WORKER_TOKEN: 'worker-secret' }, async () => {
      const res = mockResponse()
      await handler(request({ task: prefillTask(), approvedFields: approvedFields() }), res)

      assert.equal(res.statusCode, 200)
      assert.equal(captured.url, 'https://worker.example/api/v1/prefill')
      assert.equal(captured.options.redirect, 'error')
      assert.equal(captured.options.headers.Authorization, 'Bearer worker-secret')

      const sent = JSON.parse(captured.options.body)
      assert.equal(sent.approvedFields[0].value, 'asha@example.com')
      assert.equal(sent.policy.networkAfterPrefillAllowed, false)
      assert.equal(sent.policy.submitAllowed, false)

      assert.equal(res.body.prefill.fields[0].status, 'filled')
      assert.equal(Object.hasOwn(res.body.prefill.fields[0], 'value'), false)
      assert.equal(res.body.prefill.metadata.networkFrozen, true)
      assert.equal(res.body.prefill.metadata.submitAttempted, false)
      assert.equal(res.body.prefill.session.id, SESSION_ID)
      assert.equal(res.body.prefill.preview.mimeType, 'image/png')
      assert.equal(res.headers['cache-control'], 'no-store')
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('worker policy violation is rejected even after an otherwise successful response', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => reviewableWorkerResult({ metadata: { networkFrozen: false, submitAttempted: false } }),
  })

  try {
    await withEnv({ BROWSER_WORKER_URL: 'https://worker.example', BROWSER_WORKER_TOKEN: 'secret' }, async () => {
      const res = mockResponse()
      await handler(request({ task: prefillTask(), approvedFields: approvedFields() }), res)
      assert.equal(res.statusCode, 502)
      assert.equal(res.body.error, 'browser_worker_prefill_policy_violation')
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('ephemeral prefill without retained review session and preview is rejected', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => reviewableWorkerResult({ session: null, preview: null }),
  })

  try {
    await withEnv({ BROWSER_WORKER_URL: 'https://worker.example', BROWSER_WORKER_TOKEN: 'secret' }, async () => {
      const res = mockResponse()
      await handler(request({ task: prefillTask(), approvedFields: approvedFields() }), res)
      assert.equal(res.statusCode, 502)
      assert.equal(res.body.error, 'browser_worker_prefill_review_missing')
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})
