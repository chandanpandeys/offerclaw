import assert from 'node:assert/strict'
import test from 'node:test'
import { nextFunnelStage, summarizeTracker } from '../src/analytics.js'

test('conversion funnel counts reached stages instead of only exact status', () => {
  const summary = summarizeTracker([
    { status: 'applied', sourceIntel: { label: 'Employer A' }, packageEvaluation: { score: 90 } },
    { status: 'response', sourceIntel: { label: 'LinkedIn' }, packageEvaluation: { score: 80 } },
    { status: 'interview', sourceIntel: { label: 'LinkedIn' }, packageEvaluation: { score: 100 } },
    { status: 'offer', sourceIntel: { label: 'Employer A' }, packageEvaluation: { score: 70 } },
    { status: 'rejected', sourceIntel: { label: 'Employer A' } },
  ])

  assert.equal(summary.total, 5)
  assert.equal(summary.responses, 3)
  assert.equal(summary.interviews, 2)
  assert.equal(summary.offers, 1)
  assert.equal(summary.responseRate, 60)
  assert.equal(summary.interviewRate, 40)
  assert.equal(summary.offerRate, 20)
  assert.equal(summary.averageEvalScore, 85)
  assert.equal(summary.rejected, 1)
})

test('source breakdown keeps conversion rates per route', () => {
  const summary = summarizeTracker([
    { status: 'response', sourceIntel: { label: 'LinkedIn' } },
    { status: 'applied', sourceIntel: { label: 'LinkedIn' } },
    { status: 'interview', sourceIntel: { label: 'Greenhouse' } },
  ])

  const linkedin = summary.sourceBreakdown.find(row => row.source === 'LinkedIn')
  const greenhouse = summary.sourceBreakdown.find(row => row.source === 'Greenhouse')

  assert.equal(linkedin.applications, 2)
  assert.equal(linkedin.responseRate, 50)
  assert.equal(greenhouse.responseRate, 100)
  assert.equal(greenhouse.interviewRate, 100)
})

test('legacy evidence source is still usable for analytics', () => {
  const summary = summarizeTracker([{ status: 'applied', evidence: { source: 'company_site' } }])
  assert.equal(summary.sourceBreakdown[0].source, 'company_site')
})

test('next funnel stage follows applied to offer progression', () => {
  assert.equal(nextFunnelStage('applied'), 'response')
  assert.equal(nextFunnelStage('response'), 'interview')
  assert.equal(nextFunnelStage('interview'), 'offer')
  assert.equal(nextFunnelStage('offer'), null)
  assert.equal(nextFunnelStage('rejected'), null)
})
