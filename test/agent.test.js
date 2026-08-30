import test from 'node:test'
import assert from 'node:assert/strict'
import { skillGhostDetector, skillHumanFinder, skillFollowUp } from '../src/agent.js'

test('demo listings are explicitly low-confidence demo data', () => {
  const result = skillGhostDetector({ dataSource: 'demo' })
  assert.equal(result.confidence, 'demo')
  assert.equal(result.score, 50)
  assert.match(result.warnings.join(' '), /Demo listing/)
})

test('human finder never fabricates an email address', () => {
  const result = skillHumanFinder({ company: 'Example Co', title: 'Frontend Engineer' })
  assert.equal(result.bestGuess, null)
  assert.deepEqual(result.emailPatterns, [])
  assert.match(result.linkedinUrl, /linkedin\.com\/search/)
  assert.match(result.outreachTip, /does not invent email addresses/i)
})

test('fresh employer-site listings score higher than stale board listings', () => {
  const fresh = skillGhostDetector({
    dataSource: 'live', postedHoursAgo: 4, salary: '₹20L–₹30L', source: 'company_site',
    url: 'https://example.com/jobs/1', description: 'x'.repeat(300),
  })
  const stale = skillGhostDetector({
    dataSource: 'live', postedHoursAgo: 240, salary: null, source: 'naukri',
    url: 'https://board.example/jobs/1', description: 'short',
  })
  assert.ok(fresh.score > stale.score)
})

test('follow-up copy stays concise and role-specific', () => {
  const result = skillFollowUp({ company: 'Example Co', jobTitle: 'AI Engineer' }, { name: 'Chandan Pandey' }, 3)
  assert.match(result.content, /AI Engineer/)
  assert.match(result.content, /Example Co/)
  assert.ok(result.content.length < 400)
})
