// ═══════════════════════════════════════════════════════════════
// HireOS Agent — Production Agent Skills
// Real job data via JSearch API + Gemini for content generation
// Research basis documented in research_intelligence.md
// ═══════════════════════════════════════════════════════════════

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
const JSEARCH_BASE = 'https://jsearch.p.rapidapi.com'

// ── Utility ──────────────────────────────────────────────────
const delay = (ms) => new Promise(r => setTimeout(r, ms))

async function callGemini(apiKey, prompt, systemPrompt = '') {
  if (!apiKey) throw new Error('NO_KEY')
  const res = await fetch(`${GEMINI_BASE}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.65, maxOutputTokens: 2048 },
    }),
  })
  if (res.status === 429) throw new Error('RATE_LIMIT')
  if (!res.ok) throw new Error(`API_ERROR:${res.status}`)
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

// ═══════════════════════════════════════════════════════════════
// DEMO DATA — Used when no JSearch key is provided
// ═══════════════════════════════════════════════════════════════
export const DEMO_JOBS = [
  {
    id: 'd1', title: 'Frontend Engineer', company: 'Razorpay',
    location: 'Bangalore', salary: '₹18-28L', postedHoursAgo: 3,
    source: 'company_site', url: 'https://razorpay.com/jobs',
    contactName: null, contactRole: null,
    linkedinSearch: 'https://linkedin.com/search/results/people/?keywords=engineering+manager+Razorpay',
    emailGuess: null,
    companySignals: ['Series F funded', 'Engineering blog active', 'Hired 12 engineers last month'],
    description: "Build high-performance web apps using React, TypeScript, and Node.js for Razorpay's payment products.",
    skills: ['React', 'TypeScript', 'Node.js', 'Performance'],
  },
  {
    id: 'd2', title: 'React Developer', company: 'Zerodha',
    location: 'Bangalore', salary: '₹15-22L', postedHoursAgo: 6,
    source: 'company_site', url: 'https://zerodha.com/careers',
    contactName: null, contactRole: null,
    linkedinSearch: 'https://linkedin.com/search/results/people/?keywords=engineering+lead+Zerodha',
    emailGuess: null,
    companySignals: ['Profitable, no layoffs', 'Tech blog very active'],
    description: "Work on Zerodha's trading platform UI for millions of investors.",
    skills: ['React', 'Redux', 'WebSockets', 'Financial UX'],
  },
  {
    id: 'd3', title: 'Software Engineer — UI Platform', company: 'Cred',
    location: 'Bangalore (Remote-first)', salary: '₹20-35L', postedHoursAgo: 2,
    source: 'linkedin', url: 'https://cred.club/careers',
    contactName: null, contactRole: null,
    linkedinSearch: 'https://linkedin.com/search/results/people/?keywords=head+of+engineering+Cred',
    emailGuess: null,
    companySignals: ['$140M Series E', 'Design system rebrand announced'],
    description: 'Build the design system and core SDK used by all Cred product teams.',
    skills: ['React', 'Design Systems', 'Micro-frontends', 'Performance'],
  },
  {
    id: 'd4', title: 'Frontend Engineer', company: 'Groww',
    location: 'Bangalore', salary: '₹14-20L', postedHoursAgo: 18,
    source: 'linkedin', url: 'https://groww.in/careers',
    contactName: null, contactRole: null,
    linkedinSearch: 'https://linkedin.com/search/results/people/?keywords=engineering+manager+Groww',
    emailGuess: null,
    companySignals: ['IPO filed 2025', 'Expanding SIP product line'],
    description: "Build investment products for Groww's 10M+ users.",
    skills: ['React', 'JavaScript', 'CSS', 'Analytics'],
  },
  {
    id: 'd5', title: 'Full-Stack Developer', company: 'Porter',
    location: 'Bangalore', salary: '₹12-18L', postedHoursAgo: 9,
    source: 'naukri', url: 'https://porter.in/careers',
    contactName: null, contactRole: null,
    linkedinSearch: 'https://linkedin.com/search/results/people/?keywords=VP+engineering+Porter',
    emailGuess: null,
    companySignals: ['Series C active', 'Expanding to 5 new cities'],
    description: "Join Porter's logistics tech team building dashboards and driver apps.",
    skills: ['React', 'Node.js', 'MongoDB', 'Maps API'],
  },
]

// ═══════════════════════════════════════════════════════════════
// JSEARCH API CLIENT — Real job data
// ═══════════════════════════════════════════════════════════════
async function fetchJSearchJobs(query, location, jsearchKey) {
  if (!jsearchKey) throw new Error('NO_KEY')
  const params = new URLSearchParams({
    query: `${query} in ${location}`,
    page: '1',
    num_pages: '1',
    date_posted: 'today', // Fresh jobs only — research says <24h = best response
  })
  const res = await fetch(`${JSEARCH_BASE}/search?${params}`, {
    headers: {
      'x-rapidapi-host': 'jsearch.p.rapidapi.com',
      'x-rapidapi-key': jsearchKey,
    },
  })
  if (res.status === 429) throw new Error('RATE_LIMIT')
  if (res.status === 403) throw new Error('INVALID_KEY')
  if (!res.ok) throw new Error(`API_ERROR:${res.status}`)
  const data = await res.json()
  return (data.data || []).slice(0, 8)
}

function normaliseJSearchJob(raw, index) {
  const hoursAgo = raw.job_posted_at_datetime_utc
    ? Math.max(1, Math.floor((Date.now() - new Date(raw.job_posted_at_datetime_utc)) / 3600000))
    : 12

  const salary = raw.job_min_salary && raw.job_max_salary
    ? `${raw.job_salary_currency || '$'}${Math.round(raw.job_min_salary / 1000)}K-${Math.round(raw.job_max_salary / 1000)}K`
    : null

  // Determine source
  let source = 'linkedin'
  const applyUrl = raw.job_apply_link || ''
  if (applyUrl.includes('linkedin.com')) source = 'linkedin'
  else if (applyUrl.includes('indeed.com') || applyUrl.includes('glassdoor.com')) source = 'naukri'
  else source = 'company_site'

  // Extract skills from description (basic keyword matching)
  const desc = (raw.job_description || '').toLowerCase()
  const skillMap = ['React', 'TypeScript', 'JavaScript', 'Node.js', 'Python', 'Java', 'Go', 'AWS', 'Docker', 'Kubernetes', 'SQL', 'MongoDB', 'GraphQL', 'Redux', 'Vue', 'Angular', 'CSS', 'HTML']
  const skills = skillMap.filter(s => desc.includes(s.toLowerCase())).slice(0, 4)
  if (skills.length === 0) skills.push('See description')

  return {
    id: `j${index}-${Date.now()}`,
    title: raw.job_title || 'Role',
    company: raw.employer_name || 'Company',
    location: raw.job_city
      ? `${raw.job_city}${raw.job_state ? ', ' + raw.job_state : ''}`
      : raw.job_is_remote ? 'Remote' : 'Location not specified',
    salary,
    postedHoursAgo: hoursAgo,
    source,
    url: raw.job_apply_link || raw.job_google_link || '#',
    contactName: null, // JSearch doesn't provide this — Human Finder generates guesses
    contactRole: null,
    linkedinSearch: `https://linkedin.com/search/results/people/?keywords=hiring+manager+${encodeURIComponent(raw.employer_name || '')}`,
    emailGuess: null,
    companySignals: [],
    description: (raw.job_description || '').slice(0, 500),
    skills,
    employerLogo: raw.employer_logo || null,
  }
}

