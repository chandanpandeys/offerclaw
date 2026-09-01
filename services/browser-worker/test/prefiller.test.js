import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'

import { closePrefillBrowser, prefillApplicationPage } from '../prefiller.js'
import { closeAllPrefillSessions, closePrefillSession, getPrefillSession } from '../sessionStore.js'

async function testServer() {
  const requests = []
  const server = createServer((req, res) => {
    requests.push(req.url)
    if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html>
        <html><body>
          <form id="application" action="/submit" method="post">
            <label for="full_name">Full name</label>
            <input id="full_name" name="full_name" type="text" />
            <label for="email">Email</label>
            <input id="email" name="email" type="email" />
            <label for="gender">Gender</label>
            <select id="gender" name="gender"><option value="">Choose</option><option value="female">Female</option></select>
            <button type="submit">Submit</button>
          </form>
          <script>
            document.querySelector('#email').addEventListener('input', event => {
              fetch('/leak?value=' + encodeURIComponent(event.target.value)).catch(() => {})
            })
          </script>
        </body></html>`)
      return
    }
    res.writeHead(204)
    res.end()
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const origin = `http://127.0.0.1:${address.port}`
  return {
    origin,
    requests,
    close: () => new Promise(resolve => server.close(resolve)),
  }
}

async function cleanup(fixture) {
  await closeAllPrefillSessions()
  await closePrefillBrowser()
  await fixture.close()
}

test('supervised prefill retains frozen review session and blocks post-write exfiltration and submit', async () => {
  const fixture = await testServer()
  try {
    const result = await prefillApplicationPage({
      connectorId: 'greenhouse',
      target: {
        url: `${fixture.origin}/`,
        origin: fixture.origin,
      },
      approvedFields: [
        {
          key: 'full_name',
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
      ],
    }, { timeoutMs: 10_000 })

    assert.equal(result.metadata.networkFrozen, true)
    assert.equal(result.metadata.submitAttempted, false)
    assert.equal(result.metadata.filledCount, 2)
    assert.equal(result.metadata.rejectedCount, 0)
    assert.deepEqual(result.fields.map(field => field.status), ['filled', 'filled'])
    assert.match(result.session.id, /^[A-Za-z0-9_-]{32,120}$/)
    assert.ok(await getPrefillSession(result.session.id))
    assert.equal(result.preview.mimeType, 'image/png')
    assert.equal(result.preview.width, 1280)
    assert.equal(result.preview.height, 900)
    assert.ok(result.preview.base64.length > 100)
    assert.equal(Buffer.from(result.preview.base64, 'base64').subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(JSON.stringify(result.fields).includes('asha@example.com'), false)
    assert.equal(JSON.stringify(result.fields).includes('Asha Rao'), false)

    await new Promise(resolve => setTimeout(resolve, 100))
    assert.ok(fixture.requests.includes('/'))
    assert.equal(fixture.requests.some(url => url.startsWith('/leak')), false)
    assert.equal(fixture.requests.includes('/submit'), false)
    assert.ok(result.metadata.blockedAfterFreeze >= 1)

    assert.equal(await closePrefillSession(result.session.id), true)
    assert.equal(await getPrefillSession(result.session.id), null)
  } finally {
    await cleanup(fixture)
  }
})

test('live label or kind changes are rejected before writing that field', async () => {
  const fixture = await testServer()
  try {
    const result = await prefillApplicationPage({
      connectorId: 'greenhouse',
      target: {
        url: `${fixture.origin}/`,
        origin: fixture.origin,
      },
      approvedFields: [{
        key: 'full_name',
        label: 'Candidate legal name',
        inputType: 'text',
        kind: 'identity',
        value: 'Asha Rao',
        evidenceSource: 'profile.name',
      }],
    }, { timeoutMs: 10_000 })

    assert.equal(result.metadata.filledCount, 0)
    assert.equal(result.metadata.rejectedCount, 1)
    assert.equal(result.fields[0].status, 'rejected')
    assert.equal(result.fields[0].reason, 'approved_field_label_changed')
    assert.ok(result.session.id)
    assert.equal(result.preview.mimeType, 'image/png')
  } finally {
    await cleanup(fixture)
  }
})
