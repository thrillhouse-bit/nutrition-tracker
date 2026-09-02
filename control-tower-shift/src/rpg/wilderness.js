// Oathbearer wilderness domain layer.
//
// A pure, deterministic module describing the risk/reward loop of the mythic
// wilderness: named risk bands outside civic sanctuaries, escalating enemy
// pools, recoverable death drops with a protected-item allowance, and
// deterministic combat rewards. It is a domain layer only — no UI, no reducer
// wiring, no timers, no network access, and no randomness from Math.random.
// Codex integrates this into the RPG state machine later.
//
// The interaction grammar is inspired by a classic point-and-click skill RPG's
// readable risk/reward loop, but every name, region, enemy, and rule is
// original Greek-mythology content. No RuneScape names or systems are used.

import {
  levelForXp,
  normalizeInventory,
  normalizeSkills,
} from './progression.js'
import { ALL_ITEM_DEFS } from './crafting.js'
import { combatXpFromContributions } from './combatProgression.js'

// ---------------------------------------------------------------------------
// Risk bands, ordered from safest to most dangerous. The array index is the
// canonical escalation order used by tests and by the region definitions.
// ---------------------------------------------------------------------------
export const RISK_BANDS = Object.freeze(['low', 'moderate', 'high', 'severe', 'extreme'])

export const RISK_ORDER = Object.freeze(Object.fromEntries(RISK_BANDS.map((band, index) => [band, index])))

// Base protected-item allowance per risk band: the deeper the wilderness, the
// fewer carried items survive a defeat.
const BASE_PROTECTED_BY_RISK = Object.freeze({
  low: 4,
  moderate: 3,
  high: 2,
  severe: 1,
  extreme: 0,
})

// Maximum protected-item allowance, applied as a hard clamp.
export const MAX_PROTECTED_ITEMS = 4

// Fraction of carried currency lost on defeat, per risk band.
const CURRENCY_LOSS_BY_RISK = Object.freeze({
  low: 0.1,
  moderate: 0.25,
  high: 0.5,
  severe: 0.75,
  extreme: 1,
})

// ---------------------------------------------------------------------------
// Wilderness regions, escalating from the Olive Road through mythic Act I
// terrain. Each region is immutable and carries its own risk band, recommended
// combat level, resource tier, enemy pool, and escape boundary/cost.
// ---------------------------------------------------------------------------
const REGION_DEFS = [
  {
    id: 'olive-road',
    name: 'Olive Road',
    riskBand: 'low',
    recommendedCombatLevel: 3,
    resourceTier: 1,
    enemyPool: Object.freeze(['wild-boar', 'feral-goat']),
    escape: Object.freeze({ boundary: 'beacon-gate', cost: 0 }),
    encounterChance: 0.4,
  },
  {
    id: 'cephissus-shallows',
    name: 'Cephissus Shallows',
    riskBand: 'moderate',
    recommendedCombatLevel: 10,
    resourceTier: 2,
    enemyPool: Object.freeze(['marsh-viper', 'river-nymph']),
    escape: Object.freeze({ boundary: 'olive-road-ford', cost: 10 }),
    encounterChance: 0.5,
  },
  {
    id: 'asphodel-fringe',
    name: 'Asphodel Fringe',
    riskBand: 'high',
    recommendedCombatLevel: 20,
    resourceTier: 3,
    enemyPool: Object.freeze(['shade', 'asphodel-wraith']),
    escape: Object.freeze({ boundary: 'cephissus-bridge', cost: 25 }),
    encounterChance: 0.6,
  },
  {
    id: 'cursed-grove-of-hecate',
    name: 'Cursed Grove of Hecate',
    riskBand: 'severe',
    recommendedCombatLevel: 35,
    resourceTier: 4,
    enemyPool: Object.freeze(['hellhound', 'hecate-witch']),
    escape: Object.freeze({ boundary: 'asphodel-gate', cost: 50 }),
    encounterChance: 0.7,
  },
  {
    id: 'tartarus-rift',
    name: 'Tartarus Rift',
    riskBand: 'extreme',
    recommendedCombatLevel: 50,
    resourceTier: 5,
    enemyPool: Object.freeze(['titan-spawn', 'fury']),
    escape: Object.freeze({ boundary: 'hecate-gate', cost: 100 }),
    encounterChance: 0.8,
  },
]

