import { useMemo, useState } from 'react'
import { summarizeTracker, nextFunnelStage } from './analytics'
import { useAgent } from './agentContext'
import { buildSourceIntel, officialCareersSearchUrl } from './sourceIntel'

const STAGE_LABELS = {
  applied: 'Applied',
  response: 'Response',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  archived: 'Archived',
}

const shell = {
  position: 'fixed',
  right: 14,
  bottom: 14,
  zIndex: 80,
  fontFamily: 'var(--font-mono)',
}

const drawer = {
  width: 'min(390px, calc(100vw - 28px))',
  maxHeight: 'min(640px, calc(100vh - 90px))',
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

const metricGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 6,
  marginTop: 8,
}

const metricBox = {
  padding: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg-2)',
  textAlign: 'center',
}

function StageButton({ children, onClick, danger = false }) {
  return (
    <button
      type="button"
      className={danger ? 'btn btn-danger' : 'btn btn-ghost'}
      onClick={onClick}
      style={{ fontSize: 9, padding: '4px 7px' }}
    >
      {children}
    </button>
  )
}

export default function Insights() {
  const { tracker, setTracker, selectedJob, addToast } = useAgent()
  const [open, setOpen] = useState(false)
  const summary = useMemo(() => summarizeTracker(tracker), [tracker])
  const selectedIntel = useMemo(() => selectedJob ? buildSourceIntel(selectedJob) : null, [selectedJob])
  const careersSearch = selectedJob ? officialCareersSearchUrl(selectedJob) : null

  const patchStatus = (id, status) => {
    setTracker(previous => previous.map(item => item.id === id
      ? {
          ...item,
          status,
          statusUpdatedAt: new Date().toISOString(),
          statusHistory: [
            ...(Array.isArray(item.statusHistory) ? item.statusHistory : []),
            { status, at: new Date().toISOString() },
          ].slice(-20),
        }
      : item))
    addToast(`Pipeline moved to ${STAGE_LABELS[status] || status}`, 'success')
  }

  return (
    <div style={shell}>
      {open && (
        <aside style={drawer} aria-label="OfferClaw conversion insights">
          <div style={{ ...section, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div className="field-label">Conversion Insights</div>
              <div className="text-muted text-xs">Local-only funnel + apply-route evidence</div>
            </div>
            <button type="button" className="btn btn-link" onClick={() => setOpen(false)} aria-label="Close insights">✕</button>
          </div>

          <div style={section}>
            <div className="field-label">Pipeline funnel</div>
            <div style={metricGrid}>
              <div style={metricBox}><div style={{ fontSize: 17 }}>{summary.total}</div><div className="text-muted" style={{ fontSize: 8 }}>APPLIED</div></div>
              <div style={metricBox}><div style={{ fontSize: 17 }}>{summary.responseRate}%</div><div className="text-muted" style={{ fontSize: 8 }}>RESPONSE</div></div>
              <div style={metricBox}><div style={{ fontSize: 17 }}>{summary.interviewRate}%</div><div className="text-muted" style={{ fontSize: 8 }}>INTERVIEW</div></div>
              <div style={metricBox}><div style={{ fontSize: 17 }}>{summary.offerRate}%</div><div className="text-muted" style={{ fontSize: 8 }}>OFFER</div></div>
            </div>
            <div className="text-muted text-xs" style={{ marginTop: 8 }}>
              Package eval average: {summary.averageEvalScore ?? '—'} · rejected: {summary.rejected} · archived: {summary.archived}
            </div>
          </div>

          {selectedJob && selectedIntel && (
            <div style={section}>
              <div className="field-label">Selected job · apply-route intelligence</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 7 }}>
                <span>{selectedIntel.label}</span>
                <span className={`badge ${selectedIntel.score >= 80 ? 'badge-green' : selectedIntel.score >= 50 ? 'badge-yellow' : 'badge-red'}`}>
                  {selectedIntel.score}/100 route confidence
                </span>
              </div>
              <div className="text-muted text-xs" style={{ lineHeight: 1.55, marginTop: 7 }}>
                {selectedIntel.category === 'ats'
                  ? 'Shared ATS domain: useful evidence, but confirm company + role before submitting personal data.'
                  : selectedIntel.category === 'job_board'
                    ? 'Job-board route: confirm the opening on the employer careers site.'
                    : selectedIntel.category === 'employer_site'
                      ? 'Likely employer-controlled route; this is still a heuristic, not identity verification.'
                      : selectedIntel.warnings[0]}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {selectedJob.url && <a className="btn btn-ghost" href={selectedJob.url} target="_blank" rel="noreferrer">Open apply route ↗</a>}
                {careersSearch && <a className="btn btn-ghost" href={careersSearch} target="_blank" rel="noreferrer">Verify careers page ↗</a>}
              </div>
            </div>
          )}

          <div style={section}>
            <div className="field-label">Source conversion</div>
            {summary.sourceBreakdown.length === 0 && <div className="text-muted text-xs" style={{ marginTop: 7 }}>Log applications to compare which routes actually produce responses.</div>}
            {summary.sourceBreakdown.slice(0, 5).map(row => (
              <div key={row.source} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.source}</span>
                <span className="text-muted">{row.applications} apps · {row.responseRate}% resp · {row.interviewRate}% int</span>
              </div>
            ))}
          </div>

          <div style={{ ...section, borderBottom: 0 }}>
            <div className="field-label">Recent applications</div>
            {tracker.length === 0 && <div className="text-muted text-xs" style={{ marginTop: 7 }}>Nothing logged yet.</div>}
            {tracker.slice(0, 5).map(item => {
              const next = nextFunnelStage(item.status)
              return (
                <div key={item.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.company} · {item.jobTitle}</span>
                    <span className="badge">{STAGE_LABELS[item.status] || item.status}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                    {next && <StageButton onClick={() => patchStatus(item.id, next)}>→ {STAGE_LABELS[next]}</StageButton>}
                    {!['offer', 'rejected', 'archived'].includes(item.status) && <StageButton danger onClick={() => patchStatus(item.id, 'rejected')}>Rejected</StageButton>}
                  </div>
                </div>
              )
            })}
          </div>
        </aside>
      )}

      <button
        type="button"
        className="btn btn-primary"
        onClick={() => setOpen(previous => !previous)}
        aria-expanded={open}
        aria-label="Toggle conversion insights"
        style={{ boxShadow: '0 8px 24px rgba(0,0,0,.25)' }}
      >
        ◈ Insights {tracker.length ? `· ${summary.responseRate}% response` : ''}
      </button>
    </div>
  )
}
