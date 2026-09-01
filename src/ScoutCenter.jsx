import { useMemo, useState } from 'react'
import { skillJobScout } from './agent'
import { useAgent } from './agentContext'
import { deleteScoutCloudState, pullScoutCloudState, syncScoutCloudState } from './scoutCloud'
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

const UNREAD_STORAGE_KEY = 'offerclaw_scout_unread_background_runs'

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

function readUnreadIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(UNREAD_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 40) : []
  } catch {
    return []
  }
}

function cloudFailureMessage(error) {
  if (error?.code === 'identity_not_configured') return 'Device identity is not configured on this deployment.'
  if (error?.code === 'scout_store_not_configured') return 'Durable scout storage is not configured on this deployment.'
  if (error?.code === 'device_identity_required') return 'This browser no longer has the linked device session. Enable & sync again to start a new device cloud copy.'
  if (error?.code === 'scout_state_origin_rejected') return 'Scout sync was rejected by the same-origin safety check.'
  return 'Scout cloud request failed. Local state was not deleted.'
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
  const [unreadBackgroundIds, setUnreadBackgroundIds] = useState(readUnreadIds)

  const latestRunByGoal = useMemo(() => {
    const map = new Map()
    for (const run of scoutRuns) {
      if (!map.has(run.goalId)) map.set(run.goalId, run)
    }
    return map
  }, [scoutRuns])

  const unreadBackgroundRuns = useMemo(() => {
    const unread = new Set(unreadBackgroundIds)
    return scoutRuns.filter(run => backgroundRun(run) && unread.has(run.id))
  }, [scoutRuns, unreadBackgroundIds])

  const persistUnreadIds = (nextOrUpdater) => {
    setUnreadBackgroundIds(previous => {
      const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(previous) : nextOrUpdater
      const bounded = [...new Set(Array.isArray(next) ? next.filter(Boolean) : [])].slice(0, 40)
      localStorage.setItem(UNREAD_STORAGE_KEY, JSON.stringify(bounded))
      return bounded
    })
  }

  const addUnreadRuns = (runs) => {
    const ids = (Array.isArray(runs) ? runs : []).filter(backgroundRun).map(run => run.id).filter(Boolean)
    if (!ids.length) return
    persistUnreadIds(previous => [...ids, ...previous])
  }

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
    if (runningGoalId) return null
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
      return matches
    } catch {
      addToast('Scout run failed. No external actions were taken.', 'error')
      return null
    } finally {
      setRunningGoalId(null)
    }
  }

  const pullCloud = async ({ quiet = false } = {}) => {
    if (!cloudLinked || cloudBusy) return
    setCloudBusy('pull')
    try {
      const result = await pullScoutCloudState({ goals: scoutGoals, runs: scoutRuns })
      setScoutGoals(result.merged.goals)
      setScoutRuns(result.merged.runs)
      setCloudRevision(result.revision)
      addUnreadRuns(result.newBackgroundRuns)

      if (result.newBackgroundRuns.length) {
        const candidateCount = result.newBackgroundRuns.reduce((sum, run) => sum + Number(run.resultCount || 0), 0)
        addToast(`${candidateCount} new background candidates arrived`, 'success')
      } else if (!quiet) {
        addToast('Scout inbox is up to date', 'info')
      }
    } catch (error) {
      addToast(cloudFailureMessage(error), 'error')
    } finally {
      setCloudBusy(null)
    }
  }

  const syncCloud = async () => {
    if (cloudBusy) return
    setCloudBusy('sync')
    const existingRunIds = new Set(scoutRuns.map(run => run.id))
    try {
      const result = await syncScoutCloudState({ goals: scoutGoals, runs: scoutRuns })
      const newBackgroundRuns = result.merged.runs.filter(run => backgroundRun(run) && !existingRunIds.has(run.id))
      addUnreadRuns(newBackgroundRuns)
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

  const markRunReviewed = (runId) => {
    persistUnreadIds(previous => previous.filter(id => id !== runId))
  }

  const markAllReviewed = () => persistUnreadIds([])

  const reviewBackgroundRun = async (run) => {
    const goal = scoutGoals.find(item => item.id === run.goalId)
    if (!goal) {
      addToast('The saved scout goal for this discovery is no longer available.', 'error')
      return
    }

    addToast('Running a fresh personalized review locally', 'info')
    const matches = await runGoal(goal)
    if (matches !== null) markRunReviewed(run.id)
  }

  const toggleOpen = () => {
    const next = !open
    setOpen(next)
    if (next && cloudLinked && !cloudBusy) void pullCloud({ quiet: true })
  }

  return (
    <div style={shell}>
      {open && (
        <aside style={drawer} aria-label="OfferClaw scout center">
          <div style={{ ...section, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div className="field-label">Scout Center</div>
              <div className="text-muted text-xs">saved search goals · background inbox · run history</div>
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
              Opening a linked Scout Center performs a read-only inbox refresh. Edits still upload only when you choose Sync. The scheduler uses only the last synced daily goals. {cloudRevision != null ? `Cloud revision ${cloudRevision}.` : ''}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={syncCloud} disabled={Boolean(cloudBusy)}>
                {cloudBusy === 'sync' ? 'Syncing…' : cloudLinked ? 'Sync now' : 'Enable & sync'}
              </button>
              {cloudLinked && (
                <button type="button" className="btn btn-ghost" onClick={() => pullCloud()} disabled={Boolean(cloudBusy)}>
                  {cloudBusy === 'pull' ? 'Refreshing…' : 'Refresh inbox'}
                </button>
              )}
              {cloudLinked && (
                <button type="button" className="btn btn-ghost" onClick={removeCloud} disabled={Boolean(cloudBusy)}>
                  {cloudBusy === 'delete' ? 'Removing…' : 'Remove cloud copy'}
                </button>
              )}
            </div>
          </div>

          {unreadBackgroundRuns.length > 0 && (
            <div style={section}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div className="field-label" style={{ flex: 1 }}>Background inbox</div>
                <span className="badge badge-yellow">{unreadBackgroundRuns.length} unread</span>
                <button type="button" className="btn btn-link" onClick={markAllReviewed}>Mark all reviewed</button>
              </div>
              <div className="text-muted text-xs" style={{ lineHeight: 1.5, marginTop: 5 }}>
                These are discovery candidates only. They were found without your local profile and have not been personalized, applied to, or contacted.
              </div>
              {unreadBackgroundRuns.slice(0, 6).map(run => {
                const savedGoalAvailable = scoutGoals.some(goal => goal.id === run.goalId)
                return (
                  <div key={run.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                      <strong style={{ flex: 1 }}>{run.goalName}</strong>
                      <span className="badge">{run.resultCount} candidates</span>
                    </div>
                    <div className="text-muted" style={{ fontSize: 8.5, marginTop: 3 }}>
                      discovered {new Date(run.ranAt).toLocaleString()} · not personalized
                    </div>
                    <div style={{ display: 'grid', gap: 5, marginTop: 7 }}>
                      {(run.results || []).slice(0, 4).map((candidate, index) => (
                        <div key={`${run.id}-${candidate.id || index}`} style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                          <span className="text-xs" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {candidate.title} · {candidate.company}
                          </span>
                          {candidate.url && (
                            <a className="btn btn-link" href={candidate.url} target="_blank" rel="noreferrer">Open</a>
                          )}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => reviewBackgroundRun(run)}
                        disabled={Boolean(runningGoalId) || !savedGoalAvailable}
                      >
                        {runningGoalId === run.goalId ? 'Reviewing…' : 'Run full local review'}
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => markRunReviewed(run.id)}>
                        Mark reviewed
                      </button>
                    </div>
                    {!savedGoalAvailable && (
                      <div className="text-muted" style={{ fontSize: 8.5, marginTop: 5 }}>
                        The saved goal was removed, so this discovery remains reviewable only through its candidate links.
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

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
        onClick={toggleOpen}
        aria-expanded={open}
        aria-label="Toggle scout center"
        style={{ boxShadow: '0 8px 24px rgba(0,0,0,.2)' }}
      >
        ⌕ Scouts{unreadBackgroundRuns.length ? ` · ${unreadBackgroundRuns.length} new` : scoutGoals.some(goal => isScoutDue(goal)) ? ' · due' : scoutGoals.length ? ` · ${scoutGoals.length}` : ''}
      </button>
    </div>
  )
}
