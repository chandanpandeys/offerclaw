import { chromium } from 'playwright'

import { classifyField } from '../../src/formPlanner.js'
import {
  PREFILL_ALLOWED_INPUT_TYPES,
  PREFILL_ALLOWED_KINDS,
  validateApprovedPrefillFields,
} from '../../src/prefillContract.js'
import { isSameOrigin } from './security.js'
import { retainPrefillSession } from './sessionStore.js'
import { evaluateSubmitNetworkRequest, MAX_SUBMIT_POST_REQUESTS } from './submitPolicy.js'

export const PREFILL_WORKER_VERSION = '0.4.0'

let browserPromise = null

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage'],
    }).catch(error => {
      browserPromise = null
      throw error
    })
  }
  const browser = await browserPromise
  if (!browser.isConnected()) {
    browserPromise = null
    return getBrowser()
  }
  return browser
}

export async function closePrefillBrowser() {
  if (!browserPromise) return
  const browser = await browserPromise.catch(() => null)
  browserPromise = null
  if (browser) await browser.close().catch(() => {})
}

export async function discoverLiveFields(page) {
  return page.locator('input, textarea, select, [contenteditable="true"]').evaluateAll(elements => {
    const normalize = (value, max = 500) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)

    const labelFor = element => {
      const labels = element.labels ? [...element.labels] : []
      if (labels.length) {
        const text = normalize(labels.map(label => label.innerText || label.textContent).join(' '))
        if (text) return text
      }

      const ariaLabel = normalize(element.getAttribute('aria-label'))
      if (ariaLabel) return ariaLabel

      const labelledBy = normalize(element.getAttribute('aria-labelledby'))
      if (labelledBy) {
        const text = normalize(labelledBy
          .split(/\s+/)
          .map(id => document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || '')
          .join(' '))
        if (text) return text
      }

      const parentLabel = element.closest('label')
      if (parentLabel) {
        const text = normalize(parentLabel.innerText || parentLabel.textContent)
        if (text) return text
      }

      const fieldset = element.closest('fieldset')
      if (fieldset) {
        const legend = fieldset.querySelector(':scope > legend')
        const text = normalize(legend?.innerText || legend?.textContent)
        if (text) return text
      }

      return null
    }

    return elements.map((element, domIndex) => {
      const tag = element.tagName.toLowerCase()
      const inputType = tag === 'input'
        ? String(element.getAttribute('type') || 'text').toLowerCase()
        : tag === 'textarea'
          ? 'textarea'
          : tag === 'select'
            ? 'select'
            : 'contenteditable'
      const style = globalThis.getComputedStyle(element)
      const visible = style.display !== 'none' && style.visibility !== 'hidden'
        && inputType !== 'hidden'

      const options = tag === 'select'
        ? [...element.options].slice(0, 80).map(option => ({
            value: normalize(option.value, 240),
            label: normalize(option.textContent, 240),
          }))
        : []

      return {
        domIndex,
        visible,
        id: normalize(element.id, 180) || null,
        name: normalize(element.getAttribute('name'), 180) || null,
        label: labelFor(element),
        type: normalize(inputType, 80) || 'unknown',
        placeholder: normalize(element.getAttribute('placeholder'), 300) || null,
        autocomplete: normalize(element.getAttribute('autocomplete'), 120) || null,
        required: Boolean(element.required || element.getAttribute('aria-required') === 'true'),
        disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
        readonly: Boolean(element.readOnly || element.getAttribute('aria-readonly') === 'true'),
        options,
      }
    }).filter(field => field.visible)
  })
}

export async function detectCheckpoints(page) {
  const captchaSelectors = [
    'iframe[src*="captcha" i]',
    'iframe[title*="captcha" i]',
    '[class*="captcha" i]',
    '[id*="captcha" i]',
    '[data-sitekey]',
  ]
  const twoFactorSelectors = [
    'input[autocomplete="one-time-code"]',
    'input[name*="otp" i]',
    'input[id*="otp" i]',
    'input[name*="verification" i]',
  ]

  const captchaDetected = await page.locator(captchaSelectors.join(',')).count().then(count => count > 0).catch(() => false)
  const twoFactorDetected = await page.locator(twoFactorSelectors.join(',')).count().then(count => count > 0).catch(() => false)
  const passwordField = await page.locator('input[type="password"]').count().then(count => count > 0).catch(() => false)
  const textSignals = await page.locator('body').innerText({ timeout: 1_500 })
    .then(text => String(text || '').slice(0, 120_000).toLowerCase())
    .catch(() => '')
  const loginRequired = passwordField || /\b(sign in|log in|login required|create an account)\b/.test(textSignals)

  return { captchaDetected, twoFactorDetected, loginRequired }
}

