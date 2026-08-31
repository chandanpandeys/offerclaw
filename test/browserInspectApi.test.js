import test from 'node:test'
import assert from 'node:assert/strict'

import handler from '../api/browser/inspect.js'
import { APPROVAL_SCOPE, BROWSER_ACTION, createBrowserTask } from '../src/browserTasks.js'

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

test('inspection endpoint returns not-configured before attempting remote browser access', async () => {
  const originalFetch = globalThis.fetch
  let called = false
  globalThis.fetch = async () => { called = true; throw new Error('should not run') }

  try {
    await withEnv({ BROWSER_WORKER_URL: null, BROWSER_WORKER_TOKEN: null }, async () => {
      const res = mockResponse()
      await handler({ method: 'POST', body: { task: {} } }, res)
      assert.equal(res.statusCode, 503)
      assert.equal(res.body.error, 'browser_worker_not_configured')
      assert.equal(called, false)
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('invalid or write-capable task is rejected before calling the worker', async () => {
  const originalFetch = globalThis.fetch
  let called = false
  globalThis.fetch = async () => { called = true; throw new Error('should not run') }

  const task = createBrowserTask({
    connectorId: 'greenhouse',
    action: BROWSER_ACTION.PREFILL_APPLICATION,
    jobUrl: 'https://job-boards.greenhouse.io/example/jobs/123',
    approvalScope: APPROVAL_SCOPE.PREFILL_ONLY,
  })

  try {
    await withEnv({
      BROWSER_WORKER_URL: 'https://worker.example',
      BROWSER_WORKER_TOKEN: 'worker-secret',
    }, async () => {
      const res = mockResponse()
      await handler({ method: 'POST', body: { task } }, res)
      assert.equal(res.statusCode, 400)
      assert.equal(res.body.error, 'inspection_endpoint_action_mismatch')
      assert.equal(called, false)
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('valid inspection forwards minimal policy with redirects disabled and sanitizes response', async () => {
  const originalFetch = globalThis.fetch
  let captured = null

  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        url: 'https://jobs.lever.co/example/abc',
        title: 'Application',
        connectorId: 'lever',
        rawHtml: '<script>malicious()</script>',
        fields: [{
          name: 'email',
          label: 'Email',
          type: 'email',
          required: true,
          outerHTML: '<input>',
        }],
        checkpoints: { captchaDetected: false },
        metadata: { workerVersion: 'test', secret: 'drop-me' },
      }),
    }
  }

  const task = createBrowserTask({
    connectorId: 'lever',
    action: BROWSER_ACTION.INSPECT_FORM,
    jobUrl: 'https://jobs.lever.co/example/abc',
    approvalScope: APPROVAL_SCOPE.INSPECT_ONLY,
    evidenceSnapshotId: 'evidence-1',
  })

  try {
    await withEnv({
      BROWSER_WORKER_URL: 'https://worker.example/api',
      BROWSER_WORKER_TOKEN: 'worker-secret',
    }, async () => {
      const res = mockResponse()
      await handler({ method: 'POST', body: { task } }, res)

      assert.equal(res.statusCode, 200)
      assert.equal(captured.url, 'https://worker.example/api/v1/inspect')
      assert.equal(captured.options.redirect, 'error')
      assert.equal(captured.options.headers.Authorization, 'Bearer worker-secret')

      const sent = JSON.parse(captured.options.body)
      assert.equal(sent.policy.writesAllowed, false)
      assert.equal(sent.policy.navigationScope, 'task_origin_only')
      assert.equal(sent.task.approvalScope, APPROVAL_SCOPE.INSPECT_ONLY)

      assert.equal(res.body.inspection.fields[0].label, 'Email')
      assert.equal(Object.hasOwn(res.body.inspection, 'rawHtml'), false)
      assert.equal(Object.hasOwn(res.body.inspection.fields[0], 'outerHTML'), false)
      assert.equal(Object.hasOwn(res.body.inspection.metadata, 'secret'), false)
      assert.equal(res.headers['cache-control'], 'no-store')
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('worker navigation to another origin is rejected', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({
      url: 'https://evil.example/application',
      connectorId: 'greenhouse',
      fields: [],
    }),
  })

  const task = createBrowserTask({
    connectorId: 'greenhouse',
    action: BROWSER_ACTION.INSPECT_FORM,
    jobUrl: 'https://job-boards.greenhouse.io/example/jobs/123',
    approvalScope: APPROVAL_SCOPE.INSPECT_ONLY,
  })

  try {
    await withEnv({
      BROWSER_WORKER_URL: 'https://worker.example',
      BROWSER_WORKER_TOKEN: 'worker-secret',
    }, async () => {
      const res = mockResponse()
      await handler({ method: 'POST', body: { task } }, res)
      assert.equal(res.statusCode, 502)
      assert.equal(res.body.error, 'browser_worker_navigation_scope_violation')
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})
