import { validateApprovedPrefillFields } from '../../src/prefillContract.js'

const CONNECTOR_HOSTS = Object.freeze({
  greenhouse: ['greenhouse.io'],
  lever: ['lever.co'],
  ashby: ['ashbyhq.com'],
})

export const WORKER_POLICY_VERSION = 1
export const WORKER_CONNECTORS = Object.freeze(Object.keys(CONNECTOR_HOSTS))

function clean(value, max = 2_000) {
  return String(value || '').trim().slice(0, max)
}

function hostMatches(hostname, allowedHost) {
  return hostname === allowedHost || hostname.endsWith(`.${allowedHost}`)
}

export function validateTargetUrl(rawUrl, connectorId) {
  const allowedHosts = CONNECTOR_HOSTS[connectorId]
  if (!allowedHosts) return { ok: false, reason: 'connector_not_enabled' }

  let url
  try {
    url = new URL(clean(rawUrl))
  } catch {
    return { ok: false, reason: 'invalid_target_url' }
  }

  if (url.protocol !== 'https:') return { ok: false, reason: 'https_required' }
  if (url.username || url.password) return { ok: false, reason: 'url_credentials_not_allowed' }
  if (!allowedHosts.some(host => hostMatches(url.hostname.toLowerCase(), host))) {
    return { ok: false, reason: 'target_host_not_allowed' }
  }

  url.hash = ''
  return {
    ok: true,
    url: url.toString(),
    origin: url.origin,
    hostname: url.hostname.toLowerCase(),
  }
}

function validateBaseEnvelope(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'request_required' }
  if (payload.version !== WORKER_POLICY_VERSION) return { ok: false, reason: 'unsupported_request_version' }

  const task = payload.task
  const policy = payload.policy
  if (!task || typeof task !== 'object') return { ok: false, reason: 'task_required' }
  if (!policy || typeof policy !== 'object') return { ok: false, reason: 'policy_required' }
  if (task.version !== 1) return { ok: false, reason: 'unsupported_task_version' }
  if (policy.navigationScope !== 'task_origin_only') return { ok: false, reason: 'origin_scope_required' }
  if (policy.pageContentTrust !== 'untrusted') return { ok: false, reason: 'page_content_must_be_untrusted' }

  const connectorId = clean(task.connectorId, 60)
  const target = validateTargetUrl(task.jobUrl, connectorId)
  if (!target.ok) return target

  return {
    ok: true,
    requestId: clean(payload.requestId, 120) || null,
    connectorId,
    target,
    task,
    policy,
  }
}

export function validateInspectRequest(payload) {
  const base = validateBaseEnvelope(payload)
  if (!base.ok) return base

  if (base.task.action !== 'inspect_form') return { ok: false, reason: 'inspection_only' }
  if (base.task.approvalScope !== 'inspect_only') return { ok: false, reason: 'inspection_scope_required' }
  if (base.policy.writesAllowed !== false) return { ok: false, reason: 'writes_must_be_disabled' }

  return {
    ok: true,
    requestId: base.requestId,
    connectorId: base.connectorId,
    target: base.target,
    task: {
      version: 1,
      connectorId: base.connectorId,
      action: 'inspect_form',
      approvalScope: 'inspect_only',
      jobUrl: base.target.url,
      jobId: base.task.jobId ? clean(base.task.jobId, 180) : null,
      evidenceSnapshotId: base.task.evidenceSnapshotId ? clean(base.task.evidenceSnapshotId, 180) : null,
    },
  }
}

export function validatePrefillRequest(payload) {
  const base = validateBaseEnvelope(payload)
  if (!base.ok) return base

  if (base.task.action !== 'prefill_application') return { ok: false, reason: 'prefill_only' }
  if (base.task.approvalScope !== 'prefill_only') return { ok: false, reason: 'prefill_scope_required' }
  if (base.policy.domWritesAllowed !== true) return { ok: false, reason: 'prefill_dom_writes_required' }
  if (base.policy.networkAfterPrefillAllowed !== false) return { ok: false, reason: 'prefill_network_must_be_frozen' }
  if (base.policy.submitAllowed !== false) return { ok: false, reason: 'submit_must_be_disabled' }

  const fields = validateApprovedPrefillFields(payload.approvedFields)
  if (!fields.ok) return { ok: false, reason: fields.reason }

  return {
    ok: true,
    requestId: base.requestId,
    connectorId: base.connectorId,
    target: base.target,
    task: {
      version: 1,
      connectorId: base.connectorId,
      action: 'prefill_application',
      approvalScope: 'prefill_only',
      jobUrl: base.target.url,
      jobId: base.task.jobId ? clean(base.task.jobId, 180) : null,
      evidenceSnapshotId: base.task.evidenceSnapshotId ? clean(base.task.evidenceSnapshotId, 180) : null,
    },
    approvedFields: fields.fields,
  }
}

export function isSameOrigin(left, right) {
  try {
    return new URL(left).origin === new URL(right).origin
  } catch {
    return false
  }
}
