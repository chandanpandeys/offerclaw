// Global agent store — shared state across all components
import { useState, createContext, useContext, useCallback, useRef } from 'react'

const AgentContext = createContext(null)

export function AgentProvider({ children }) {
    const [profile, setProfile] = useState(null)          // User profile
    const [messages, setMessages] = useState([])           // Chat messages
    const [jobs, setJobs] = useState([])                   // Current job batch
    const [selectedJob, setSelectedJob] = useState(null)   // Job being prepared
    const [appPackage, setAppPackage] = useState(null)     // AI-generated package
    const [agentStatus, setAgentStatus] = useState('idle') // idle | thinking | live
    const [tracker, setTracker] = useState(           // Application tracker
        () => JSON.parse(localStorage.getItem('hireos_tracker') || '[]')
    )
    const [streak, setStreak] = useState(
        () => parseInt(localStorage.getItem('hireos_streak') || '0')
    )
    const [view, setView] = useState('chat') // chat | tracker | settings
    const [toasts, setToasts] = useState([])
    const messageEndRef = useRef(null)

    const addMessage = useCallback((msg) => {
        setMessages(prev => [...prev, { id: Date.now() + Math.random(), ...msg }])
    }, [])

    const addToast = useCallback((text, type = 'info') => {
        const id = Date.now()
        setToasts(prev => [...prev, { id, text, type }])
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
    }, [])

    const saveApplication = useCallback((job) => {
        const entry = {
            id: Date.now(),
            jobTitle: job.title,
            company: job.company,
            appliedAt: new Date().toISOString(),
            status: 'applied',
            followUpDay3: null,
            followUpDay5: null,
            url: job.url,
            contactName: job.contactName,
        }
        const updated = [entry, ...tracker]
        setTracker(updated)
        localStorage.setItem('hireos_tracker', JSON.stringify(updated))

        // Streak logic
        const today = new Date().toDateString()
        const lastDay = localStorage.getItem('hireos_last_day')
        if (lastDay !== today) {
            const newStreak = streak + 1
            setStreak(newStreak)
            localStorage.setItem('hireos_streak', String(newStreak))
            localStorage.setItem('hireos_last_day', today)
        }
    }, [tracker, streak])

    const clearPackage = useCallback(() => {
        setAppPackage(null)
        setSelectedJob(null)
    }, [])

    return (
        <AgentContext.Provider value={{
            profile, setProfile,
            messages, addMessage,
            jobs, setJobs,
            selectedJob, setSelectedJob,
            appPackage, setAppPackage,
            agentStatus, setAgentStatus,
            tracker, setTracker, saveApplication,
            streak,
            view, setView,
            toasts, addToast,
            messageEndRef,
            clearPackage,
        }}>
            {children}
        </AgentContext.Provider>
    )
}

export const useAgent = () => useContext(AgentContext)