function matchesApprovedKey(field, approved) {
  return field.name === approved.key || field.id === approved.key || field.label === approved.key
}

function prefillDecision(approved, liveFields) {
  const matches = liveFields.filter(field => matchesApprovedKey(field, approved))
  if (matches.length === 0) return { ok: false, reason: 'approved_field_missing' }
  if (matches.length > 1) return { ok: false, reason: 'approved_field_ambiguous' }

  const live = matches[0]
  if (live.disabled || live.readonly) return { ok: false, reason: 'approved_field_not_writable' }
  if (approved.label && live.label !== approved.label) return { ok: false, reason: 'approved_field_label_changed' }
  if (live.type !== approved.inputType) return { ok: false, reason: 'approved_field_type_changed' }
  if (!PREFILL_ALLOWED_INPUT_TYPES.has(live.type)) return { ok: false, reason: 'live_input_type_not_allowed' }

  const liveKind = classifyField(live)
  if (!PREFILL_ALLOWED_KINDS.has(liveKind)) return { ok: false, reason: 'live_field_kind_not_allowed' }
  if (liveKind !== approved.kind) return { ok: false, reason: 'approved_field_kind_changed' }

  if (live.type === 'select') {
    const option = live.options.find(item => item.value === approved.value || item.label === approved.value)
    if (!option) return { ok: false, reason: 'approved_select_option_missing' }
    return { ok: true, live, selectOption: option }
  }

  return { ok: true, live, selectOption: null }
}

function resultField(approved, status, reason) {
  return {
    key: approved.key,
    status,
    kind: approved.kind,
    inputType: approved.inputType,
    evidenceSource: approved.evidenceSource,
    reason,
  }
}

