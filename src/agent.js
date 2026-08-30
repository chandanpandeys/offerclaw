// OfferClaw agent core — secure-provider edition.
// Browser code talks only to same-origin /api routes. Provider secrets stay server-side.

const DAY_MS = 86_400_000

export const DEMO_JOBS = [
  {
    id: 'demo-1',
    title: 'Frontend Engineer',
    company: 'Northstar Labs (demo)',
    location: 'Remote',
    salary: '₹18L–₹26L',
    postedHoursAgo: 5,
    source: 'company_site',
    url: null,
    description: 'Build accessible React product surfaces, improve performance, and collaborate closely with product and design.',
    skills: ['React', 'TypeScript', 'Accessibility', 'Performance'],
    companySignals: ['Demo listing — replace with live data when the jobs API is configured'],
    dataSource: 'demo',
  },
  {
    id: 'demo-2',
    title: 'Full-Stack Product Engineer',
    company: 'OrbitPay (demo)',
    location: 'Bengaluru / Hybrid',
    salary: '₹16L–₹24L',
    postedHoursAgo: 14,
    source: 'company_site',
    url: null,
    description: 'Own customer-facing features across React, Node.js, APIs, SQL, observability, and experimentation.',
    skills: ['React', 'Node.js', 'SQL', 'APIs'],
    companySignals: ['Demo listing — no application will be sent'],
    dataSource: 'demo',
  },
  {
    id: 'demo-3',
    title: 'AI Product Engineer',
    company: 'SignalWorks (demo)',
    location: 'India / Remote',
    salary: null,
    postedHoursAgo: 28,
    source: 'linkedin',
    url: null,
    description: 'Prototype AI-assisted workflows, build evaluation loops, integrate model APIs, and ship reliable user-facing tools.',
    skills: ['JavaScript', 'AI APIs', 'Evaluation', 'Product Engineering'],
    companySignals: ['Demo listing — useful for exploring OfferClaw without credentials'],
    dataSource: 'demo',
  },
]

const APPLICATION_SCHEMA = {
  type: 'object',
  properties: {
    resumeDelta: { type: 'array', items: { type: 'string' } },
    coverLetter: { type: 'string' },
    dm: { type: 'string' },
    emailSubject: { type: 'string' },
    matchNarrative: { type: 'string' },
    gaps: { type: 'array', items: { type: 'string' } },
    proofChecks: { type: 'array', items: { type: 'string' } },
  },
  required: ['resumeDelta', 'coverLetter', 'dm', 'emailSubject', 'matchNarrative', 'gaps', 'proofChecks'],
}

function cleanText(value, max = 12_000) {
  return String(value || '').split(String.fromCodePoint(0)).join('').slice(0, max)
}

async function readJsonResponse(response) {
  const type = response.headers.get('content-type') || ''
  if (!type.includes('application/json')) throw new Error('BACKEND_UNAVAILABLE')
  return response.json()
}

async function callAI(prompt, systemPrompt = '', responseSchema = null) {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, systemPrompt, responseSchema }),
  })

  const data = await readJsonResponse(response)
  if (!response.ok) {
    const code = data?.error || `HTTP_${response.status}`
    throw new Error(code)
  }

  if (responseSchema) {
    if (data.structured && typeof data.structured === 'object') return data.structured
    if (data.text) {
      try { return JSON.parse(data.text) } catch { throw new Error('INVALID_STRUCTURED_OUTPUT') }
    }
  }

  return data.text || ''
}

async function fetchServerJobs(query, location) {
  const response = await fetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, location, freshness: '3days' }),
  })
  const data = await readJsonResponse(response)
  if (!response.ok) throw new Error(data?.error || `HTTP_${response.status}`)
  return Array.isArray(data.data) ? data.data : []
}

function detectSource(url = '') {
  const lower = url.toLowerCase()
  if (lower.includes('linkedin.com')) return 'linkedin'
  if (lower.includes('indeed.') || lower.includes('glassdoor.') || lower.includes('naukri.')) return 'naukri'
  return url ? 'company_site' : 'naukri'
}

