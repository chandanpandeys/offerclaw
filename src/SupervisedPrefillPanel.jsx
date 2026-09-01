import { useEffect, useMemo, useRef, useState } from 'react'

import {
  cancelPrefillSession,
  createPrefillRequestForReview,
  prefillErrorMessage,
  requestSupervisedPrefill,
} from './browserReview'
import { useAgent } from './agentContext'
import {
  createSubmitApprovalForReview,
  readinessBlockerLabel,
  requestSupervisedSubmit,
  submitErrorMessage,
  submitReadinessForReview,
} from './supervisedSubmit'

function fieldLabels(fields) {
  return fields.map(field => field.label || field.key).filter(Boolean)
}

function outcomeLabel(outcome) {
  if (outcome?.confirmed) return 'Application submitted and confirmed'
  if (outcome?.attempted) return 'Submission attempted — confirmation unknown'
  return 'Submission blocked before network activity'
}

export default function SupervisedPrefillPanel({ job, review, addToast }) {
  const { recordSubmission, queueAction } = useAgent()
  const request = useMemo(() => createPrefillRequestForReview(job, review), [job, review])
  const reviewKey = useMemo(() => [
    review?.jobId || '',
    review?.requestUrl || '',
    review?.metadata?.inspectedAt || '',
  ].join('|'), [review])
  const [busy, setBusy] = useState(false)
  const [busyMode, setBusyMode] = useState(null)
  const [result, setResult] = useState(null)
  const [submitRecord, setSubmitRecord] = useState(null)
  const sessionIdRef = useRef(null)
  const submitOutcome = submitRecord?.reviewKey === reviewKey ? submitRecord.outcome : null

  useEffect(() => () => {
    const sessionId = sessionIdRef.current
    sessionIdRef.current = null
    if (sessionId) void cancelPrefillSession(sessionId).catch(() => {})
  }, [])

  const cancelSession = async ({ quiet = false } = {}) => {
    const sessionId = sessionIdRef.current || result?.session?.id
    sessionIdRef.current = null
    setResult(null)
    if (!sessionId) return
    try {
      await cancelPrefillSession(sessionId)
      if (!quiet) addToast?.('Frozen application session closed', 'info')
    } catch {
      if (!quiet) addToast?.('The retained session could not be closed immediately; it will expire automatically.', 'error')
    }
  }

  const runPrefill = async () => {
    if (!request.eligible || busy) return

    const labels = fieldLabels(request.approvedFields)
    const preview = labels.slice(0, 6).join(', ')
    const more = labels.length > 6 ? ` + ${labels.length - 6} more` : ''
    const confirmed = globalThis.confirm?.(
      `Prefill ${labels.length} reviewed field${labels.length === 1 ? '' : 's'} in an isolated frozen browser session?\n\n${preview}${more}\n\nOnly direct profile-backed fields are sent. Networking is frozen before values are written. You will review a screenshot before any submission approval is available.`,
    )
    if (confirmed === false) return

    if (sessionIdRef.current) await cancelSession({ quiet: true })
    setSubmitRecord(null)
    setBusy(true)
    setBusyMode('prefill')
    try {
      const response = await requestSupervisedPrefill(request.task, request.approvedFields)
      sessionIdRef.current = response.prefill.session.id
      setResult(response.prefill)
      addToast?.(`Prefilled ${response.prefill.metadata?.filledCount || 0} reviewed fields in a frozen session`, 'success')
    } catch (error) {
      addToast?.(prefillErrorMessage(error), 'error')
    } finally {
      setBusy(false)
      setBusyMode(null)
    }
  }

  const runSubmit = async () => {
    if (!result?.session || busy) return

    let approvalBundle
    try {
      approvalBundle = createSubmitApprovalForReview(job, review, result, new Date())
    } catch (error) {
      addToast?.(submitErrorMessage(error), 'error')
      return
    }

    const confirmed = globalThis.confirm?.(
      `Submit this application once to ${job.company || 'the employer'}?\n\nRole: ${job.title || 'selected role'}\nConnector: ${approvalBundle.readiness.connectorId}\n\nOfferClaw will use the frozen reviewed form, permit only connector-scoped submission traffic, click one submit control once, never automatically retry, and destroy the retained browser session after any submission attempt.`,
    )
    if (confirmed === false) return

    setBusy(true)
    setBusyMode('submit')
    try {
      const response = await requestSupervisedSubmit(approvalBundle.approval)
      const outcome = response.outcome
      setSubmitRecord({ reviewKey, outcome })

      if (outcome.sessionClosed) {
        sessionIdRef.current = null
        setResult(null)
      } else {
        await cancelSession({ quiet: true })
      }

      recordSubmission?.(job, outcome)
      queueAction?.({
        type: 'submit_application',
        action: 'submit_application',
        status: outcome.confirmed ? 'completed' : outcome.attempted ? 'needs_review' : 'blocked',
        jobId: job.id || null,
        connectorId: outcome.connectorId || approvalBundle.readiness.connectorId,
        approvalScope: 'submit_once',
        result: {
          status: outcome.status,
          attempted: Boolean(outcome.attempted),
          confirmed: Boolean(outcome.confirmed),
          confirmationSignal: outcome.confirmationSignal || null,
          completedAt: outcome.completedAt || new Date().toISOString(),
        },
      })

      if (outcome.confirmed) {
        addToast?.('Application submitted once and confirmation detected. Tracker updated.', 'success')
      } else if (outcome.attempted) {
        addToast?.('Submission was attempted once but confirmation is uncertain. OfferClaw will not retry automatically.', 'error')
      } else {
        addToast?.('Submission was blocked before network activity. Re-inspect the form before trying again.', 'error')
      }
    } catch (error) {
      addToast?.(submitErrorMessage(error), 'error')
    } finally {
      setBusy(false)
      setBusyMode(null)
    }
  }

  if (submitOutcome) {
    return (
      <div style={{ marginTop: 10, border: '1px solid var(--border)', padding: 9, background: 'var(--bg-2)' }}>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          <strong style={{ flex: 1, fontSize: 10 }}>{outcomeLabel(submitOutcome)}</strong>
          <span className={`badge ${submitOutcome.confirmed ? '' : 'badge-yellow'}`}>{submitOutcome.status}</span>
        </div>
        <div className="text-muted" style={{ fontSize: 8.5, lineHeight: 1.55, marginTop: 6 }}>
          {submitOutcome.confirmed
            ? 'OfferClaw recorded this job as applied using bounded local outcome evidence.'
            : submitOutcome.attempted
              ? 'The retained browser session was consumed. Verify the employer/ATS state manually before considering another application attempt.'
              : 'No application request was sent. The retained session was closed by the UI; re-inspect the live form before a new approval.'}
        </div>
        {submitOutcome.confirmationSignal && <div className="text-muted" style={{ fontSize: 8.5, marginTop: 5 }}>Confirmation signal: {submitOutcome.confirmationSignal}</div>}
        {submitOutcome.network?.lastPostStatus && <div className="text-muted" style={{ fontSize: 8.5, marginTop: 3 }}>Last application POST status: {submitOutcome.network.lastPostStatus}</div>}
        {Array.isArray(submitOutcome.blockers) && submitOutcome.blockers.length > 0 && (
          <div style={{ marginTop: 7 }}>
            {submitOutcome.blockers.slice(0, 5).map((blocker, index) => (
              <div key={`${blocker.code}-${index}`} className="text-muted" style={{ fontSize: 8.25, lineHeight: 1.45 }}>• {readinessBlockerLabel(blocker)}</div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (!request.eligible) {
    return (
      <div className="text-muted text-xs" style={{ marginTop: 8, lineHeight: 1.55 }}>
        Supervised prefill unavailable: {String(request.reason || 'no safe evidence-backed fields').replaceAll('_', ' ')}.
      </div>
    )
  }

  if (result?.session && result?.preview) {
    const expires = new Date(result.session.expiresAt)
    const readiness = submitReadinessForReview(job, review, result, new Date())
    return (
      <div style={{ marginTop: 10, border: '1px solid var(--border)', padding: 9, background: 'var(--bg-2)' }}>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          <strong style={{ flex: 1, fontSize: 10 }}>Frozen prefill review</strong>
          <span className={`badge ${readiness.ready ? '' : 'badge-yellow'}`}>{readiness.ready ? 'READY FOR APPROVAL' : 'SUBMIT BLOCKED'}</span>
        </div>
        <div className="text-muted" style={{ fontSize: 8.5, lineHeight: 1.5, marginTop: 5 }}>
          {result.metadata?.filledCount || 0} filled · {result.metadata?.rejectedCount || 0} rejected · browser offline · networking frozen · expires {Number.isFinite(expires.getTime()) ? expires.toLocaleTimeString() : 'soon'}
        </div>
        <img
          src={`data:${result.preview.mimeType};base64,${result.preview.base64}`}
          alt="Frozen screenshot preview of the prefilled application form"
          style={{ width: '100%', height: 'auto', display: 'block', marginTop: 8, border: '1px solid var(--border)' }}
        />
        <div className="text-muted" style={{ fontSize: 8.5, lineHeight: 1.5, marginTop: 7 }}>
          Review this screenshot carefully. It can contain your approved candidate data and exists only in this in-memory panel. It is never added to the tracker, scout storage, analytics, or application history.
        </div>
        {!readiness.ready && (
          <div style={{ marginTop: 7 }}>
            {readiness.blockers.slice(0, 6).map((blocker, index) => (
              <div key={`${blocker.code}-${index}`} className="text-muted" style={{ fontSize: 8.25, lineHeight: 1.45 }}>• {readinessBlockerLabel(blocker)}</div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {readiness.ready && (
            <button type="button" className="btn btn-primary" onClick={runSubmit} disabled={busy}>
              {busyMode === 'submit' ? 'Submitting once…' : 'Approve & submit once'}
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => cancelSession()} disabled={busy}>Cancel & destroy session</button>
        </div>
        {readiness.ready && (
          <div className="text-muted" style={{ fontSize: 8.25, lineHeight: 1.5, marginTop: 7 }}>
            Final submission always requires this separate confirmation. OfferClaw performs one submit action and never automatically retries an uncertain result.
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ marginTop: 9, borderTop: '1px solid var(--border)', paddingTop: 9 }}>
      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div className="field-label">Supervised prefill</div>
          <div className="text-muted" style={{ fontSize: 8.5, lineHeight: 1.5, marginTop: 4 }}>
            {request.approvedFields.length} direct profile-backed field{request.approvedFields.length === 1 ? '' : 's'} eligible. Salary, authorization, screening, consent, demographics, CAPTCHA/2FA and file uploads are excluded.
          </div>
        </div>
        <span className="badge badge-yellow">REVIEW FIRST</span>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 7 }}>
        {fieldLabels(request.approvedFields).slice(0, 8).map(label => <span key={label} className="badge">{label}</span>)}
        {request.approvedFields.length > 8 && <span className="badge">+{request.approvedFields.length - 8}</span>}
      </div>
      <button type="button" className="btn btn-primary" onClick={runPrefill} disabled={busy} style={{ marginTop: 8 }}>
        {busyMode === 'prefill' ? 'Creating frozen review…' : 'Review & prefill safe fields'}
      </button>
    </div>
  )
}
