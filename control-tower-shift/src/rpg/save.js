// RPG save contract — schemaVersion-keyed validation and migration, pure.
//
// Storage key: `control-tower-shift:rpg-save:v1` (never the arena high-score
// key). Corrupt JSON, future schema versions, and unknown IDs never throw and
// never crash rendering. Unknown IDs fall back to the last valid shrine or the
// documented spawn — never a blank world.

import { TIER1_PATRON_IDS } from './content.js'
import {
  REGISTERED_QUESTS,
  rpgMapById as mapById,
  rpgQuestDefById as questDefById,
  rpgSpawnById as spawnById,
  normalizedProgressFlags,
} from './registry.js'
import {
  createInitialState, SCHEMA_VERSION,
  START_MAP, START_SPAWN,
} from './state.js'
import { normalizeInventory, normalizeSkills } from './progression.js'
import { ALL_ITEM_DEFS, RECIPES } from './crafting.js'
import { craftingAccessDecision } from './systemAccess.js'
import { REGIONS_BY_ID as WILDERNESS_REGIONS_BY_ID } from './wilderness.js'

export const RPG_SAVE_KEY = 'control-tower-shift:rpg-save:v1'

const RECIPE_IDS = new Set(RECIPES.map((recipe) => recipe.id))
const STATION_IDS = new Set(RECIPES.map((recipe) => recipe.stationId))

// Pure migration pipeline keyed by schemaVersion. Returns the migrated state
// or null when the version is not migratable (e.g. a future version).
export function migrateSave(raw) {
  if (!raw || typeof raw !== 'object') return null
  const v = raw.schemaVersion
  if (v === undefined || v === null || typeof v !== 'number') return null
  if (v > SCHEMA_VERSION) return null // future schema — refuse to downgrade
  if (v === SCHEMA_VERSION) return raw
  // Future versions migrate here; for now v1 is the only version.
  return null
}

