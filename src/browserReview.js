import { APPROVAL_SCOPE, BROWSER_ACTION, createBrowserTask } from './browserTasks.js'
import { resolveConnector } from './connectors.js'
import { buildFormPlan } from './formPlanner.js'

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

  // Resolve from the destination itself instead of trusting feed-provided connector metadata.
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
