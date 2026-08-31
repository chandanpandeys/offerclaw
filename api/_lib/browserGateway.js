import { BROWSER_ACTION, APPROVAL_SCOPE, validateBrowserTask } from '../../src/browserTasks.js'

const MAX_FIELDS = 120
const MAX_OPTIONS = 80

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
    mode: 'inspection_only',
    taskVersion: 1,
    pageContentTrust: 'untrusted',
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
