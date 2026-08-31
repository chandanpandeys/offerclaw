import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createDeviceToken,
  deviceCookieHeader,
  getDeviceIdentityConfig,
  identityFromRequest,
  identityNamespace,
  isTrustedSameOriginRequest,
  parseCookies,
  publicDeviceIdentityRuntime,
  verifyDeviceToken,
} from '../api/_lib/deviceIdentity.js'

const SECRET = 'test-secret-that-is-long-enough-for-device-identity-123456'
const NOW = Date.parse('2026-09-01T00:00:00Z')

function config(overrides = {}) {
  return {
    ...getDeviceIdentityConfig({ OFFERCLAW_IDENTITY_SECRET: SECRET, IDENTITY_COOKIE_SECURE: 'false' }),
    ...overrides,
  }
}

test('identity config requires a strong server secret and exposes only public capability metadata', () => {
  const disabled = getDeviceIdentityConfig({ OFFERCLAW_IDENTITY_SECRET: 'short' })
  assert.equal(disabled.configured, false)
  assert.equal(disabled.secret, null)

  const enabled = config()
  const runtime = publicDeviceIdentityRuntime(enabled)
  assert.deepEqual(runtime, {
    configured: true,
    type: 'anonymous_device',
    cookie: 'http_only',
    profileDataInToken: false,
  })
  assert.equal(Object.hasOwn(runtime, 'secret'), false)
})

test('signed device tokens verify, expire, and reject tampering', () => {
  const runtime = config()
  const subject = 'abcdefghijklmnopqrstuvwx12345678'
  const token = createDeviceToken(runtime, NOW, subject)

  const valid = verifyDeviceToken(token, runtime, NOW + 60_000)
  assert.equal(valid.valid, true)
  assert.equal(valid.subject, subject)

  const pieces = token.split('.')
  const tampered = `${pieces[0]}.${pieces[1]}.${pieces[2].slice(0, -1)}x`
  assert.equal(verifyDeviceToken(tampered, runtime, NOW).valid, false)

  const expiredAt = NOW + (runtime.ttlSeconds + 1) * 1000
  const expired = verifyDeviceToken(token, runtime, expiredAt)
  assert.equal(expired.valid, false)
  assert.equal(expired.reason, 'token_expired')
})

test('identity cookies are HttpOnly, same-site and secure in production mode', () => {
  const secure = getDeviceIdentityConfig({
    OFFERCLAW_IDENTITY_SECRET: SECRET,
    NODE_ENV: 'production',
  })
  const header = deviceCookieHeader('signed.token.value', secure)

  assert.match(header, /^offerclaw_device=/)
  assert.match(header, /Path=\//)
  assert.match(header, /HttpOnly/)
  assert.match(header, /SameSite=Lax/)
  assert.match(header, /Secure/)
  assert.equal(header.includes('Domain='), false)
})

test('cookie parsing and request identity do not trust malformed tokens', () => {
  const runtime = config()
  const cookies = parseCookies('theme=dark; offerclaw_device=bad%20token; x=1')
  assert.equal(cookies.offerclaw_device, 'bad token')

  const identity = identityFromRequest({ headers: { cookie: 'offerclaw_device=bad' } }, runtime, NOW)
  assert.equal(identity.active, false)
})

test('identity namespace is deterministic and rejects unsafe subjects', () => {
  const subject = 'abcdefghijklmnopqrstuvwx12345678'
  assert.equal(identityNamespace(subject), `offerclaw:v1:device:${subject}`)
  assert.throws(() => identityNamespace('../../shared'), /invalid_identity_subject/)
})

test('state-changing identity requests accept same-origin and reject foreign origins', () => {
  assert.equal(isTrustedSameOriginRequest({
    headers: { host: 'offerclaw.example', origin: 'https://offerclaw.example' },
  }), true)

  assert.equal(isTrustedSameOriginRequest({
    headers: { host: 'offerclaw.example', origin: 'https://evil.example' },
  }), false)

  assert.equal(isTrustedSameOriginRequest({
    headers: { 'x-forwarded-host': 'offerclaw.example', origin: 'https://offerclaw.example' },
  }), true)

  assert.equal(isTrustedSameOriginRequest({ headers: { host: 'offerclaw.example' } }), true)
})
