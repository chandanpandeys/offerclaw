export const CAPABILITY = Object.freeze({
  NATIVE: 'native',
  HANDOFF: 'handoff',
  APPROVAL: 'approval',
  PLANNED: 'planned',
  BLOCKED: 'blocked',
})

export const ACTION = Object.freeze({
  SEARCH_JOBS: 'search_jobs',
  READ_JOB: 'read_job',
  VERIFY_LISTING: 'verify_listing',
  PREPARE_APPLICATION: 'prepare_application',
  OPEN_APPLY: 'open_apply',
  PREFILL_APPLICATION: 'prefill_application',
  SUBMIT_APPLICATION: 'submit_application',
  FIND_PEOPLE: 'find_people',
  DRAFT_OUTREACH: 'draft_outreach',
  SEND_MESSAGE: 'send_message',
})

const DEFAULT_CAPABILITIES = Object.freeze({
  [ACTION.SEARCH_JOBS]: CAPABILITY.BLOCKED,
  [ACTION.READ_JOB]: CAPABILITY.HANDOFF,
  [ACTION.VERIFY_LISTING]: CAPABILITY.HANDOFF,
  [ACTION.PREPARE_APPLICATION]: CAPABILITY.NATIVE,
  [ACTION.OPEN_APPLY]: CAPABILITY.HANDOFF,
  [ACTION.PREFILL_APPLICATION]: CAPABILITY.PLANNED,
  [ACTION.SUBMIT_APPLICATION]: CAPABILITY.PLANNED,
  [ACTION.FIND_PEOPLE]: CAPABILITY.HANDOFF,
  [ACTION.DRAFT_OUTREACH]: CAPABILITY.NATIVE,
  [ACTION.SEND_MESSAGE]: CAPABILITY.PLANNED,
})

function connector(config) {
  return Object.freeze({
    ...config,
    capabilities: Object.freeze({ ...DEFAULT_CAPABILITIES, ...(config.capabilities || {}) }),
  })
}

const PUBLIC_FEED_CAPABILITIES = {
  [ACTION.SEARCH_JOBS]: CAPABILITY.NATIVE,
  [ACTION.READ_JOB]: CAPABILITY.NATIVE,
}

