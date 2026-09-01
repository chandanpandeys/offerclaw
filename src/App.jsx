import { useEffect, useRef, useState } from 'react'
import { useAgent } from './agentContext'
import {
  exportTrackerCSV,
  exportTrackerJSON,
  runAgent,
  skillApplicationComposer,
  skillDailyDigest,
  skillFollowUp,
} from './agent'

const SESSION_NOW = Date.now()

const SOURCE_LABELS = {
  company_site: { label: '🏢 Employer site', cls: 'badge-green' },
  linkedin: { label: '🔗 LinkedIn', cls: 'badge-amber' },
  naukri: { label: '📋 Job board', cls: 'badge-yellow' },
}

function daysSince(iso, now) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000))
}

function Topbar({ runtime }) {
  const { agentStatus, streak } = useAgent()
  const dot = agentStatus === 'thinking' ? 'thinking' : agentStatus === 'running' ? 'live' : ''
  const mode = runtime?.jobs?.configured || runtime?.ai?.configured ? 'connected' : 'demo'

  return (
    <header className="app-topbar">
      <div className="app-logo">
        <div className="app-logo-mark">OC</div>
        OfferClaw
      </div>
      <div className="topbar-divider" />
      <div className="topbar-status">
        <span className={`status-dot ${dot}`} />
        {agentStatus === 'thinking' ? 'thinking...' : agentStatus === 'running' ? 'running' : 'ready'}
      </div>
      <div className="topbar-divider" />
      <span className="text-muted text-xs text-mono">v1.0.0 · persistent career agent · {mode}</span>
      <div className="topbar-right">
        {streak > 0 && <div className="streak-badge">🔥 {streak}-day streak</div>}
      </div>
    </header>
  )
}

function Sidebar({ now }) {
  const { profile, view, setView, tracker, streak } = useAgent()
  const today = new Date(now).toDateString()
  const todayApplied = tracker.filter(item => new Date(item.appliedAt).toDateString() === today).length
  const followUpsDue = tracker.filter(item => {
    const age = daysSince(item.appliedAt, now)
    return item.status === 'applied' && ((age >= 3 && !item.followUpDay3) || (age >= 5 && !item.followUpDay5))
  }).length
  const responses = tracker.filter(item => item.status === 'response').length
  const responseRate = tracker.length ? Math.round((responses / tracker.length) * 100) : 0
  const nav = [
    { id: 'chat', icon: '⌥', label: 'Agent Chat' },
    { id: 'tracker', icon: '◈', label: 'Pipeline', badge: followUpsDue || null },
    { id: 'settings', icon: '⚙', label: 'Settings' },
  ]

  return (
    <aside className="app-sidebar">
      <div className="sidebar-section">
        <div className="sidebar-label">Profile</div>
        <div className="profile-card">
          <div className="profile-name">{profile?.name || 'Not set'}</div>
          <div className="profile-role">{profile?.currentRole || 'Choose a target role'}</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {nav.map(item => (
          <button
            key={item.id}
            className={`nav-item ${view === item.id ? 'active' : ''}`}
            onClick={() => setView(item.id)}
            type="button"
            style={{ width: '100%', border: 0, textAlign: 'left' }}
          >
            <span className="nav-item-icon">{item.icon}</span>
            {item.label}
            {item.badge && <span className="badge badge-yellow" style={{ marginLeft: 'auto' }}>{item.badge}</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar-stats">
        <div className="sidebar-label">Today</div>
        <div className="stat-row"><span className="stat-label">Applied</span><span className="stat-val accent">{todayApplied}/3</span></div>
        <div className="stat-row"><span className="stat-label">Follow-ups</span><span className={`stat-val ${followUpsDue ? 'warn' : 'good'}`}>{followUpsDue || 'clear'}</span></div>
        <div className="stat-row"><span className="stat-label">Response</span><span className="stat-val">{responseRate}%</span></div>
        <div className="stat-row"><span className="stat-label">Streak</span><span className="stat-val">{streak}d</span></div>
        <div className="stat-row"><span className="stat-label">Pipeline</span><span className="stat-val">{tracker.length}</span></div>
      </div>
    </aside>
  )
}

function RuntimeNotice({ runtime }) {
  if (!runtime) return null
  const liveJobs = Boolean(runtime.jobs?.configured)
  const liveAi = Boolean(runtime.ai?.configured)
  if (liveJobs && liveAi) return null

  return (
    <div style={{
      padding: '8px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)',
      fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-2)', display: 'flex', gap: 10,
    }}>
      <span style={{ color: 'var(--yellow)' }}>◌</span>
      <span style={{ flex: 1 }}>
        {liveJobs ? 'Live jobs connected.' : 'Jobs are in demo mode.'} {liveAi ? `AI connected (${runtime.ai.model}).` : 'AI uses truth-safe templates.'}
        {' '}Self-hosters can enable providers with server-side environment variables.
      </span>
    </div>
  )
}

function GhostBar({ result }) {
  const score = result?.score ?? 0
  const warnings = result?.warnings || []
  const [open, setOpen] = useState(false)
  const cls = score >= 80 ? 'high' : score >= 60 ? 'med' : 'low'

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        type="button"
        className="job-ghost-bar"
        onClick={() => setOpen(previous => !previous)}
        style={{ cursor: warnings.length ? 'pointer' : 'default', width: '100%', border: 0, background: 'transparent' }}
      >
        <span className="ghost-label">Listing confidence</span>
        <div className="ghost-track"><div className={`ghost-fill ${cls}`} style={{ width: `${score}%` }} /></div>
        <span className="ghost-pct">{score}%</span>
      </button>
      {open && warnings.length > 0 && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--yellow)', lineHeight: 1.7, paddingTop: 4 }}>
          {warnings.map(warning => <div key={warning}>⚠ {warning}</div>)}
        </div>
      )}
    </div>
  )
}

