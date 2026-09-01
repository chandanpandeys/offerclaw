import { APPROVAL_SCOPE, BROWSER_ACTION, createBrowserTask } from './browserTasks.js'
import { resolveConnector } from './connectors.js'
import { buildFormPlan } from './formPlanner.js'
import { prefillApprovalEntries } from './prefillContract.js'

export const LIVE_INSPECTION_CONNECTORS = Object.freeze(['greenhouse', 'lever', 'ashby'])
const LIVE_INSPECTION_SET = new Set(LIVE_INSPECTION_CONNECTORS)

function jobUrl(job = {}) {
  return String(job.url || job.applyUrl || '').trim()
}

export function inspectionEligibility(job = {}) {
  const url = jobUrl(job)
  if (!url) {
    return { eligible: false, reason: 'application_url_missing', connectorId: null, url: null }
  }

  const connector = resolveConnector({ url })
  if (!LIVE_INSPECTION_SET.has(connector.id)) {
    return {
      eligible: false,
      reason: 'connector_not_live_for_inspection',
      connectorId: connector.id,
      url,
    }
  }

  return {
    eligible: true,
    reason: 'inspection_available',
    connectorId: connector.id,
    connectorName: connector.name,
    url,
  }
}

export function createInspectionTaskForJob(job = {}) {
  const eligibility = inspectionEligibility(job)
  if (!eligibility.eligible) return { task: null, eligibility }

  return {
    eligibility,
    task: createBrowserTask({
      connectorId: eligibility.connectorId,
      action: BROWSER_ACTION.INSPECT_FORM,
      jobUrl: eligibility.url,
      jobId: job.id || null,
      evidenceSnapshotId: job.evidenceSnapshotId || null,
      approvalScope: APPROVAL_SCOPE.INSPECT_ONLY,
      requestedBy: 'user',
    }),
  }
}

export async function requestFormInspection(task, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('inspection_fetch_unavailable')

  const response = await fetchImpl('/api/browser/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ task }),
  })

  let body = {}
  try {
    body = await response.json()
  } catch {
    body = {}
  }

  if (!response.ok) {
    const error = new Error(String(body.error || 'browser_inspection_failed'))
    error.code = String(body.error || 'browser_inspection_failed')
    error.requestId = body.requestId || null
    throw error
  }

  if (!body.inspection || typeof body.inspection !== 'object') {
    const error = new Error('browser_inspection_invalid_response')
    error.code = 'browser_inspection_invalid_response'
    throw error
  }

  return {
    requestId: body.requestId || null,
    inspection: body.inspection,
  }
}

function profilePreferences(profile = {}) {
  const nested = profile.preferences && typeof profile.preferences === 'object'
    ? profile.preferences
    : {}

  return {
    ...nested,
    salaryExpectation: nested.salaryExpectation || profile.salaryExpectation || profile.salary || '',
    workAuthorization: nested.workAuthorization || profile.workAuthorization || '',
  }
}

export function buildInspectionReview(inspection, { profile = {}, job = {} } = {}) {
  const fields = Array.isArray(inspection?.fields) ? inspection.fields : []
  const plan = buildFormPlan(fields, {
    profile,
    preferences: profilePreferences(profile),
    evidenceSnapshotId: job.evidenceSnapshotId || null,
    resumeAssetId: profile.resumeAssetId || null,
  })

  return {
    version: 1,
    jobId: job.id || null,
    requestUrl: jobUrl(job) || null,
    inspectedUrl: inspection?.url || null,
    title: inspection?.title || null,
    connectorId: inspection?.connectorId || null,
    checkpoints: {
      captchaDetected: Boolean(inspection?.checkpoints?.captchaDetected),
      twoFactorDetected: Boolean(inspection?.checkpoints?.twoFactorDetected),
      loginRequired: Boolean(inspection?.checkpoints?.loginRequired),
    },
    metadata: {
      inspectedAt: inspection?.metadata?.inspectedAt || null,
      workerVersion: inspection?.metadata?.workerVersion || null,
      fieldCount: Number(inspection?.metadata?.fieldCount) || fields.length,
    },
    plan,
  }
}

