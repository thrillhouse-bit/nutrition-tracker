import { dedupeSessions, ouraWorkoutToSession, appleSignalToSession, garminWorkoutToSession } from './afp/plan.js'

// Observed workout minutes, not a proprietary strain score. Reuse AFP's
// canonical normalization/deduplication so mirrored sessions count once.
export async function trainingHistory(store, userId, from, to) {
  const sessions = []
  const sources = []
  for (const provider of ['oura', 'apple', 'garmin']) {
    const integration = await store.getIntegration(userId, provider)
    if (integration.enabled === false) continue
    let rows = []
    let status = 'no_workouts'
    try {
      rows = await store.listTrainingWorkouts(userId, provider, from, to)
      status = rows.length ? 'available' : 'no_workouts'
    } catch { status = 'read_error' }
    const sync = provider === 'oura' ? integration.settings?.workout_sync : null
    if (sync?.status === 'needs_authorization' || sync?.status === 'sync_error') status = sync.status
    const mapper = provider === 'oura' ? ouraWorkoutToSession : provider === 'apple' ? appleSignalToSession : garminWorkoutToSession
    for (const row of rows) sessions.push({ ...mapper(row), day: row.day })
    sources.push({ provider, status, lastAttemptedAt: sync?.attempted_at || null })
  }
  const retained = dedupeSessions(sessions)
  const byDay = new Map()
  for (const session of retained) {
    if (!(session.durationMin > 0)) continue
    const point = byDay.get(session.day) || { date: session.day, minutes: 0, sessions: 0, providers: [] }
    point.minutes += session.durationMin
    point.sessions++
    if (!point.providers.includes(session.provider)) point.providers.push(session.provider)
    byDay.set(session.day, point)
  }
  return { workoutLoad: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)), workoutHistoryStatus: { sources, measure: 'recorded_workout_minutes' } }
}