export const CONNECTORS = Object.freeze({
  jsearch: connector({
    id: 'jsearch',
    name: 'JSearch',
    kind: 'aggregator',
    status: 'connected_when_configured',
    note: 'Server-side discovery provider. Apply actions hand off to the destination returned by the listing.',
    capabilities: {
      [ACTION.SEARCH_JOBS]: CAPABILITY.NATIVE,
      [ACTION.READ_JOB]: CAPABILITY.NATIVE,
    },
  }),
  linkedin: connector({
    id: 'linkedin',
    name: 'LinkedIn',
    kind: 'job_board',
    status: 'user_assisted',
    hosts: ['linkedin.com'],
    note: 'Research and user handoff only. OfferClaw does not automate LinkedIn submissions or messages.',
    capabilities: {
      [ACTION.SEARCH_JOBS]: CAPABILITY.HANDOFF,
      [ACTION.FIND_PEOPLE]: CAPABILITY.HANDOFF,
      [ACTION.PREFILL_APPLICATION]: CAPABILITY.BLOCKED,
      [ACTION.SUBMIT_APPLICATION]: CAPABILITY.BLOCKED,
      [ACTION.SEND_MESSAGE]: CAPABILITY.BLOCKED,
    },
  }),
  indeed: connector({
    id: 'indeed',
    name: 'Indeed',
    kind: 'job_board',
    status: 'user_assisted',
    hosts: ['indeed.com', 'indeed.co.in'],
    note: 'Designed for an approved partner/API implementation later; current product uses verified handoff.',
    capabilities: {
      [ACTION.SEARCH_JOBS]: CAPABILITY.HANDOFF,
      [ACTION.PREFILL_APPLICATION]: CAPABILITY.PLANNED,
      [ACTION.SUBMIT_APPLICATION]: CAPABILITY.PLANNED,
    },
  }),
  naukri: connector({
    id: 'naukri',
    name: 'Naukri',
    kind: 'job_board',
    status: 'user_assisted',
    hosts: ['naukri.com'],
    note: 'No undocumented private API is treated as a production dependency.',
    capabilities: {
      [ACTION.SEARCH_JOBS]: CAPABILITY.HANDOFF,
      [ACTION.PREFILL_APPLICATION]: CAPABILITY.PLANNED,
      [ACTION.SUBMIT_APPLICATION]: CAPABILITY.PLANNED,
    },
  }),
  apna: connector({
    id: 'apna',
    name: 'Apna',
    kind: 'job_board',
    status: 'user_assisted',
    hosts: ['apna.co'],
    note: 'Connector contract is ready for an approved integration; current product uses user handoff.',
    capabilities: {
      [ACTION.SEARCH_JOBS]: CAPABILITY.HANDOFF,
      [ACTION.PREFILL_APPLICATION]: CAPABILITY.PLANNED,
      [ACTION.SUBMIT_APPLICATION]: CAPABILITY.PLANNED,
    },
  }),
  greenhouse: connector({
    id: 'greenhouse',
    name: 'Greenhouse',
    kind: 'ats',
    status: 'public_feed_when_configured',
    hosts: ['greenhouse.io', 'boards.greenhouse.io', 'job-boards.greenhouse.io'],
    note: 'Official public Job Board API supports read-only discovery when a board token is configured. Application actions remain separate.',
    capabilities: PUBLIC_FEED_CAPABILITIES,
  }),
  lever: connector({
    id: 'lever',
    name: 'Lever',
    kind: 'ats',
    status: 'public_feed_when_configured',
    hosts: ['lever.co', 'jobs.lever.co'],
    note: 'Official public Postings API supports read-only discovery when a site is configured. Application submission is not enabled.',
    capabilities: PUBLIC_FEED_CAPABILITIES,
  }),
  workday: connector({
    id: 'workday',
    name: 'Workday',
    kind: 'ats',
    status: 'browser_worker_candidate',
    hosts: ['myworkdayjobs.com', 'workdayjobs.com'],
  }),
  ashby: connector({
    id: 'ashby',
    name: 'Ashby',
    kind: 'ats',
    status: 'public_feed_when_configured',
    hosts: ['ashbyhq.com'],
    note: 'Official public Job Postings API supports listed read-only jobs when a board name is configured.',
    capabilities: PUBLIC_FEED_CAPABILITIES,
  }),
  smartrecruiters: connector({
    id: 'smartrecruiters',
    name: 'SmartRecruiters',
    kind: 'ats',
    status: 'browser_worker_candidate',
    hosts: ['smartrecruiters.com'],
  }),
  workable: connector({
    id: 'workable',
    name: 'Workable',
    kind: 'ats',
    status: 'browser_worker_candidate',
    hosts: ['workable.com'],
  }),
  jobvite: connector({
    id: 'jobvite',
    name: 'Jobvite',
    kind: 'ats',
    status: 'browser_worker_candidate',
    hosts: ['jobvite.com'],
  }),
  icims: connector({
    id: 'icims',
    name: 'iCIMS',
    kind: 'ats',
    status: 'browser_worker_candidate',
    hosts: ['icims.com'],
  }),
  bamboohr: connector({
    id: 'bamboohr',
    name: 'BambooHR',
    kind: 'ats',
    status: 'browser_worker_candidate',
    hosts: ['bamboohr.com'],
  }),
  employer_site: connector({
    id: 'employer_site',
    name: 'Employer careers site',
    kind: 'employer_site',
    status: 'browser_worker_candidate',
    note: 'Unknown non-board destinations are treated as likely employer-controlled only after user verification.',
    capabilities: {
      [ACTION.SEARCH_JOBS]: CAPABILITY.PLANNED,
    },
  }),
  demo: connector({
    id: 'demo',
    name: 'Demo data',
    kind: 'demo',
    status: 'local',
    note: 'Synthetic data for product evaluation. External actions are disabled.',
    capabilities: {
      [ACTION.SEARCH_JOBS]: CAPABILITY.NATIVE,
      [ACTION.READ_JOB]: CAPABILITY.NATIVE,
      [ACTION.VERIFY_LISTING]: CAPABILITY.BLOCKED,
      [ACTION.OPEN_APPLY]: CAPABILITY.BLOCKED,
      [ACTION.PREFILL_APPLICATION]: CAPABILITY.BLOCKED,
      [ACTION.SUBMIT_APPLICATION]: CAPABILITY.BLOCKED,
      [ACTION.FIND_PEOPLE]: CAPABILITY.BLOCKED,
      [ACTION.SEND_MESSAGE]: CAPABILITY.BLOCKED,
    },
  }),
  unknown: connector({
    id: 'unknown',
    name: 'Unknown source',
    kind: 'unknown',
    status: 'verify_first',
    note: 'Unknown destinations require verification before OfferClaw should suggest an external action.',
    capabilities: {
      [ACTION.SEARCH_JOBS]: CAPABILITY.BLOCKED,
      [ACTION.OPEN_APPLY]: CAPABILITY.APPROVAL,
      [ACTION.PREFILL_APPLICATION]: CAPABILITY.BLOCKED,
      [ACTION.SUBMIT_APPLICATION]: CAPABILITY.BLOCKED,
      [ACTION.SEND_MESSAGE]: CAPABILITY.BLOCKED,
    },
  }),
})

