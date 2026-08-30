import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateApplicationPackage, snapshotJobEvidence } from '../src/evals.js'

const validPackage = {
  resumeDelta: ['Emphasize the React project already present in the resume.'],
  coverLetter: 'I built the React interface described in my resume and would be glad to walk through the trade-offs.',
  dm: 'Hi — I’m interested in the frontend role. My background includes the React work in my resume. Is there one capability the team is prioritizing?',
  emailSubject: 'Frontend role — relevant React work',
  matchNarrative: 'The strongest supported overlap is React product work.',
  gaps: ['No verified accessibility metric is present in the resume.'],
  proofChecks: ['Keep all project and impact claims tied to the supplied resume.'],
}

const profile = {
  skills: 'React, JavaScript',
  experience: '2 years',
  achievement: 'Improved load time by 30%',
  resume: 'Frontend work. 2 years experience. Improved load time by 30%.',
}

test('a bounded package with supported claims passes deterministic evals', () => {
  const result = evaluateApplicationPackage(validPackage, profile)
  assert.equal(result.status, 'pass')
  assert.equal(result.score, 100)
  assert.deepEqual(result.unsupportedNumericClaims, [])
})

test('unsupported numeric claims are surfaced for human review', () => {
  const result = evaluateApplicationPackage({
    ...validPackage,
    coverLetter: 'I increased conversion by 85% and led 12 engineers.',
  }, profile)
  assert.equal(result.status, 'review')
  assert.deepEqual(result.unsupportedNumericClaims.sort(), ['12', '85%'])
  assert.ok(result.warnings.some(warning => /unsupported numeric claim/i.test(warning)))
})

test('dm and email subject limits are enforced', () => {
  const result = evaluateApplicationPackage({
    ...validPackage,
    dm: 'x'.repeat(301),
    emailSubject: 'y'.repeat(61),
  }, profile)
  const dm = result.checks.find(check => check.id === 'dm-length')
  const subject = result.checks.find(check => check.id === 'subject-length')
  assert.equal(dm.passed, false)
  assert.equal(subject.passed, false)
})

test('job evidence snapshots keep the source used for an application', () => {
  const snapshot = snapshotJobEvidence({
    id: 'job-1',
    title: 'AI Product Engineer',
    company: 'Example',
    location: 'Remote',
    source: 'company_site',
    dataSource: 'live',
    url: 'https://example.com/jobs/1',
    postedHoursAgo: 6,
    salary: '₹20L–₹30L',
    description: 'Build reliable AI product workflows.',
    skills: ['React', 'LLM'],
    matchScore: 88,
    ghostResult: { score: 92, warnings: [] },
  })
  assert.equal(snapshot.title, 'AI Product Engineer')
  assert.equal(snapshot.dataSource, 'live')
  assert.equal(snapshot.matchScore, 88)
  assert.equal(snapshot.listingConfidence, 92)
  assert.match(snapshot.description, /reliable AI product/)
})