function salaryLabel(raw) {
  if (!raw.job_min_salary || !raw.job_max_salary) return null
  const currency = raw.job_salary_currency || ''
  const period = raw.job_salary_period ? `/${String(raw.job_salary_period).toLowerCase()}` : ''
  const min = Math.round(Number(raw.job_min_salary)).toLocaleString()
  const max = Math.round(Number(raw.job_max_salary)).toLocaleString()
  return `${currency} ${min}–${max}${period}`.trim()
}

function extractSkills(description = '') {
  const catalog = [
    'React', 'TypeScript', 'JavaScript', 'Node.js', 'Python', 'Java', 'Go', 'Rust',
    'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'SQL', 'PostgreSQL', 'MongoDB',
    'GraphQL', 'Redux', 'Vue', 'Angular', 'CSS', 'HTML', 'Next.js', 'FastAPI',
    'LLM', 'RAG', 'Agents', 'Machine Learning', 'TensorFlow', 'PyTorch',
  ]
  const lower = description.toLowerCase()
  return catalog.filter(skill => lower.includes(skill.toLowerCase())).slice(0, 6)
}

function normaliseJob(raw, index) {
  const postedAt = raw.job_posted_at_datetime_utc ? new Date(raw.job_posted_at_datetime_utc).getTime() : null
  const postedHoursAgo = Number.isFinite(postedAt)
    ? Math.max(1, Math.floor((Date.now() - postedAt) / 3_600_000))
    : 72
  const url = raw.job_apply_link || raw.job_google_link || null
  const description = cleanText(raw.job_description, 4_000)

  return {
    id: raw.job_id || `job-${index}-${postedAt || 'unknown'}`,
    title: raw.job_title || 'Untitled role',
    company: raw.employer_name || 'Unknown company',
    location: raw.job_is_remote
      ? 'Remote'
      : [raw.job_city, raw.job_state, raw.job_country].filter(Boolean).join(', ') || 'Location not specified',
    salary: salaryLabel(raw),
    postedHoursAgo,
    source: detectSource(url),
    url,
    description,
    skills: extractSkills(description),
    employerLogo: raw.employer_logo || null,
    companySignals: [],
    dataSource: 'live',
  }
}

function tokenise(text) {
  return cleanText(text, 4_000)
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter(token => token.length > 1)
}

function computeMatchScore(job, profile) {
  const userSkills = cleanText(profile?.skills, 1_000)
    .split(',')
    .map(skill => skill.trim().toLowerCase())
    .filter(Boolean)
  const targetTokens = new Set(tokenise(profile?.currentRole))
  const jobTokens = new Set(tokenise(`${job.title} ${job.description} ${(job.skills || []).join(' ')}`))

  const skillHits = userSkills.filter(skill => jobTokens.has(skill) || cleanText(job.description).toLowerCase().includes(skill)).length
  const roleHits = [...targetTokens].filter(token => jobTokens.has(token)).length
  const skillRatio = userSkills.length ? skillHits / userSkills.length : 0.45
  const roleRatio = targetTokens.size ? roleHits / targetTokens.size : 0.5
  const freshness = job.postedHoursAgo <= 24 ? 1 : job.postedHoursAgo <= 72 ? 0.8 : 0.55

  return Math.max(35, Math.min(96, Math.round(45 + skillRatio * 30 + roleRatio * 15 + freshness * 6)))
}

export function skillGhostDetector(job) {
  let score = 70
  const signals = []
  const warnings = []

  if (job.dataSource === 'demo') {
    warnings.push('Demo listing — do not treat this as a real vacancy')
    return { score: 50, signals, warnings, confidence: 'demo' }
  }

  if (job.postedHoursAgo <= 24) {
    score += 12
    signals.push('Posted within the last 24 hours')
  } else if (job.postedHoursAgo <= 72) {
    score += 5
    signals.push('Posted within the last 3 days')
  } else if (job.postedHoursAgo > 168) {
    score -= 15
    warnings.push('Listing is more than a week old; verify it is still active')
  }

  if (job.salary) {
    score += 5
    signals.push('Compensation information is present')
  } else {
    warnings.push('No compensation information in the feed')
  }

  if (job.source === 'company_site') {
    score += 8
    signals.push('Apply link appears to be an employer-controlled destination')
  } else {
    warnings.push('Job-board source; verify the opening on the employer careers site')
  }

  if (!job.url) {
    score -= 25
    warnings.push('No usable application URL')
  }

  if ((job.description || '').length < 180) {
    score -= 8
    warnings.push('Very short job description')
  } else {
    signals.push('Detailed role description is available')
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    signals,
    warnings,
    confidence: 'heuristic',
  }
}

