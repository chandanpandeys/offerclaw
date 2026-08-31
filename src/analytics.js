export const FUNNEL_STAGES = ['applied', 'response', 'interview', 'offer']
export const TERMINAL_STAGES = ['rejected', 'archived']

function percent(numerator, denominator) {
  if (!denominator) return 0
  return Math.round((numerator / denominator) * 100)
}

function sourceKey(item) {
  return item?.sourceIntel?.label
    || item?.sourceIntel?.category
    || item?.evidence?.source
    || item?.dataSource
    || 'unknown'
}

function reachedStage(status, stage) {
  const current = FUNNEL_STAGES.indexOf(status)
  const target = FUNNEL_STAGES.indexOf(stage)
  return current >= 0 && target >= 0 && current >= target
}

export function summarizeTracker(tracker = []) {
  const items = Array.isArray(tracker) ? tracker : []
  const total = items.length
  const reachedResponses = items.filter(item => reachedStage(item.status, 'response')).length
  const reachedInterviews = items.filter(item => reachedStage(item.status, 'interview')).length
  const reachedOffers = items.filter(item => reachedStage(item.status, 'offer')).length
  const rejected = items.filter(item => item.status === 'rejected').length
  const archived = items.filter(item => item.status === 'archived').length
  const evalScores = items
    .map(item => Number(item?.packageEvaluation?.score))
    .filter(Number.isFinite)

  const sources = new Map()
  for (const item of items) {
    const key = sourceKey(item)
    const current = sources.get(key) || { source: key, applications: 0, responses: 0, interviews: 0, offers: 0 }
    current.applications += 1
    if (reachedStage(item.status, 'response')) current.responses += 1
    if (reachedStage(item.status, 'interview')) current.interviews += 1
    if (reachedStage(item.status, 'offer')) current.offers += 1
    sources.set(key, current)
  }

  const sourceBreakdown = [...sources.values()]
    .map(row => ({
      ...row,
      responseRate: percent(row.responses, row.applications),
      interviewRate: percent(row.interviews, row.applications),
      offerRate: percent(row.offers, row.applications),
    }))
    .sort((a, b) => b.applications - a.applications || b.responseRate - a.responseRate)

  return {
    total,
    responses: reachedResponses,
    interviews: reachedInterviews,
    offers: reachedOffers,
    rejected,
    archived,
    responseRate: percent(reachedResponses, total),
    interviewRate: percent(reachedInterviews, total),
    offerRate: percent(reachedOffers, total),
    averageEvalScore: evalScores.length
      ? Math.round(evalScores.reduce((sum, score) => sum + score, 0) / evalScores.length)
      : null,
    sourceBreakdown,
  }
}

export function nextFunnelStage(status) {
  const index = FUNNEL_STAGES.indexOf(status)
  if (index < 0 || index === FUNNEL_STAGES.length - 1) return null
  return FUNNEL_STAGES[index + 1]
}
