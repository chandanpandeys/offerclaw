import { useMemo, useState } from 'react'

import {
  buildInspectionReview,
  createInspectionTaskForJob,
  inspectionEligibility,
  inspectionErrorMessage,
  requestFormInspection,
} from './browserReview'
import { useAgent } from './agentContext'
import SupervisedPrefillPanel from './SupervisedPrefillPanel'

const shell = {
  position: 'fixed',
  left: 14,
  bottom: 102,
  zIndex: 86,
  fontFamily: 'var(--font-mono)',
}

const drawer = {
  width: 'min(430px, calc(100vw - 28px))',
  maxHeight: 'min(700px, calc(100vh - 150px))',
  overflow: 'auto',
  marginBottom: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg-1)',
  boxShadow: '0 18px 60px rgba(0,0,0,.32)',
}

const section = {
  padding: 12,
  borderBottom: '1px solid var(--border)',
}

function Metric({ value, label }) {
  return (
    <div style={{ border: '1px solid var(--border)', padding: '7px 5px', textAlign: 'center', background: 'var(--bg-2)' }}>
      <div style={{ fontSize: 15 }}>{value}</div>
      <div className="text-muted" style={{ fontSize: 7.5, marginTop: 2 }}>{label}</div>
    </div>
  )
}

export default function SupervisedPrefillCenter() {
  const { profile, selectedJob, addToast } = useAgent()
  const [open, setOpen] = useState(false)
  const [inspectionState, setInspectionState] = useState({ jobId: null, status: 'idle', review: null, error: null })

  const eligibility = useMemo(() => selectedJob ? inspectionEligibility(selectedJob) : null, [selectedJob])
  if (!selectedJob || !eligibility?.eligible) return null

  const current = inspectionState.jobId === selectedJob.id ? inspectionState : { status: 'idle', review: null, error: null }

  const inspect = async () => {
    if (current.status === 'loading') return
    const { task } = createInspectionTaskForJob(selectedJob)
    if (!task) return

    setInspectionState({ jobId: selectedJob.id, status: 'loading', review: null, error: null })
    try {
      const result = await requestFormInspection(task)
      const review = buildInspectionReview(result.inspection, { profile: profile || {}, job: selectedJob })
      setInspectionState({ jobId: selectedJob.id, status: 'success', review, error: null })
      addToast(`Reviewed ${review.plan.summary.total} application fields for supervised application flow`, 'success')
    } catch (error) {
      const message = inspectionErrorMessage(error)
      setInspectionState({ jobId: selectedJob.id, status: 'error', review: null, error: message })
      addToast(message, 'error')
    }
  }

  return (
    <div style={shell}>
      {open && (
        <aside style={drawer} aria-label="OfferClaw supervised application center">
          <div style={{ ...section, display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div className="field-label">Supervised Application</div>
              <div className="text-muted text-xs">inspect → evidence review → frozen prefill → separate submit approval</div>
            </div>
            <button type="button" className="btn btn-link" onClick={() => setOpen(false)} aria-label="Close supervised application center">✕</button>
          </div>

          <div style={section}>
            <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
              <strong style={{ flex: 1 }}>{selectedJob.title}</strong>
              <span className="badge">{eligibility.connectorName}</span>
            </div>
            <div className="text-muted text-xs" style={{ marginTop: 5 }}>{selectedJob.company} · {selectedJob.location || 'location not listed'}</div>
            <div className="text-muted text-xs" style={{ marginTop: 7, lineHeight: 1.55 }}>
              OfferClaw first inspects the live ATS form without candidate values. Only direct profile-backed fields that survive local review can be prefilled. Final submission is a separate, short-lived, explicit one-time approval after screenshot review.
            </div>
            <button type="button" className="btn btn-primary" onClick={inspect} disabled={current.status === 'loading'} style={{ marginTop: 8 }}>
              {current.status === 'loading' ? 'Inspecting form…' : current.status === 'success' ? 'Re-inspect form' : 'Inspect form for supervised application'}
            </button>
          </div>

          {current.status === 'error' && (
            <div style={section}>
              <div style={{ color: 'var(--red)', fontSize: 9, lineHeight: 1.55 }}>{current.error}</div>
            </div>
          )}

          {current.status === 'success' && current.review && (
            <div style={{ ...section, borderBottom: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                <Metric value={current.review.plan.summary.prefill} label="SAFE PREFILL" />
                <Metric value={current.review.plan.summary.review} label="REVIEW" />
                <Metric value={current.review.plan.summary.manual} label="MANUAL" />
                <Metric value={current.review.plan.summary.unresolved} label="MISSING" />
              </div>
              <div className="text-muted" style={{ fontSize: 8.5, marginTop: 7, lineHeight: 1.5 }}>
                CAPTCHA/2FA/login checkpoints, unresolved required fields, changed form controls, expired sessions, and rejected live prefill fields block final approval. OfferClaw never automatically retries a submission.
              </div>
              <SupervisedPrefillPanel job={selectedJob} review={current.review} addToast={addToast} />
            </div>
          )}
        </aside>
      )}

      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setOpen(previous => !previous)}
        aria-expanded={open}
        aria-label="Toggle supervised application center"
        style={{ boxShadow: '0 8px 24px rgba(0,0,0,.2)' }}
      >
        ◇ Apply · {eligibility.connectorName}
      </button>
    </div>
  )
}