function JobCard({ job, index, onPrepare }) {
  const { selectedJob, setSelectedJob, addMessage } = useAgent()
  const source = SOURCE_LABELS[job.source] || SOURCE_LABELS.naukri
  const demo = job.dataSource === 'demo'

  const analyze = () => {
    setSelectedJob(job)
    const warnings = job.ghostResult?.warnings || []
    addMessage({
      type: 'agent',
      text: `${job.title} @ ${job.company}\nMatch: ${job.matchScore}% · listing confidence: ${job.ghostResult?.score || 0}%\n${warnings.join('\n') || 'No major listing-quality warnings from the available feed.'}\n\n${job.humanData?.outreachTip || ''}`,
    })
  }

  return (
    <div className={`job-card ${selectedJob?.id === job.id ? 'selected' : ''}`} onClick={() => setSelectedJob(job)}>
      <div className="job-card-header">
        <div className="job-card-title">{index}. {job.title} @ {job.company}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className={`badge ${source.cls}`} style={{ fontSize: 9 }}>{source.label}</span>
          <span className={`badge ${demo ? 'badge-yellow' : 'badge-green'}`} style={{ fontSize: 9 }}>{demo ? 'DEMO' : 'LIVE'}</span>
          <div className="job-score">{job.matchScore}%</div>
        </div>
      </div>
      <div className="job-card-meta">
        <span>⏱ {job.postedHoursAgo}h</span>
        {job.salary && <span>💰 {job.salary}</span>}
        <span>📍 {job.location}</span>
      </div>
      <GhostBar result={job.ghostResult} />
      {job.skills?.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
          {job.skills.slice(0, 6).map(skill => <span key={skill} className="badge">{skill}</span>)}
        </div>
      )}
      <div className="job-actions" onClick={event => event.stopPropagation()}>
        <button className="btn btn-primary" onClick={() => onPrepare(job)} type="button">⚡ Prepare</button>
        <button className="btn btn-ghost" onClick={analyze} type="button">Analyze</button>
        {job.url ? <a href={job.url} target="_blank" rel="noreferrer" className="btn btn-ghost">↗ Apply</a> : <button className="btn btn-ghost" disabled type="button">Demo only</button>}
        <a href={job.humanData?.linkedinUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">Find human</a>
      </div>
    </div>
  )
}

function ChatMessages({ onPrepare }) {
  const { messages, jobs, agentStatus } = useAgent()
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, jobs, agentStatus])

  return (
    <div className="chat-messages">
      {messages.length === 0 && (
        <div className="msg">
          <span className="msg-agent" style={{ color: 'var(--text-2)', fontSize: 12 }}>
            {'— OfferClaw v1.0.0 — persistent, supervised career agent —'}<br /><br />
            {'Try:'}<br />
            {'  > find me jobs'}<br />
            {'  > analyze 1'}<br />
            {'  > prepare 1'}<br />
            {'  > daily digest'}<br />
            {'  > status'}
          </span>
        </div>
      )}
      {messages.map(message => (
        <div key={message.id} className="msg">
          {message.type === 'user'
            ? <span className="msg-prompt">{message.text}</span>
            : <span className="msg-agent">{message.text}</span>}
        </div>
      ))}
      {jobs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
          {jobs.map((job, index) => <JobCard key={job.id} job={job} index={index + 1} onPrepare={onPrepare} />)}
        </div>
      )}
      {(agentStatus === 'thinking' || agentStatus === 'running') && (
        <div className="msg"><span className="msg-agent" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="spinner" /> processing...</span></div>
      )}
      <div ref={endRef} />
    </div>
  )
}

