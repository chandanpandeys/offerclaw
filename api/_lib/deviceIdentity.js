import { Buffer } from 'node:buffer'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const DEVICE_IDENTITY_VERSION = 1
export const DEVICE_COOKIE_NAME = 'offerclaw_device'
export const DEVICE_IDENTITY_TTL_SECONDS = 180 * 24 * 60 * 60

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max)
}

function toBase64Url(value) {
  return Buffer.from(value).toString('base64url')
}

function fromBase64Url(value) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function sign(secret, value) {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

function safeSignatureEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8')
  const b = Buffer.from(String(right || ''), 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

function subject() {
  return randomBytes(24).toString('base64url')
}

function seconds(value = Date.now()) {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000)
  const number = Number(value)
  if (!Number.isFinite(number)) return Math.floor(Date.now() / 1000)
  return number > 10_000_000_000 ? Math.floor(number / 1000) : Math.floor(number)
}

export function getDeviceIdentityConfig(env = {}) {
  const secret = clean(env.OFFERCLAW_IDENTITY_SECRET, 4_000)
  const secureCookie = env.IDENTITY_COOKIE_SECURE === 'false'
    ? false
    : Boolean(env.VERCEL || env.NODE_ENV === 'production')

  return {
    configured: secret.length >= 32,
    secret: secret.length >= 32 ? secret : null,
    secureCookie,
    ttlSeconds: DEVICE_IDENTITY_TTL_SECONDS,
    cookieName: DEVICE_COOKIE_NAME,
  }
}

export function publicDeviceIdentityRuntime(config) {
  return {
    configured: Boolean(config?.configured),
    type: 'anonymous_device',
    cookie: 'http_only',
    profileDataInToken: false,
  }
}

export function createDeviceToken(config, now = Date.now(), explicitSubject = null) {
  if (!config?.configured || !config.secret) throw new Error('identity_not_configured')
  const issuedAt = seconds(now)
  const payload = {
    v: DEVICE_IDENTITY_VERSION,
    sub: clean(explicitSubject, 120) || subject(),
    iat: issuedAt,
    exp: issuedAt + config.ttlSeconds,
  }
  const encoded = toBase64Url(JSON.stringify(payload))
  const signedValue = `v${DEVICE_IDENTITY_VERSION}.${encoded}`
  return `${signedValue}.${sign(config.secret, signedValue)}`
}

export function verifyDeviceToken(token, config, now = Date.now()) {
  if (!config?.configured || !config.secret) return { valid: false, reason: 'identity_not_configured' }
  const parts = clean(token, 4_000).split('.')
  if (parts.length !== 3 || parts[0] !== `v${DEVICE_IDENTITY_VERSION}`) {
    return { valid: false, reason: 'invalid_token_format' }
  }

  const signedValue = `${parts[0]}.${parts[1]}`
  const expected = sign(config.secret, signedValue)
  if (!safeSignatureEqual(parts[2], expected)) return { valid: false, reason: 'invalid_token_signature' }

  let payload
  try {
    payload = JSON.parse(fromBase64Url(parts[1]))
  } catch {
    return { valid: false, reason: 'invalid_token_payload' }
  }

  const nowSeconds = seconds(now)
  const sub = clean(payload?.sub, 120)
  const issuedAt = Number(payload?.iat)
  const expiresAt = Number(payload?.exp)
  if (payload?.v !== DEVICE_IDENTITY_VERSION || !/^[A-Za-z0-9_-]{20,120}$/.test(sub)) {
    return { valid: false, reason: 'invalid_token_claims' }
  }
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt) {
    return { valid: false, reason: 'invalid_token_timestamps' }
  }
  if (issuedAt > nowSeconds + 300) return { valid: false, reason: 'token_issued_in_future' }
  if (expiresAt <= nowSeconds) return { valid: false, reason: 'token_expired' }
  if (expiresAt - issuedAt > config.ttlSeconds + 300) return { valid: false, reason: 'token_ttl_invalid' }

  return {
    valid: true,
    subject: sub,
    issuedAt: new Date(issuedAt * 1000).toISOString(),
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  }
}

export function parseCookies(header = '') {
  const output = {}
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=')
    if (index <= 0) continue
    const name = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (!name) continue
    try {
      output[name] = decodeURIComponent(value)
    } catch {
      output[name] = value
    }
  }
  return output
}

export function identityFromRequest(req, config, now = Date.now()) {
  const cookies = parseCookies(req?.headers?.cookie || '')
  const token = cookies[config?.cookieName || DEVICE_COOKIE_NAME] || ''
  const verification = verifyDeviceToken(token, config, now)
  return {
    configured: Boolean(config?.configured),
    active: verification.valid,
    verification,
  }
}

export function deviceCookieHeader(token, config, maxAge = config?.ttlSeconds || DEVICE_IDENTITY_TTL_SECONDS) {
  const attributes = [
    `${config?.cookieName || DEVICE_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(Number(maxAge) || 0))}`,
  ]
  if (config?.secureCookie) attributes.push('Secure')
  return attributes.join('; ')
}

export function clearDeviceCookieHeader(config) {
  return deviceCookieHeader('', config, 0)
}

export function issueDeviceIdentity(config, now = Date.now()) {
  const token = createDeviceToken(config, now)
  const verification = verifyDeviceToken(token, config, now)
  if (!verification.valid) throw new Error('identity_issue_failed')
  return { token, ...verification }
}

export function identityNamespace(subjectValue) {
  const value = clean(subjectValue, 120)
  if (!/^[A-Za-z0-9_-]{20,120}$/.test(value)) throw new Error('invalid_identity_subject')
  return `offerclaw:v1:device:${value}`
}
