import { mergeScoutStates, normalizeScoutState } from './scoutState.js'

async function readJson(response) {
  try { return await response.json() } catch { return {} }
}

function cloudError(code, details = {}) {
  const error = new Error(code || 'scout_cloud_error')
  error.code = code || 'scout_cloud_error'
  Object.assign(error, details)
  return error
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  const data = await readJson(response)
  if (!response.ok) {
    throw cloudError(data?.error || `HTTP_${response.status}`, {
      status: response.status,
      currentRevision: data?.currentRevision,
    })
  }
  return data
}

export function getDeviceSession() {
  return requestJson('/api/identity/session')
}

export function ensureDeviceSession() {
  return requestJson('/api/identity/session', { method: 'POST' })
}

export function loadScoutCloudState() {
  return requestJson('/api/scout/state')
}

export function saveScoutCloudState(state, expectedRevision) {
  return requestJson('/api/scout/state', {
    method: 'PUT',
    body: JSON.stringify({
      expectedRevision,
      state: normalizeScoutState(state),
    }),
  })
}

export function deleteScoutCloudState() {
  return requestJson('/api/scout/state', { method: 'DELETE' })
}

export async function syncScoutCloudState(localState) {
  await ensureDeviceSession()
  let remote = await loadScoutCloudState()
  let merged = mergeScoutStates(localState, remote.state || {})

  try {
    const saved = await saveScoutCloudState(merged, remote.revision || 0)
    return { ...saved, merged: saved.state, conflictResolved: false }
  } catch (error) {
    if (error?.code !== 'scout_state_revision_conflict') throw error

    remote = await loadScoutCloudState()
    merged = mergeScoutStates(localState, remote.state || {})
    const saved = await saveScoutCloudState(merged, remote.revision || 0)
    return { ...saved, merged: saved.state, conflictResolved: true }
  }
}