const HOST_MATCHERS = Object.values(CONNECTORS)
  .filter(item => Array.isArray(item.hosts))
  .flatMap(item => item.hosts.map(host => [host, item.id]))

export function hostnameFromUrl(url) {
  if (!url) return ''
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

function hostMatches(hostname, pattern) {
  return hostname === pattern || hostname.endsWith(`.${pattern}`)
}

export function resolveConnector(job = {}) {
  if (job.dataSource === 'demo') return CONNECTORS.demo
  if (job.connectorId && CONNECTORS[job.connectorId]) return CONNECTORS[job.connectorId]

  const hostname = hostnameFromUrl(job.url || job.applyUrl)
  if (hostname) {
    const match = HOST_MATCHERS.find(([pattern]) => hostMatches(hostname, pattern))
    if (match) return CONNECTORS[match[1]]
    return CONNECTORS.employer_site
  }

  if (job.dataSource === 'live') return CONNECTORS.jsearch
  return CONNECTORS.unknown
}

export function connectorSnapshot(job = {}) {
  const item = resolveConnector(job)
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    status: item.status,
    capabilities: { ...item.capabilities },
  }
}

export function capabilityFor(connectorId, action) {
  const item = CONNECTORS[connectorId] || CONNECTORS.unknown
  return item.capabilities[action] || CAPABILITY.BLOCKED
}

function encodedSearch(query) {
  return encodeURIComponent(String(query || '').trim())
}

export function buildPlatformJobSearchUrl(connectorId, profile = {}) {
  const role = String(profile.currentRole || 'software engineer').trim()
  const location = String(profile.location || 'India').trim()
  const q = encodedSearch(role)
  const l = encodedSearch(location)

  if (connectorId === 'linkedin') return `https://www.linkedin.com/jobs/search/?keywords=${q}&location=${l}`
  if (connectorId === 'indeed') return `https://in.indeed.com/jobs?q=${q}&l=${l}`

  const domains = {
    naukri: 'naukri.com',
    apna: 'apna.co',
  }
  const domain = domains[connectorId]
  if (domain) return `https://www.google.com/search?q=${encodedSearch(`site:${domain} ${role} ${location}`)}`
  return null
}

export function buildPeopleSearchUrl(job = {}) {
  const query = [job.company, job.title, 'hiring manager recruiter'].filter(Boolean).join(' ')
  return `https://www.linkedin.com/search/results/people/?keywords=${encodedSearch(query)}`
}

export function listConnectorSummaries() {
  return Object.values(CONNECTORS).map(item => ({
    id: item.id,
    name: item.name,
    kind: item.kind,
    status: item.status,
  }))
}