export const REGIONS = Object.freeze(REGION_DEFS.map((region) => Object.freeze(region)))

export const REGIONS_BY_ID = Object.freeze(Object.fromEntries(REGIONS.map((region) => [region.id, region])))

// ---------------------------------------------------------------------------
// Authored enemies. Each carries a deterministic XP bundle (keyed by existing
// combat skills) plus fixed item/currency rewards. Loot references only items
// already defined in progression.js — no item definitions are edited here.
// ---------------------------------------------------------------------------
export const ENEMY_DEFS = Object.freeze({
  'wild-boar': {
    id: 'wild-boar',
    name: 'Wild Boar',
    xp: Object.freeze({ spearcraft: 20, might: 15, guard: 10, vitality: 8 }),
    loot: Object.freeze([{ itemId: 'thyme', quantity: 1 }]),
    currency: 5,
  },
  'feral-goat': {
    id: 'feral-goat',
    name: 'Feral Goat',
    xp: Object.freeze({ spearcraft: 18, might: 12, guard: 8, vitality: 6 }),
    loot: Object.freeze([{ itemId: 'olive-log', quantity: 1 }]),
    currency: 4,
  },
  'marsh-viper': {
    id: 'marsh-viper',
    name: 'Marsh Viper',
    xp: Object.freeze({ spearcraft: 30, might: 20, guard: 15, vitality: 12, marksmanship: 10 }),
    loot: Object.freeze([{ itemId: 'sage', quantity: 1 }]),
    currency: 8,
  },
  'river-nymph': {
    id: 'river-nymph',
    name: 'River Nymph',
    xp: Object.freeze({ spearcraft: 28, might: 18, guard: 14, vitality: 10, stormcalling: 12 }),
    loot: Object.freeze([{ itemId: 'red-mullet', quantity: 1 }]),
    currency: 12,
  },
  shade: {
    id: 'shade',
    name: 'Shade',
    xp: Object.freeze({ spearcraft: 45, might: 30, guard: 25, vitality: 20, stormcalling: 15 }),
    loot: Object.freeze([{ itemId: 'asphodel', quantity: 1 }]),
    currency: 15,
  },
  'asphodel-wraith': {
    id: 'asphodel-wraith',
    name: 'Asphodel Wraith',
    xp: Object.freeze({ spearcraft: 50, might: 35, guard: 28, vitality: 22, stormcalling: 18 }),
    loot: Object.freeze([{ itemId: 'silver-ore', quantity: 1 }]),
    currency: 20,
  },
  hellhound: {
    id: 'hellhound',
    name: 'Hellhound',
    xp: Object.freeze({ spearcraft: 70, might: 50, guard: 40, vitality: 35, marksmanship: 20 }),
    loot: Object.freeze([{ itemId: 'moly', quantity: 1 }]),
    currency: 30,
  },
  'hecate-witch': {
    id: 'hecate-witch',
    name: 'Hecate Witch',
    xp: Object.freeze({ spearcraft: 75, might: 45, guard: 42, vitality: 30, stormcalling: 40 }),
    loot: Object.freeze([{ itemId: 'celestial-bronze', quantity: 1 }]),
    currency: 40,
  },
  'titan-spawn': {
    id: 'titan-spawn',
    name: 'Titan Spawn',
    xp: Object.freeze({ spearcraft: 100, might: 80, guard: 65, vitality: 55, marksmanship: 30, stormcalling: 25 }),
    loot: Object.freeze([{ itemId: 'orichalcum', quantity: 1 }]),
    currency: 60,
  },
  fury: {
    id: 'fury',
    name: 'Fury',
    xp: Object.freeze({ spearcraft: 110, might: 70, guard: 60, vitality: 50, stormcalling: 60 }),
    loot: Object.freeze([{ itemId: 'ambrosia-bloom', quantity: 1 }]),
    currency: 80,
  },
})