// ═══════════════════════════════════════════════════════════════
// SKILL: Job Scout — Quality filter, not quantity
// ═══════════════════════════════════════════════════════════════
export async function skillJobScout(profile, jsearchKey) {
  // Try real API first, fall back to demo
  let rawJobs

  if (jsearchKey) {
    try {
      const query = profile?.currentRole || profile?.skills?.split(',')[0]?.trim() || 'software engineer'
      const location = profile?.location || 'India'
      const apiResults = await fetchJSearchJobs(query, location, jsearchKey)
      rawJobs = apiResults.map((r, i) => normaliseJSearchJob(r, i))
    } catch (err) {
      if (err.message === 'RATE_LIMIT') {
        throw new Error('JSearch free tier limit reached (500/month). Try again tomorrow or upgrade your API key.')
      }
      if (err.message === 'INVALID_KEY') {
        throw new Error('JSearch API key is invalid. Check your key in Settings.')
      }
      // Fallback to demo on other errors
      rawJobs = null
    }
  }

  if (!rawJobs || rawJobs.length === 0) {
    rawJobs = [...DEMO_JOBS]
  }

  // Run ghost detection + human finder on each
  const enriched = rawJobs.map(j => ({
    ...j,
    matchScore: computeMatchScore(j, profile),
    ghostResult: skillGhostDetector(j),
    humanData: skillHumanFinder(j),
  }))

  // Sort: source quality × match score
  const sourceMultiplier = { company_site: 1.1, linkedin: 1.0, naukri: 0.9 }
  return enriched.sort((a, b) =>
    (b.matchScore * (sourceMultiplier[b.source] || 1)) -
    (a.matchScore * (sourceMultiplier[a.source] || 1))
  )
}

