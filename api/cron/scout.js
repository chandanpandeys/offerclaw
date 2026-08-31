import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

import { discoverJobs } from '../_lib/jobDiscovery.js'
import { getJobRuntimeConfig } from '../_lib/jobSources.js'
import {
  SCOUT_SCHEDULE_INDEX_KEY,
  compareAndSetScoutRecord,
  getRedisStoreConfig,
  listDueScoutNamespaces,
  readScoutRecord,
  redisCommand,
} from '../_lib/redisStore.js'
import { createBackgroundDiscoveryRun } from '../../src/backgroundScout.js'
import {
  SCOUT_CADENCE,
  isScoutDue,
  markScoutGoalRun,
} from '../../src/scoutGoals.js'
import {
  nextScoutStateDueAt,
  normalizeScoutState,
} from '../../src/scoutState.js'

const MAX_NAMESPACES = 10
const MAX_GOALS_PER_DEVICE = 3
const NAMESPACE_RE = /^offerclaw:v1:device:[A-Za-z0-9_-]{20,120}$/

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8')
  const b = Buffer.from(String(right || ''), 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

function authorized(req, env) {
  const secret = String(env.CRON_SECRET || '').trim()
  if (secret.length < 16) return { configured: false, allowed: false }
  return {
    configured: true,
    allowed: safeEqual(req?.headers?.authorization, `Bearer ${secret}`),
  }
}

function keys(namespace) {
  return {
    stateKey: `${namespace}:scout:state`,
    revisionKey: `${namespace}:scout:revision`,
  }
}

function schedule(namespace, state) {
  const dueAt = nextScoutStateDueAt(state)
  return {
    member: namespace,
    dueScore: dueAt ? new Date(dueAt).getTime() : -1,
  }
}

async function rescore(storeConfig, namespace, state) {
  const next = schedule(namespace, state)
  if (next.dueScore >= 0) {
    await redisCommand(storeConfig, ['ZADD', SCOUT_SCHEDULE_INDEX_KEY, next.dueScore, namespace])
  } else {
    await redisCommand(storeConfig, ['ZREM', SCOUT_SCHEDULE_INDEX_KEY, namespace])
  }
}

async function removeIndexEntry(storeConfig, namespace) {
  await redisCommand(storeConfig, ['ZREM', SCOUT_SCHEDULE_INDEX_KEY, namespace])
}

async function processNamespace(namespace, env, storeConfig, now) {
  if (!NAMESPACE_RE.test(namespace)) {
    await removeIndexEntry(storeConfig, namespace)
    return { status: 'invalid_index_entry', discovered: 0, failures: 0 }
  }

  const recordKeys = keys(namespace)
  const record = await readScoutRecord(storeConfig, recordKeys.stateKey, recordKeys.revisionKey)
  if (!record.state) {
    await removeIndexEntry(storeConfig, namespace)
    return { status: 'missing_state', discovered: 0, failures: 0 }
  }

  const state = normalizeScoutState(record.state, now)
  const dueGoals = state.goals
    .filter(goal => goal.enabled && goal.cadence === SCOUT_CADENCE.DAILY && isScoutDue(goal, now))
    .slice(0, MAX_GOALS_PER_DEVICE)

  if (!dueGoals.length) {
    await rescore(storeConfig, namespace, state)
    return { status: 'not_due', discovered: 0, failures: 0 }
  }

  const attempts = await Promise.allSettled(dueGoals.map(async goal => {
    const discovery = await discoverJobs({
      env,
      query: goal.query,
      location: goal.location,
      freshnessHours: goal.freshnessHours,
    })
    return {
      goal,
      run: createBackgroundDiscoveryRun(goal, discovery.data, now),
    }
  }))

  const successfulRuns = []
  const updatedByGoal = new Map()
  let failures = 0

  attempts.forEach((attempt, index) => {
    if (attempt.status === 'fulfilled') {
      successfulRuns.push(attempt.value.run)
      updatedByGoal.set(attempt.value.goal.id, markScoutGoalRun(attempt.value.goal, attempt.value.run))
    } else {
      failures += 1
      const goal = dueGoals[index]
      if (goal) updatedByGoal.delete(goal.id)
    }
  })

  if (!successfulRuns.length) {
    return { status: 'providers_failed', discovered: 0, failures }
  }

  const nextState = normalizeScoutState({
    goals: state.goals.map(goal => updatedByGoal.get(goal.id) || goal),
    runs: [...successfulRuns, ...state.runs],
  }, now)

  const write = await compareAndSetScoutRecord(
    storeConfig,
    recordKeys.stateKey,
    recordKeys.revisionKey,
    record.revision,
    nextState,
    schedule(namespace, nextState),
  )

  if (!write.written) {
    return { status: 'revision_conflict', discovered: 0, failures }
  }

  return {
    status: 'processed',
    discovered: successfulRuns.reduce((sum, run) => sum + run.resultCount, 0),
    failures,
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length)
  let cursor = 0

  async function run() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      try {
        results[index] = await worker(items[index])
      } catch {
        results[index] = { status: 'internal_error', discovered: 0, failures: 1 }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()))
  return results
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const env = globalThis.process?.env || {}
  const auth = authorized(req, env)
  if (!auth.configured) return res.status(503).json({ error: 'cron_not_configured' })
  if (!auth.allowed) return res.status(401).json({ error: 'unauthorized' })

  const storeConfig = getRedisStoreConfig(env)
  if (!storeConfig.configured) return res.status(503).json({ error: 'scout_store_not_configured' })

  const jobs = getJobRuntimeConfig(env)
  if (!jobs.jsearchConfigured && jobs.publicAtsSources.length === 0) {
    return res.status(503).json({ error: 'jobs_not_configured' })
  }

  try {
    const now = new Date()
    const namespaces = await listDueScoutNamespaces(storeConfig, now.getTime(), MAX_NAMESPACES)
    const results = await mapWithConcurrency(namespaces, 2, namespace => processNamespace(namespace, env, storeConfig, now))

    const summary = results.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1
      acc.discovered += item.discovered || 0
      acc.providerFailures += item.failures || 0
      return acc
    }, { discovered: 0, providerFailures: 0 })

    return res.status(200).json({
      ok: true,
      checked: namespaces.length,
      ...summary,
    })
  } catch (error) {
    console.error('Background scout cron failed', { name: error?.name || 'Error' })
    return res.status(502).json({ error: 'background_scout_failed' })
  }
}
