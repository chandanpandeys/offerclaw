import { useMemo, useState } from 'react'
import { ACTION, CAPABILITY, CONNECTORS, buildPeopleSearchUrl, buildPlatformJobSearchUrl, resolveConnector } from './connectors'
import { ACTION_LABELS, AUTONOMY_MODES, DECISION, evaluateAction, modeLabel } from './autonomy'
import { useAgent } from './agentContext'
import { officialCareersSearchUrl } from './sourceIntel'

const shell = {
  position: 'fixed',
  left: 14,
  bottom: 14,
  zIndex: 90,
  fontFamily: 'var(--font-mono)',
}

const drawer = {
  width: 'min(430px, calc(100vw - 28px))',
  maxHeight: 'min(700px, calc(100vh - 90px))',
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

const CAP_LABEL = {
  [CAPABILITY.NATIVE]: 'native',
  [CAPABILITY.HANDOFF]: 'handoff',
  [CAPABILITY.APPROVAL]: 'approval',
  [CAPABILITY.PLANNED]: 'planned',
  [CAPABILITY.BLOCKED]: 'blocked',
}

function capClass(capability) {
  if (capability === CAPABILITY.NATIVE) return 'badge-green'
  if (capability === CAPABILITY.HANDOFF || capability === CAPABILITY.APPROVAL) return 'badge-yellow'
  if (capability === CAPABILITY.BLOCKED) return 'badge-red'
  return ''
}

function CapabilityRow({ connector, action }) {
  const capability = connector.capabilities[action]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '5px 0' }}>
      <span className="text-muted text-xs">{ACTION_LABELS[action]}</span>
      <span className={`badge ${capClass(capability)}`} style={{ fontSize: 8 }}>{CAP_LABEL[capability] || capability}</span>
    </div>
  )
}