function computeMatchScore(job, profile) {
  if (!profile?.skills) return 70
  const userSkills = profile.skills.toLowerCase().split(',').map(s => s.trim())
  const jobText = `${job.title} ${job.description} ${(job.skills || []).join(' ')}`.toLowerCase()
  let hits = 0
  for (const skill of userSkills) {
    if (skill && jobText.includes(skill)) hits++
  }
  const base = Math.min(95, 60 + Math.round((hits / Math.max(1, userSkills.length)) * 35))
  // Freshness bonus
  if (job.postedHoursAgo <= 6) return Math.min(98, base + 5)
  if (job.postedHoursAgo <= 24) return base
  return Math.max(50, base - 5)
}

// ═══════════════════════════════════════════════════════════════
// SKILL: Ghost Detector — Research-calibrated
// 1 in 3 postings fake (ResumeBuilder 2025)
// ═══════════════════════════════════════════════════════════════
export function skillGhostDetector(job) {
  let score = 100
  const signals = []
  const warnings = []

  if (job.postedHoursAgo <= 6) {
    signals.push('✓ Posted within 6h — highest freshness')
  } else if (job.postedHoursAgo <= 24) {
    score -= 5
    signals.push('✓ Posted today')
  } else if (job.postedHoursAgo <= 168) {
    score -= 20
    warnings.push('⚠ Posted over 24h ago — apply today')
  } else if (job.postedHoursAgo <= 720) {
    score -= 35
    warnings.push('⚠ Over 7 days old — likely stale, verify before applying')
  } else {
    score -= 50
    warnings.push('✗ Over 30 days old — very likely ghost job')
  }

  if (!job.salary) {
    score -= 15
    warnings.push('⚠ No salary listed — common ghost signal')
  } else {
    signals.push('✓ Salary listed — real intent signal')
  }

  if (job.source === 'company_site') {
    signals.push('✓ From company career page — highest signal')
  } else if (job.source === 'naukri') {
    score -= 10
    warnings.push('⚠ From job board — more ghost risk')
  }

  if (job.companySignals?.length > 0) {
    signals.push(`✓ ${job.companySignals[0]}`)
  }

  return { score: Math.max(0, Math.min(100, score)), signals, warnings }
}

// ═══════════════════════════════════════════════════════════════
// SKILL: Human Finder
// Referred candidates 4-5x more likely to get hired
// ═══════════════════════════════════════════════════════════════
export function skillHumanFinder(job) {
  if (job.contactName) {
    const nameParts = job.contactName.toLowerCase().split(' ')
    const first = nameParts[0] || 'contact'
    const last = nameParts[nameParts.length - 1] || 'person'
    const domain = (job.emailGuess || '').split('@')[1] || `${job.company.toLowerCase().replace(/\s+/g, '')}.com`
    const patterns = [
      `${first}.${last}@${domain}`,
      `${first[0]}${last}@${domain}`,
      `${first}@${domain}`,
    ]
    return {
      name: job.contactName, role: job.contactRole,
      linkedinUrl: job.linkedinSearch, emailPatterns: patterns,
      bestGuess: patterns[0], companySignals: job.companySignals || [],
      outreachTip: getOutreachTip(job),
    }
  }
  // No contact name — generate LinkedIn search URL
  const companyClean = (job.company || '').replace(/[^a-zA-Z0-9 ]/g, '')
  return {
    name: null, role: 'Hiring Manager',
    linkedinUrl: `https://linkedin.com/search/results/people/?keywords=hiring+manager+${encodeURIComponent(companyClean)}`,
    emailPatterns: [], bestGuess: null,
    companySignals: job.companySignals || [],
    outreachTip: `Search LinkedIn for hiring manager at ${job.company}. DM directly — 15-25% response rate.`,
  }
}

function getOutreachTip(job) {
  const signals = job.companySignals || []
  if (signals.some(s => s.toLowerCase().includes('fund')))
    return `Mention their recent funding — shows you do research.`
  if (signals.some(s => s.toLowerCase().includes('blog')))
    return `Reference a recent blog post — instant credibility.`
  if (job.source === 'company_site')
    return `You found this on their career page — mention it. Shows genuine interest.`
  return `Keep the DM to 2 sentences. Ask for 15 mins, not "any opportunities".`
}

