import test from 'node:test'
import assert from 'node:assert/strict'

import {
  deleteScoutCloudState,
  pullScoutCloudState,
  syncScoutCloudState,
} from '../src/scoutCloud.js'

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

test('read-only cloud pull performs one GET, merges state and reports only new background runs', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    return response(200, {
      revision: 7,
      state: {
        goals: [{
          id: 'remote-goal',
          name: 'Remote',
          query: 'ML Engineer',
          location: 'Remote',
          updatedAt: '2026-09-01T01:00:00Z',
        }],
        runs: [
          {
            id: 'bg-new',
            mode: 'background_discovery',
            goalId: 'remote-goal',
            goalName: 'Remote',
            ranAt: '2026-09-01T03:00:00Z',
            results: [{ title: 'ML Engineer', company: 'Example' }],
          },
          {
            id: 'interactive-remote',
            mode: 'interactive_ranked',
            goalId: 'remote-goal',
            goalName: 'Remote',
            ranAt: '2026-09-01T02:00:00Z',
          },
          {
            id: 'bg-existing',
            mode: 'background_discovery',
            goalId: 'remote-goal',
            goalName: 'Remote',
            ranAt: '2026-08-31T03:00:00Z',
          },
        ],
      },
    })
  }

  try {
    const result = await pullScoutCloudState({
      goals: [],
      runs: [{
        id: 'bg-existing',
        mode: 'background_discovery',
        goalId: 'remote-goal',
        goalName: 'Remote',
        ranAt: '2026-08-31T03:00:00Z',
      }],
    })

    assert.equal(result.revision, 7)
    assert.deepEqual(result.newBackgroundRuns.map(run => run.id), ['bg-new'])
    assert.deepEqual(result.merged.runs.map(run => run.id), ['bg-new', 'interactive-remote', 'bg-existing'])
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, '/api/scout/state')
    assert.equal(calls[0].options.method, undefined)
    assert.equal(calls[0].options.credentials, 'same-origin')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('cloud sync creates device session, merges remote state and saves with current revision', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  const queue = [
    response(201, { active: true }),
    response(200, {
      revision: 2,
      state: {
        goals: [{
          id: 'remote-goal',
          name: 'Remote',
          query: 'ML Engineer',
          location: 'Remote',
          updatedAt: '2026-08-31T00:00:00Z',
        }],
        runs: [],
      },
    }),
    response(200, { revision: 3, state: { goals: [], runs: [] } }),
  ]
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    return queue.shift()
  }

  try {
    const result = await syncScoutCloudState({
      goals: [{
        id: 'local-goal',
        name: 'Local',
        query: 'AI Engineer',
        location: 'India',
        updatedAt: '2026-09-01T00:00:00Z',
      }],
      runs: [],
    })

    assert.equal(result.revision, 3)
    assert.equal(result.conflictResolved, false)
    assert.equal(calls[0].url, '/api/identity/session')
    assert.equal(calls[0].options.method, 'POST')
    assert.equal(calls[1].url, '/api/scout/state')
    assert.equal(calls[2].options.method, 'PUT')

    const saved = JSON.parse(calls[2].options.body)
    assert.equal(saved.expectedRevision, 2)
    assert.deepEqual(saved.state.goals.map(goal => goal.id).sort(), ['local-goal', 'remote-goal'])
    assert.equal(calls[2].options.credentials, 'same-origin')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('cloud sync resolves one revision conflict by reloading and merging again', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  const queue = [
    response(200, { active: true }),
    response(200, { revision: 1, state: { goals: [], runs: [] } }),
    response(409, { error: 'scout_state_revision_conflict', currentRevision: 2 }),
    response(200, {
      revision: 2,
      state: {
        goals: [{
          id: 'remote-new',
          name: 'Remote new',
          query: 'Product Engineer',
          location: 'India',
          updatedAt: '2026-09-01T00:01:00Z',
        }],
        runs: [],
      },
    }),
    response(200, { revision: 3, state: { goals: [], runs: [] } }),
  ]
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    return queue.shift()
  }

  try {
    const result = await syncScoutCloudState({
      goals: [{
        id: 'local',
        name: 'Local',
        query: 'AI Engineer',
        location: 'India',
        updatedAt: '2026-09-01T00:00:00Z',
      }],
      runs: [],
    })

    assert.equal(result.conflictResolved, true)
    assert.equal(result.revision, 3)
    assert.equal(calls.length, 5)
    const retryBody = JSON.parse(calls[4].options.body)
    assert.equal(retryBody.expectedRevision, 2)
    assert.deepEqual(retryBody.state.goals.map(goal => goal.id).sort(), ['local', 'remote-new'])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('cloud API error codes are preserved for UI decisions', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => response(503, { error: 'scout_store_not_configured' })
  try {
    await assert.rejects(
      () => deleteScoutCloudState(),
      error => error?.code === 'scout_store_not_configured' && error?.status === 503,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
