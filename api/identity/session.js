import {
  clearDeviceCookieHeader,
  createDeviceToken,
  deviceCookieHeader,
  getDeviceIdentityConfig,
  identityFromRequest,
  isTrustedSameOriginRequest,
  issueDeviceIdentity,
  publicDeviceIdentityRuntime,
  verifyDeviceToken,
} from '../_lib/deviceIdentity.js'

const REFRESH_WINDOW_SECONDS = 30 * 24 * 60 * 60

function publicSession(config, identity) {
  return {
    ...publicDeviceIdentityRuntime(config),
    active: Boolean(identity?.active),
    expiresAt: identity?.active ? identity.verification.expiresAt : null,
  }
}

export default function handler(req, res) {
  const env = globalThis.process?.env || {}
  const config = getDeviceIdentityConfig(env)
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'GET') {
    const identity = identityFromRequest(req, config)
    return res.status(200).json(publicSession(config, identity))
  }

  if (req.method === 'POST') {
    if (!isTrustedSameOriginRequest(req)) return res.status(403).json({ error: 'identity_origin_rejected' })
    if (!config.configured) return res.status(503).json({ error: 'identity_not_configured' })

    const current = identityFromRequest(req, config)
    if (current.active) {
      const expiresAtSeconds = Math.floor(new Date(current.verification.expiresAt).getTime() / 1000)
      const nowSeconds = Math.floor(Date.now() / 1000)
      if (expiresAtSeconds - nowSeconds > REFRESH_WINDOW_SECONDS) {
        return res.status(200).json(publicSession(config, current))
      }

      const refreshedToken = createDeviceToken(config, Date.now(), current.verification.subject)
      const verification = verifyDeviceToken(refreshedToken, config)
      res.setHeader('Set-Cookie', deviceCookieHeader(refreshedToken, config))
      return res.status(200).json(publicSession(config, {
        active: verification.valid,
        verification,
      }))
    }

    const issued = issueDeviceIdentity(config)
    res.setHeader('Set-Cookie', deviceCookieHeader(issued.token, config))
    return res.status(201).json(publicSession(config, {
      active: true,
      verification: issued,
    }))
  }

  if (req.method === 'DELETE') {
    if (!isTrustedSameOriginRequest(req)) return res.status(403).json({ error: 'identity_origin_rejected' })
    res.setHeader('Set-Cookie', clearDeviceCookieHeader(config))
    return res.status(200).json({
      ...publicDeviceIdentityRuntime(config),
      active: false,
      expiresAt: null,
    })
  }

  res.setHeader('Allow', 'GET, POST, DELETE')
  return res.status(405).json({ error: 'method_not_allowed' })
}