export function skillHumanFinder(job) {
  const company = cleanText(job.company, 120).replace(/\s*\(demo\)$/i, '')
  const roleQuery = `${company} ${job.title} hiring manager recruiter engineering manager`
  return {
    name: null,
    role: 'Likely hiring contact',
    linkedinUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(roleQuery)}`,
    emailPatterns: [],
    bestGuess: null,
    outreachTip: `Look for the hiring manager, team lead, or recruiter responsible for ${job.title}. Verify identity before sending outreach; OfferClaw does not invent email addresses.`,
  }
}

export async function skillJobScout(profile, _legacyKey = null) {
  const query = cleanText(profile?.currentRole || profile?.skills?.split(',')?.[0] || 'software engineer', 120)
  const location = cleanText(profile?.location || 'India', 100)
  let jobs

  try {
    const raw = await fetchServerJobs(query, location)
    jobs = raw.map(normaliseJob)
  } catch {
    jobs = DEMO_JOBS.map(job => ({ ...job }))
  }

  return jobs
    .map(job => ({
      ...job,
      matchScore: computeMatchScore(job, profile),
      ghostResult: skillGhostDetector(job),
      humanData: skillHumanFinder(job),
      linkedinSearch: skillHumanFinder(job).linkedinUrl,
    }))
    .sort((a, b) => {
      const sourceBoost = { company_site: 4, linkedin: 1, naukri: 0 }
      return (b.matchScore + (sourceBoost[b.source] || 0)) - (a.matchScore + (sourceBoost[a.source] || 0))
    })
}

function fallbackPackage(job, profile) {
  const skills = cleanText(profile?.skills, 500).split(',').map(s => s.trim()).filter(Boolean)
  const strongest = skills.slice(0, 3)
  const achievement = cleanText(profile?.achievement, 400).trim()
  const role = cleanText(job.title, 140)
  const company = cleanText(job.company, 140).replace(/\s*\(demo\)$/i, '')

  const resumeDelta = []
  if (achievement) resumeDelta.push(`Lead with this verified proof point: ${achievement}`)
  if (strongest.length) resumeDelta.push(`Make ${strongest.join(', ')} easy to find where they genuinely match the ${role} requirements.`)
  resumeDelta.push(`Add one truthful project or work example that demonstrates the closest requirement from this role; include a metric only if you can verify it.`)

  return {
    resumeDelta: resumeDelta.slice(0, 3),
    coverLetter: `Hi ${company} team — I’m interested in the ${role} opening because the role overlaps with ${strongest.join(', ') || 'the work I am targeting'}. I’d be glad to share a concise example of relevant work and how I approached it. I’ve kept this note intentionally specific rather than repeating my resume, and I’m happy to provide more context if useful.`,
    dm: `Hi — I’m exploring the ${role} role at ${company}. My background overlaps with ${strongest.slice(0, 2).join(' + ') || 'the core requirements'}. Is there one capability the team is prioritizing most for this hire?`,
    emailSubject: `${role} — relevant work sample`,
    matchNarrative: `Your strongest visible overlap is ${strongest.join(', ') || 'not yet specified'}. Validate the role requirements against your actual experience before applying.`,
    gaps: ['AI generation is unavailable, so review the job description manually for missing must-have requirements.'],
    proofChecks: ['Do not add metrics, employers, projects, or credentials that are not already true and verifiable.'],
    mode: 'template',
  }
}

export async function skillApplicationComposer(job, profile, _legacyKey = null) {
  const fallback = fallbackPackage(job, profile)
  const profilePayload = {
    name: cleanText(profile?.name, 160),
    targetRole: cleanText(profile?.currentRole, 200),
    experience: cleanText(profile?.experience, 100),
    skills: cleanText(profile?.skills, 1_500),
    achievement: cleanText(profile?.achievement, 800),
    resume: cleanText(profile?.resume, 14_000),
  }
  const jobPayload = {
    title: cleanText(job.title, 200),
    company: cleanText(job.company, 200),
    location: cleanText(job.location, 160),
    description: cleanText(job.description, 8_000),
    skills: job.skills || [],
  }

  const systemPrompt = `You are OfferClaw, a truth-first career application assistant.\nNever fabricate employers, projects, credentials, years of experience, achievements, metrics, contacts, or tools.\nIf evidence is missing, state the gap instead of inventing proof.\nWrite concise human-sounding professional English. Avoid generic hype, fake enthusiasm, and keyword stuffing.\nThe LinkedIn DM must stay under 300 characters. The email subject must stay under 60 characters.\nResume suggestions must be edits or emphasis recommendations, not fictional accomplishments.`

  const prompt = `Create a targeted application package from only the verified candidate data and the job description below.\n\nCANDIDATE\n${JSON.stringify(profilePayload)}\n\nJOB\n${JSON.stringify(jobPayload)}\n\nReturn: three resume delta suggestions, a short cover letter, a concise LinkedIn DM, an email subject, a one-paragraph match narrative, the most important evidence gaps, and a proof checklist.`

  try {
    const generated = await callAI(prompt, systemPrompt, APPLICATION_SCHEMA)
    return {
      ...fallback,
      ...generated,
      resumeDelta: Array.isArray(generated.resumeDelta) ? generated.resumeDelta.slice(0, 3) : fallback.resumeDelta,
      gaps: Array.isArray(generated.gaps) ? generated.gaps.slice(0, 5) : [],
      proofChecks: Array.isArray(generated.proofChecks) ? generated.proofChecks.slice(0, 5) : fallback.proofChecks,
      mode: 'ai',
    }
  } catch {
    return fallback
  }
}

export function skillFollowUp(item, profile, day) {
  const firstName = cleanText(profile?.name, 100).split(' ')[0] || 'there'
  const company = cleanText(item.company, 120)
  const role = cleanText(item.jobTitle, 120)

  if (day === 3) {
    return {
      label: 'Day 3 · concise check-in',
      content: `Hi — following up on my ${role} application at ${company}. I’m still interested and can share a focused work sample if that would help with the review. — ${firstName}`,
    }
  }
  if (day === 5) {
    return {
      label: 'Day 5 · email follow-up',
      subject: `${role} application — follow-up`,
      content: `Hi, I wanted to follow up on my application for ${role} at ${company}. If the role is still active, I’m happy to send a short example of the most relevant work rather than another long note. Thanks, ${firstName}`,
    }
  }
  return {
    label: 'Day 7 · refocus',
    content: `No response yet for ${role} at ${company}. Verify whether the role is still active, send one final useful note only if you have new information, then refocus on fresher opportunities.`,
  }
}

export function skillDailyDigest(tracker, profile) {
  const now = Date.now()
  const today = new Date(now).toDateString()
  const todayApplied = tracker.filter(item => new Date(item.appliedAt).toDateString() === today).length
  const pending = tracker
    .filter(item => item.status === 'applied')
    .map(item => ({ item, days: Math.floor((now - new Date(item.appliedAt).getTime()) / DAY_MS) }))
    .filter(({ item, days }) => (days >= 3 && !item.followUpDay3) || (days >= 5 && !item.followUpDay5))

  const targetForDay = 3
  const name = cleanText(profile?.name, 100).split(' ')[0] || 'there'
  const lines = [
    `Morning, ${name}.`,
    `${todayApplied}/${targetForDay} focused applications logged today.`,
    pending.length ? `${pending.length} follow-up${pending.length === 1 ? '' : 's'} due.` : 'No follow-ups due right now.',
    'Prioritize recent employer-site roles and verify every listing before investing time.',
  ]

  return { pending, todayApplied, targetForDay, message: lines.join('\n') }
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function exportTrackerCSV(tracker) {
  const fields = ['jobTitle', 'company', 'appliedAt', 'status', 'followUpDay3', 'followUpDay5', 'url']
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  const rows = [fields.join(','), ...tracker.map(item => fields.map(field => escape(item[field])).join(','))]
  downloadText('offerclaw-pipeline.csv', rows.join('\n'), 'text/csv;charset=utf-8')
}

export function exportTrackerJSON(tracker) {
  downloadText('offerclaw-pipeline.json', JSON.stringify(tracker, null, 2), 'application/json')
}

async function runtimeStatus() {
  try {
    const response = await fetch('/api/health', { headers: { Accept: 'application/json' } })
    const data = await readJsonResponse(response)
    if (!response.ok) throw new Error('health_failed')
    return data
  } catch {
    return { ok: false, ai: { configured: false }, jobs: { configured: false } }
  }
}

export async function runAgent(command, profile, _legacyKeys, tracker, callbacks = {}) {
  const input = cleanText(command, 500).trim()
  const lower = input.toLowerCase()
  const onMessage = callbacks.onMessage || (() => {})
  const onJobs = callbacks.onJobs || (() => {})
  const onSetView = callbacks.onSetView || (() => {})
  const onDone = callbacks.onDone || (() => {})
  const onError = callbacks.onError || (() => {})

  try {
    if (!input || lower === 'help' || lower === '?') {
      onMessage({ type: 'agent', text: 'Commands:\n  find me jobs\n  analyze 1\n  prepare 1\n  daily digest\n  status\n  export' })
      return onDone()
    }

    if (lower === 'status' || lower.includes('runtime')) {
      const status = await runtimeStatus()
      const ai = status.ai?.configured ? `AI ready · ${status.ai.model}` : 'AI not configured · template mode'
      const jobs = status.jobs?.configured ? 'Live jobs ready' : 'Jobs API not configured · demo mode'
      onMessage({ type: 'agent', text: `${ai}\n${jobs}\nProvider credentials stay server-side.` })
      return onDone()
    }

    if (lower.includes('daily digest') || lower === 'digest') {
      onMessage({ type: 'agent', text: skillDailyDigest(tracker || [], profile).message })
      return onDone()
    }

    if (lower === 'export' || lower.includes('export pipeline')) {
      exportTrackerJSON(tracker || [])
      onMessage({ type: 'agent', text: 'Pipeline exported as JSON.' })
      return onDone()
    }

    const prepareMatch = lower.match(/(?:prepare|compose|apply)\s+(\d+)/)
    if (prepareMatch) {
      const index = Number(prepareMatch[1])
      onMessage({ type: 'agent', text: `Preparing job ${index}. I will only use claims already present in your profile/resume.` })
      return onDone(index)
    }

    const analyzeMatch = lower.match(/(?:analyze|analyse|inspect)\s+(\d+)/)
    if (analyzeMatch && callbacks.currentJobs) {
      const job = callbacks.currentJobs[Number(analyzeMatch[1]) - 1]
      if (!job) {
        onMessage({ type: 'agent', text: 'That job number is not in the current result set.' })
        return onDone()
      }
      const ghost = skillGhostDetector(job)
      const finder = skillHumanFinder(job)
      onMessage({
        type: 'agent',
        text: `${job.title} @ ${job.company}\nMatch: ${job.matchScore}% · Listing confidence: ${ghost.score}%\n${ghost.warnings.join('\n') || 'No major listing-quality warnings from the available data.'}\n\nHuman route: ${finder.outreachTip}`,
      })
      return onDone()
    }

    if (lower.includes('job') || lower.includes('find') || lower.includes('search')) {
      onMessage({ type: 'agent', text: `Searching for recent ${profile?.currentRole || 'roles'} near ${profile?.location || 'your preferred location'}...` })
      const jobs = await skillJobScout(profile)
      onJobs(jobs)
      const mode = jobs.some(job => job.dataSource === 'live') ? 'live provider data' : 'demo data'
      onMessage({ type: 'agent', text: `Found ${jobs.length} ranked roles using ${mode}. Use “analyze 1” for listing risk or “prepare 1” for a truth-checked application package.` })
      return onDone()
    }

    if (lower.includes('pipeline') || lower.includes('tracker')) {
      onSetView('tracker')
      return onDone()
    }

    onMessage({ type: 'agent', text: 'I did not recognize that command. Try “find me jobs”, “analyze 1”, “prepare 1”, “daily digest”, “status”, or “help”.' })
    return onDone()
  } catch (error) {
    onError(error.message || 'Agent error')
    onMessage({ type: 'agent', text: `I hit a runtime problem (${error.message || 'unknown'}). Demo/template mode is still available.` })
    return onDone()
  }
}
