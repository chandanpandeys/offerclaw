import { useEffect, useMemo, useRef, useState } from 'react'

import {
  cancelPrefillSession,
  createPrefillRequestForReview,
  prefillErrorMessage,
  requestSupervisedPrefill,
} from './browserReview'

function fieldLabels(fields) {
  return fields.map(field => field.label || field.key).filter(Boolean)
}

export default function SupervisedPrefillPanel({ job, review, addToast }) {
  const request = useMemo(() => createPrefillRequestForReview(job, review), [job, review])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const sessionIdRef = useRef(null)

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
      if (!quiet) addToast?.('Frozen prefill session closed', 'info')
    } catch {
      if (!quiet) addToast?.('The prefill session could not be closed immediately; it will expire automatically.', 'error')
    }
  }

  const runPrefill = async () => {
    if (!request.eligible || busy) return

    const labels = fieldLabels(request.approvedFields)
    const preview = labels.slice(0, 6).join(', ')
    const more = labels.length > 6 ? ` + ${labels.length - 6} more` : ''
    const confirmed = globalThis.confirm?.(
      `Prefill ${labels.length} reviewed field${labels.length === 1 ? '' : 's'} in an isolated frozen browser session?\n\n${preview}${more}\n\nOnly direct profile-backed fields are sent. Networking is frozen before values are written. The application will NOT be submitted.`,
    )
    if (confirmed === false) return

    if (sessionIdRef.current) await cancelSession({ quiet: true })
    setBusy(true)
    try {
      const response = await requestSupervisedPrefill(request.task, request.approvedFields)
      sessionIdRef.current = response.prefill.session.id
      setResult(response.prefill)
      addToast?.(`Prefilled ${response.prefill.metadata?.filledCount || 0} reviewed fields; submission remains disabled`, 'success')
    } catch (error) {
      addToast?.(prefillErrorMessage(error), 'error')
    } finally {
      setBusy(false)
    }
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
    return (
      <div style={{ marginTop: 10, border: '1px solid var(--border)', padding: 9, background: 'var(--bg-2)' }}>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          <strong style={{ flex: 1, fontSize: 10 }}>Frozen prefill review</strong>
          <span className="badge badge-yellow">NO SUBMIT</span>
        </div>
        <div className="text-muted" style={{ fontSize: 8.5, lineHeight: 1.5, marginTop: 5 }}>
          {result.metadata?.filledCount || 0} filled · {result.metadata?.rejectedCount || 0} rejected · networking frozen · expires {Number.isFinite(expires.getTime()) ? expires.toLocaleTimeString() : 'soon'}
        </div>
        <img
          src={`data:${result.preview.mimeType};base64,${result.preview.base64}`}
          alt="Frozen screenshot preview of the prefilled application form"
          style={{ width: '100%', height: 'auto', display: 'block', marginTop: 8, border: '1px solid var(--border)' }}
        />
        <div className="text-muted" style={{ fontSize: 8.5, lineHeight: 1.5, marginTop: 7 }}>
          This screenshot can contain your approved candidate data. It is kept only in this in-memory review panel and is not added to OfferClaw local storage.
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={() => cancelSession()} disabled={busy}>Cancel & destroy session</button>
        </div>
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
        <span className="badge badge-yellow">PREFILL ONLY</span>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 7 }}>
        {fieldLabels(request.approvedFields).slice(0, 8).map(label => <span key={label} className="badge">{label}</span>)}
        {request.approvedFields.length > 8 && <span className="badge">+{request.approvedFields.length - 8}</span>}
      </div>
      <button type="button" className="btn btn-primary" onClick={runPrefill} disabled={busy} style={{ marginTop: 8 }}>
        {busy ? 'Creating frozen review…' : 'Review & prefill safe fields'}
      </button>
    </div>
  )
}