function ChatInput({ onSubmit }) {
  const [value, setValue] = useState('')
  const { agentStatus } = useAgent()
  const busy = agentStatus !== 'idle'

  const submit = () => {
    const command = value.trim()
    if (!command || busy) return
    onSubmit(command)
    setValue('')
  }

  return (
    <div className="chat-input-bar">
      <span className="chat-prompt-symbol">{'>'}</span>
      <textarea
        id="chat-input"
        className="chat-input"
        rows={1}
        value={value}
        disabled={busy}
        placeholder="find me jobs | analyze 1 | prepare 1 | status"
        onChange={event => setValue(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
      />
      <button className="btn btn-primary chat-send-btn" onClick={submit} disabled={busy} type="button">Run</button>
    </div>
  )
}

function PackageSection({ title, value, onCopy }) {
  if (!value || (Array.isArray(value) && value.length === 0)) return null
  const text = Array.isArray(value) ? value.join('\n') : value

  return (
    <div className="pkg-section">
      <div className="pkg-section-header">
        <span className="pkg-section-title">▸ {title}</span>
        <button className="btn btn-link" onClick={() => onCopy(text)} type="button">⎘ copy</button>
      </div>
      <div className="pkg-section-body">
        {Array.isArray(value)
          ? <div className="pkg-bullets">{value.map(item => <div className="pkg-bullet" key={item}>{item}</div>)}</div>
          : <div className="pkg-text">{value}</div>}
      </div>
    </div>
  )
}

function AppPanel() {
  const { selectedJob, appPackage, clearPackage, saveApplication, addToast } = useAgent()

  const copy = async (text) => {
    await navigator.clipboard.writeText(text)
    addToast('Copied to clipboard', 'info')
  }

  const approve = async () => {
    if (!selectedJob || !appPackage) return
    const bundle = [
      'RESUME DELTA', ...(appPackage.resumeDelta || []), '',
      'COVER LETTER', appPackage.coverLetter || '', '',
      'LINKEDIN DM', appPackage.dm || '', '',
      'EMAIL SUBJECT', appPackage.emailSubject || '', '',
      'PROOF CHECKS', ...(appPackage.proofChecks || []),
    ].join('\n')
    await copy(bundle)
    saveApplication(selectedJob)
    if (selectedJob.url) window.open(selectedJob.url, '_blank', 'noopener,noreferrer')
    addToast(selectedJob.url ? 'Package copied and application logged' : 'Demo package copied and logged', 'success')
  }

  if (!selectedJob) {
    return (
      <aside className="app-panel">
        <div className="panel-header"><span className="panel-title">Application Package</span></div>
        <div className="panel-empty"><div className="panel-empty-icon">◈</div><span>Select a job and click Prepare</span><span className="text-muted">Truth-checked drafts · gaps · proof checks</span></div>
      </aside>
    )
  }

  if (!appPackage) {
    return (
      <aside className="app-panel">
        <div className="panel-header"><span className="panel-title">Selected · {selectedJob.company}</span></div>
        <div className="panel-empty"><span>Click ⚡ Prepare to compose a package.</span></div>
      </aside>
    )
  }

  return (
    <aside className="app-panel">
      <div className="panel-header">
        <span className="panel-title">Package · {selectedJob.company}</span>
        <button className="btn btn-link" onClick={clearPackage} type="button">✕</button>
      </div>
      <div className="panel-content">
        <div style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 10, color: appPackage.mode === 'ai' ? 'var(--green)' : 'var(--yellow)' }}>
          {appPackage.mode === 'ai' ? '● Gemini structured output' : '◌ Template mode'} · verify before sending
        </div>
        <PackageSection title="Resume Delta" value={appPackage.resumeDelta} onCopy={copy} />
        <PackageSection title="Match Narrative" value={appPackage.matchNarrative} onCopy={copy} />
        <PackageSection title="Evidence Gaps" value={appPackage.gaps} onCopy={copy} />
        <PackageSection title="Cover Letter" value={appPackage.coverLetter} onCopy={copy} />
        <PackageSection title="LinkedIn DM" value={appPackage.dm} onCopy={copy} />
        <PackageSection title="Email Subject" value={appPackage.emailSubject} onCopy={copy} />
        <PackageSection title="Proof Checks" value={appPackage.proofChecks} onCopy={copy} />
        {selectedJob.humanData && (
          <div className="pkg-section">
            <div className="pkg-section-header"><span className="pkg-section-title">▸ Human route</span></div>
            <div className="pkg-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="pkg-text">{selectedJob.humanData.outreachTip}</div>
              <a href={selectedJob.humanData.linkedinUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">↗ Search LinkedIn</a>
            </div>
          </div>
        )}
      </div>
      <div className="pkg-approve-bar">
        <button className="btn btn-primary w-full" onClick={approve} type="button" style={{ justifyContent: 'center' }}>
          ⚡ Copy + Log {selectedJob.url ? '+ Open Apply' : '(Demo)'}
        </button>
      </div>
    </aside>
  )
}

function TrackerView({ now }) {
  const { tracker, setTracker, profile, addToast } = useAgent()
  const [followUp, setFollowUp] = useState(null)

  const patchItem = (id, patch) => {
    setTracker(previous => previous.map(item => item.id === id ? { ...item, ...patch } : item))
  }

  const openFollowUp = (item, day) => setFollowUp({ item, day, message: skillFollowUp(item, profile, day) })

  const confirmFollowUp = async () => {
    if (!followUp) return
    const { item, day, message } = followUp
    await navigator.clipboard.writeText([message.subject, message.content].filter(Boolean).join('\n\n'))
    if (day === 3) patchItem(item.id, { followUpDay3: new Date().toISOString() })
    if (day === 5) patchItem(item.id, { followUpDay5: new Date().toISOString() })
    if (day === 7) patchItem(item.id, { status: 'archived' })
    setFollowUp(null)
    addToast(`Day ${day} follow-up copied`, 'success')
  }

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {followUp && (
        <div className="modal-overlay" onClick={() => setFollowUp(null)}>
          <div className="modal" onClick={event => event.stopPropagation()}>
            <div className="modal-header"><div className="modal-title">{followUp.message.label}</div><div className="modal-subtitle">{followUp.item.company} · {followUp.item.jobTitle}</div></div>
            <div className="modal-body">
              {followUp.message.subject && <div className="field-group"><label className="field-label">Subject</label><div className="field-input">{followUp.message.subject}</div></div>}
              <div className="field-group"><label className="field-label">Message</label><div className="field-textarea" style={{ whiteSpace: 'pre-wrap' }}>{followUp.message.content}</div></div>
            </div>
            <div className="modal-footer"><button className="btn btn-ghost" onClick={() => setFollowUp(null)} type="button">Cancel</button><button className="btn btn-primary" onClick={confirmFollowUp} type="button">Copy + mark done</button></div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', padding: 14, borderBottom: '1px solid var(--border)' }}>
        <span className="text-muted text-xs text-mono">{tracker.length} applications</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost" onClick={() => exportTrackerCSV(tracker)} type="button">↓ CSV</button>
          <button className="btn btn-ghost" onClick={() => exportTrackerJSON(tracker)} type="button">↓ JSON</button>
          <button className="btn btn-danger" onClick={() => { if (confirm('Clear all pipeline data?')) setTracker([]) }} type="button">Clear</button>
        </div>
      </div>

      {tracker.length === 0 && <div className="panel-empty" style={{ minHeight: 220 }}><div className="panel-empty-icon">◈</div><span>No applications yet</span></div>}
      <div className="tracker-list">
        {tracker.map(item => {
          const age = daysSince(item.appliedAt, now)
          const day3 = age >= 3 && !item.followUpDay3 && item.status === 'applied'
          const day5 = age >= 5 && !item.followUpDay5 && item.status === 'applied'
          const archive = age >= 7 && item.status === 'applied'
          return (
            <div className={`tracker-item ${day3 || day5 ? 'needs-followup' : ''}`} key={item.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div className="tracker-item-title">{item.jobTitle}</div>
                <div className="tracker-item-co">{item.company}</div>
                <div className="tracker-item-day" style={{ marginLeft: 'auto' }}>{age === 0 ? 'Today' : `Day ${age}`}</div>
                <span className={`badge ${item.status === 'response' ? 'badge-green' : day5 ? 'badge-red' : day3 ? 'badge-yellow' : ''}`}>{item.status}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {day3 && <button className="btn btn-ghost" onClick={() => openFollowUp(item, 3)} type="button">Day 3 DM</button>}
                {day5 && <button className="btn btn-ghost" onClick={() => openFollowUp(item, 5)} type="button">Day 5 email</button>}
                {archive && <button className="btn btn-ghost" onClick={() => openFollowUp(item, 7)} type="button">Refocus</button>}
                {item.status === 'applied' && <button className="btn btn-ghost" onClick={() => patchItem(item.id, { status: 'response' })} type="button">Mark response</button>}
                {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="btn btn-link">Open listing ↗</a>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SettingsView({ runtime }) {
  const { profile, setProfile, addToast } = useAgent()
  const [form, setForm] = useState({
    name: profile?.name || '',
    currentRole: profile?.currentRole || '',
    experience: profile?.experience || '',
    skills: profile?.skills || '',
    location: profile?.location || '',
    achievement: profile?.achievement || '',
    resume: profile?.resume || '',
  })
  const fileRef = useRef(null)

  const handleFile = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = loadEvent => setForm(previous => ({ ...previous, resume: String(loadEvent.target?.result || '') }))
    reader.readAsText(file)
  }

  const save = () => {
    setProfile(form)
    addToast('Profile saved locally', 'success')
  }

  return (
    <div style={{ overflow: 'auto', flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 620 }}>
      <div className="text-muted text-xs text-mono">PROFILE & RUNTIME</div>
      {[
        ['name', 'Full Name', 'Your name'],
        ['currentRole', 'Target Role', 'Frontend Engineer, AI Product Engineer...'],
        ['experience', 'Experience', '2 years / fresher / internships...'],
        ['location', 'Location Preference', 'Bengaluru / Remote / India'],
        ['skills', 'Top Skills', 'React, TypeScript, Python, LLM APIs'],
        ['achievement', 'Best Verified Proof Point', 'A real result you can defend in an interview'],
      ].map(([key, label, placeholder]) => (
        <div className="field-group" key={key}>
          <label className="field-label">{label}</label>
          <input className="field-input" value={form[key]} placeholder={placeholder} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))} />
        </div>
      ))}

      <div className="field-group">
        <label className="field-label">Resume / CV text</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()} type="button">📄 Load .txt / .md</button>
          {form.resume && <span className="text-muted text-xs text-mono">{form.resume.length.toLocaleString()} chars</span>}
          <input ref={fileRef} type="file" accept=".txt,.md" hidden onChange={handleFile} />
        </div>
        <textarea className="field-textarea" value={form.resume} onChange={event => setForm(previous => ({ ...previous, resume: event.target.value }))} placeholder="Paste resume text. Generated content will be constrained to this evidence." style={{ minHeight: 120 }} />
      </div>

      <button className="btn btn-primary" onClick={save} type="button" style={{ alignSelf: 'flex-start' }}>Save Profile</button>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="field-label">Secure provider runtime</div>
        <div className="pkg-text">Gemini: {runtime?.ai?.configured ? `ready · ${runtime.ai.model} · Interactions API` : 'not configured · templates active'}</div>
        <div className="pkg-text">Jobs: {runtime?.jobs?.configured ? 'JSearch ready' : 'not configured · demo listings active'}</div>
        <div className="text-muted text-xs text-mono" style={{ lineHeight: 1.6 }}>
          OfferClaw no longer asks users to paste provider secrets into the browser. Self-hosted deployments configure GEMINI_API_KEY and JSEARCH_API_KEY on the server.
        </div>
      </div>
    </div>
  )
}

function Onboarding({ onDone }) {
  const [form, setForm] = useState({ name: '', currentRole: '', skills: '', location: '' })
  const ready = form.name.trim() && form.currentRole.trim()

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header"><div className="modal-title">Welcome to OfferClaw</div><div className="modal-subtitle">Set your search direction. No account required.</div></div>
        <div className="modal-body">
          {[
            ['name', 'Your Name', 'Chandan Pandey'],
            ['currentRole', 'Target Role', 'AI Engineer, Product Engineer...'],
            ['skills', 'Top Skills', 'Python, React, AI agents...'],
            ['location', 'Location', 'India / Remote / Bengaluru'],
          ].map(([key, label, placeholder]) => (
            <div className="field-group" key={key}><label className="field-label">{label}</label><input className="field-input" value={form[key]} placeholder={placeholder} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))} /></div>
          ))}
          <div className="text-muted text-xs text-mono" style={{ lineHeight: 1.6 }}>Your profile and pipeline stay in this browser. AI/job-provider secrets belong on the server, not in localStorage.</div>
        </div>
        <div className="modal-footer"><button className="btn btn-primary" disabled={!ready} onClick={() => ready && onDone(form)} type="button">Launch Agent →</button></div>
      </div>
    </div>
  )
}

function ToastStack() {
  const { toasts } = useAgent()
  return <div className="toast-stack">{toasts.map(toast => <div className="toast" key={toast.id}>{toast.text}</div>)}</div>
}

function DailyDigestBanner() {
  const { tracker, profile, addMessage } = useAgent()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('offerclaw_digest_dismissed') === new Date().toDateString())
  const digest = skillDailyDigest(tracker, profile)
  if (dismissed || (!digest.pending.length && digest.todayApplied >= digest.targetForDay)) return null

  const open = () => {
    addMessage({ type: 'agent', text: digest.message })
    const today = new Date().toDateString()
    localStorage.setItem('offerclaw_digest_dismissed', today)
    setDismissed(true)
  }

  return (
    <div style={{ background: 'var(--accent-glow)', borderBottom: '1px solid rgba(217,119,6,0.25)', padding: '8px 14px', display: 'flex', gap: 10, alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      <span style={{ color: 'var(--accent)' }}>⚡</span>
      <span style={{ flex: 1 }}>{digest.pending.length ? `${digest.pending.length} follow-up${digest.pending.length === 1 ? '' : 's'} due` : `${digest.todayApplied}/${digest.targetForDay} focused applications today`}</span>
      <button className="btn btn-ghost" onClick={open} type="button">View digest</button>
    </div>
  )
}

export default function App() {
  const {
    profile, setProfile, addMessage, jobs, setJobs,
    setSelectedJob, setAppPackage, setAgentStatus,
    tracker, view, setView, addToast,
  } = useAgent()
  const [runtime, setRuntime] = useState(null)

  useEffect(() => {
    let active = true
    fetch('/api/health', { headers: { Accept: 'application/json' } })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('health')))
      .then(data => { if (active) setRuntime(data) })
      .catch(() => { if (active) setRuntime({ ok: false, ai: { configured: false }, jobs: { configured: false } }) })
    return () => { active = false }
  }, [])

  const prepare = async (job) => {
    setSelectedJob(job)
    setAppPackage(null)
    setAgentStatus('running')
    addMessage({ type: 'agent', text: `Building a truth-checked package for ${job.company}...` })
    const pkg = await skillApplicationComposer(job, profile)
    setAppPackage(pkg)
    addMessage({ type: 'agent', text: pkg.mode === 'ai' ? '✅ Structured AI package ready. Review evidence gaps before sending.' : '◌ Template package ready. Configure server-side Gemini to enable structured AI drafting.' })
    setAgentStatus('idle')
  }

  const submit = async (input) => {
    if (!profile) return
    addMessage({ type: 'user', text: input })
    setAgentStatus('thinking')
    await runAgent(input, profile, null, tracker, {
      currentJobs: jobs,
      onMessage: message => addMessage(message),
      onJobs: setJobs,
      onSetView: setView,
      onError: error => addToast(error, 'error'),
      onDone: async index => {
        if (typeof index === 'number') {
          const job = jobs[index - 1]
          if (job) await prepare(job)
          else addMessage({ type: 'agent', text: 'That job number is not available. Run “find me jobs” first.' })
        }
      },
    })
    setAgentStatus('idle')
  }

  const finishOnboarding = (data) => {
    setProfile(data)
    addMessage({ type: 'agent', text: `Welcome, ${data.name}. Start with “find me jobs”, then use “analyze 1” before deciding where to spend your time.` })
  }

  return (
    <>
      {!profile && <Onboarding onDone={finishOnboarding} />}
      <div className="app-layout">
        <Topbar runtime={runtime} />
        <Sidebar now={SESSION_NOW} />
        <main className="app-chat">
          {view === 'chat' && <RuntimeNotice runtime={runtime} />}
          {view === 'chat' && <DailyDigestBanner />}
          {view === 'chat' && <><ChatMessages onPrepare={prepare} /><ChatInput onSubmit={submit} /></>}
          {view === 'tracker' && <TrackerView now={SESSION_NOW} />}
          {view === 'settings' && <SettingsView runtime={runtime} />}
        </main>
        {view === 'chat' && <AppPanel />}
      </div>
      <ToastStack />
    </>
  )
}
