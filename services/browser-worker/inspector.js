import { chromium } from 'playwright'
import { isSameOrigin } from './security.js'

export const WORKER_VERSION = '0.1.0'

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

export async function closeBrowser() {
  if (!browserPromise) return
  const browser = await browserPromise.catch(() => null)
  browserPromise = null
  if (browser) await browser.close().catch(() => {})
}

export async function extractFields(page) {
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

    return elements
      .filter(element => {
        const tag = element.tagName.toLowerCase()
        const inputType = tag === 'input' ? String(element.getAttribute('type') || 'text').toLowerCase() : ''
        if (inputType === 'hidden') return false
        const style = globalThis.getComputedStyle(element)
        return style.display !== 'none' && style.visibility !== 'hidden'
      })
      .slice(0, 120)
      .map(element => {
        const tag = element.tagName.toLowerCase()
        const inputType = tag === 'input'
          ? String(element.getAttribute('type') || 'text').toLowerCase()
          : tag === 'textarea'
            ? 'textarea'
            : tag === 'select'
              ? 'select'
              : 'contenteditable'

        const options = tag === 'select'
          ? [...element.options].slice(0, 80).map(option => ({
              value: normalize(option.value, 240),
              label: normalize(option.textContent, 240),
            }))
          : []

        return {
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
      })
  })
}

async function detectCheckpoints(page) {
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

export async function inspectApplicationPage(validatedRequest, options = {}) {
  const browser = await getBrowser()
  const timeoutMs = Math.min(20_000, Math.max(5_000, Number(options.timeoutMs) || 15_000))
  const context = await browser.newContext({
    acceptDownloads: false,
    serviceWorkers: 'block',
    permissions: [],
    ignoreHTTPSErrors: false,
  })

  let blockedWriteRequests = 0
  let blockedCrossOriginDocuments = 0
  const targetOrigin = validatedRequest.target.origin

  try {
    await context.route('**/*', async route => {
      const request = route.request()
      let url
      try {
        url = new URL(request.url())
      } catch {
        return route.abort('blockedbyclient')
      }

      if (!['http:', 'https:'].includes(url.protocol)) return route.abort('blockedbyclient')

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

    const finalUrl = page.url()
    if (!isSameOrigin(validatedRequest.target.url, finalUrl)) {
      throw Object.assign(new Error('navigation_scope_violation'), { code: 'navigation_scope_violation' })
    }

    const [fields, checkpoints, title] = await Promise.all([
      extractFields(page),
      detectCheckpoints(page),
      page.title().then(value => String(value || '').slice(0, 300)).catch(() => ''),
    ])

    return {
      url: finalUrl,
      title: title || null,
      connectorId: validatedRequest.connectorId,
      fields,
      checkpoints,
      metadata: {
        inspectedAt: new Date().toISOString(),
        workerVersion: WORKER_VERSION,
        blockedWriteRequests,
        blockedCrossOriginDocuments,
      },
    }
  } finally {
    await context.close().catch(() => {})
  }
}