export const ENEMY_DEFS_BY_ID = Object.freeze(Object.fromEntries(Object.values(ENEMY_DEFS).map((enemy) => [enemy.id, enemy])))

// ---------------------------------------------------------------------------
// Stable item value table used to decide which carried items are protected on
// defeat. Values are authored constants (not derived from live prices) so the
// ordering is deterministic and reviewable. Unknown items fall back to a
// deterministic tier-derived value; items absent from ITEM_DEFS are worth 0.
// ---------------------------------------------------------------------------
const ITEM_VALUE = Object.freeze({
  'oath-spear': 500,
  'traveler-tunic': 120,
  'barley-flatbread': 5,
  'copper-ore': 8,
  'tin-ore': 8,
  'iron-ore': 40,
  'silver-ore': 90,
  'celestial-bronze': 200,
  orichalcum: 400,
  'olive-log': 6,
  'cypress-log': 30,
  'cedar-log': 70,
  'laurel-branch': 120,
  'ambrosial-ash': 300,
  sardine: 4,
  'red-mullet': 20,
  tuna: 50,
  sturgeon: 100,
  'hippocamp-roe': 250,
  thyme: 5,
  sage: 20,
  asphodel: 60,
  moly: 120,
  'ambrosia-bloom': 300,
  drachma: 1,
})

export function itemValue(itemId) {
  if (ITEM_VALUE[itemId] != null) return ITEM_VALUE[itemId]
  const def = ALL_ITEM_DEFS[itemId]
  return def ? (def.tier || 1) * 10 : 0
}

// ---------------------------------------------------------------------------
// Combat level derived only from normalized combat-skill XP/levels already
// defined in progression.js. It averages the two defensive pillars (Guard and
// Vitality) with the strongest offensive combat skill, clamped to 1–99.
// ---------------------------------------------------------------------------
export function combatLevelForSkills(skills) {
  const normalized = normalizeSkills(skills)
  const level = (skillId) => levelForXp(normalized[skillId]?.xp || 0)
  const defence = level('guard')
  const vitality = level('vitality')
  const offensive = Math.max(
    level('spearcraft'),
    level('might'),
    level('marksmanship'),
    level('stormcalling'),
  )
  return Math.max(1, Math.min(99, Math.floor((defence + vitality + offensive) / 3)))
}

// ---------------------------------------------------------------------------
// Protected-item allowance. Base count comes from the risk band; being skulled
// (marked for a recent kill) reduces it by one, and an active Devotion blessing
// adds one. The result is clamped to [0, MAX_PROTECTED_ITEMS].
// ---------------------------------------------------------------------------
export function protectedItemCount(input = {}) {
  const { riskBand, skulled, devotionActive } = input || {}
  const base = BASE_PROTECTED_BY_RISK[riskBand] ?? 0
  let count = base
  if (skulled) count -= 1
  if (devotionActive) count += 1
  return Math.max(0, Math.min(MAX_PROTECTED_ITEMS, count))
}

// ---------------------------------------------------------------------------
// Plan a death drop. Never mutates the input inventory. The most valuable
// eligible carried items (up to the protected allowance) are kept; the rest
// are dropped. Currency loss scales with the risk band. Stackable items are
// treated as single slots: a protected stack is kept whole, an unprotected
// stack is dropped whole. Quest items and epithet fragments live outside the
// carried slots and are therefore never eligible to drop.
// ---------------------------------------------------------------------------
export function planDeathDrop(input = {}) {
  const { inventory, riskBand, skulled, devotionActive } = input || {}
  // A null/undefined inventory is treated as empty: no carried items to keep or
  // drop and no currency to lose. A present-but-malformed inventory is
  // normalized, which safely filters out invalid slots.
  const normalized = inventory ? normalizeInventory(inventory, ALL_ITEM_DEFS) : { slots: [], currency: 0 }
  const count = protectedItemCount({ riskBand, skulled, devotionActive })
  const slots = normalized.slots.map((entry) => ({ ...entry }))

  // Stable ordering: value descending, then itemId ascending as a tie-break.
  const ranked = [...slots].sort((a, b) => {
    const valueA = itemValue(a.itemId)
    const valueB = itemValue(b.itemId)
    if (valueB !== valueA) return valueB - valueA
    if (a.itemId < b.itemId) return -1
    if (a.itemId > b.itemId) return 1
    return 0
  })

  const kept = ranked.slice(0, count)
  const dropped = ranked.slice(count)
  const lossFraction = CURRENCY_LOSS_BY_RISK[riskBand] ?? 0
  const lostCurrency = Math.floor(normalized.currency * lossFraction)

  return { kept, dropped, lostCurrency }
}

