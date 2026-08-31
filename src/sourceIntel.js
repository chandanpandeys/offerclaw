const BOARD_HOSTS = [
  ['linkedin.com', 'LinkedIn'],
  ['indeed.', 'Indeed'],
  ['glassdoor.', 'Glassdoor'],
  ['naukri.com', 'Naukri'],
  ['wellfound.com', 'Wellfound'],
  ['monster.', 'Monster'],
]

const ATS_HOSTS = [
  ['greenhouse.io', 'Greenhouse'],
  ['lever.co', 'Lever'],
  ['myworkdayjobs.com', 'Workday'],
  ['workdayjobs.com', 'Workday'],
  ['ashbyhq.com', 'Ashby'],
  ['smartrecruiters.com', 'SmartRecruiters'],
  ['workable.com', 'Workable'],
  ['jobvite.com', 'Jobvite'],
  ['icims.com', 'iCIMS'],
  ['bamboohr.com', 'BambooHR'],
]

function safeUrl(value) {
  try {
    const parsed = new URL(String(value || ''))
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    return parsed
  } catch {
    return null
  }
}

function knownHost(hostname, catalog) {
  const lower = String(hostname || '').toLowerCase()
  return catalog.find(([needle]) => lower.includes(needle)) || null
}

export function buildSourceIntel(job = {}) {
  if (job.dataSource === 'demo') {
    return {
      category: 'demo',
      label: 'Demo listing',
      host: null,
      score: 0,
      employerControlled: false,
      needsOfficialVerification: true,
      signals: [],
      warnings: ['Demo data is not a real vacancy.'],
    }
  }

  const parsed = safeUrl(job.url)
  if (!parsed) {
    return {
      category: 'unknown',
      label: 'No apply route',
      host: null,
      score: 20,
      employerControlled: false,
      needsOfficialVerification: true,
      signals: [],
      warnings: ['No usable application URL was provided by the job feed.'],
    }
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase()
  const board = knownHost(host, BOARD_HOSTS)
  if (board) {
    return {
      category: 'job_board',
      label: board[1],
      host,
      score: 55,
      employerControlled: false,
      needsOfficialVerification: true,
      signals: [`Apply route is hosted by ${board[1]}.`],
      warnings: ['Verify the opening on the employer careers site before investing significant time.'],
    }
  }

  const ats = knownHost(host, ATS_HOSTS)
  if (ats) {
    return {
      category: 'ats',
      label: ats[1],
      host,
      score: 82,
      employerControlled: false,
      needsOfficialVerification: false,
      signals: [`Apply route uses the ${ats[1]} applicant-tracking platform.`],
      warnings: ['An ATS route can be legitimate without sharing the employer’s own domain; confirm the company name and role before submitting personal data.'],
    }
  }

  return {
    category: 'employer_site',
    label: host,
    host,
    score: 88,
    employerControlled: true,
    needsOfficialVerification: false,
    signals: ['Apply route is not a recognized large job board or shared ATS domain.'],
    warnings: ['Treat this as a likely employer-controlled route, not a cryptographic verification of the company.'],
  }
}

export function officialCareersSearchUrl(job = {}) {
  const company = String(job.company || '').replace(/\s*\(demo\)$/i, '').trim()
  const role = String(job.title || '').trim()
  if (!company) return null
  const query = [`${company} careers`, role].filter(Boolean).join(' ')
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}
