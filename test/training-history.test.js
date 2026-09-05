import { describe, it, expect } from 'vitest'
import { trainingHistory } from '../server/trainingHistory.js'
import { JsonStore } from '../server/db.js'

describe('actual workout history across wearables', () => {
  it('includes Oura history, deduplicates mirrored Apple sessions, retains distinct sessions and isolates accounts', async () => {
    const store = new JsonStore('unused')
    store.data = {
      oura_accounts: [{ id: 10, user_id: 1 }, { id: 20, user_id: 2 }],
      oura_workouts: [
        { account_id: 10, day: '2026-09-05', activity: 'running', start_datetime: '2026-09-05T07:00:00Z', end_datetime: '2026-09-05T07:30:00Z' },
        { account_id: 20, day: '2026-09-05', activity: 'running', start_datetime: '2026-09-05T01:00:00Z', end_datetime: '2026-09-05T02:30:00Z' },
      ],
      wearable_signals: [
        { user_id: 1, provider: 'apple', day: '2026-09-05', metric: 'workout', recorded_at: '2026-09-05T07:00:00Z', value: { kind: 'run', duration_min: 30 } },
        { user_id: 1, provider: 'apple', day: '2026-09-05', metric: 'workout', recorded_at: '2026-09-05T12:00:00Z', value: { kind: 'strength', duration_min: 20 } },
        { user_id: 1, provider: 'apple', day: '2026-09-05', metric: 'steps', value: 9000 },
      ],
    }
    const result = await trainingHistory(store, 1, '2026-09-01', '2026-09-05')
    expect(result.workoutLoad).toEqual([{ date: '2026-09-05', minutes: 50, sessions: 2, providers: ['oura', 'apple'] }])
    expect((await trainingHistory(store, 1, '2026-09-06', '2026-09-07')).workoutLoad).toEqual([])
  })

  it('retains available history alongside a truthful authorization or read failure', async () => {
    const store = {
      getIntegration: async (_, provider) => ({ settings: provider === 'oura' ? { workout_sync: { status: 'needs_authorization' } } : {} }),
      listTrainingWorkouts: async (_, provider) => { if (provider === 'apple') throw Error('db unavailable'); return [] },
    }
    const result = await trainingHistory(store, 1, '2026-09-01', '2026-09-05')
    expect(result.workoutLoad).toEqual([])
    expect(result.workoutHistoryStatus.sources).toContainEqual({ provider: 'oura', status: 'needs_authorization', lastAttemptedAt: null })
    expect(result.workoutHistoryStatus.sources).toContainEqual({ provider: 'apple', status: 'read_error', lastAttemptedAt: null })
  })
})
