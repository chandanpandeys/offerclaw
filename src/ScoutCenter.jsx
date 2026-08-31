import { useMemo, useState } from 'react'
import { skillJobScout } from './agent'
import { useAgent } from './agentContext'
import { deleteScoutCloudState, syncScoutCloudState } from './scoutCloud'
import {
  SCOUT_CADENCE,
  SCOUT_FRESHNESS,
  createScoutGoal,
  createScoutRun,
  filterScoutResults,
  isScoutDue,
  markScoutGoalRun,
  nextScoutDueAt,
  scoutGoalProfile,
} from './scoutGoals'

const shell = {
  position: 'fixed',
  left: 14,
  bottom: 58,
  zIndex: 88,
  fontFamily: 'var(--font-mono)',
}

const drawer = {
  width: 'min(430px, calc(100vw - 28px))',
  maxHeight: 'min(700px, calc(100vh - 130px))',
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

function formatDue(goal) {
  const dueAt = nextScoutDueAt(goal)
  if (!dueAt) return 'manual'
  if (isScoutDue(goal)) return 'due now'
  const hours = Math.max(1, Math.ceil((new Date(dueAt).getTime() - Date.now()) / 3_600_000))
  return `due in ${hours}h`
}

function backgroundRun(run) {
  return run?.mode === 'background_discovery' || run?.personalized === false
}

function runSummary(run) {
  if (!run) return 'never run'
  if (backgroundRun(run)) return `${run.resultCount} background candidates`
  if (run.demoCount && !run.liveCount) return `${run.resultCount} demo matches`
  return `${run.resultCount} matches · ${run.liveCount} live`
}

function cloudFailureMessage(error) {
  if (error?.code === 'identity_not_configured') return 'Device identity is not configured on this deployment.'
  if (error?.code === 'scout_store_not_configured') return 'Durable scout storage is not configured on this deployment.'
  if (error?.code === 'device_identity_required') return 'Device session could not be established.'
  if (error?.code === 'scout_state_origin_rejected') return 'Scout sync was rejected by the same-origin safety check.'
  return 'Scout cloud sync failed. Local state was not deleted.'
}

export default function ScoutCenter() {
  const {
    profile,
    tracker,
    setJobs,
    addMessage,
    addToast,
    scoutGoals,
    setScoutGoals,
    scoutRuns,
    setScoutRuns,
  } = useAgent()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [runningGoalId, setRunningGoalId] = useState(null)
  const [query, setQuery] = useState(() => profile?.currentRole || '')
  const [location, setLocation] = useState(() => profile?.location || 'India')
  const [minMatch, setMinMatch] = useState(70)
  const [freshnessHours, setFreshnessHours] = useState(SCOUT_FRESHNESS.THREE_DAYS)
  const [cadence, setCadence] = useState(SCOUT_CADENCE.MANUAL)
  const [cloudLinked, setCloudLinked] = useState(() => localStorage.getItem('offerclaw_scout_cloud_linked') === 'true')
  const [cloudBusy, setCloudBusy] = useState(null)
  const [cloudRevision, setCloudRevision] = useState(null)

  const latestRunByGoal = useMemo(() => {
    const map = new Map()
    for (const run of scoutRuns) {
      if (!map.has(run.goalId)) map.set(run.goalId, run)
    }
    return map
  }, [scoutRuns])

  const saveGoal = () => {
    const goal = createScoutGoal({
      query: query || profile?.currentRole || 'software engineer',
      name: query || profile?.currentRole || 'Saved scout',
      location: location || profile?.location || 'India',
      minMatch,
      freshnessHours,
      cadence,
      excludeApplied: true,
    })
    setScoutGoals(previous => [goal, ...previous.filter(item => item.id !== goal.id)])
    setCreating(false)
    addToast('Scout goal saved locally', 'success')
  }

  const removeGoal = (goalId) => {
    setScoutGoals(previous => previous.filter(goal => goal.id !== goalId))
    addToast('Scout goal removed', 'info')
  }

  const runGoal = async (goal) => {
    if (runningGoalId) return
    setRunningGoalId(goal.id)
    addToast(`Scouting: ${goal.query}`, 'info')

    try {
      const rawJobs = await skillJobScout(scoutGoalProfile(goal, profile || {}))
      const matches = filterScoutResults(rawJobs, goal, tracker)
      const run = createScoutRun(goal, matches)
      const updatedGoal = markScoutGoalRun(goal, run)

      setJobs(matches)
      setScoutRuns(previous => [run, ...previous])
      setScoutGoals(previous => previous.map(item => item.id === goal.id ? updatedGoal : item))

      const top = matches.slice(0, 3).map(job => `${job.title} @ ${job.company} (${job.matchScore}%)`).join('\n')
      addMessage({
        type: 'agent',
        text: matches.length
          ? `Scout “${goal.name}” found ${matches.length} matches after your filters.\n\n${top}${matches.length > 3 ? `\n\n+ ${matches.length - 3} more` : ''}`
          : `Scout “${goal.name}” found no roles that cleared the saved filters. No applications were sent.`,
      })
      addToast(matches.length ? `${matches.length} scout matches loaded` : 'No scout matches cleared the filters', matches.length ? 'success' : 'info')
    } catch {
      addToast('Scout run failed. No external actions were taken.', 'error')
    } finally {
      setRunningGoalId(null)
    }
  }

  const syncCloud = async () => {
    if (cloudBusy) return
    setCloudBusy('sync')
    try {
      const result = await syncScoutCloudState({ goals: scoutGoals, runs: scoutRuns })
      setScoutGoals(result.merged.goals)
      setScoutRuns(result.merged.runs)
      localStorage.setItem('offerclaw_scout_cloud_linked', 'true')
      setCloudLinked(true)
      setCloudRevision(result.revision)
      addToast(result.conflictResolved ? 'Scout cloud conflict merged and synced' : 'Scout cloud copy synced', 'success')
    } catch (error) {
      addToast(cloudFailureMessage(error), 'error')
    } finally {
      setCloudBusy(null)
    }
  }

  const removeCloud = async () => {
    if (cloudBusy) return
    const confirmed = globalThis.confirm?.('Remove the device cloud copy? Local scout goals and run history will stay in this browser.')
    if (confirmed === false) return

    setCloudBusy('delete')
    try {
      await deleteScoutCloudState()
      localStorage.removeItem('offerclaw_scout_cloud_linked')
      setCloudLinked(false)
      setCloudRevision(0)
      addToast('Device cloud copy removed; local scouts kept', 'success')
    } catch (error) {
      addToast(cloudFailureMessage(error), 'error')
    } finally {
      setCloudBusy(null)
    }
  }

  return (
    <div style={shell}>
      {open && (
        <aside style={drawer} aria-label="OfferClaw scout center">
          <div style={{ ...section, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div className="field-label">Scout Center</div>
              <div className="text-muted text-xs">saved search goals · run history · due state</div>
            </div>
            <button type="button" className="btn btn-link" onClick={() => setOpen(false)} aria-label="Close scout center">✕</button>
          </div>

          <div style={section}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div className="field-label">Saved goals</div>
                <div className="text-muted text-xs" style={{ marginTop: 4 }}>{scoutGoals.length}/12 local goals</div>
              </div>
              <button type="button" className="btn btn-primary" onClick={() => setCreating(previous => !previous)} disabled={scoutGoals.length >= 12}>
                {creating ? 'Cancel' : '+ Goal'}
              </button>
            </div>

            {creating && (
              <div style={{ marginTop: 10, display: 'grid', gap: 7 }}>
                <input className="field-input" value={query} onChange={event => setQuery(event.target.value)} placeholder="Target role or keywords" />
                <input className="field-input" value={location} onChange={event => setLocation(event.target.value)} placeholder="Location" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                  <label className="text-muted text-xs">
                    Minimum match
                    <select className="field-input" value={minMatch} onChange={event => setMinMatch(Number(event.target.value))} style={{ marginTop: 4 }}>
                      {[60, 70, 80, 90].map(value => <option value={value} key={value}>{value}%+</option>)}
                    </select>
                  </label>
                  <label className="text-muted text-xs">
                    Freshness
                    <select className="field-input" value={freshnessHours} onChange={event => setFreshnessHours(Number(event.target.value))} style={{ marginTop: 4 }}>
                      <option value={24}>24 hours</option>
                      <option value={72}>3 days</option>
                    </select>
                  </label>
                </div>
                <label className="text-muted text-xs">
                  Cadence preference
                  <select className="field-input" value={cadence} onChange={event => setCadence(event.target.value)} style={{ marginTop: 4 }}>
                    <option value={SCOUT_CADENCE.MANUAL}>Manual</option>
                    <option value={SCOUT_CADENCE.DAILY}>Daily</option>
                  </select>
                </label>
                <div className="text-muted text-xs" style={{ lineHeight: 1.5 }}>
                  Already-applied roles are excluded from interactive scouts by default. Synced daily goals can run discovery in the background, but personal match scoring still happens only when your local profile is available.
                </div>
                <button type="button" className="btn btn-primary" onClick={saveGoal}>Save scout goal</button>
              </div>
            )}
          </div>

          <div style={section}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div className="field-label">Device cloud copy</div>
                <div className="text-muted text-xs" style={{ marginTop: 4, lineHeight: 1.5 }}>
                  Optional. Syncs saved scout goals and compact run history only. Profile, resume, tracker and application drafts stay local.
                </div>
              </div>
              <span className={`badge ${cloudLinked ? 'badge-green' : ''}`}>{cloudLinked ? 'linked' : 'local only'}</span>
            </div>
            <div className="text-muted" style={{ fontSize: 8.5, marginTop: 6, lineHeight: 1.5 }}>
              Sync is explicit. The daily scheduler uses only the last synced daily goals; unsynced edits remain local. Background results are unranked candidates until this browser scores them against your profile. {cloudRevision != null ? `Cloud revision ${cloudRevision}.` : ''}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button type="button" className="btn btn-primary" onClick={syncCloud} disabled={Boolean(cloudBusy)}>
                {cloudBusy === 'sync' ? 'Syncing…' : cloudLinked ? 'Sync now' : 'Enable & sync'}
              </button>
              {cloudLinked && (
                <button type="button" className="btn btn-ghost" onClick={removeCloud} disabled={Boolean(cloudBusy)}>
                  {cloudBusy === 'delete' ? 'Removing…' : 'Remove cloud copy'}
                </button>
              )}
            </div>
          </div>

          <div style={section}>
            {scoutGoals.length === 0 && (
              <div className="text-muted text-xs" style={{ lineHeight: 1.6 }}>
                Save a target role and location to make repeat scouting one click instead of re-entering filters each session.
              </div>
            )}

            {scoutGoals.map(goal => {
              const latestRun = latestRunByGoal.get(goal.id)
              const running = runningGoalId === goal.id
              return (
                <div key={goal.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                    <strong style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{goal.name}</strong>
                    {goal.cadence === SCOUT_CADENCE.DAILY && <span className={`badge ${isScoutDue(goal) ? 'badge-yellow' : ''}`}>{formatDue(goal)}</span>}
                  </div>
                  <div className="text-muted text-xs" style={{ marginTop: 5, lineHeight: 1.5 }}>
                    {goal.location} · {goal.minMatch}%+ · ≤{goal.freshnessHours}h · {runSummary(latestRun)}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                    <button type="button" className="btn btn-primary" onClick={() => runGoal(goal)} disabled={Boolean(runningGoalId)}>
                      {running ? 'Scouting…' : 'Run scout'}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => removeGoal(goal.id)} disabled={running}>Remove</button>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ ...section, borderBottom: 0 }}>
            <div className="field-label">Recent runs</div>
            {scoutRuns.length === 0 && <div className="text-muted text-xs" style={{ marginTop: 7 }}>No scout runs yet.</div>}
            {scoutRuns.slice(0, 6).map(run => (
              <div key={run.id} style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 7 }}>
                  <span style={{ flex: 1 }}>{run.goalName}</span>
                  <span className={`badge ${backgroundRun(run) ? 'badge-yellow' : ''}`}>
                    {run.resultCount} {backgroundRun(run) ? 'candidates' : 'matches'}
                  </span>
                </div>
                <div className="text-muted" style={{ fontSize: 8.5, marginTop: 3 }}>
                  {new Date(run.ranAt).toLocaleString()} · {backgroundRun(run) ? 'background discovery · not personalized' : `${run.liveCount} live · ${run.demoCount} demo`}
                </div>
              </div>
            ))}
          </div>
        </aside>
      )}

      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setOpen(previous => !previous)}
        aria-expanded={open}
        aria-label="Toggle scout center"
        style={{ boxShadow: '0 8px 24px rgba(0,0,0,.2)' }}
      >
        ⌕ Scouts{scoutGoals.some(goal => isScoutDue(goal)) ? ' · due' : scoutGoals.length ? ` · ${scoutGoals.length}` : ''}
      </button>
    </div>
  )
}
