import { detectCheckpoints } from './prefiller.js'
import {
  claimPrefillSessionForSubmit,
  closePrefillSession,
  markSubmitNetworkAttempt,
  releasePrefillSubmitClaim,
} from './sessionStore.js'

export const SUBMIT_WORKER_VERSION = '0.1.0'

function clean(value, max = 2_000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function sameUrl(left, right) {
  try {
    const a = new URL(left)
    const b = new URL(right)
    a.hash = ''
    b.hash = ''
    return a.toString() === b.toString()
  } catch {
    return false
  }
}

async function requiredFieldGaps(page) {
  return page.locator('input, textarea, select, [contenteditable="true"]').evaluateAll(elements => {
    const normalize = (value, max = 240) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
    const labelFor = element => {
      const labels = element.labels ? [...element.labels] : []
      if (labels.length) {
        const text = normalize(labels.map(label => label.innerText || label.textContent).join(' '))
        if (text) return text
      }
      const aria = normalize(element.getAttribute('aria-label'))
      if (aria) return aria
      const parent = element.closest('label')
      if (parent) return normalize(parent.innerText || parent.textContent)
      return normalize(element.getAttribute('placeholder') || element.getAttribute('name') || element.id)
    }

    const visible = element => {
      const style = globalThis.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }

    const gaps = []
    const radioGroups = new Set()
    for (const element of elements) {
      const required = Boolean(element.required || element.getAttribute('aria-required') === 'true')
      if (!required || element.disabled || !visible(element)) continue

      const tag = element.tagName.toLowerCase()
      const type = tag === 'input' ? String(element.type || 'text').toLowerCase() : tag
      if (type === 'hidden') continue

      let missing = false
      if (type === 'radio') {
        const name = String(element.getAttribute('name') || '')
        const key = name || element.id || `radio-${gaps.length}`
        if (radioGroups.has(key)) continue
        radioGroups.add(key)
        const group = name
          ? [...document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`)]
          : [element]
        missing = !group.some(item => item.checked)
      } else if (type === 'checkbox') {
        missing = !element.checked
      } else if (type === 'file') {
        missing = !element.files || element.files.length === 0
      } else if (tag === 'select') {
        missing = !String(element.value || '').trim()
      } else if (element.getAttribute('contenteditable') === 'true') {
        missing = !String(element.innerText || element.textContent || '').trim()
      } else {
        missing = !String(element.value || '').trim()
      }

      if (missing) {
        gaps.push({
          key: normalize(element.getAttribute('name') || element.id || labelFor(element), 180) || null,
          label: labelFor(element) || null,
          type: normalize(type, 60) || 'unknown',
        })
      }
      if (gaps.length >= 24) break
    }
    return gaps
  })
}

async function findSubmitControl(page) {
  const selector = 'form button[type="submit"], form button:not([type]), form input[type="submit"]'
  const locator = page.locator(selector)
  const candidates = await locator.evaluateAll(elements => {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 180)
    return elements.map((element, index) => {
      const style = globalThis.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      const visible = style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
      return {
        index,
        visible,
        disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
        label: normalize(element.innerText || element.value || element.getAttribute('aria-label') || 'Submit'),
      }
    }).filter(item => item.visible && !item.disabled)
  })

  if (candidates.length === 0) return { ok: false, reason: 'submit_control_missing', locator: null, label: null }
  const preferred = candidates.filter(item => /\b(submit|apply|send application|send)\b/i.test(item.label))
  const pool = preferred.length ? preferred : candidates
  if (pool.length !== 1) return { ok: false, reason: 'submit_control_ambiguous', locator: null, label: null }
  return {
    ok: true,
    reason: 'submit_control_ready',
    locator: locator.nth(pool[0].index),
    label: pool[0].label,
  }
}

async function confirmationSignal(page, originalUrl) {
  const finalUrl = page.url()
  const text = await page.locator('body').innerText({ timeout: 1_500 })
    .then(value => String(value || '').slice(0, 160_000).toLowerCase())
    .catch(() => '')

  const patterns = [
    ['thank_you', /\bthank you(?: for applying)?\b/],
    ['thanks_for_applying', /\bthanks for applying\b/],
    ['application_submitted', /\bapplication (?:was )?submitted\b/],
    ['application_received', /\b(?:we(?:'|’)ve|we have) received your application\b|\bapplication received\b/],
    ['successfully_submitted', /\bsuccessfully submitted\b/],
  ]
  for (const [signal, pattern] of patterns) {
    if (pattern.test(text)) return { signal, finalUrl }
  }

  try {
    const path = new URL(finalUrl).pathname.toLowerCase()
    if (/thank|success|submitted|confirmation/.test(path) && !sameUrl(finalUrl, originalUrl)) {
      return { signal: 'confirmation_url', finalUrl }
    }
  } catch {
    // Final URL is sanitized by caller.
  }

  return { signal: null, finalUrl }
}

function outcomeBase(validatedRequest, status, extras = {}) {
  return {
    version: 1,
    status,
    attempted: Boolean(extras.attempted),
    confirmed: Boolean(extras.confirmed),
    connectorId: validatedRequest.connectorId,
    approvalId: validatedRequest.approval.id,
    sessionId: validatedRequest.approval.sessionId,
    finalUrl: clean(extras.finalUrl, 2_000) || null,
    confirmationSignal: clean(extras.confirmationSignal, 80) || null,
    blockers: Array.isArray(extras.blockers) ? extras.blockers.slice(0, 24) : [],
    network: {
      allowedRequestCount: Math.max(0, Number(extras.allowedRequestCount) || 0),
      postRequestCount: Math.max(0, Number(extras.postRequestCount) || 0),
      navigationRequestCount: Math.max(0, Number(extras.navigationRequestCount) || 0),
      preflightRequestCount: Math.max(0, Number(extras.preflightRequestCount) || 0),
      blockedRequestCount: Math.max(0, Number(extras.blockedRequestCount) || 0),
      lastPostStatus: Number.isInteger(extras.lastPostStatus) ? extras.lastPostStatus : null,
    },
    sessionClosed: Boolean(extras.sessionClosed),
    completedAt: new Date().toISOString(),
  }
}

async function refreezeAndRelease(record, approvalId) {
  if (record?.networkState) record.networkState.mode = 'frozen'
  await record?.context?.setOffline?.(true).catch(() => {})
  if (record?.networkState) record.networkState.browserOffline = true
  releasePrefillSubmitClaim(record, approvalId)
}

export async function submitPrefilledApplication(validatedRequest, options = {}) {
  const approval = validatedRequest.approval
  const claim = await claimPrefillSessionForSubmit(approval.sessionId, {
    approvalId: approval.id,
    connectorId: validatedRequest.connectorId,
    targetUrl: validatedRequest.target.url,
    now: options.now,
  })
  if (!claim.ok) throw Object.assign(new Error(claim.reason), { code: claim.reason })

  const record = claim.record
  const page = record.page
  const network = record.networkState
  const initial = {
    allowed: Number(network.allowedSubmitRequests) || 0,
    posts: Number(network.submitPostRequests) || 0,
    navigation: Number(network.submitNavigationRequests) || 0,
    preflight: Number(network.submitPreflightRequests) || 0,
    blocked: Number(network.blockedSubmitRequests) || 0,
  }
  const postStatuses = []
  const responseListener = response => {
    try {
      if (network.mode !== 'submit') return
      const request = response.request()
      if (request.method().toUpperCase() === 'POST') postStatuses.push(response.status())
    } catch {
      // Outcome telemetry is best-effort and never contains response bodies.
    }
  }
  page.on('response', responseListener)

  try {
    if (!sameUrl(page.url(), record.targetUrl)) {
      await refreezeAndRelease(record, approval.id)
      return outcomeBase(validatedRequest, 'blocked_pre_submit', {
        blockers: [{ code: 'submit_live_url_changed' }],
        finalUrl: page.url(),
      })
    }

    if (record.prefillFields.some(field => field.status === 'rejected')) {
      await refreezeAndRelease(record, approval.id)
      return outcomeBase(validatedRequest, 'blocked_pre_submit', {
        blockers: [{ code: 'submit_prefill_rejected' }],
        finalUrl: page.url(),
      })
    }

    const checkpoints = await detectCheckpoints(page)
    const checkpointBlockers = []
    if (checkpoints.captchaDetected) checkpointBlockers.push({ code: 'submit_captcha_checkpoint' })
    if (checkpoints.twoFactorDetected) checkpointBlockers.push({ code: 'submit_two_factor_checkpoint' })
    if (checkpoints.loginRequired) checkpointBlockers.push({ code: 'submit_login_checkpoint' })
    if (checkpointBlockers.length) {
      await refreezeAndRelease(record, approval.id)
      return outcomeBase(validatedRequest, 'blocked_pre_submit', {
        blockers: checkpointBlockers,
        finalUrl: page.url(),
      })
    }

    const gaps = await requiredFieldGaps(page)
    if (gaps.length) {
      await refreezeAndRelease(record, approval.id)
      return outcomeBase(validatedRequest, 'blocked_pre_submit', {
        blockers: gaps.map(field => ({ code: 'submit_required_live_field_empty', detail: field.key || field.label || field.type })),
        finalUrl: page.url(),
      })
    }

    const submitControl = await findSubmitControl(page)
    if (!submitControl.ok) {
      await refreezeAndRelease(record, approval.id)
      return outcomeBase(validatedRequest, 'blocked_pre_submit', {
        blockers: [{ code: submitControl.reason }],
        finalUrl: page.url(),
      })
    }

    network.mode = 'submit'
    await record.context.setOffline(false)
    network.browserOffline = false

    let clickError = null
    try {
      await submitControl.locator.click({ timeout: Math.min(5_000, Number(options.clickTimeoutMs) || 3_000) })
    } catch (error) {
      clickError = error
    }

    await page.waitForLoadState('domcontentloaded', { timeout: Math.min(6_000, Number(options.settleTimeoutMs) || 4_000) }).catch(() => {})
    await page.waitForTimeout(Math.min(1_500, Math.max(100, Number(options.settleDelayMs) || 600)))

    const counts = {
      allowed: (Number(network.allowedSubmitRequests) || 0) - initial.allowed,
      posts: (Number(network.submitPostRequests) || 0) - initial.posts,
      navigation: (Number(network.submitNavigationRequests) || 0) - initial.navigation,
      preflight: (Number(network.submitPreflightRequests) || 0) - initial.preflight,
      blocked: (Number(network.blockedSubmitRequests) || 0) - initial.blocked,
    }
    const attempted = counts.posts > 0 || counts.navigation > 0

    network.mode = 'frozen'
    await record.context.setOffline(true).catch(() => {})
    network.browserOffline = true

    if (!attempted) {
      releasePrefillSubmitClaim(record, approval.id)
      return outcomeBase(validatedRequest, clickError ? 'submit_control_failed' : 'not_attempted', {
        blockers: clickError ? [{ code: 'submit_control_click_failed' }] : [{ code: 'submit_no_application_request_observed' }],
        finalUrl: page.url(),
        allowedRequestCount: counts.allowed,
        postRequestCount: counts.posts,
        navigationRequestCount: counts.navigation,
        preflightRequestCount: counts.preflight,
        blockedRequestCount: counts.blocked,
        lastPostStatus: postStatuses.at(-1),
      })
    }

    markSubmitNetworkAttempt(record, approval.id)
    const confirmation = await confirmationSignal(page, record.targetUrl)
    const lastPostStatus = postStatuses.at(-1)
    const postSucceeded = postStatuses.some(status => status >= 200 && status < 400)
    const postFailed = postStatuses.some(status => status >= 400)

    let status = 'attempted_unconfirmed'
    let confirmed = false
    if (confirmation.signal && !postFailed) {
      status = 'submitted_confirmed'
      confirmed = true
    } else if (postSucceeded && !postFailed) {
      status = 'submitted_likely'
    } else if (postFailed) {
      status = 'attempted_failed'
    }

    const sessionClosed = await closePrefillSession(approval.sessionId)
    return outcomeBase(validatedRequest, status, {
      attempted: true,
      confirmed,
      finalUrl: confirmation.finalUrl,
      confirmationSignal: confirmation.signal,
      allowedRequestCount: counts.allowed,
      postRequestCount: counts.posts,
      navigationRequestCount: counts.navigation,
      preflightRequestCount: counts.preflight,
      blockedRequestCount: counts.blocked,
      lastPostStatus,
      sessionClosed,
    })
  } catch (error) {
    const networkAttempted = (Number(network?.submitPostRequests) || 0) > initial.posts
      || (Number(network?.submitNavigationRequests) || 0) > initial.navigation

    if (networkAttempted) {
      markSubmitNetworkAttempt(record, approval.id)
      await closePrefillSession(approval.sessionId)
    } else {
      await refreezeAndRelease(record, approval.id)
    }
    throw error
  } finally {
    page.off('response', responseListener)
  }
}
