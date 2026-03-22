import { useState, useRef, useEffect, useCallback } from 'react'
import { useAgent } from './AgentContext'
import { runAgent, skillApplicationComposer, skillFollowUp, skillDailyDigest, exportTrackerCSV, exportTrackerJSON } from './agent'

// ════════════════════════════════════════════════════════════
// TOPBAR
// ════════════════════════════════════════════════════════════
function Topbar() {
  const { agentStatus, streak } = useAgent()
  const dot = agentStatus === 'thinking' ? 'thinking' : agentStatus === 'running' ? 'live' : ''
  return (
    <header className="app-topbar">
      <div className="app-logo">
        <div className="app-logo-mark">H</div>
        HireOS Agent
      </div>
      <div className="topbar-divider" />
      <div className="topbar-status">
        <span className={`status-dot ${dot}`} />
        {agentStatus === 'thinking' ? 'thinking...' : agentStatus === 'running' ? 'running' : 'ready'}
      </div>
      <div className="topbar-divider" />
      <span className="text-muted text-xs text-mono">v1.0.0-alpha · quality-first job search</span>
      <div className="topbar-right">
        {streak > 0 && <div className="streak-badge">🔥 {streak}-day streak</div>}
      </div>
    </header>
  )
}

// ════════════════════════════════════════════════════════════
// SIDEBAR
// ════════════════════════════════════════════════════════════
function Sidebar() {
  const { profile, view, setView, tracker, streak } = useAgent()

  const todayApplied = tracker.filter(t =>
    new Date(t.appliedAt).toDateString() === new Date().toDateString()
  ).length

  const followUpsDue = tracker.filter(t => {
    const age = Math.floor((Date.now() - new Date(t.appliedAt)) / 86400000)
    return t.status === 'applied' && (
      (age >= 3 && !t.followUpDay3) ||
      (age >= 5 && !t.followUpDay5)
    )
  }).length

  const responseRate = tracker.length > 0
    ? Math.round((tracker.filter(t => t.status === 'response').length / tracker.length) * 100)
    : 0

  const nav = [
    { id: 'chat', icon: '⌥', label: 'Agent Chat' },
    { id: 'tracker', icon: '◈', label: 'Pipeline', badge: followUpsDue > 0 ? followUpsDue : null },
    { id: 'settings', icon: '⚙', label: 'Settings' },
  ]

  return (
    <aside className="app-sidebar">
      <div className="sidebar-section">
        <div className="sidebar-label">Profile</div>
        <div className="profile-card">
          <div className="profile-name">{profile?.name || 'Not set'}</div>
          <div className="profile-role">{profile?.currentRole || 'Set up profile →'}</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {nav.map(item => (
          <div key={item.id}
            className={`nav-item ${view === item.id ? 'active' : ''}`}
            onClick={() => setView(item.id)}
          >
            <span className="nav-item-icon">{item.icon}</span>
            {item.label}
            {item.badge && (
              <span style={{
                marginLeft: 'auto', background: 'var(--accent)', color: 'var(--bg-0)',
                fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
              }}>{item.badge}</span>
            )}
          </div>
        ))}
      </nav>

      <div className="sidebar-stats">
        <div className="sidebar-label">Today</div>
        <div className="stat-row">
          <span className="stat-label">Applied</span>
          <span className={`stat-val ${todayApplied >= 3 ? 'good' : todayApplied >= 1 ? 'accent' : ''}`}>
            {todayApplied}/3
          </span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Follow-ups</span>
          <span className={`stat-val ${followUpsDue > 0 ? 'warn' : 'good'}`}>
            {followUpsDue > 0 ? `${followUpsDue} due` : 'clear'}
          </span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Streak</span>
          <span className={`stat-val ${streak >= 7 ? 'good' : streak >= 3 ? 'accent' : ''}`}>
            {streak}d 🔥
          </span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Response</span>
          <span className={`stat-val ${responseRate >= 15 ? 'good' : responseRate >= 5 ? 'warn' : ''}`}>
            {responseRate}%
          </span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Pipeline</span>
          <span className="stat-val">{tracker.length}</span>
        </div>
      </div>
    </aside>
  )
}

