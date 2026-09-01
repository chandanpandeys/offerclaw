import { connectorSnapshot } from './connectors.js'
import { snapshotJobEvidence } from './evals.js'
import { buildSourceIntel } from './sourceIntel.js'

const ALLOWED_STATUS = new Set([
  'blocked_pre_submit',
  'submit_control_failed',
  'not_attempted',
  'submitted_confirmed',
  'submitted_likely',
  'attempted_unconfirmed',
  'attempted_failed',
])

function text(value, max = 2_000) {
  return String(value || '').trim().slice(0, max)
}

function iso(value, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(value || fallback)
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(fallback).toISOString()
}

function boundedCount(value, max) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(max, Math.trunc(number))) : 0
}

export function boundedSubmissionOutcome(outcome = {}, now = new Date()) {
  const status = ALLOWED_STATUS.has(outcome.status) ? outcome.status : 'attempted_unconfirmed'
  return {
    version: 1,
    status,
    attempted: Boolean(outcome.attempted),
    confirmed: Boolean(outcome.confirmed),
    connectorId: text(outcome.connectorId, 60) || null,
    finalUrl: text(outcome.finalUrl, 2_000) || null,
    confirmationSignal: text(outcome.confirmationSignal, 80) || null,
    blockers: (Array.isArray(outcome.blockers) ? outcome.blockers : []).slice(0, 12).map(item => ({
      code: text(item?.code, 120) || 'submit_blocked',
      detail: text(item?.detail, 180) || null,
    })),
    network: {
      postRequestCount: boundedCount(outcome?.network?.postRequestCount, 20),
      navigationRequestCount: boundedCount(outcome?.network?.navigationRequestCount, 20),
      blockedRequestCount: boundedCount(outcome?.network?.blockedRequestCount, 200),
      lastPostStatus: Number.isInteger(Number(outcome?.network?.lastPostStatus))
        ? Math.max(100, Math.min(599, Number(outcome.network.lastPostStatus)))
        : null,
    },
    sessionClosed: Boolean(outcome.sessionClosed),
    completedAt: iso(outcome.completedAt, now),
  }
}

function sameApplication(item, job) {
  const jobUrl = text(job?.url || job?.applyUrl, 2_000)
  if (jobUrl && item?.url === jobUrl) return true
  return Boolean(
    text(item?.jobTitle, 240)
    && text(item?.company, 240)
    && text(item.jobTitle, 240) === text(job?.title, 240)
    && text(item.company, 240) === text(job?.company, 240)
  )
}

export function recordSubmissionInTracker(tracker, job, outcome, {
  now = new Date(),
  idFactory = () => globalThis.crypto?.randomUUID?.() || `submission-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
} = {}) {
  const previous = Array.isArray(tracker) ? tracker : []
  const evidence = boundedSubmissionOutcome(outcome, now)
  const at = evidence.completedAt
  const nextStatus = evidence.confirmed ? 'applied' : evidence.attempted ? 'submission_unknown' : 'needs_review'
  const index = previous.findIndex(item => sameApplication(item, job))

  if (index >= 0) {
    const current = previous[index]
    const history = Array.isArray(current.statusHistory) ? current.statusHistory.slice(0, 40) : []
    if (current.status !== nextStatus) history.push({ status: nextStatus, at })
    const updated = {
      ...current,
      status: nextStatus,
      statusUpdatedAt: at,
      appliedAt: evidence.confirmed ? (current.appliedAt || at) : current.appliedAt || null,
      statusHistory: history.slice(-40),
      submissionOutcome: evidence,
    }
    return [updated, ...previous.filter((_, itemIndex) => itemIndex !== index)]
  }

  const entry = {
    id: text(idFactory(), 180),
    jobTitle: text(job?.title, 240) || 'Untitled role',
    company: text(job?.company, 240) || 'Unknown company',
    appliedAt: evidence.confirmed ? at : null,
    status: nextStatus,
    statusUpdatedAt: at,
    statusHistory: [{ status: nextStatus, at }],
    followUpDay3: null,
    followUpDay5: null,
    url: text(job?.url || job?.applyUrl, 2_000) || null,
    dataSource: text(job?.dataSource, 80) || 'unknown',
    connector: connectorSnapshot(job || {}),
    sourceIntel: buildSourceIntel(job || {}),
    evidence: snapshotJobEvidence(job || {}),
    packageSnapshot: null,
    packageEvaluation: null,
    submissionOutcome: evidence,
  }

  return [entry, ...previous]
}
