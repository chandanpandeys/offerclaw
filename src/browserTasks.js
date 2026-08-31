import { ACTION, CONNECTORS, hostnameFromUrl, resolveConnector } from './connectors.js'

export const BROWSER_TASK_VERSION = 1

export const BROWSER_ACTION = Object.freeze({
  INSPECT_FORM: 'inspect_form',
  PREFILL_APPLICATION: 'prefill_application',
  SUBMIT_APPLICATION: 'submit_application',
})

export const APPROVAL_SCOPE = Object.freeze({
  INSPECT_ONLY: 'inspect_only',
  PREFILL_ONLY: 'prefill_only',
  SUBMIT_ONCE: 'submit_once',
})

export const BROWSER_DECISION = Object.freeze({
  ALLOW: 'allow',
  BLOCK: 'block',
})

export const BROWSER_WRITE_CONNECTORS = Object.freeze(new Set([
  'greenhouse',
  'lever',
  'ashby',
  'workday',
  'smartrecruiters',
  'workable',
  'jobvite',
  'icims',
  'bamboohr',
  'employer_site',
]))

const ACTION_TO_SCOPE = Object.freeze({
  [BROWSER_ACTION.INSPECT_FORM]: APPROVAL_SCOPE.INSPECT_ONLY,
  [BROWSER_ACTION.PREFILL_APPLICATION]: APPROVAL_SCOPE.PREFILL_ONLY,
  [BROWSER_ACTION.SUBMIT_APPLICATION]: APPROVAL_SCOPE.SUBMIT_ONCE,
})

const SCOPE_LEVEL = Object.freeze({
  [APPROVAL_SCOPE.INSPECT_ONLY]: 1,
  [APPROVAL_SCOPE.PREFILL_ONLY]: 2,
  [APPROVAL_SCOPE.SUBMIT_ONCE]: 3,
})

function cleanText(value, max = 240) {
  return String(value || '').trim().slice(0, max)
}

function isHttps(url) {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

function scopeAllows(scope, action) {
  const required = ACTION_TO_SCOPE[action]
  return Boolean(required && SCOPE_LEVEL[scope] >= SCOPE_LEVEL[required])
}

function allowedConnectorForAction(connectorId, action) {
  if (action === BROWSER_ACTION.INSPECT_FORM) {
    return BROWSER_WRITE_CONNECTORS.has(connectorId)
  }
  return BROWSER_WRITE_CONNECTORS.has(connectorId)
}

export function browserActionToConnectorAction(action) {
  if (action === BROWSER_ACTION.PREFILL_APPLICATION) return ACTION.PREFILL_APPLICATION
  if (action === BROWSER_ACTION.SUBMIT_APPLICATION) return ACTION.SUBMIT_APPLICATION
  if (action === BROWSER_ACTION.INSPECT_FORM) return ACTION.READ_JOB
  return null
}

export function createBrowserTask({
  connectorId,
  action = BROWSER_ACTION.INSPECT_FORM,
  jobUrl,
  jobId = null,
  evidenceSnapshotId = null,
  approvalScope = APPROVAL_SCOPE.INSPECT_ONLY,
  requestedBy = 'user',
} = {}) {
  return {
    version: BROWSER_TASK_VERSION,
    connectorId: cleanText(connectorId, 60),
    action,
    jobUrl: cleanText(jobUrl, 2_000),
    jobId: jobId ? cleanText(jobId, 180) : null,
    evidenceSnapshotId: evidenceSnapshotId ? cleanText(evidenceSnapshotId, 180) : null,
    approvalScope,
    requestedBy: cleanText(requestedBy, 40) || 'user',
    createdAt: new Date().toISOString(),
  }
}

export function validateBrowserTask(task) {
  if (!task || typeof task !== 'object') {
    return { decision: BROWSER_DECISION.BLOCK, reason: 'browser_task_required' }
  }

  if (task.version !== BROWSER_TASK_VERSION) {
    return { decision: BROWSER_DECISION.BLOCK, reason: 'unsupported_browser_task_version' }
  }

  if (!Object.values(BROWSER_ACTION).includes(task.action)) {
    return { decision: BROWSER_DECISION.BLOCK, reason: 'unsupported_browser_action' }
  }

  if (!Object.values(APPROVAL_SCOPE).includes(task.approvalScope)) {
    return { decision: BROWSER_DECISION.BLOCK, reason: 'invalid_approval_scope' }
  }

  if (!scopeAllows(task.approvalScope, task.action)) {
    return { decision: BROWSER_DECISION.BLOCK, reason: 'approval_scope_too_narrow' }
  }

  if (!isHttps(task.jobUrl)) {
    return { decision: BROWSER_DECISION.BLOCK, reason: 'https_required' }
  }

  const declared = CONNECTORS[task.connectorId]
  if (!declared) {
    return { decision: BROWSER_DECISION.BLOCK, reason: 'unknown_connector' }
  }

  if (!allowedConnectorForAction(task.connectorId, task.action)) {
    return { decision: BROWSER_DECISION.BLOCK, reason: 'connector_not_browser_write_allowed' }
  }

  const resolved = resolveConnector({ url: task.jobUrl })
  if (resolved.id !== task.connectorId) {
    return {
      decision: BROWSER_DECISION.BLOCK,
      reason: 'connector_destination_mismatch',
      resolvedConnectorId: resolved.id,
    }
  }

  const hostname = hostnameFromUrl(task.jobUrl)
  if (!hostname) {
    return { decision: BROWSER_DECISION.BLOCK, reason: 'invalid_job_url' }
  }

  if (task.connectorId === 'linkedin' || task.connectorId === 'demo' || task.connectorId === 'unknown') {
    return { decision: BROWSER_DECISION.BLOCK, reason: 'connector_explicitly_blocked' }
  }

  return {
    decision: BROWSER_DECISION.ALLOW,
    reason: 'browser_task_valid',
    connectorId: task.connectorId,
    hostname,
    requiredScope: ACTION_TO_SCOPE[task.action],
  }
}

export function browserTaskPublicSummary(task) {
  const validation = validateBrowserTask(task)
  return {
    version: task?.version || null,
    connectorId: task?.connectorId || null,
    action: task?.action || null,
    approvalScope: task?.approvalScope || null,
    jobId: task?.jobId || null,
    evidenceSnapshotId: task?.evidenceSnapshotId || null,
    validation,
  }
}
