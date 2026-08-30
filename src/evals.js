const NUMBER_TOKEN = /\b\d+(?:\.\d+)?(?:%|x|\+|k|m|l|cr|years?|months?)?/gi

function text(value) {
  return String(value || '').trim()
}

function unique(values) {
  return [...new Set(values)]
}

function numericClaims(value) {
  return unique(text(value).match(NUMBER_TOKEN) || []).map(token => token.toLowerCase())
}

function packageText(pkg) {
  return [
    ...(Array.isArray(pkg?.resumeDelta) ? pkg.resumeDelta : []),
    pkg?.coverLetter,
    pkg?.dm,
    pkg?.emailSubject,
    pkg?.matchNarrative,
  ].filter(Boolean).join('\n')
}

function candidateEvidence(profile) {
  return [
    profile?.experience,
    profile?.skills,
    profile?.achievement,
    profile?.resume,
  ].filter(Boolean).join('\n').toLowerCase()
}

export function evaluateApplicationPackage(pkg, profile) {
  const checks = []
  const warnings = []

  const dmLength = text(pkg?.dm).length
  const subjectLength = text(pkg?.emailSubject).length
  const resumeDeltaCount = Array.isArray(pkg?.resumeDelta) ? pkg.resumeDelta.length : 0

  checks.push({
    id: 'dm-length',
    passed: dmLength > 0 && dmLength <= 300,
    detail: `${dmLength}/300 characters`,
  })
  checks.push({
    id: 'subject-length',
    passed: subjectLength > 0 && subjectLength <= 60,
    detail: `${subjectLength}/60 characters`,
  })
  checks.push({
    id: 'resume-delta-count',
    passed: resumeDeltaCount >= 1 && resumeDeltaCount <= 3,
    detail: `${resumeDeltaCount} suggestions`,
  })
  checks.push({
    id: 'evidence-gaps',
    passed: Array.isArray(pkg?.gaps) && pkg.gaps.length > 0,
    detail: Array.isArray(pkg?.gaps) ? `${pkg.gaps.length} gap(s) surfaced` : 'No gaps array',
  })
  checks.push({
    id: 'proof-checks',
    passed: Array.isArray(pkg?.proofChecks) && pkg.proofChecks.length > 0,
    detail: Array.isArray(pkg?.proofChecks) ? `${pkg.proofChecks.length} proof check(s)` : 'No proof checks',
  })

  const evidence = candidateEvidence(profile)
  const claims = numericClaims(packageText(pkg))
  const unsupportedNumericClaims = claims.filter(claim => !evidence.includes(claim))
  checks.push({
    id: 'numeric-claims',
    passed: unsupportedNumericClaims.length === 0,
    detail: unsupportedNumericClaims.length
      ? `Review unsupported numeric claim(s): ${unsupportedNumericClaims.join(', ')}`
      : 'No unsupported numeric claims detected',
  })

  for (const check of checks) {
    if (!check.passed) warnings.push(check.detail)
  }

  const score = Math.max(0, 100 - warnings.length * 15)
  return {
    status: warnings.length ? 'review' : 'pass',
    score,
    checks,
    warnings,
    unsupportedNumericClaims,
    evaluatedAt: new Date().toISOString(),
    evaluator: 'deterministic-v1',
  }
}

export function snapshotJobEvidence(job) {
  return {
    capturedAt: new Date().toISOString(),
    id: job?.id || null,
    title: text(job?.title).slice(0, 200),
    company: text(job?.company).slice(0, 200),
    location: text(job?.location).slice(0, 200),
    source: job?.source || 'unknown',
    dataSource: job?.dataSource || 'unknown',
    url: job?.url || null,
    postedHoursAgo: Number.isFinite(job?.postedHoursAgo) ? job.postedHoursAgo : null,
    salary: job?.salary || null,
    description: text(job?.description).slice(0, 12_000),
    skills: Array.isArray(job?.skills) ? job.skills.slice(0, 20) : [],
    matchScore: Number.isFinite(job?.matchScore) ? job.matchScore : null,
    listingConfidence: Number.isFinite(job?.ghostResult?.score) ? job.ghostResult.score : null,
    listingWarnings: Array.isArray(job?.ghostResult?.warnings) ? job.ghostResult.warnings.slice(0, 10) : [],
  }
}
