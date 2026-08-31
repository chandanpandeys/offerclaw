import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_GATEWAY_MODEL,
  DEFAULT_GEMINI_MODEL,
  getAiRuntimeConfig,
  isRetryableProviderStatus,
  publicAiRuntime,
  splitCsv,
} from '../api/_lib/runtime.js'

test('direct Gemini is primary when both provider paths are configured', () => {
  const config = getAiRuntimeConfig({
    GEMINI_API_KEY: 'secret-primary',
    AI_GATEWAY_API_KEY: 'secret-gateway',
    AI_GATEWAY_FALLBACK_MODELS: 'openai/example-small, anthropic/example-fast, openai/example-small',
    AI_GATEWAY_PROVIDER_ORDER: 'vertex,google',
  })

  assert.equal(config.configured, true)
  assert.equal(config.primary, 'gemini-direct')
  assert.equal(config.model, DEFAULT_GEMINI_MODEL)
  assert.equal(config.providers.gateway.model, DEFAULT_GATEWAY_MODEL)
  assert.deepEqual(config.providers.gateway.fallbackModels, ['openai/example-small', 'anthropic/example-fast'])
  assert.deepEqual(config.providers.gateway.providerOrder, ['vertex', 'google'])
  assert.equal(config.providers.gateway.zeroDataRetention, true)
})

test('AI Gateway becomes primary when direct Gemini is not configured', () => {
  const config = getAiRuntimeConfig({
    AI_GATEWAY_API_KEY: 'gateway-only',
    AI_GATEWAY_MODEL: 'google/gemini-3.7-flash',
  })

  assert.equal(config.configured, true)
  assert.equal(config.primary, 'vercel-ai-gateway')
  assert.equal(config.api, 'ai-gateway-chat-completions')
  assert.equal(config.model, 'google/gemini-3.7-flash')
})

test('OIDC can configure the Gateway without exposing a browser key', () => {
  const config = getAiRuntimeConfig({ VERCEL_OIDC_TOKEN: 'oidc-token' })
  const publicConfig = publicAiRuntime(config)

  assert.equal(config.providers.gateway.configured, true)
  assert.equal(publicConfig.providers.gateway.configured, true)
  assert.equal(JSON.stringify(publicConfig).includes('oidc-token'), false)
})

test('CSV runtime options are trimmed and deduplicated', () => {
  assert.deepEqual(splitCsv(' vertex, google,vertex ,, anthropic '), ['vertex', 'google', 'anthropic'])
})

test('provider retry classification covers transient upstream failures', () => {
  assert.equal(isRetryableProviderStatus(429), true)
  assert.equal(isRetryableProviderStatus(503), true)
  assert.equal(isRetryableProviderStatus(408), true)
  assert.equal(isRetryableProviderStatus(400), false)
  assert.equal(isRetryableProviderStatus(401), false)
})

test('Gateway zero-data-retention can be explicitly disabled', () => {
  const config = getAiRuntimeConfig({ AI_GATEWAY_API_KEY: 'key', AI_GATEWAY_ZDR: 'false' })
  assert.equal(config.providers.gateway.zeroDataRetention, false)
})