// ════════════════════════════════════════════════════════════
// GHOST BAR
// ════════════════════════════════════════════════════════════
function GhostBar({ score, warnings }) {
  const cls = score >= 80 ? 'high' : score >= 60 ? 'med' : 'low'
  const label = score >= 80 ? 'Legit' : score >= 60 ? 'Caution' : 'Ghost?'
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="job-ghost-bar" onClick={() => warnings?.length && setOpen(o => !o)}
        style={{ cursor: warnings?.length ? 'pointer' : 'default' }}>
        <span className="ghost-label">Ghost: {label}</span>
        <div className="ghost-track">
          <div className={`ghost-fill ${cls}`} style={{ width: `${score}%` }} />
        </div>
        <span className="ghost-pct">{score}%</span>
        {warnings?.length > 0 && <span style={{ fontSize: 9, color: 'var(--yellow)', marginLeft: 4 }}>▾</span>}
      </div>
      {open && warnings?.length > 0 && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--yellow)', padding: '4px 0 2px', lineHeight: 1.8 }}>
          {warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// SOURCE BADGE
// ════════════════════════════════════════════════════════════
const SOURCE_LABELS = {
  company_site: { label: '🏢 Company Site', cls: 'badge-green', tip: 'Less competition — apply here first' },
  linkedin: { label: '🔗 LinkedIn', cls: 'badge-amber', tip: 'High volume of applicants — personalise further' },
  naukri: { label: '📋 Job Board', cls: 'badge-yellow', tip: 'Higher ghost-job risk — verify before applying' },
}

function SourceBadge({ source }) {
  const s = SOURCE_LABELS[source] || SOURCE_LABELS.naukri
  return (
    <span className={`badge ${s.cls}`} title={s.tip} style={{ fontSize: 9 }}>
      {s.label}
    </span>
  )
}

// ════════════════════════════════════════════════════════════
// JOB CARD
// ════════════════════════════════════════════════════════════
function JobCard({ job, index, onPrepare }) {
  const { selectedJob, setSelectedJob } = useAgent()
  const isSelected = selectedJob?.id === job.id
  const ghostScore = job.ghostResult?.score ?? job.ghostScore
  const ghostWarnings = job.ghostResult?.warnings

  return (
    <div
      className={`job-card ${isSelected ? 'selected' : ''}`}
      onClick={() => setSelectedJob(job)}
    >
      <div className="job-card-header">
        <div className="job-card-title">{index}. {job.title} @ {job.company}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <SourceBadge source={job.source} />
          <div className="job-score">{job.matchScore}%</div>
        </div>
      </div>
      <div className="job-card-meta">
        <span>⏱ {job.postedHoursAgo}h ago</span>
        {job.salary && <span>💰 {job.salary}</span>}
        <span>📍 {job.location}</span>
      </div>

      <GhostBar score={ghostScore} warnings={ghostWarnings} />

      {/* Company Intelligence — key differentiator */}
      {job.companySignals?.length > 0 && (
        <div className="job-signals">
          {job.companySignals.slice(0, 2).map((s, i) => (
            <div key={i} className="job-signal">📡 {s}</div>
          ))}
        </div>
      )}

      {job.contactName && (
        <div className="job-contact">
          <span className="contact-icon">👤</span>
          <span>{job.contactName}</span>
          <span className="text-muted">·</span>
          <span className="text-muted">{job.contactRole}</span>
        </div>
      )}
      <div className="job-actions" onClick={e => e.stopPropagation()}>
        <button className="btn btn-primary" id={`prepare-job-${index}`} onClick={() => onPrepare(job)}>
          ⚡ Prepare
        </button>
        <a href={job.url} target="_blank" rel="noreferrer" className="btn btn-ghost">↗ Apply</a>
        <a href={job.linkedinSearch || job.humanData?.linkedinUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
          LinkedIn
        </a>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// CHAT MESSAGES
// ════════════════════════════════════════════════════════════
function ChatMessages({ onPrepare }) {
  const { messages, jobs, agentStatus, messageEndRef } = useAgent()

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, jobs])

  return (
    <div className="chat-messages">
      {messages.length === 0 && (
        <div style={{ padding: '20px 0' }}>
          <div className="msg">
            <span className="msg-agent" style={{ color: 'var(--text-2)', fontSize: 12 }}>
              {'— HireOS Agent v1.0 — quality-first job search —'}<br />
              <br />
              {'Commands:'}<br />
              {'  > find me jobs'}<br />
              {'  > daily digest'}<br />
              {'  > prepare 1'}<br />
              {'  > help'}
            </span>
          </div>
        </div>
      )}

      {messages.map(msg => (
        <div key={msg.id} className="msg">
          {msg.type === 'user'
            ? <span className="msg-prompt">{msg.text}</span>
            : <span className="msg-agent">{msg.text}</span>
          }
        </div>
      ))}

      {jobs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
          {jobs.map((job, i) => (
            <JobCard key={job.id} job={job} index={i + 1} onPrepare={onPrepare} />
          ))}
        </div>
      )}

      {agentStatus === 'thinking' && (
        <div className="msg">
          <span className="msg-agent" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="spinner" /> processing...
          </span>
        </div>
      )}
      <div ref={messageEndRef} />
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// CHAT INPUT
// ════════════════════════════════════════════════════════════
function ChatInput({ onSubmit }) {
  const [val, setVal] = useState('')
  const { agentStatus } = useAgent()

  const submit = () => {
    const t = val.trim()
    if (!t || agentStatus === 'thinking') return
    onSubmit(t)
    setVal('')
  }

  return (
    <div className="chat-input-bar">
      <span className="chat-prompt-symbol">{'>'}</span>
      <textarea
        id="chat-input"
        className="chat-input"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
        placeholder="find me jobs | prepare 1 | daily digest | help"
        rows={1}
        disabled={agentStatus === 'thinking'}
      />
      <button id="chat-run-btn" className="btn btn-primary chat-send-btn" onClick={submit} disabled={agentStatus === 'thinking'}>
        Run
      </button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// APPLICATION PACKAGE PANEL
// ════════════════════════════════════════════════════════════
function AppPanel() {
  const { selectedJob, appPackage, clearPackage, saveApplication, addToast } = useAgent()
  const [copied, setCopied] = useState(null)

  const copy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      addToast('Copied to clipboard!', 'info')
      setTimeout(() => setCopied(null), 1500)
    })
  }

  const approveAll = () => {
    if (!appPackage || !selectedJob) return
    const text = [
      '══ RESUME DELTA ══',
      ...(appPackage.resumeDelta || []).map(b => `• ${b}`),
      '',
      '══ COVER LETTER ══',
      appPackage.coverLetter,
      '',
      '══ LINKEDIN DM ══',
      appPackage.dm,
      '',
      '══ EMAIL SUBJECT ══',
      appPackage.emailSubject,
    ].join('\n')

    navigator.clipboard.writeText(text)
    saveApplication(selectedJob)
    window.open(selectedJob.url, '_blank')
    addToast('🚀 Applied! Package copied, application logged. Follow-up set for Day 3 & 5.', 'success')
  }

  if (!selectedJob) {
    return (
      <aside className="app-panel">
        <div className="panel-header"><span className="panel-title">Application Package</span></div>
        <div className="panel-empty">
          <div className="panel-empty-icon">◈</div>
          <span>Select a job → click ⚡ Prepare</span>
          <span className="text-muted">Resume delta · Cover letter · LinkedIn DM · Email</span>
        </div>
      </aside>
    )
  }

  if (!appPackage) {
    return (
      <aside className="app-panel">
        <div className="panel-header"><span className="panel-title">Generating package...</span></div>
        <div className="panel-empty">
          <div className="spinner" style={{ width: 20, height: 20 }} />
          <span>Composing for {selectedJob.company}</span>
          <span className="text-muted">Resume delta · cover letter · DM · email</span>
        </div>
      </aside>
    )
  }

  const sections = [
    {
      id: 'delta',
      title: '▸ Resume Delta (add these 3 bullets)',
      content: (appPackage.resumeDelta || []).join('\n'),
      render: () => (
        <div className="pkg-bullets">
          {(appPackage.resumeDelta || []).map((b, i) => <div key={i} className="pkg-bullet">{b}</div>)}
        </div>
      ),
    },
    {
      id: 'cover',
      title: '▸ Cover Letter',
      content: appPackage.coverLetter,
      render: () => <div className="pkg-text">{appPackage.coverLetter}</div>,
    },
    {
      id: 'dm',
      title: `▸ LinkedIn DM → ${selectedJob.contactName}`,
      content: appPackage.dm,
      render: () => <div className="pkg-text">{appPackage.dm}</div>,
    },
    {
      id: 'subject',
      title: '▸ Email Subject Line',
      content: appPackage.emailSubject,
      render: () => <div className="pkg-text">{appPackage.emailSubject}</div>,
    },
  ]

  return (
    <aside className="app-panel">
      <div className="panel-header">
        <span className="panel-title">Package · {selectedJob.company}</span>
        <button className="btn btn-link" onClick={clearPackage} id="panel-close">✕</button>
      </div>

      <div className="panel-content">
        {sections.map(s => (
          <div key={s.id} className="pkg-section">
            <div className="pkg-section-header" onClick={() => copy(s.content, s.id)}>
              <span className="pkg-section-title">{s.title}</span>
              <span className="pkg-section-check" style={{ color: copied === s.id ? 'var(--green)' : 'var(--accent)' }}>
                {copied === s.id ? '✓ copied' : '⎘ copy'}
              </span>
            </div>
            <div className="pkg-section-body">{s.render()}</div>
          </div>
        ))}

        {/* Human Finder */}
        {selectedJob.humanData && (
          <div className="pkg-section">
            <div className="pkg-section-header">
              <span className="pkg-section-title">▸ Human Finder</span>
              <span className="pkg-section-check text-accent" onClick={() => copy(selectedJob.humanData.bestGuess, 'email')}>
                {copied === 'email' ? '✓ copied' : '⎘ email'}
              </span>
            </div>
            <div className="pkg-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="pkg-text bold">{selectedJob.humanData.name} · {selectedJob.humanData.role}</div>
              <div className="pkg-text text-muted">📧 {selectedJob.humanData.bestGuess}</div>
              <div className="pkg-text text-muted" style={{ fontSize: 10 }}>
                Alt: {selectedJob.humanData.emailPatterns.slice(1).join(' · ')}
              </div>
              <a href={selectedJob.humanData.linkedinUrl} target="_blank" rel="noreferrer"
                className="btn btn-ghost" style={{ marginTop: 2 }}>
                ↗ Open LinkedIn Profile
              </a>
            </div>
          </div>
        )}
      </div>

      <div className="pkg-approve-bar">
        <button id="approve-all-btn" className="btn btn-primary w-full" onClick={approveAll} style={{ justifyContent: 'center' }}>
          ⚡ Approve All — Apply + Log + DM
        </button>
      </div>
    </aside>
  )
}

// ════════════════════════════════════════════════════════════
// TRACKER VIEW (Sprint 2 — Follow-Up Engine)
// ════════════════════════════════════════════════════════════
function TrackerView() {
  const { tracker, setTracker, profile, addToast } = useAgent()
  const [activeFollowUp, setActiveFollowUp] = useState(null) // { item, msg }

  const updateItem = (id, patch) => {
    const updated = tracker.map(t => t.id === id ? { ...t, ...patch } : t)
    setTracker(updated)
    localStorage.setItem('hireos_tracker', JSON.stringify(updated))
  }

  const generateFollowUp = (item, day) => {
    const msg = skillFollowUp(item, profile, day)
    setActiveFollowUp({ item, msg, day })
  }

  const confirmFollowUp = () => {
    if (!activeFollowUp) return
    const { item, day } = activeFollowUp
    navigator.clipboard.writeText(activeFollowUp.msg.content)
    if (day === 3) updateItem(item.id, { followUpDay3: new Date().toISOString() })
    if (day === 5) updateItem(item.id, { followUpDay5: new Date().toISOString() })
    if (day === 7) updateItem(item.id, { status: 'archived' })
    addToast(`Day ${day} message copied!`, 'success')
    setActiveFollowUp(null)
  }

  const markResponse = (id) => {
    updateItem(id, { status: 'response' })
    addToast('🎉 Marked as responded! Great sign.', 'success')
  }

  if (tracker.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        <div style={{ fontSize: 32 }}>◈</div>
        <div>No applications yet</div>
        <div style={{ color: 'var(--text-3)', fontSize: 11 }}>Use the Agent Chat to find and apply to jobs</div>
      </div>
    )
  }

  const active = tracker.filter(t => t.status !== 'archived')
  const archived = tracker.filter(t => t.status === 'archived')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Follow-up message modal */}
      {activeFollowUp && (
        <div className="modal-overlay" onClick={() => setActiveFollowUp(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{activeFollowUp.msg.label}</div>
              <div className="modal-subtitle">{activeFollowUp.item.company} · {activeFollowUp.item.jobTitle}</div>
            </div>
            <div className="modal-body">
              {activeFollowUp.msg.subject && (
                <div className="field-group">
                  <label className="field-label">Email Subject</label>
                  <div className="field-input" style={{ cursor: 'text' }}>{activeFollowUp.msg.subject}</div>
                </div>
              )}
              <div className="field-group">
                <label className="field-label">Message</label>
                <div className="field-textarea" style={{ whiteSpace: 'pre-wrap', cursor: 'text', minHeight: 100 }}>
                  {activeFollowUp.msg.content}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setActiveFollowUp(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmFollowUp}>
                ⎘ Copy + Mark Done
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ overflow: 'auto', flex: 1 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {active.length} active · {archived.length} archived
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost" style={{ fontSize: 9, padding: '2px 6px' }}
              onClick={() => { exportTrackerCSV(tracker); addToast('CSV exported!', 'success') }}>
              ↓ CSV
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 9, padding: '2px 6px' }}
              onClick={() => { exportTrackerJSON(tracker); addToast('JSON exported!', 'success') }}>
              ↓ JSON
            </button>
            <button className="btn btn-danger" style={{ fontSize: 9, padding: '2px 6px' }}
              onClick={() => {
                if (confirm('Clear ALL application data? This cannot be undone.')) {
                  setTracker([])
                  localStorage.removeItem('hireos_tracker')
                  addToast('All data cleared.', 'info')
                }
              }}>
              ✕ Clear
            </button>
          </div>
        </div>

        <div className="tracker-list">
          {active.map(item => {
            const daysAgo = Math.floor((Date.now() - new Date(item.appliedAt)) / 86400000)
            const needsDay3 = daysAgo >= 3 && !item.followUpDay3 && item.status === 'applied'
            const needsDay5 = daysAgo >= 5 && !item.followUpDay5 && item.status === 'applied'
            const needsArchive = daysAgo >= 7 && item.status === 'applied'

            return (
              <div key={item.id} className={`tracker-item ${needsDay3 || needsDay5 ? 'needs-followup' : ''}`}
                style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10 }}>
                  <div className="tracker-item-title">{item.jobTitle}</div>
                  <div className="tracker-item-co">{item.company}</div>
                  <div className="tracker-item-day" style={{ marginLeft: 'auto' }}>
                    {daysAgo === 0 ? 'Today' : `Day ${daysAgo}`}
                  </div>
                  <div>
                    {item.status === 'response'
                      ? <span className="badge badge-green">Response ✓</span>
                      : needsArchive ? <span className="badge badge-red">7d — Archive?</span>
                      : needsDay5 ? <span className="badge badge-red">Day 5 email due</span>
                      : needsDay3 ? <span className="badge badge-yellow">Day 3 DM due</span>
                      : <span className="badge badge-green">Applied</span>
                    }
                  </div>
                </div>

                {/* Follow-up actions */}
                {(needsDay3 || needsDay5 || needsArchive) && item.status !== 'response' && (
                  <div style={{ display: 'flex', gap: 6, width: '100%', flexWrap: 'wrap' }}>
                    {needsDay3 && !item.followUpDay3 && (
                      <button className="btn btn-ghost" style={{ fontSize: 10 }}
                        onClick={() => generateFollowUp(item, 3)}>
                        ↗ Generate Day 3 DM
                      </button>
                    )}
                    {needsDay5 && !item.followUpDay5 && (
                      <button className="btn btn-ghost" style={{ fontSize: 10 }}
                        onClick={() => generateFollowUp(item, 5)}>
                        ✉ Generate Day 5 Email
                      </button>
                    )}
                    {needsArchive && (
                      <button className="btn btn-danger" style={{ fontSize: 10 }}
                        onClick={() => generateFollowUp(item, 7)}>
                        Archive
                      </button>
                    )}
                    {item.status !== 'response' && (
                      <button className="btn btn-ghost" style={{ fontSize: 10, color: 'var(--green)' }}
                        onClick={() => markResponse(item.id)}>
                        🎉 Got a response!
                      </button>
                    )}
                  </div>
                )}

                {/* Follow-up log */}
                {(item.followUpDay3 || item.followUpDay5) && (
                  <div style={{ display: 'flex', gap: 8, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
                    {item.followUpDay3 && <span>✓ Day 3 sent</span>}
                    {item.followUpDay5 && <span>✓ Day 5 sent</span>}
                  </div>
                )}
              </div>
            )
          })}

          {archived.length > 0 && (
            <>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '12px 0 4px' }}>
                Archived ({archived.length})
              </div>
              {archived.map(item => (
                <div key={item.id} className="tracker-item" style={{ opacity: 0.45 }}>
                  <div className="tracker-item-title">{item.jobTitle}</div>
                  <div className="tracker-item-co">{item.company}</div>
                  <div className="tracker-item-day" style={{ marginLeft: 'auto' }}>Archived</div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// SETTINGS VIEW (Sprint 2 — Resume upload, API key)
// ════════════════════════════════════════════════════════════
function SettingsView() {
  const { profile, setProfile, addToast } = useAgent()
  const [form, setForm] = useState({
    name: profile?.name || '',
    currentRole: profile?.currentRole || '',
    experience: profile?.experience || '',
    skills: profile?.skills || '',
    location: profile?.location || '',
    achievement: profile?.achievement || '',
    resume: profile?.resume || '',
    geminiKey: localStorage.getItem('hireos_gemini_key') || '',
    jsearchKey: localStorage.getItem('hireos_jsearch_key') || '',
  })
  const fileRef = useRef()

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setForm(f => ({ ...f, resume: ev.target.result }))
      addToast('Resume loaded (used for AI personalisation)', 'info')
    }
    reader.readAsText(file)
  }

  const save = () => {
    const { geminiKey, jsearchKey, ...profileData } = form
    setProfile(profileData)
    localStorage.setItem('hireos_profile', JSON.stringify(profileData))
    if (geminiKey) localStorage.setItem('hireos_gemini_key', geminiKey)
    else localStorage.removeItem('hireos_gemini_key')
    if (jsearchKey) localStorage.setItem('hireos_jsearch_key', jsearchKey)
    else localStorage.removeItem('hireos_jsearch_key')
    addToast('Profile & API keys saved!', 'success')
  }

  return (
    <div style={{ overflow: 'auto', flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 520 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        Profile & Settings
      </div>

      {[
        { key: 'name', label: 'Full Name', ph: 'Arjun Sharma' },
        { key: 'currentRole', label: 'Target Role', ph: 'Frontend Engineer, React Developer...' },
        { key: 'experience', label: 'Years of Experience', ph: '3' },
        { key: 'location', label: 'Location Preference', ph: 'Bangalore / Remote / Mumbai' },
        { key: 'skills', label: 'Top Skills (comma separated)', ph: 'React, TypeScript, Node.js, Redux' },
        { key: 'achievement', label: 'Best Achievement (1 line, quantified)', ph: 'Rebuilt checkout flow — 40% faster, $2M lift' },
      ].map(f => (
        <div key={f.key} className="field-group">
          <label className="field-label">{f.label}</label>
          <input className="field-input" placeholder={f.ph} value={form[f.key]}
            onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
        </div>
      ))}

      {/* Resume upload */}
      <div className="field-group">
        <label className="field-label">Resume / CV (text — optional, improves AI output)</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            📄 Upload .txt / .md resume
          </button>
          {form.resume && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)' }}>
              ✓ {Math.round(form.resume.length / 100) * 100} chars loaded
            </span>
          )}
          <input ref={fileRef} type="file" accept=".txt,.md" style={{ display: 'none' }} onChange={handleFile} />
        </div>
        <textarea className="field-textarea" placeholder="Or paste your resume text here..."
          value={form.resume} onChange={e => setForm(p => ({ ...p, resume: e.target.value }))}
          style={{ marginTop: 6, fontSize: 11, minHeight: 80 }} />
      </div>

      {/* API Keys section */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 8 }}>
        API Keys (BYOK — stored in browser only)
      </div>

      <div className="field-group">
        <label className="field-label">JSearch API Key — for real job listings (RapidAPI, 500 free/month)</label>
        <input className="field-input" type="password" placeholder="RapidAPI key..."
          value={form.jsearchKey} onChange={e => setForm(p => ({ ...p, jsearchKey: e.target.value }))} />
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          {form.jsearchKey
            ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)' }}>✓ Live mode — real job listings active</span>
            : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>No key — using demo data. Get free key from rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch</span>
          }
        </div>
      </div>

      <div className="field-group">
        <label className="field-label">Gemini API Key — for AI-personalised content (Google AI Studio, free)</label>
        <input className="field-input" type="password" placeholder="AIzaSy..."
          value={form.geminiKey} onChange={e => setForm(p => ({ ...p, geminiKey: e.target.value }))} />
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          {form.geminiKey
            ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)' }}>✓ AI mode — cover letters & DMs personalised by Gemini</span>
            : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>No key — using template content. Get free key at aistudio.google.com</span>
          }
        </div>
      </div>

      <button id="save-settings-btn" className="btn btn-primary" onClick={save} style={{ alignSelf: 'flex-start' }}>
        Save Profile & Keys
      </button>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <a href="https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch" target="_blank" rel="noreferrer" className="btn btn-link" style={{ padding: 0 }}>
          ↗ Get JSearch key (free)
        </a>
        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="btn btn-link" style={{ padding: 0 }}>
          ↗ Get Gemini key (free)
        </a>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// ONBOARDING
// ════════════════════════════════════════════════════════════
function Onboarding({ onDone }) {
  const [form, setForm] = useState({ name: '', currentRole: '', skills: '', location: '' })
  const canSubmit = form.name.trim() && form.currentRole.trim()

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">Welcome to HireOS Agent</div>
          <div className="modal-subtitle">30-second setup. No account needed.</div>
        </div>
        <div className="modal-body">
          {[
            { key: 'name', label: 'Your Name', ph: 'Arjun Sharma' },
            { key: 'currentRole', label: 'Role You Are Targeting', ph: 'Frontend Engineer, React Developer...' },
            { key: 'skills', label: 'Top Skills', ph: 'React, TypeScript, Node.js' },
            { key: 'location', label: 'Location / Preference', ph: 'Bangalore, Remote, Mumbai...' },
          ].map(f => (
            <div key={f.key} className="field-group">
              <label className="field-label">{f.label}</label>
              <input id={`onboard-${f.key}`} className="field-input" placeholder={f.ph}
                value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
            </div>
          ))}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)', lineHeight: 1.65 }}>
            💡 All data stays in your browser. Add a Gemini API key in Settings for AI-powered personalisation.
          </div>
        </div>
        <div className="modal-footer">
          <button id="launch-agent-btn" className="btn btn-primary" onClick={() => canSubmit && onDone(form)}
            style={{ opacity: canSubmit ? 1 : 0.45 }}>
            Launch Agent →
          </button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// TOASTS
// ════════════════════════════════════════════════════════════
function ToastStack() {
  const { toasts } = useAgent()
  return (
    <div className="toast-stack">
      {toasts.map(t => <div key={t.id} className="toast">{t.text}</div>)}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// DAILY DIGEST PROMPT (Sprint 3 — Morning nudge)
// ════════════════════════════════════════════════════════════
function DailyDigestBanner() {
  const { tracker, profile, addMessage, setView } = useAgent()
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('hireos_digest_dismissed') === new Date().toDateString()
  })

  const digest = skillDailyDigest(tracker, profile)
  const show = !dismissed && (digest.pending.length > 0 || digest.todayApplied < digest.targetForDay)

  if (!show) return null

  const openDigest = () => {
    addMessage({ type: 'agent', text: digest.message })
    setDismissed(true)
    localStorage.setItem('hireos_digest_dismissed', new Date().toDateString())
    setView('chat')
  }

  return (
    <div style={{
      background: 'var(--accent-glow)', border: '1px solid rgba(217,119,6,0.25)',
      padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10,
      fontFamily: 'var(--font-mono)', fontSize: 11,
    }}>
      <span style={{ color: 'var(--accent)' }}>⚡</span>
      <span style={{ color: 'var(--text-1)', flex: 1 }}>
        {digest.pending.length > 0
          ? `${digest.pending.length} follow-up${digest.pending.length > 1 ? 's' : ''} due today`
          : `Daily sprint: ${digest.todayApplied}/${digest.targetForDay} applications`}
      </span>
      <button className="btn btn-ghost" style={{ fontSize: 10, padding: '3px 8px' }} onClick={openDigest}>
        View Digest
      </button>
      <button className="btn btn-link" style={{ fontSize: 11, padding: '3px' }}
        onClick={() => { setDismissed(true); localStorage.setItem('hireos_digest_dismissed', new Date().toDateString()) }}>
        ✕
      </button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════
export default function App() {
  const {
    profile, setProfile,
    addMessage, setJobs, jobs,
    setSelectedJob, setAppPackage,
    agentStatus, setAgentStatus,
    tracker, view, setView, addToast,
  } = useAgent()

  // Load saved profile on mount
  useEffect(() => {
    const saved = localStorage.getItem('hireos_profile')
    if (saved) {
      try { setProfile(JSON.parse(saved)) } catch { }
    }
  }, [])

  const getKeys = () => ({
    gemini: localStorage.getItem('hireos_gemini_key') || null,
    jsearch: localStorage.getItem('hireos_jsearch_key') || null,
  })

  const handleSubmit = useCallback(async (input) => {
    if (!profile) return
    addMessage({ type: 'user', text: input })
    setAgentStatus('thinking')
    const keys = getKeys()

    try {
      await runAgent(input, profile, keys, tracker, {
        onMessage: (msg) => addMessage({ type: msg.type, text: msg.text }),
        onJobs: (j) => setJobs(j),
        onSetView: (v) => setView(v),
        onError: (err) => addToast(err, 'error'),
        onDone: async (val) => {
          if (typeof val === 'number') {
            const job = jobs[val - 1]
            if (job) {
              setSelectedJob(job)
              setAppPackage(null)
              addMessage({ type: 'agent', text: `Composing application package for ${job.company}...` })
              try {
                const pkg = await skillApplicationComposer(job, profile, keys.gemini)
                setAppPackage(pkg)
                addMessage({ type: 'agent', text: `✅ Package ready. Review in the right panel → Approve All to apply.` })
              } catch (err) {
                addMessage({ type: 'agent', text: `⚠ ${err.message}\nUsing template content instead.` })
                const pkg = await skillApplicationComposer(job, profile, null)
                setAppPackage(pkg)
              }
            }
          }
          setAgentStatus('idle')
        },
      })
    } catch (err) {
      addMessage({ type: 'agent', text: `Error: ${err.message}` })
    }
    setAgentStatus('idle')
  }, [profile, jobs, tracker])

  const handlePrepare = useCallback(async (job) => {
    setSelectedJob(job)
    setAppPackage(null)
    addMessage({ type: 'agent', text: `Composing application package for ${job.company}...` })
    setAgentStatus('running')
    try {
      const pkg = await skillApplicationComposer(job, profile, getKeys().gemini)
      setAppPackage(pkg)
      addMessage({ type: 'agent', text: `✅ Package ready. Click sections to copy. Hit "Approve All" to apply + log.` })
    } catch (err) {
      addMessage({ type: 'agent', text: `⚠ ${err.message}\nUsing template content.` })
      const pkg = await skillApplicationComposer(job, profile, null)
      setAppPackage(pkg)
    }
    setAgentStatus('idle')
  }, [profile])

  const finishOnboarding = (data) => {
    setProfile(data)
    localStorage.setItem('hireos_profile', JSON.stringify(data))
    addMessage({
      type: 'agent',
      text: `Welcome, ${data.name}! Ready to find you a ${data.currentRole} role.\n\nTry:\n  > find me jobs\n  > daily digest`,
    })
  }

  return (
    <>
      {!profile && <Onboarding onDone={finishOnboarding} />}
      <div className="app-layout">
        <Topbar />
        <Sidebar />
        <main className="app-chat">
          {view === 'chat' && <DailyDigestBanner />}
          {view === 'chat' && (
            <>
              <ChatMessages onPrepare={handlePrepare} />
              <ChatInput onSubmit={handleSubmit} />
            </>
          )}
          {view === 'tracker' && <TrackerView />}
          {view === 'settings' && <SettingsView />}
        </main>
        {view === 'chat' && <AppPanel />}
      </div>
      <ToastStack />
    </>
  )
}
