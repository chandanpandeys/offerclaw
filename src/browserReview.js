import { APPROVAL_SCOPE, BROWSER_ACTION, createBrowserTask } from './browserTasks.js'
import { resolveConnector } from './connectors.js'
import { buildFormPlan } from './formPlanner.js'
import { prefillApprovalEntries, validateApprovedPrefillFields } from './prefillContract.js'

export const LIVE_INSPECTION_CONNECTORS = Object.freeze(['greenhouse', 'lever', 'ashby'])
const LIVE_INSPECTION_SET = new Set(LIVE_INSPECTION_CONNECTORS)

function jobUrl(job = {}) {
  return String(job.url || job.applyUrl || '').trim()
}

async function readBody(response) {
  try { return await response.json() } catch { return {} }
}

function apiError(body, fallback) {
  const code = String(body?.error || fallback)
  const error = new Error(code)
  error.code = code
  error.requestId = body?.requestId || null
  return error
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
    body: JSON.stringify({ task }),
  })
  const body = await readBody(response)
  if (!response.ok) throw apiError(body, 'browser_inspection_failed')
  if (!body.inspection || typeof body.inspection !== 'object') throw apiError({}, 'browser_inspection_invalid_response')

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

export function createPrefillRequestForReview(job = {}, review = {}) {
  const eligibility = inspectionEligibility(job)
  if (!eligibility.eligible) return { eligible: false, reason: eligibility.reason, task: null, approvedFields: [] }
  if (!review || review.jobId !== (job.id || null)) {
    return { eligible: false, reason: 'prefill_review_job_mismatch', task: null, approvedFields: [] }
  }
  if (review.connectorId && review.connectorId !== eligibility.connectorId) {
    return { eligible: false, reason: 'prefill_review_connector_mismatch', task: null, approvedFields: [] }
  }
  if (review.requestUrl && review.requestUrl !== eligibility.url) {
    return { eligible: false, reason: 'prefill_review_url_mismatch', task: null, approvedFields: [] }
  }
  if (Object.values(review.checkpoints || {}).some(Boolean)) {
    return { eligible: false, reason: 'prefill_manual_checkpoint_required', task: null, approvedFields: [] }
  }

  const approvedFields = prefillApprovalEntries(review.plan)
  const fieldValidation = validateApprovedPrefillFields(approvedFields)
  if (!fieldValidation.ok) {
    return { eligible: false, reason: fieldValidation.reason, task: null, approvedFields: [] }
  }

  return {
    eligible: true,
    reason: 'supervised_prefill_available',
    approvedFields: fieldValidation.fields,
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
    body: JSON.stringify({ task, approvedFields }),
  })
  const body = await readBody(response)
  if (!response.ok) throw apiError(body, 'browser_prefill_failed')
  if (!body.prefill?.session || !body.prefill?.preview) throw apiError({}, 'browser_prefill_review_missing')
  return { requestId: body.requestId || null, prefill: body.prefill }
}

export async function cancelPrefillSession(sessionId, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('prefill_fetch_unavailable')
  const response = await fetchImpl('/api/browser/prefill-session', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  })
  const body = await readBody(response)
  if (!response.ok && response.status !== 404) throw apiError(body, 'browser_prefill_cancel_failed')
  return { closed: Boolean(body.closed), alreadyGone: response.status === 404 }
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
    browser_prefill_revalidation_failed: 'The live form changed or now needs manual review. Re-inspect before prefilling.',
    browser_worker_navigation_scope_violation: 'Prefill stopped because the page left the approved origin.',
    browser_worker_prefill_policy_violation: 'Prefill stopped because the worker did not preserve the required network freeze.',
    browser_worker_prefill_review_missing: 'Prefill stopped because a reviewable frozen session could not be created.',
  }
  return messages[code] || 'Supervised prefill failed. No application was submitted.'
}