// ═══════════════════════════════════════════════════════════════
// SKILL: Application Composer — Anti-AI-detection
// 74% recruiters detect AI in 20s; 57% auto-reject
// ═══════════════════════════════════════════════════════════════
export async function skillApplicationComposer(job, profile, geminiKey) {
  if (geminiKey) {
    try {
      const systemPrompt = `You are a brutally honest career coach. Your output sounds like a confident senior engineer — never like an AI. Every sentence is specific and verifiable. BANNED phrases: "I am passionate about", "seeking to leverage", "proven track record", "seasoned professional", "I hope this finds you", "synergy", "go-getter", "team player", "excited to apply". Output ONLY valid JSON, no markdown.`

      const companyContext = job.companySignals?.join(', ') || job.company
      const prompt = `Generate a job application package.

ROLE: ${job.title} at ${job.company}
DESCRIPTION: ${job.description?.slice(0, 400)}
SKILLS: ${(job.skills || []).join(', ')}
CONTACT: ${job.contactName || 'Hiring Manager'} (${job.contactRole || 'Engineering'})
COMPANY CONTEXT: ${companyContext}

CANDIDATE:
Name: ${profile?.name}
Target Role: ${profile?.currentRole}
Years: ${profile?.experience || '3'}
Skills: ${profile?.skills}
Achievement: ${profile?.achievement || 'shipped features at scale'}
Resume excerpt: ${profile?.resume ? profile.resume.slice(0, 500) : '(not provided)'}

Return ONLY this JSON:
{
  "resumeDelta": [
    "bullet 1 — quantified, specific to ${(job.skills || ['the role'])[0]}",
    "bullet 2 — references scale or business impact",
    "bullet 3 — unique, can't be reused for random jobs"
  ],
  "coverLetter": "4 sentences exactly. S1: why this company specifically. S2: one relevant thing you built. S3: one metric. S4: ask for 20 mins.",
  "dm": "Max 260 chars. No opener pleasantries. Get straight to it. Reference ONE specific thing about ${job.company}.",
  "emailSubject": "Under 50 chars. Role name + one differentiator."
}`
      const raw = await callGemini(geminiKey, prompt, systemPrompt)
      const m = raw.match(/\{[\s\S]*\}/)
      if (m) {
        const parsed = JSON.parse(m[0])
        if (parsed.resumeDelta && parsed.coverLetter) return parsed
      }
    } catch (err) {
      if (err.message === 'RATE_LIMIT') {
        throw new Error('Gemini API rate limit reached. Wait a minute and try again.')
      }
      // Fall through to demo
    }
  }

  // ── Demo fallback ──────────────────────────────────────────
  const skill1 = profile?.skills?.split(',')[0]?.trim() || (job.skills || ['the tech stack'])[0]
  const skill2 = profile?.skills?.split(',')[1]?.trim() || (job.skills || ['', 'architecture'])[1]
  const name = profile?.name || 'Alex'
  const companyDetail = job.companySignals?.[0] || `${job.company}'s product`

  return {
    resumeDelta: [
      `Built ${skill1} component library adopted across 8 teams — cut feature dev time by 35%`,
      `Improved Lighthouse score from 48 → 94 for core product, reducing bounce rate by 22%`,
      `Delivered 3 features end-to-end from Figma to production — avg 6-day cycle time`,
    ],
    coverLetter: `${job.company} caught my attention because of ${companyDetail} — the kind of problem I've been deep in. I recently led a ${skill1} performance overhaul that cut load time by 40% and increased conversion by 18%. That work maps directly to the ${job.title} role. Would appreciate 20 minutes to walk through specifics.`,
    dm: `Applied for ${job.title} at ${job.company}. Been focused on ${skill1} at scale — cut load times 40%, improved conversion 18%. Worth a 15-min chat?`,
    emailSubject: `${job.title} — ${name} (${skill1}, 40% perf lift)`,
  }
}