// ---------------------------------------------------------------------------
// Deterministic combat rewards. XP is derived purely from the damage the
// player actually dealt and took this fight (see combatProgression.js):
// spear damage trains spearcraft and might, ranged damage trains
// marksmanship, patron-power damage trains stormcalling, guarded damage
// actually taken trains guard, and total damage actually taken trains
// vitality. Each enemy's authored xp bundle is a per-skill cap, not a bundle
// paid out regardless of contribution — a skill with zero contribution earns
// zero XP from this kill, and a skill the enemy does not author at all can
// never be trained by it. Item/currency rewards remain fixed per enemy.
// Unknown enemies and missing kill credit fail safely by returning null.
// ---------------------------------------------------------------------------
function normalizeDamageByStyle(damageByStyle) {
  const result = {}
  if (!damageByStyle || typeof damageByStyle !== 'object') return result
  for (const [skillId, damage] of Object.entries(damageByStyle)) {
    if (Number.isFinite(damage) && damage > 0) result[skillId] = damage
  }
  return result
}

export function wildernessCombatRewards({ enemyId, damageByStyle, damageTaken, guardedDamageTaken, killCredit } = {}) {
  const enemy = ENEMY_DEFS_BY_ID[enemyId]
  if (!enemy || !killCredit) return null

  const contributions = {
    damageByStyle: normalizeDamageByStyle(damageByStyle),
    damageTaken,
    guardedDamageTaken,
  }

  const xp = {}
  for (const { skillId, amount } of combatXpFromContributions(contributions)) {
    const cap = enemy.xp[skillId]
    if (!Number.isFinite(cap) || cap <= 0) continue
    const awarded = Math.floor(Math.min(amount, cap))
    if (awarded > 0) xp[skillId] = awarded
  }

  return {
    xp,
    items: enemy.loot.map((entry) => ({ ...entry })),
    currency: enemy.currency,
  }
}

// ---------------------------------------------------------------------------
// Small local deterministic PRNG (mulberry32) seeded from a stable hash of the
// region id, seed, and step. Identical inputs always produce identical output.
// ---------------------------------------------------------------------------
function hashSeed(seed, step) {
  let h = (Number(seed) >>> 0) ^ 0x9e3779b9
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  h = Math.imul(h ^ (step >>> 0), 0x85ebca6b)
  h ^= h >>> 13
  return h >>> 0
}

function mulberry32(seedInt) {
  let a = seedInt >>> 0
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Roll a wilderness encounter for a region. Returns an authored enemy id from
// the region's pool, or null when no encounter occurs. Unknown regions and
// empty pools fail safely by returning null.
// ---------------------------------------------------------------------------
export function rollWildernessEncounter({ regionId, seed, step } = {}) {
  const region = REGIONS_BY_ID[regionId]
  if (!region || !Array.isArray(region.enemyPool) || region.enemyPool.length === 0) return null

  const safeSeed = Number(seed) || 0
  const safeStep = Math.max(0, Math.floor(Number(step) || 0))
  const rng = mulberry32(hashSeed(safeSeed, safeStep))

  const noEncounterChance = 1 - region.encounterChance
  if (rng() < noEncounterChance) return null

  const index = Math.floor(rng() * region.enemyPool.length)
  return region.enemyPool[index]
}