// Validate and normalize a raw state into a safe, renderable v1 state. Falls
// back to the last valid shrine (a map the player has visited) or the
// documented spawn for any unknown IDs. Never throws.
export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return null
  const migrated = migrateSave(raw)
  if (!migrated) return null

  // Start from a fresh baseline so every field is present and typed.
  const base = createInitialState()

  const safeGod = (god) => (god && TIER1_PATRON_IDS.includes(god) ? god : base.protagonist.activePatronId)

  // World: pick the map from the save if it is known, else a visited shrine
  // map, else the documented spawn.
  let mapId = START_MAP
  const visitedShrines = Array.isArray(migrated.progression?.shrineIds)
    ? migrated.progression.shrineIds.filter((id) => mapById(id))
    : []
  if (mapById(migrated.world?.mapId)) mapId = migrated.world.mapId
  else if (visitedShrines.length > 0) mapId = visitedShrines[visitedShrines.length - 1]
  const map = mapById(mapId)
  const requestedSpawnId = typeof migrated.world?.spawnId === 'string'
    ? migrated.world.spawnId
    : map.spawn?.id
  const requestedSpawnIsKnown = Boolean(spawnById(mapId, requestedSpawnId))
  const spawn = spawnById(mapId, requestedSpawnId) || map.spawn
  const pos = (p) => {
    if (!requestedSpawnIsKnown) return { x: spawn.x, y: spawn.y }
    const x = typeof p?.x === 'number' && Number.isFinite(p.x) ? p.x : spawn.x
    const y = typeof p?.y === 'number' && Number.isFinite(p.y) ? p.y : spawn.y
    return { x, y }
  }

  // Quests: keep only known quest defs; normalize each progress shape.
  const quests = {}
  for (const qid of Object.keys(REGISTERED_QUESTS)) {
    const saved = migrated.quests && migrated.quests[qid]
    const def = questDefById(qid)
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) continue
    const maxIdx = def.objectives.length
    const idx = Math.max(0, Math.min(Number.isFinite(saved.objectiveIndex) ? saved.objectiveIndex : 0, maxIdx))
    const states = ['locked', 'available', 'active', 'ready-to-turn-in', 'completed', 'failed']
    quests[qid] = {
      state: states.includes(saved.state) ? saved.state : (def.kind === 'main' ? 'active' : 'available'),
      objectiveIndex: idx,
      objectiveCounts: saved.objectiveCounts && typeof saved.objectiveCounts === 'object' ? saved.objectiveCounts : {},
      ...(typeof saved.acceptedAtTick === 'number' ? { acceptedAtTick: saved.acceptedAtTick } : {}),
      ...(typeof saved.completedAtTick === 'number' ? { completedAtTick: saved.completedAtTick } : {}),
    }
  }

  // A few early/partial v1 writers persisted `mainQuestId` before writing the
  // corresponding progress entry. Keep the selected registered main quest,
  // but always restore the minimum progress record the reducer requires. The
  // original Act I quest keeps its fresh-save objective advance; later main
  // quests restart safely at their first objective.
  const mainQuestId = questDefById(migrated.mainQuestId) ? migrated.mainQuestId : base.mainQuestId
  if (!quests[mainQuestId]) {
    const def = questDefById(mainQuestId)
    quests[mainQuestId] = base.quests[mainQuestId]
      ? { ...base.quests[mainQuestId], objectiveCounts: { ...base.quests[mainQuestId].objectiveCounts } }
      : {
          state: def?.kind === 'main' ? 'active' : 'available',
          objectiveIndex: 0,
          objectiveCounts: {},
        }
  }

  let flags = migrated.flags && typeof migrated.flags === 'object'
    ? Object.fromEntries(Object.entries(migrated.flags).filter(([, v]) => typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string'))
    : {}

  const inv = migrated.inventory || {}
  const arr = (x) => (Array.isArray(x) ? x.filter((s) => typeof s === 'string') : [])

  // V1 persists only reconstructible encounter/dialogue boundaries. If an old
  // or interrupted build wrote an ephemeral status, resume into the world
  // instead of loading without the corresponding local UI/session object.
  const status = migrated.status === 'ending' ? 'ending' : 'playing'

  const normalized = {
    schemaVersion: SCHEMA_VERSION,
    status,
    protagonist: {
      presentation: typeof migrated.protagonist?.presentation === 'string' ? migrated.protagonist.presentation : base.protagonist.presentation,
      activePatronId: safeGod(migrated.protagonist?.activePatronId),
      unlockedPatronIds: Array.isArray(migrated.protagonist?.unlockedPatronIds)
        ? migrated.protagonist.unlockedPatronIds.filter((g) => TIER1_PATRON_IDS.includes(g))
        : [],
    },
    world: {
      regionId: map.region,
      mapId,
      spawnId: spawn.id,
      position: pos(migrated.world?.position),
      facing: typeof migrated.world?.facing === 'number' ? migrated.world.facing : spawn.facing || 0,
    },
    mainQuestId,
    quests,
    flags,
    inventory: normalizeInventory({
      ...inv,
      epithetFragments: arr(inv.epithetFragments),
      questItems: arr(inv.questItems),
      currency: typeof inv.currency === 'number' && Number.isFinite(inv.currency) ? Math.max(0, Math.floor(inv.currency)) : 0,
    }, ALL_ITEM_DEFS),
    progression: {
      rank: typeof migrated.progression?.rank === 'number' ? migrated.progression.rank : 0,
      powerUnlocks: arr(migrated.progression?.powerUnlocks),
      shrineIds: visitedShrines,
      skills: normalizeSkills(migrated.progression?.skills),
      totalXp: Number.isFinite(migrated.progression?.totalXp) ? Math.max(0, Math.floor(migrated.progression.totalXp)) : 0,
    },
    wilderness: normalizeWilderness(migrated.wilderness, base.wilderness),
    crafting: normalizeCrafting(migrated.crafting, base.crafting, mapId),
    combatSnapshot: null, // v1 persists combat only at boundaries, never mid-frame
    playtimeTicks: typeof migrated.playtimeTicks === 'number' ? migrated.playtimeTicks : 0,
    savedAt: typeof migrated.savedAt === 'string' ? migrated.savedAt : new Date().toISOString(),
  }
  normalized.flags = normalizedProgressFlags(normalized)
  return normalized
}

function normalizeWilderness(raw, baseline) {
  const region = WILDERNESS_REGIONS_BY_ID[raw?.regionId]
  if (!region) {
    return {
      ...baseline,
      regionId: null,
      riskBand: baseline.riskBand,
      step: 0,
      skulled: false,
      devotionActive: false,
      pendingEnemyId: null,
      activeEncounterKey: null,
      lastDeathDrop: raw?.lastDeathDrop && typeof raw.lastDeathDrop === 'object' ? raw.lastDeathDrop : null,
    }
  }
  const pendingEnemyId = typeof raw?.pendingEnemyId === 'string' && region.enemyPool.includes(raw.pendingEnemyId)
    ? raw.pendingEnemyId
    : null
  return {
    ...baseline,
    regionId: region.id,
    riskBand: region.riskBand,
    step: Number.isFinite(raw?.step) ? Math.max(0, Math.floor(raw.step)) : 0,
    skulled: raw?.skulled === true,
    devotionActive: raw?.devotionActive === true,
    pendingEnemyId,
    // Mid-frame combat is deliberately not persisted. Preserve the pending
    // authored enemy so the player can restart the boundary, but never retain
    // a stale active encounter identity after reload.
    activeEncounterKey: null,
    lastDeathDrop: raw?.lastDeathDrop && typeof raw.lastDeathDrop === 'object' ? raw.lastDeathDrop : null,
  }
}

function normalizeCrafting(raw, baseline, mapId) {
  const knownStationId = STATION_IDS.has(raw?.stationId) ? raw.stationId : null
  const stationId = knownStationId && craftingAccessDecision(mapId, knownStationId)?.available
    ? knownStationId
    : null
  const lastResult = raw?.lastResult && typeof raw.lastResult === 'object' && !hasUnknownStructuredIds(raw.lastResult)
    ? raw.lastResult
    : null
  return {
    ...baseline,
    stationId,
    lastResult,
  }
}

export function serializeRPG(state) {
  try {
    return JSON.stringify(state)
  } catch {
    return null
  }
}

export function saveRPG(store, state) {
  if (!store || typeof store.setItem !== 'function') return false
  // savedAt is stamped at the persistence boundary (never inside the reducer).
  const stamped = { ...state, savedAt: new Date().toISOString() }
  const raw = serializeRPG(stamped)
  if (raw == null) return false
  try {
    store.setItem(RPG_SAVE_KEY, raw)
    return true
  } catch {
    return false
  }
}

// Load + validate. Returns { save, error } where error is one of
// 'none' | 'corrupt' | 'future' | 'unknown'. 'future' means a newer schema
// version (refuse to load). 'unknown' means a valid v1 save whose IDs were
// unknown and normalized to safe fallbacks. 'corrupt' means the data could not
// be parsed into a safe state at all.
export function loadRPG(store) {
  if (!store || typeof store.getItem !== 'function') return { save: null, error: 'corrupt' }
  let raw
  try {
    raw = store.getItem(RPG_SAVE_KEY)
  } catch {
    return { save: null, error: 'corrupt' }
  }
  if (!raw) return { save: null, error: 'none' }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { save: null, error: 'corrupt' }
  }
  if (!parsed || typeof parsed !== 'object') return { save: null, error: 'corrupt' }
  if (typeof parsed.schemaVersion !== 'number' || parsed.schemaVersion > SCHEMA_VERSION) {
    return { save: null, error: 'future' }
  }
  const save = normalizeState(parsed)
  if (!save) return { save: null, error: 'corrupt' }
  const unknown = hasUnknownIds(parsed)
  return { save, error: unknown ? 'unknown' : 'none' }
}