// ═══════════════════════════════════════════════════════════════
// SKILL: Follow-Up Agent (Day 3/5/7)
// ═══════════════════════════════════════════════════════════════
export function skillFollowUp(trackerItem, profile, dayNumber) {
  const name = profile?.name || 'Alex'
  const contact = trackerItem.contactName || 'there'
  const co = trackerItem.company
  const role = trackerItem.jobTitle
  const skill = profile?.skills?.split(',')[0]?.trim() || 'the tech stack'

  if (dayNumber === 3) return {
    type: 'dm', label: 'Day 3 LinkedIn DM',
    content: `${contact}, following up on my ${role} application at ${co}. Built a demo of my ${skill} work this week — happy to share if useful. Still very keen.`,
  }
  if (dayNumber === 5) return {
    type: 'email', label: 'Day 5 Email Follow-Up',
    subject: `Re: ${role} — ${name}`,
    content: `Hi ${contact},\n\nQuick follow-up on the ${role} role at ${co}.\n\nI've been thinking about the ${skill} challenges at your scale — I've solved similar problems recently and would love to discuss specifics.\n\nAny update on timing? Happy to adjust to your schedule.\n\n— ${name}`,
  }
  if (dayNumber === 7) return {
    type: 'archive', label: 'Archive (7 days, no response)',
    content: `Archiving ${role} @ ${co} — 7 days without response. Focus on next targets.`,
  }
  return { type: 'none', label: 'No action', content: '' }
}

// ═══════════════════════════════════════════════════════════════
// SKILL: Daily Digest
// ═══════════════════════════════════════════════════════════════
export function skillDailyDigest(tracker, profile) {
  const now = Date.now()
  const pending = []
  for (const item of tracker) {
    if (item.status !== 'applied') continue
    const age = Math.floor((now - new Date(item.appliedAt)) / 86400000)
    if (age >= 7) pending.push({ item, action: 'archive', day: 7 })
    else if (age >= 5 && !item.followUpDay5) pending.push({ item, action: 'followup5', day: 5 })
    else if (age >= 3 && !item.followUpDay3) pending.push({ item, action: 'followup3', day: 3 })
  }

  const todayApplied = tracker.filter(t =>
    new Date(t.appliedAt).toDateString() === new Date().toDateString()
  ).length

  const name = profile?.name?.split(' ')[0] || 'there'
  const lines = [`Good morning, ${name}. Today's sprint:\n`]

  if (pending.length > 0) {
    lines.push(`⚡ Follow-ups due (${pending.length}):`)
    pending.forEach(p => {
      const label = p.action === 'followup3' ? 'Day 3 DM' : p.action === 'followup5' ? 'Day 5 email' : 'Archive'
      lines.push(`  → ${p.item.company} — ${label}`)
    })
    lines.push('')
  }

  if (todayApplied < 3) {
    lines.push(`🎯 Find ${3 - todayApplied} job${3 - todayApplied > 1 ? 's' : ''} today (${todayApplied}/3)`)
    lines.push(`  Type "find me jobs" to start.`)
    lines.push('')
    lines.push(`💡 Jobs posted <24h have the highest response rates.`)
  } else {
    lines.push(`✅ Daily target hit (${todayApplied}/3). Strong work.`)
  }

  return { pending, todayApplied, targetForDay: 3, message: lines.join('\n') }
}

// ═══════════════════════════════════════════════════════════════
// DATA EXPORT
// ═══════════════════════════════════════════════════════════════
export function exportTrackerCSV(tracker) {
  const headers = ['Company', 'Role', 'Applied Date', 'Status', 'Contact', 'Day 3 Sent', 'Day 5 Sent', 'URL']
  const rows = tracker.map(t => [
    t.company, t.jobTitle,
    new Date(t.appliedAt).toLocaleDateString(),
    t.status,
    t.contactName || '',
    t.followUpDay3 ? 'Yes' : 'No',
    t.followUpDay5 ? 'Yes' : 'No',
    t.url || '',
  ])
  const csv = [headers, ...rows].map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n')
  downloadFile(csv, 'hireos-applications.csv', 'text/csv')
}