export async function prefillApplicationPage(validatedRequest, options = {}) {
  const approvedValidation = validateApprovedPrefillFields(validatedRequest?.approvedFields)
  if (!approvedValidation.ok) throw Object.assign(new Error(approvedValidation.reason), { code: approvedValidation.reason })

  const browser = await getBrowser()
  const timeoutMs = Math.min(20_000, Math.max(5_000, Number(options.timeoutMs) || 15_000))
  const context = await browser.newContext({
    acceptDownloads: false,
    serviceWorkers: 'block',
    permissions: [],
    ignoreHTTPSErrors: false,
    viewport: { width: 1280, height: 900 },
  })

  let retained = false
  let blockedWriteRequests = 0
  let blockedCrossOriginDocuments = 0
  const targetOrigin = validatedRequest.target.origin
  const networkState = {
    mode: 'loading',
    browserOffline: false,
    allowedSubmitRequests: 0,
    submitPostRequests: 0,
    blockedSubmitRequests: 0,
    blockedAfterFreeze: 0,
    maxSubmitPostRequests: MAX_SUBMIT_POST_REQUESTS,
    requestPolicy: typeof options.submitRequestPolicy === 'function' ? options.submitRequestPolicy : null,
  }

  try {
    await context.routeWebSocket(/.*/, async ws => {
      await ws.close().catch(() => {})
    })

    await context.route('**/*', async route => {
      const request = route.request()
      let url
      try {
        url = new URL(request.url())
      } catch {
        return route.abort('blockedbyclient')
      }

      if (!['http:', 'https:'].includes(url.protocol)) return route.abort('blockedbyclient')

      if (networkState.mode === 'frozen') {
        networkState.blockedAfterFreeze += 1
        return route.abort('blockedbyclient')
      }

      if (networkState.mode === 'submit') {
        const input = {
          connectorId: validatedRequest.connectorId,
          url: url.toString(),
          method: request.method(),
          resourceType: request.resourceType(),
          navigationRequest: request.isNavigationRequest(),
        }
        const decision = networkState.requestPolicy
          ? networkState.requestPolicy(input)
          : evaluateSubmitNetworkRequest(input)

        if (!decision?.allowed) {
          networkState.blockedSubmitRequests += 1
          return route.abort('blockedbyclient')
        }

        if (decision.write) {
          if (networkState.submitPostRequests >= networkState.maxSubmitPostRequests) {
            networkState.blockedSubmitRequests += 1
            return route.abort('blockedbyclient')
          }
          networkState.submitPostRequests += 1
        }

        networkState.allowedSubmitRequests += 1
        return route.continue()
      }

      const method = request.method().toUpperCase()
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        blockedWriteRequests += 1
        return route.abort('blockedbyclient')
      }

      if (request.resourceType() === 'document' && url.origin !== targetOrigin) {
        blockedCrossOriginDocuments += 1
        return route.abort('blockedbyclient')
      }

      return route.continue()
    })

    const page = await context.newPage()
    page.setDefaultTimeout(Math.min(5_000, timeoutMs))
    page.setDefaultNavigationTimeout(timeoutMs)
    page.on('dialog', dialog => { dialog.dismiss().catch(() => {}) })
    page.on('download', download => { download.cancel().catch(() => {}) })
    context.on('page', popup => {
      if (popup !== page) popup.close().catch(() => {})
    })

    await page.goto(validatedRequest.target.url, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    })
    await page.waitForLoadState('networkidle', { timeout: 2_000 }).catch(() => {})

    const initialUrl = page.url()
    if (!isSameOrigin(validatedRequest.target.url, initialUrl)) {
      throw Object.assign(new Error('navigation_scope_violation'), { code: 'navigation_scope_violation' })
    }

    const [liveFields, checkpoints] = await Promise.all([
      discoverLiveFields(page),
      detectCheckpoints(page),
    ])

    if (checkpoints.captchaDetected || checkpoints.twoFactorDetected || checkpoints.loginRequired) {
      throw Object.assign(new Error('manual_checkpoint_required'), { code: 'manual_checkpoint_required' })
    }

    const decisions = approvedValidation.fields.map(approved => ({
      approved,
      decision: prefillDecision(approved, liveFields),
    }))

    // Privacy barrier: the browser network stack and route policy are both frozen
    // before approved candidate values enter the live page.
    networkState.mode = 'frozen'
    await context.setOffline(true)
    networkState.browserOffline = true

    const controls = page.locator('input, textarea, select, [contenteditable="true"]')
    const fields = []

    for (const item of decisions) {
      const { approved, decision } = item
      if (!decision.ok) {
        fields.push(resultField(approved, 'rejected', decision.reason))
        continue
      }

      try {
        const locator = controls.nth(decision.live.domIndex)
        if (decision.live.type === 'select') {
          const option = decision.selectOption
          if (option.value) await locator.selectOption({ value: option.value })
          else await locator.selectOption({ label: option.label })
        } else {
          await locator.fill(approved.value)
        }
        fields.push(resultField(approved, 'filled', 'filled_from_approved_evidence'))
      } catch {
        fields.push(resultField(approved, 'rejected', 'field_write_failed'))
      }
    }

    await page.waitForTimeout(100)

    const finalUrl = page.url()
    if (!isSameOrigin(validatedRequest.target.url, finalUrl)) {
      throw Object.assign(new Error('navigation_scope_violation'), { code: 'navigation_scope_violation' })
    }

    const filledCount = fields.filter(field => field.status === 'filled').length
    const rejectedCount = fields.length - filledCount
    const previewBuffer = await page.screenshot({
      type: 'png',
      fullPage: false,
      animations: 'disabled',
      caret: 'hide',
    })

    const session = await retainPrefillSession({
      context,
      page,
      connectorId: validatedRequest.connectorId,
      targetUrl: finalUrl,
      targetOrigin,
      approvedFieldKeys: approvedValidation.fields.map(field => field.key),
      requestId: validatedRequest.requestId || null,
      networkState,
      prefillFields: fields,
      checkpoints,
    })
    retained = true

    return {
      url: finalUrl,
      connectorId: validatedRequest.connectorId,
      fields,
      checkpoints,
      session,
      preview: {
        mimeType: 'image/png',
        base64: previewBuffer.toString('base64'),
        width: 1280,
        height: 900,
      },
      metadata: {
        filledCount,
        rejectedCount,
        networkFrozen: true,
        browserOffline: networkState.browserOffline,
        submitAttempted: false,
        blockedWriteRequests,
        blockedAfterFreeze: networkState.blockedAfterFreeze,
        blockedCrossOriginDocuments,
        workerVersion: PREFILL_WORKER_VERSION,
      },
    }
  } finally {
    if (!retained) await context.close().catch(() => {})
  }
}
