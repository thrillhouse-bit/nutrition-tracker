// High-score persistence against any storage-shaped object ({getItem,
// setItem}) so tests inject a mock and the UI hands in localStorage. Corrupt
// or absent data degrades to an empty list, never a throw.
const KEY = 'control-tower-shift:high-scores'
const MAX_ENTRIES = 10

export function loadHighScores(store) {
  let raw
  try {
    raw = store.getItem(KEY)
  } catch {
    return []
  }
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((e) => e && typeof e.score === 'number' && Number.isFinite(e.score))
      .map((e) => ({ score: Math.floor(e.score), wave: e.wave ?? null, at: e.at ?? null }))
  } catch {
    return []
  }
}

// Returns the new list (sorted desc, trimmed to MAX_ENTRIES) and writes it.
export function saveHighScore(store, { score, wave = null, at = null }) {
  const list = [...loadHighScores(store), { score: Math.floor(score), wave, at }]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTRIES)
  try {
    store.setItem(KEY, JSON.stringify(list))
  } catch {
    // Storage full/unavailable: the returned list is still correct in-memory.
  }
  return list
}

export function isHighScore(store, score) {
  const list = loadHighScores(store)
  if (list.length < MAX_ENTRIES) return score > 0
  return score > list[list.length - 1].score
}

export { KEY as HIGH_SCORE_KEY }