function hasUnknownIds(raw) {
  if (raw.world && raw.world.mapId && !mapById(raw.world.mapId)) return true
  if (raw.world && raw.world.mapId && raw.world.spawnId) {
    const map = mapById(raw.world.mapId)
    const requested = String(raw.world.spawnId)
    if (!spawnById(raw.world.mapId, requested)) return true
  }
  if (raw.protagonist && raw.protagonist.activePatronId && !TIER1_PATRON_IDS.includes(raw.protagonist.activePatronId)) return true
  if (raw.quests && typeof raw.quests === 'object') {
    for (const qid of Object.keys(raw.quests)) if (!questDefById(qid)) return true
  }
  if (raw.inventory && typeof raw.inventory === 'object') {
    if (slotListHasUnknownItems(raw.inventory.slots)) return true
    if (slotListHasUnknownItems(raw.inventory.bank?.slots)) return true
    if (raw.inventory.equipment && typeof raw.inventory.equipment === 'object') {
      for (const itemId of Object.values(raw.inventory.equipment)) {
        if (itemId != null && (typeof itemId !== 'string' || !ALL_ITEM_DEFS[itemId])) return true
      }
    }
  }
  if (raw.wilderness && typeof raw.wilderness === 'object') {
    const regionId = raw.wilderness.regionId
    const region = typeof regionId === 'string' ? WILDERNESS_REGIONS_BY_ID[regionId] : null
    if (regionId != null && !region) return true
    const pendingEnemyId = raw.wilderness.pendingEnemyId
    if (pendingEnemyId != null && (
      typeof pendingEnemyId !== 'string'
      || !region
      || !region.enemyPool.includes(pendingEnemyId)
    )) return true
  }
  if (raw.crafting && typeof raw.crafting === 'object') {
    if (raw.crafting.stationId != null && !STATION_IDS.has(raw.crafting.stationId)) return true
    if (hasUnknownStructuredIds(raw.crafting)) return true
  }
  if (raw.flags && typeof raw.flags === 'object') {
    // Encounter/quest ids referenced in flags that we know about should be
    // validated; unknown non-ID flags are simply ignored, not errors.
  }
  return false
}

