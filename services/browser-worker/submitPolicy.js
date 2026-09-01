const CONNECTOR_SUBMIT_HOSTS = Object.freeze({
  greenhouse: Object.freeze([
    'boards.greenhouse.io',
    'job-boards.greenhouse.io',
    'boards-api.greenhouse.io',
  ]),
  lever: Object.freeze([
    'jobs.lever.co',
    'api.lever.co',
    'jobs.eu.lever.co',
    'api.eu.lever.co',
  ]),
  ashby: Object.freeze([
    'jobs.ashbyhq.com',
    'api.ashbyhq.com',
  ]),
})

export const SUBMIT_NETWORK_POLICY_VERSION = 1
export const SUBMIT_NETWORK_CONNECTORS = Object.freeze(Object.keys(CONNECTOR_SUBMIT_HOSTS))
export const MAX_SUBMIT_POST_REQUESTS = 6

function clean(value, max = 2_000) {
  return String(value || '').trim().slice(0, max)
}

function exactHost(hostname, allowed) {
  return hostname === allowed
}

export function connectorSubmitHosts(connectorId) {
  return CONNECTOR_SUBMIT_HOSTS[clean(connectorId, 60)] || Object.freeze([])
}

export function submitHostAllowed(connectorId, rawUrl) {
  let url
  try {
    url = new URL(clean(rawUrl))
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const hostname = url.hostname.toLowerCase()
  return connectorSubmitHosts(connectorId).some(host => exactHost(hostname, host))
}

export function evaluateSubmitNetworkRequest({
  connectorId,
  url,
  method,
  resourceType,
  navigationRequest = false,
} = {}) {
  let parsed
  try {
    parsed = new URL(clean(url))
  } catch {
    return { allowed: false, reason: 'submit_network_invalid_url', write: false }
  }

  if (parsed.protocol !== 'https:') {
    return { allowed: false, reason: 'submit_network_https_required', write: false }
  }
  if (!submitHostAllowed(connectorId, parsed.toString())) {
    return { allowed: false, reason: 'submit_network_host_blocked', write: false }
  }

  const verb = clean(method, 20).toUpperCase()
  const type = clean(resourceType, 40).toLowerCase()

  if (verb === 'POST') {
    return { allowed: true, reason: 'submit_network_post_allowed', write: true }
  }

  if (verb === 'OPTIONS') {
    return { allowed: true, reason: 'submit_network_preflight_allowed', write: false }
  }

  if ((verb === 'GET' || verb === 'HEAD') && navigationRequest && type === 'document') {
    return { allowed: true, reason: 'submit_network_navigation_allowed', write: false }
  }

  return { allowed: false, reason: 'submit_network_method_or_resource_blocked', write: false }
}
