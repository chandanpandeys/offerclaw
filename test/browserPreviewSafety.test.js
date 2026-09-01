import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizePrefillResult } from '../api/_lib/browserGateway.js'

const SESSION_ID = 'abcdefghijklmnopqrstuvwxyzABCDEFGH12345678'

function baseResult(preview) {
  return normalizePrefillResult({
    session: { id: SESSION_ID, expiresAt: '2026-09-01T12:00:00Z', ttlSeconds: 600 },
    preview,
    metadata: { networkFrozen: true, browserOffline: true, submitAttempted: false },
  })
}

test('review preview requires PNG signature rather than trusting MIME label', () => {
  assert.equal(baseResult({ mimeType: 'image/png', base64: 'AAAA', width: 1280, height: 900 }).preview, null)
  assert.equal(baseResult({ mimeType: 'text/html', base64: 'iVBORw0KGgo=', width: 1280, height: 900 }).preview, null)

  const valid = baseResult({ mimeType: 'image/png', base64: 'iVBORw0KGgo=', width: 1280, height: 900 })
  assert.equal(valid.preview.mimeType, 'image/png')
})

test('review preview payload is bounded', () => {
  const oversized = `iVBORw0KGgo${'A'.repeat(2_500_001)}`
  assert.equal(baseResult({ mimeType: 'image/png', base64: oversized }).preview, null)
})