export default function CommandCenter() {
  const {
    profile,
    selectedJob,
    autonomyMode,
    setAutonomyMode,
    actionQueue,
    queueAction,
    patchAction,
    addToast,
  } = useAgent()
  const [open, setOpen] = useState(false)
  const selectedConnector = useMemo(() => selectedJob ? resolveConnector(selectedJob) : null, [selectedJob])
  const pending = actionQueue.filter(item => item.status === 'pending')

  const enqueue = ({ action, connector, title, url }) => {
    if (!url) {
      addToast('No safe destination is available for that action yet.', 'error')
      return
    }

    const policy = evaluateAction({ mode: autonomyMode, connectorId: connector.id, action })
    if (policy.decision === DECISION.BLOCK) {
      addToast(policy.reason, 'error')
      return
    }
    if (policy.decision === DECISION.PLANNED) {
      addToast(policy.reason, 'info')
      return
    }

    queueAction({
      action,
      connectorId: connector.id,
      connectorName: connector.name,
      title,
      url,
      executor: 'open_url',
      policy,
    })
    addToast(policy.decision === DECISION.REQUIRE_APPROVAL ? 'Action queued for approval' : 'Action queued', 'info')
  }

  const runAction = (item) => {
    if (item.executor !== 'open_url' || !item.url) {
      patchAction(item.id, { status: 'failed', error: 'unsupported_executor' })
      addToast('This executor is not implemented yet.', 'error')
      return
    }

    const popup = window.open(item.url, '_blank', 'noopener,noreferrer')
    if (!popup) {
      addToast('Browser blocked the new tab. Allow popups and retry.', 'error')
      return
    }

    patchAction(item.id, { status: 'completed', completedAt: new Date().toISOString() })
    addToast(`${ACTION_LABELS[item.action] || 'Action'} handed off`, 'success')
  }

  const rejectAction = (item) => {
    patchAction(item.id, { status: 'rejected', rejectedAt: new Date().toISOString() })
    addToast('Action rejected', 'info')
  }

  const queueVerification = () => {
    if (!selectedJob || !selectedConnector) return
    enqueue({
      action: ACTION.VERIFY_LISTING,
      connector: selectedConnector,
      title: `Verify ${selectedJob.company} · ${selectedJob.title}`,
      url: officialCareersSearchUrl(selectedJob),
    })
  }

  const queueApply = () => {
    if (!selectedJob || !selectedConnector) return
    enqueue({
      action: ACTION.OPEN_APPLY,
      connector: selectedConnector,
      title: `Open application · ${selectedJob.company}`,
      url: selectedJob.url,
    })
  }

  const queuePeopleSearch = () => {
    if (!selectedJob) return
    enqueue({
      action: ACTION.FIND_PEOPLE,
      connector: CONNECTORS.linkedin,
      title: `Find hiring people · ${selectedJob.company}`,
      url: buildPeopleSearchUrl(selectedJob),
    })
  }

  const queuePlatformSearch = (connectorId) => {
    const connector = CONNECTORS[connectorId]
    enqueue({
      action: ACTION.SEARCH_JOBS,
      connector,
      title: `Search ${connector.name} · ${profile?.currentRole || 'jobs'}`,
      url: buildPlatformJobSearchUrl(connectorId, profile || {}),
    })
  }

  return (
    <div style={shell}>
      {open && (
        <aside style={drawer} aria-label="OfferClaw agent command center">
          <div style={{ ...section, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div className="field-label">Agent Command Center</div>
              <div className="text-muted text-xs">connector capabilities · approval queue · autonomy policy</div>
            </div>
            <button type="button" className="btn btn-link" onClick={() => setOpen(false)} aria-label="Close command center">✕</button>
          </div>

          <div style={section}>
            <div className="field-label">Autonomy</div>
            <select
              className="field-input"
              value={autonomyMode}
              onChange={event => setAutonomyMode(event.target.value)}
              style={{ marginTop: 7 }}
            >
              {AUTONOMY_MODES.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
            </select>
            <div className="text-muted text-xs" style={{ lineHeight: 1.55, marginTop: 7 }}>
              {AUTONOMY_MODES.find(mode => mode.id === autonomyMode)?.description}
            </div>
            <div className="text-muted text-xs" style={{ lineHeight: 1.55, marginTop: 5 }}>
              CAPTCHA, 2FA, declarations and sensitive external submissions are never silently bypassed.
            </div>
          </div>

          <div style={section}>
            <div className="field-label">Cross-platform discovery</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {['linkedin', 'indeed', 'naukri', 'apna'].map(id => (
                <button key={id} type="button" className="btn btn-ghost" onClick={() => queuePlatformSearch(id)}>
                  {CONNECTORS[id].name}
                </button>
              ))}
            </div>
            <div className="text-muted text-xs" style={{ lineHeight: 1.55, marginTop: 7 }}>
              These are explicit handoffs today. Native platform integrations can replace each connector later without changing the agent policy layer.
            </div>
          </div>

          <div style={section}>
            <div className="field-label">Selected job connector</div>
            {!selectedJob || !selectedConnector ? (
              <div className="text-muted text-xs" style={{ marginTop: 7 }}>Select a job to inspect its connector contract.</div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7 }}>
                  <strong style={{ flex: 1 }}>{selectedConnector.name}</strong>
                  <span className="badge">{selectedConnector.kind}</span>
                  <span className="badge">{selectedConnector.status}</span>
                </div>
                <div className="text-muted text-xs" style={{ lineHeight: 1.55, marginTop: 6 }}>{selectedConnector.note}</div>
                <div style={{ marginTop: 7 }}>
                  <CapabilityRow connector={selectedConnector} action={ACTION.VERIFY_LISTING} />
                  <CapabilityRow connector={selectedConnector} action={ACTION.PREPARE_APPLICATION} />
                  <CapabilityRow connector={selectedConnector} action={ACTION.PREFILL_APPLICATION} />
                  <CapabilityRow connector={selectedConnector} action={ACTION.SUBMIT_APPLICATION} />
                  <CapabilityRow connector={selectedConnector} action={ACTION.SEND_MESSAGE} />
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  <button type="button" className="btn btn-ghost" onClick={queueVerification}>Verify</button>
                  <button type="button" className="btn btn-primary" onClick={queueApply} disabled={!selectedJob.url}>Queue apply handoff</button>
                  <button type="button" className="btn btn-ghost" onClick={queuePeopleSearch}>Find human</button>
                </div>
              </>
            )}
          </div>

          <div style={{ ...section, borderBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="field-label" style={{ flex: 1 }}>Approval queue</div>
              <span className="badge">{pending.length} pending</span>
            </div>
            {pending.length === 0 && (
              <div className="text-muted text-xs" style={{ marginTop: 7 }}>
                No external actions waiting. Current mode: {modeLabel(autonomyMode)}.
              </div>
            )}
            {pending.slice(0, 8).map(item => (
              <div key={item.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                  <span style={{ flex: 1 }}>{item.title}</span>
                  <span className="badge">{item.connectorName}</span>
                </div>
                <div className="text-muted text-xs" style={{ marginTop: 5, lineHeight: 1.45 }}>{item.policy?.reason}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                  <button type="button" className="btn btn-primary" onClick={() => runAction(item)}>
                    {item.policy?.decision === DECISION.REQUIRE_APPROVAL ? 'Approve & open' : 'Run'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => rejectAction(item)}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        </aside>
      )}

      <button
        type="button"
        className="btn btn-primary"
        onClick={() => setOpen(previous => !previous)}
        aria-expanded={open}
        aria-label="Toggle agent command center"
        style={{ boxShadow: '0 8px 24px rgba(0,0,0,.25)' }}
      >
        ◉ Agent · {modeLabel(autonomyMode)}{pending.length ? ` · ${pending.length}` : ''}
      </button>
    </div>
  )
}