function slotListHasUnknownItems(slots) {
  if (!Array.isArray(slots)) return false
  return slots.some((entry) => entry && (
    typeof entry.itemId !== 'string' || !ALL_ITEM_DEFS[entry.itemId]
  ))
}

// Persisted crafting outcomes are structured objects. Validate their explicit
// domain-ID fields recursively so normalization may safely strip a stale
// result while loadRPG still reports the raw save's unknown-ID warning.
function hasUnknownStructuredIds(value) {
  if (Array.isArray(value)) return value.some(hasUnknownStructuredIds)
  if (!value || typeof value !== 'object') return false
  if (value.reason === 'wrong_station' && value.detail && typeof value.detail === 'object') {
    for (const stationId of [value.detail.required, value.detail.actual]) {
      if (stationId != null && (typeof stationId !== 'string' || !STATION_IDS.has(stationId))) return true
    }
  }
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'itemId' && (typeof nested !== 'string' || !ALL_ITEM_DEFS[nested])) return true
    if (key === 'recipeId' && (typeof nested !== 'string' || !RECIPE_IDS.has(nested))) return true
    if (key === 'stationId' && (nested != null && (typeof nested !== 'string' || !STATION_IDS.has(nested)))) return true
    if (hasUnknownStructuredIds(nested)) return true
  }
  return false
}

// Whether the store currently holds a valid v1 save (used to enable Continue).
export function hasSave(store) {
  return loadRPG(store).save != null
}

export function clearSave(store) {
  if (store && typeof store.removeItem === 'function') {
    try { store.removeItem(RPG_SAVE_KEY) } catch { /* ignore */ }
  }
}