function hasManualCheckpoint(review = {}) {
  return Boolean(
    review?.checkpoints?.captchaDetected
    || review?.checkpoints?.twoFactorDetected
    || review?.checkpoints?.loginRequired
  )
}

export function createPrefillTaskFromReview(job = {}, review = {}) {
  const eligibility = inspectionEligibility(job)
  if (!eligibility.eligible) {
    return { task: null, approvedFields: [], eligibility, reason: eligibility.reason }
  }
  if (review?.connectorId && review.connectorId !== eligibility.connectorId) {
    return { task: null, approvedFields: [], eligibility, reason: 'prefill_review_connector_mismatch' }
  }
  if (review?.requestUrl && new URL(review.requestUrl).origin !== new URL(eligibility.url).origin) {
    return { task: null, approvedFields: [], eligibility, reason: 'prefill_review_origin_mismatch' }
  }
  if (hasManualCheckpoint(review)) {
    return { task: null, approvedFields: [], eligibility, reason: 'prefill_manual_checkpoint_present' }
  }

  const approvedFields = prefillApprovalEntries(review?.plan)
  if (!approvedFields.length) {
    return { task: null, approvedFields: [], eligibility, reason: 'prefill_no_safe_fields' }
  }

  return {
    eligibility,
    approvedFields,
    reason: 'prefill_ready_for_confirmation',
    task: createBrowserTask({
      connectorId: eligibility.connectorId,
      action: BROWSER_ACTION.PREFILL_APPLICATION,
      jobUrl: eligibility.url,
      jobId: job.id || null,
      evidenceSnapshotId: job.evidenceSnapshotId || null,
      approvalScope: APPROVAL_SCOPE.PREFILL_ONLY,
      requestedBy: 'user',
    }),
  }
}

export async function requestSupervisedPrefill(task, approvedFields, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('prefill_fetch_unavailable')

  const response = await fetchImpl('/api/browser/prefill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ task, approvedFields }),
  })

  let body = {}
  try {
    body = await response.json()
  } catch {
    body = {}
  }

  if (!response.ok) {
    const error = new Error(String(body.error || 'browser_prefill_failed'))
    error.code = String(body.error || 'browser_prefill_failed')
    error.requestId = body.requestId || null
    throw error
  }

  if (!body.prefill || typeof body.prefill !== 'object') {
    const error = new Error('browser_prefill_invalid_response')
    error.code = 'browser_prefill_invalid_response'
    throw error
  }

  return {
    requestId: body.requestId || null,
    prefill: body.prefill,
  }
}

export function inspectionErrorMessage(error) {
  const code = String(error?.code || error?.message || '')
  const messages = {
    browser_worker_not_configured: 'Browser inspection is not configured on this deployment yet.',
    browser_worker_rate_limited: 'The browser worker is busy. Try the inspection again shortly.',
    browser_worker_unavailable: 'The browser worker could not be reached.',
    browser_worker_failed: 'The application page could not be inspected safely.',
    browser_worker_navigation_scope_violation: 'Inspection stopped because the page navigated outside the approved origin.',
    browser_inspection_invalid_response: 'The browser worker returned an invalid inspection result.',
  }
  return messages[code] || 'Application-form inspection failed. No form changes were made.'
}

export function prefillErrorMessage(error) {
  const code = String(error?.code || error?.message || '')
  const messages = {
    browser_worker_not_configured: 'Supervised prefill is not configured on this deployment yet.',
    browser_worker_rate_limited: 'The browser worker is busy. Try prefill again shortly.',
    browser_worker_unavailable: 'The browser worker could not be reached.',
    browser_worker_failed: 'The application page could not be prefilled safely.',
    browser_prefill_revalidation_failed: 'The live form changed or now requires a manual checkpoint. Inspect it again before prefilling.',
    browser_worker_navigation_scope_violation: 'Prefill stopped because the page navigated outside the approved origin.',
    browser_worker_prefill_policy_violation: 'Prefill stopped because the worker did not confirm the required network/submit safety policy.',
    browser_prefill_origin_rejected: 'Prefill was rejected by the same-origin safety check.',
    browser_prefill_invalid_response: 'The browser worker returned an invalid prefill result.',
  }
  return messages[code] || 'Supervised prefill failed. Final submission was not attempted.'
}
