import {
  getDeviceIdentityConfig,
  identityFromRequest,
  identityNamespace,
  isTrustedSameOriginRequest,
} from '../_lib/deviceIdentity.js'
import {
  compareAndSetScoutRecord,
  deleteScoutRecord,
  getRedisStoreConfig,
  readScoutRecord,
} from '../_lib/redisStore.js'
import { normalizeScoutState } from '../../src/scoutState.js'

function parseBody(req) {
  if (!req.body) return {}
  if (typeof req.body === 'string') {
    if (req.body.length > 250_000) return null
    try { return JSON.parse(req.body) } catch { return {} }
  }
  return req.body
}

function stateKeys(subject) {
  const namespace = identityNamespace(subject)
  return {
    stateKey: `${namespace}:scout:state`,
    revisionKey: `${namespace}:scout:revision`,
  }
}

function runtime(req) {
  const env = globalThis.process?.env || {}
  const identityConfig = getDeviceIdentityConfig(env)
  const storeConfig = getRedisStoreConfig(env)

  if (!identityConfig.configured) return { error: 'identity_not_configured', status: 503 }
  if (!storeConfig.configured) return { error: 'scout_store_not_configured', status: 503 }

  const identity = identityFromRequest(req, identityConfig)
  if (!identity.active) return { error: 'device_identity_required', status: 401 }

  return {
    identity,
    storeConfig,
    ...stateKeys(identity.verification.subject),
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (!['GET', 'PUT', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PUT, DELETE')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  if (req.method !== 'GET' && !isTrustedSameOriginRequest(req)) {
    return res.status(403).json({ error: 'scout_state_origin_rejected' })
  }

  const context = runtime(req)
  if (context.error) return res.status(context.status).json({ error: context.error })

  try {
    if (req.method === 'GET') {
      const record = await readScoutRecord(
        context.storeConfig,
        context.stateKey,
        context.revisionKey,
      )
      return res.status(200).json({
        revision: record.revision,
        state: record.state ? normalizeScoutState(record.state) : null,
      })
    }

    if (req.method === 'DELETE') {
      await deleteScoutRecord(context.storeConfig, context.stateKey, context.revisionKey)
      return res.status(200).json({ deleted: true, revision: 0, state: null })
    }

    const body = parseBody(req)
    if (body == null) return res.status(413).json({ error: 'scout_state_too_large' })

    const expectedRevision = Number(body.expectedRevision)
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      return res.status(400).json({ error: 'invalid_expected_revision' })
    }

    const state = normalizeScoutState(body.state || {})
    const result = await compareAndSetScoutRecord(
      context.storeConfig,
      context.stateKey,
      context.revisionKey,
      expectedRevision,
      state,
    )

    if (!result.written) {
      return res.status(409).json({
        error: 'scout_state_revision_conflict',
        currentRevision: result.revision,
      })
    }

    return res.status(200).json({
      revision: result.revision,
      state,
    })
  } catch (error) {
    console.error('Scout state storage error', { name: error?.name || 'Error' })
    return res.status(502).json({ error: 'scout_store_unavailable' })
  }
}
