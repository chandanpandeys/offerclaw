import { BROWSER_ACTION, APPROVAL_SCOPE, validateBrowserTask } from '../../src/browserTasks.js'
import { validateApprovedPrefillFields } from '../../src/prefillContract.js'

const MAX_FIELDS = 120
const MAX_OPTIONS = 80
const WORKER_PREFILL_CONNECTORS = Object.freeze(new Set(['greenhouse', 'lever', 'ashby']))

function clean(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function secureWorkerBaseUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return null
    url.username = ''
    url.password = ''
    url.hash = ''
    url.search = ''
    url.pathname = url.pathname.replace(/\/+$/, '')
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export function getBrowserWorkerConfig(env = {}) {
  const baseUrl = secureWorkerBaseUrl(env.BROWSER_WORKER_URL)
  const token = String(env.BROWSER_WORKER_TOKEN || '').trim()
  return {
    configured: Boolean(baseUrl && token),
    baseUrl,
    token: token || null,
    timeoutMs: Math.min(30_000, Math.max(5_000, Number(env.BROWSER_WORKER_TIMEOUT_MS) || 20_000)),
  }
}

export function publicBrowserWorkerRuntime(config) {
  return {
    configured: Boolean(config?.configured),
    mode: 'inspection_and_supervised_prefill',
    taskVersion: 1,
    pageContentTrust: 'untrusted',
    prefillAllowed: true,
    submitAllowed: false,
  }
}

export function validateInspectionTask(task) {
  const validation = validateBrowserTask(task)
  if (validation.decision !== 'allow') return validation
  if (task.action !== BROWSER_ACTION.INSPECT_FORM) {
    return { decision: 'block', reason: 'inspection_endpoint_action_mismatch' }
  }
  if (task.approvalScope !== APPROVAL_SCOPE.INSPECT_ONLY) {
    return { decision: 'block', reason: 'inspection_endpoint_scope_mismatch' }
  }
  return validation
}

export function validatePrefillTask(task, approvedFields) {
  const validation = validateBrowserTask(task)
  if (validation.decision !== 'allow') return { ...validation, fields: [] }
  if (task.action !== BROWSER_ACTION.PREFILL_APPLICATION) {
    return { decision: 'block', reason: 'prefill_endpoint_action_mismatch', fields: [] }
  }
  if (task.approvalScope !== APPROVAL_SCOPE.PREFILL_ONLY) {
    return { decision: 'block', reason: 'prefill_endpoint_scope_mismatch', fields: [] }
  }
  if (!WORKER_PREFILL_CONNECTORS.has(task.connectorId)) {
    return { decision: 'block', reason: 'prefill_connector_not_enabled', fields: [] }
  }

  const fieldValidation = validateApprovedPrefillFields(approvedFields)
  if (!fieldValidation.ok) {
    return { decision: 'block', reason: fieldValidation.reason, fields: [] }
  }

  return {
    ...validation,
    fields: fieldValidation.fields,
  }
}

function normalizeOptions(options) {
  if (!Array.isArray(options)) return []
  return options.slice(0, MAX_OPTIONS).map(option => {
    if (option && typeof option === 'object') {
      return {
        value: clean(option.value, 240),
        label: clean(option.label ?? option.text ?? option.value, 240),
      }
    }
    const text = clean(option, 240)
    return { value: text, label: text }
  })
}

function normalizeField(field, index) {
  return {
    index,
    id: clean(field?.id, 180) || null,
    name: clean(field?.name, 180) || null,
    label: clean(field?.label, 500) || null,
    type: clean(field?.type, 80) || 'unknown',
    placeholder: clean(field?.placeholder, 300) || null,
    autocomplete: clean(field?.autocomplete, 120) || null,
    required: Boolean(field?.required),
    disabled: Boolean(field?.disabled),
    readonly: Boolean(field?.readonly),
    options: normalizeOptions(field?.options),
  }
}

export function normalizeInspectionResult(payload) {
  const fields = Array.isArray(payload?.fields)
    ? payload.fields.slice(0, MAX_FIELDS).map(normalizeField)
    : []

  return {
    version: 1,
    pageContentTrust: 'untrusted',
    url: clean(payload?.url, 2_000) || null,
    title: clean(payload?.title, 300) || null,
    connectorId: clean(payload?.connectorId, 60) || null,
    fields,
    checkpoints: {
      captchaDetected: Boolean(payload?.checkpoints?.captchaDetected),
      twoFactorDetected: Boolean(payload?.checkpoints?.twoFactorDetected),
      loginRequired: Boolean(payload?.checkpoints?.loginRequired),
    },
    metadata: {
      fieldCount: fields.length,
      inspectedAt: clean(payload?.metadata?.inspectedAt, 80) || null,
      workerVersion: clean(payload?.metadata?.workerVersion, 80) || null,
    },
  }
}

function normalizePrefillField(field) {
  const status = ['filled', 'rejected', 'skipped'].includes(field?.status) ? field.status : 'rejected'
  return {
    key: clean(field?.key, 180) || null,
    status,
    kind: clean(field?.kind, 60) || null,
    inputType: clean(field?.inputType, 60) || null,
    evidenceSource: clean(field?.evidenceSource, 120) || null,
    reason: clean(field?.reason, 180) || null,
  }
}

export function normalizePrefillResult(payload) {
  const fields = Array.isArray(payload?.fields)
    ? payload.fields.slice(0, 40).map(normalizePrefillField)
    : []

  return {
    version: 1,
    pageContentTrust: 'untrusted',
    url: clean(payload?.url, 2_000) || null,
    connectorId: clean(payload?.connectorId, 60) || null,
    fields,
    checkpoints: {
      captchaDetected: Boolean(payload?.checkpoints?.captchaDetected),
      twoFactorDetected: Boolean(payload?.checkpoints?.twoFactorDetected),
      loginRequired: Boolean(payload?.checkpoints?.loginRequired),
    },
    metadata: {
      filledCount: Number.isInteger(Number(payload?.metadata?.filledCount)) ? Number(payload.metadata.filledCount) : 0,
      rejectedCount: Number.isInteger(Number(payload?.metadata?.rejectedCount)) ? Number(payload.metadata.rejectedCount) : 0,
      networkFrozen: Boolean(payload?.metadata?.networkFrozen),
      submitAttempted: Boolean(payload?.metadata?.submitAttempted),
      workerVersion: clean(payload?.metadata?.workerVersion, 80) || null,
    },
  }
}

export function buildWorkerInspectRequest(task, requestId) {
  return {
    version: 1,
    requestId: clean(requestId, 120),
    task: {
      version: task.version,
      connectorId: task.connectorId,
      action: BROWSER_ACTION.INSPECT_FORM,
      jobUrl: task.jobUrl,
      jobId: task.jobId || null,
      evidenceSnapshotId: task.evidenceSnapshotId || null,
      approvalScope: APPROVAL_SCOPE.INSPECT_ONLY,
      requestedBy: task.requestedBy || 'user',
    },
    policy: {
      pageContentTrust: 'untrusted',
      writesAllowed: false,
      navigationScope: 'task_origin_only',
    },
  }
}

export function buildWorkerPrefillRequest(task, approvedFields, requestId) {
  const validation = validatePrefillTask(task, approvedFields)
  if (validation.decision !== 'allow') throw new Error(validation.reason || 'invalid_prefill_task')

  return {
    version: 1,
    requestId: clean(requestId, 120),
    task: {
      version: task.version,
      connectorId: task.connectorId,
      action: BROWSER_ACTION.PREFILL_APPLICATION,
      jobUrl: task.jobUrl,
      jobId: task.jobId || null,
      evidenceSnapshotId: task.evidenceSnapshotId || null,
      approvalScope: APPROVAL_SCOPE.PREFILL_ONLY,
      requestedBy: task.requestedBy || 'user',
    },
    approvedFields: validation.fields,
    policy: {
      pageContentTrust: 'untrusted',
      domWritesAllowed: true,
      networkAfterPrefillAllowed: false,
      submitAllowed: false,
      navigationScope: 'task_origin_only',
    },
  }
}
