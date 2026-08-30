import { useCallback, useRef, useState } from 'react'
import { AgentContext } from './agentContext'
import { evaluateApplicationPackage, snapshotJobEvidence } from './evals'

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function AgentProvider({ children }) {
  const [profileState, setProfileState] = useState(() => readJson('offerclaw_profile', null))
  const [messages, setMessages] = useState([])
  const [jobs, setJobs] = useState([])
  const [selectedJob, setSelectedJob] = useState(null)
  const [appPackage, setAppPackage] = useState(null)
  const [agentStatus, setAgentStatus] = useState('idle')
  const [trackerState, setTrackerState] = useState(() => readJson('offerclaw_tracker', []))
  const [streak, setStreak] = useState(() => Number(localStorage.getItem('offerclaw_streak') || 0))
  const [view, setView] = useState('chat')
  const [toasts, setToasts] = useState([])
  const messageEndRef = useRef(null)

  const setProfile = useCallback((next) => {
    setProfileState(next)
    if (next) localStorage.setItem('offerclaw_profile', JSON.stringify(next))
    else localStorage.removeItem('offerclaw_profile')
  }, [])

  const setTracker = useCallback((nextOrUpdater) => {
    setTrackerState(previous => {
      const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(previous) : nextOrUpdater
      localStorage.setItem('offerclaw_tracker', JSON.stringify(next))
      return next
    })
  }, [])

  const addMessage = useCallback((message) => {
    setMessages(previous => [...previous, { id: makeId(), ...message }])
  }, [])

  const addToast = useCallback((text, type = 'info') => {
    const id = makeId()
    setToasts(previous => [...previous, { id, text, type }])
    globalThis.setTimeout(() => {
      setToasts(previous => previous.filter(toast => toast.id !== id))
    }, 3500)
  }, [])

  const saveApplication = useCallback((job) => {
    const packageEvaluation = appPackage
      ? evaluateApplicationPackage(appPackage, profileState)
      : null
    const entry = {
      id: makeId(),
      jobTitle: job.title,
      company: job.company,
      appliedAt: new Date().toISOString(),
      status: 'applied',
      followUpDay3: null,
      followUpDay5: null,
      url: job.url || null,
      dataSource: job.dataSource || 'unknown',
      evidence: snapshotJobEvidence(job),
      packageSnapshot: appPackage ? {
        mode: appPackage.mode || 'unknown',
        resumeDelta: Array.isArray(appPackage.resumeDelta) ? appPackage.resumeDelta.slice(0, 3) : [],
        coverLetter: appPackage.coverLetter || '',
        dm: appPackage.dm || '',
        emailSubject: appPackage.emailSubject || '',
        matchNarrative: appPackage.matchNarrative || '',
        gaps: Array.isArray(appPackage.gaps) ? appPackage.gaps.slice(0, 10) : [],
        proofChecks: Array.isArray(appPackage.proofChecks) ? appPackage.proofChecks.slice(0, 10) : [],
      } : null,
      packageEvaluation,
    }
    setTracker(previous => [entry, ...previous])

    const today = new Date().toDateString()
    const lastDay = localStorage.getItem('offerclaw_last_day')
    if (lastDay !== today) {
      const yesterday = new Date(Date.now() - 86_400_000).toDateString()
      setStreak(previous => {
        const next = lastDay === yesterday ? previous + 1 : 1
        localStorage.setItem('offerclaw_streak', String(next))
        return next
      })
      localStorage.setItem('offerclaw_last_day', today)
    }
  }, [appPackage, profileState, setTracker])

  const clearPackage = useCallback(() => {
    setAppPackage(null)
    setSelectedJob(null)
  }, [])

  return (
    <AgentContext.Provider value={{
      profile: profileState,
      setProfile,
      messages,
      addMessage,
      jobs,
      setJobs,
      selectedJob,
      setSelectedJob,
      appPackage,
      setAppPackage,
      agentStatus,
      setAgentStatus,
      tracker: trackerState,
      setTracker,
      saveApplication,
      streak,
      view,
      setView,
      toasts,
      addToast,
      messageEndRef,
      clearPackage,
    }}>
      {children}
    </AgentContext.Provider>
  )
}