export function exportTrackerJSON(tracker) {
  downloadFile(JSON.stringify(tracker, null, 2), 'hireos-data.json', 'application/json')
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ═══════════════════════════════════════════════════════════════
// AGENT CORE — Orchestrator
// ═══════════════════════════════════════════════════════════════
export async function runAgent(input, profile, keys, tracker, callbacks) {
  const { onMessage, onJobs, onDone, onSetView, onError } = callbacks
  const lower = input.toLowerCase().trim()

  // ── Validate profile ────────────────────────────────────────
  if (!profile?.name || !profile?.currentRole) {
    onMessage({ type: 'agent', text: 'Please complete your profile first. Go to Settings and fill in your name and target role.' })
    onSetView?.('settings')
    onDone?.()
    return
  }

  // ── Find jobs (stricter matching) ──────────────────────────
  const jobIntents = ['find me', 'find job', 'search job', 'scout', 'look for job', 'match me', 'show me role', 'show me job', 'get me job', 'new role', 'new position', 'open position']
  if (jobIntents.some(i => lower.includes(i)) ||
      (lower.startsWith('find') && (lower.includes('job') || lower.includes('role'))) ||
      lower === 'find' || lower === 'search' || lower === 'scout') {
    onMessage({ type: 'agent', text: `Scouting ${profile.currentRole} roles${profile.location ? ` in ${profile.location}` : ''}...` })

    try {
      const jobs = await skillJobScout(profile, keys?.jsearch)
      const isDemo = !keys?.jsearch || jobs[0]?.id?.startsWith('d')
      onMessage({
        type: 'agent',
        text: `Found ${jobs.length} matches.${isDemo ? ' (Demo data — add JSearch API key in Settings for real listings)' : ''}\n\nGhost-checked all postings. Human contacts identified.\nPro tip: "🏢 Company Site" listings have less competition — apply there first.`,
      })
      onJobs(jobs)
    } catch (err) {
      onMessage({ type: 'agent', text: `⚠ ${err.message}\n\nFalling back to demo data...` })
      const demoJobs = DEMO_JOBS.map(j => ({
        ...j, matchScore: computeMatchScore(j, profile),
        ghostResult: skillGhostDetector(j), humanData: skillHumanFinder(j),
      }))
      onJobs(demoJobs)
    }
    onDone?.()
    return
  }

  // ── Prepare by number ───────────────────────────────────────
  if (lower.startsWith('prepare') || lower.startsWith('apply') || lower.startsWith('package')) {
    const n = parseInt(input.match(/\d+/)?.[0])
    if (!isNaN(n)) { onDone?.(n); return }
    onMessage({ type: 'agent', text: 'Which job? e.g. "prepare 1" or click ⚡ Prepare on a card.' })
    onDone?.(); return
  }

  // ── Daily digest ────────────────────────────────────────────
  if (lower.includes('digest') || lower.includes('today') || lower.includes('morning') ||
      lower.includes('daily') || lower.includes('sprint')) {
    onMessage({ type: 'agent', text: skillDailyDigest(tracker, profile).message })
    onDone?.(); return
  }

  // ── Pipeline / tracker ──────────────────────────────────────
  if (lower.includes('track') || lower.includes('pipeline') || lower.includes('applied') || lower.includes('status')) {
    onSetView?.('tracker')
    onDone?.(); return
  }

  // ── Follow-up (stricter — avoid matching "I follow this company") ──
  if (lower.startsWith('follow') || lower.includes('follow up') || lower.includes('followup') || lower.includes('follow-up')) {
    const digest = skillDailyDigest(tracker, profile)
    if (digest.pending.length === 0) {
      onMessage({ type: 'agent', text: 'No follow-ups due today. Keep applying — consistency wins.' })
    } else {
      onMessage({ type: 'agent', text: `${digest.pending.length} follow-up(s) due. Opening Pipeline...` })
      onSetView?.('tracker')
    }
    onDone?.(); return
  }

  // ── Settings ────────────────────────────────────────────────
  if (lower.includes('setting') || lower.includes('profile') || lower.includes('key') ||
      lower.includes('resume') || lower.includes('api')) {
    onSetView?.('settings')
    onDone?.(); return
  }

  // ── Export ──────────────────────────────────────────────────
  if (lower.includes('export') || lower.includes('download') || lower.includes('csv')) {
    if (tracker.length === 0) {
      onMessage({ type: 'agent', text: 'No applications to export yet. Apply to some jobs first!' })
    } else {
      exportTrackerCSV(tracker)
      onMessage({ type: 'agent', text: `Exported ${tracker.length} applications as CSV.` })
    }
    onDone?.(); return
  }

  // ── Help ────────────────────────────────────────────────────
  if (lower.includes('help') || lower === '?' || lower.includes('command')) {
    onMessage({
      type: 'agent',
      text: `HireOS Agent — commands:\n\n  find me jobs       — Scout fresh matched roles\n  prepare [1-5]      — Generate application package\n  daily digest       — Today's sprint & follow-ups\n  pipeline           — Application tracker\n  follow up          — Check follow-ups due\n  export             — Download applications as CSV\n  settings           — Profile, resume, API keys`,
    })
    onDone?.(); return
  }

  // ── Default ─────────────────────────────────────────────────
  await delay(200)
  onMessage({ type: 'agent', text: `Try: "find me jobs", "prepare 1", "daily digest", or "help"` })
  onDone?.()
}
