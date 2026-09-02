// RPG combat adapter — a thin, isolated shell that runs an authored encounter
// by driving the EXISTING deterministic arena reducer (game/state.js), the
// seeded spawner (spawner.js), and the logic loop (loop.js). It never duplicates
// power definitions (loadouts come from `powersForGod` via `createInitialState`)
// and never exposes waves to RPG state or UI.
//
// Isolation rule: RPG story state (rpg/state.js) and arena combat state are
// separate objects. The adapter owns the arena session and reports outcome back
// to the RPG reducer through exactly-once events (COMBAT_WON / COMBAT_FAILED).
// Replaying or re-emitting a settled outcome is impossible — a session settles
// once and never re-emits.

import { createInitialState, setInput, setFiring, setAim, deityAttack, castPowerOn, spawnThreat, advanceTick } from '../game/state.js'
import { createSpawner, stepSpawner, FIELD_RADIUS } from '../spawner.js'
import { stepFrame } from '../loop.js'
import { levelById, encounterSize, CAMPAIGN } from '../game/campaign.js'
import { resolveMonsterType } from '../game/characters.js'
import { rpgEncounterById as encounterById } from './registry.js'
import { TIER1_PATRON_IDS } from './content.js'
import { seedForEncounter } from './state.js'
import { ENEMY_DEFS_BY_ID } from './wilderness.js'
import { deriveCombatModifiers } from './equipment.js'
import { recordCombatContributions } from './combatProgression.js'
import {
  applyCombatConsumableEffect,
  combatConsumableDecision,
  consumeCombatInventoryItem,
  deriveConsumableModifiers,
  pendingConsumableLoadout,
} from './itemEffects.js'

// Terminal outcome of a combat session.
export const OUTCOME_NONE = 'none'
export const OUTCOME_WON = 'won'
export const OUTCOME_FAILED = 'failed'

// Apply the persisted equipment snapshot once at encounter construction.
// RPG gear affects deliberate spear attacks and contact resilience without
// rewriting patron powers or the shared arena engine.
export function createEquippedArena(rpgState, patron, levelIndex = 0) {
  const arena = createInitialState({ god: patron, levelIndex })
  const equipmentModifiers = deriveCombatModifiers(rpgState?.inventory?.equipment)
  const consumableLoadout = rpgState?.combatSnapshot?.consumableLoadout
    || pendingConsumableLoadout(rpgState)
  const consumableModifiers = deriveConsumableModifiers(consumableLoadout)
  const maxHealth = arena.deity.maxHealth
    + equipmentModifiers.maxHealthBonus
    + consumableModifiers.maxHealthBonus
  return {
    ...arena,
    config: {
      ...arena.config,
      autoAttackDamage: arena.config.autoAttackDamage
        * equipmentModifiers.attackDamageMultiplier
        * consumableModifiers.attackDamageMultiplier,
      autoAttackRange: arena.config.autoAttackRange + equipmentModifiers.accuracyBonus,
      threatDamage: arena.config.threatDamage
        * equipmentModifiers.incomingDamageMultiplier
        * consumableModifiers.incomingDamageMultiplier,
    },
    deity: { ...arena.deity, health: maxHealth, maxHealth },
    equipmentModifiers: Object.freeze({ ...equipmentModifiers }),
    consumableLoadout: Object.freeze({ ...consumableLoadout }),
    consumableModifiers,
  }
}

// Pure encounter-domain action. Inventory settlement remains reducer-owned,
// while this validates health/session/duplicate boundaries and applies only the
// deterministic arena benefit accepted for the same use id.
export function useCombatConsumable(session, itemId, useId) {
  return applyCombatConsumableEffect(session, itemId, useId)
}

export function combatConsumableUseDecision(session, itemId, useId) {
  return combatConsumableDecision(session, itemId, useId)
}

export function resolveCombatConsumableUse(rpgState, session, itemId, useId, itemDefs) {
  if (!session?.encounterId || session.encounterId !== rpgState?.combatSnapshot?.encounterId) {
    return Object.freeze({ allowed: false, reason: 'That encounter is no longer active.', state: rpgState, session })
  }
  const decision = combatConsumableDecision(session, itemId, useId)
  if (!decision.allowed) return Object.freeze({ allowed: false, reason: decision.reason, state: rpgState, session })
  const nextState = consumeCombatInventoryItem(rpgState, itemId, useId, itemDefs, session.encounterId)
  if (nextState === rpgState) {
    return Object.freeze({ allowed: false, reason: 'That item is not in the backpack.', state: rpgState, session })
  }
  return Object.freeze({
    allowed: true,
    reason: '',
    healed: decision.healed,
    state: nextState,
    session: applyCombatConsumableEffect(session, itemId, useId),
  })
}

export function campaignIndexForLevelId(levelId) {
  return CAMPAIGN.findIndex((l) => l.id === levelId)
}

const BOSS_OVERLAY_MONSTERS = Object.freeze({
  'hydra-heads': 'hydra',
  'sphinx-dies': 'sphinx',
  'suppressible-seals': 'sphinx',
})

// The shared arena does not have destructible sub-target entities, so authored
// targetable boss parts are translated into deterministic, individually
// defeatable ward stages before the core. This preserves the authored count,
// ordering, and readable boss escalation instead of silently reducing every
// boss to its one base monster.
function authoredCombatOrder(enc, level) {
  if (level || !Array.isArray(enc.order) || enc.order.length === 0) return null
  const base = [...enc.order]
  const targetable = enc.boss?.overlays?.find((overlay) => overlay?.targetable)
  const monsterType = targetable && BOSS_OVERLAY_MONSTERS[targetable.kind]
  if (!monsterType) return base
  const defaultCount = targetable.kind === 'hydra-heads' ? 2 : 1
  const count = Math.max(1, Math.floor(Number(targetable.count) || defaultCount))
  return [...Array.from({ length: count }, () => monsterType), ...base]
}

// Start an authored encounter with the player's chosen patron. Produces an
// isolated arena session. `seed` is deterministic per encounter (so a retry
// replays the identical fight); `startLevelIndex` anchors victory detection.
export function startEncounter(rpgState, encounterId) {
  const enc = encounterById(encounterId)
  if (!enc) return null
  const patron = rpgState?.protagonist?.activePatronId
  if (!patron) return null
  const level = levelById(enc.campaignLevelId)
  const authoredOrder = authoredCombatOrder(enc, level)
  if (!level && !authoredOrder) return null
  const levelIndex = level ? campaignIndexForLevelId(enc.campaignLevelId) : 0
  if (level && levelIndex < 0) return null

  // Later authored acts may assign stable numeric seeds explicitly. Accept
  // only finite integers that the spawner can replay exactly; legacy Act I-IV
  // encounters retain the deterministic ID hash fallback.
  const seed = Number.isInteger(enc.seed) && Number.isFinite(enc.seed)
    ? enc.seed
    : seedForEncounter(enc.id)
  // Arena initial state: the chosen patron's god + the encounter's campaign
  // level. createInitialState starts at level 0; we re-seat it to the authored
  // encounter level so the composition (not wave pacing) is what plays.
  const arena = createEquippedArena(rpgState, patron, levelIndex)
  arena.levelIndex = levelIndex
  arena.threatsRemainingInLevel = level ? encounterSize(level) : authoredOrder.length

  // The spawner is loop-owned bookkeeping; seed it and point it at the level.
  const spawner = createSpawner(seed)
  spawner.levelIndex = levelIndex

  // The RPG-local elite overlay (e.g. the Name-Cutter Captain over the final
  // Sun Court Chronos). Canonical, kept out of CAMPAIGN / MONSTER_TYPES.
  const eliteOverlay = enc.eliteOverlay || null

  const targetableBossOverlay = enc.boss?.overlays?.find((overlay) => overlay?.targetable) || null

  // Preserve every authored combat contract. Targetable boss overlays are
  // executed as deterministic ward stages by authoredCombatOrder; the rest is
  // retained for explicit HUD telegraphs and future specialized renderers.
  const encounterMetadata = {
    ...enc,
    overlay: enc.overlay ?? null,
    eliteOverlay,
    boss: enc.boss ?? null,
    phase: enc.phase ?? null,
    phases: enc.phases ?? enc.boss?.phases ?? null,
    testimony: enc.testimony ?? null,
    testimonyInterruptRequired: enc.testimonyInterruptRequired
      ?? enc.boss?.testimonyInterruptRequired
      ?? false,
    seal: enc.seal ?? null,
    seals: enc.seals ?? null,
    resolution: enc.resolution ?? null,
  }

  return {
    encounterId: enc.id,
    campaignLevelId: enc.campaignLevelId,
    seed,
    startLevelIndex: levelIndex,
    arena,
    spawner,
    overlay: encounterMetadata.overlay,
    eliteOverlay,
    boss: encounterMetadata.boss,
    phase: encounterMetadata.phase,
    phases: encounterMetadata.phases,
    testimony: encounterMetadata.testimony,
    testimonyInterruptRequired: encounterMetadata.testimonyInterruptRequired,
    seal: encounterMetadata.seal,
    seals: encounterMetadata.seals,
    resolution: encounterMetadata.resolution,
    encounterMetadata,
    authoredOrder,
    targetableBossOverlay,
    bossWardCount: targetableBossOverlay
      ? Math.max(1, Math.floor(Number(targetableBossOverlay.count) || (targetableBossOverlay.kind === 'hydra-heads' ? 2 : 1)))
      : 0,
    authoredPacing: Math.max(1, Number(enc.pacing) || 40),
    settled: false,
    outcome: OUTCOME_NONE,
  }
}

const WILDERNESS_MONSTER_TYPE = Object.freeze({
  'wild-boar': 'minotaur',
  'feral-goat': 'hydra',
  'marsh-viper': 'medusa',
  'river-nymph': 'apolloWeaver',
  shade: 'chronos',
  'asphodel-wraith': 'chronos',
  hellhound: 'cerberus',
  'hecate-witch': 'medusa',
  'titan-spawn': 'atlas',
  fury: 'sphinx',
})

// Build a deterministic one-enemy arena session for the wilderness loop.
// The authored wilderness identity remains in metadata while its combat body
// reuses the closest existing arena archetype instead of creating a second
// combat engine.
export function startWildernessEncounter(rpgState, { enemyId, encounterKey } = {}) {
  const enemy = ENEMY_DEFS_BY_ID[enemyId]
  const patron = rpgState?.protagonist?.activePatronId
  const pendingEnemyId = rpgState?.wilderness?.pendingEnemyId
  const monsterType = WILDERNESS_MONSTER_TYPE[enemyId]
  if (!enemy || pendingEnemyId !== enemyId || !TIER1_PATRON_IDS.includes(patron) || !monsterType || !encounterKey) return null

  const seed = seedForEncounter(`wilderness:${encounterKey}`)
  const arena = createEquippedArena(rpgState, patron, 0)
  arena.levelIndex = 0
  arena.threatsRemainingInLevel = 1
  const spawner = createSpawner(seed)
  spawner.levelIndex = 0

  return {
    encounterId: `wilderness:${encounterKey}`,
    campaignLevelId: 'wilderness-skirmish',
    seed,
    startLevelIndex: 0,
    arena,
    spawner,
    authoredOrder: [monsterType],
    authoredPacing: 1,
    overlay: null,
    eliteOverlay: null,
    boss: null,
    phase: null,
    phases: null,
    testimony: null,
    testimonyInterruptRequired: false,
    seal: null,
    seals: null,
    resolution: null,
    bossWardCount: 0,
    targetableBossOverlay: null,
    wilderness: { enemyId, enemyName: enemy.name, encounterKey },
    settled: false,
    outcome: OUTCOME_NONE,
  }
}

function stepAuthoredSpawner(session, arena) {
  const spawner = session.spawner
  const order = session.authoredOrder || []
  if (arena.status !== 'running' || spawner.spawned >= order.length) return []
  spawner.untilNext -= 1
  if (spawner.untilNext > 0) return []
  spawner.untilNext = session.authoredPacing
  spawner.serial += 1
  const monsterType = order[spawner.spawned]
  spawner.spawned += 1
  const spec = resolveMonsterType(monsterType)
  const angle = spawner.rng() * Math.PI * 2
  const speedMul = Math.min(
    arena.config.levelSpeedCap,
    1 + arena.levelIndex * arena.config.levelSpeedAccel,
  )
  return [{
    id: `rpg-${session.encounterId}-${spawner.serial}`,
    x: Math.cos(angle) * FIELD_RADIUS,
    y: Math.sin(angle) * FIELD_RADIUS,
    vx: 0,
    vy: 0,
    radius: spec.size,
    angle,
    god: monsterType,
    glyph: spec.glyph,
    behavior: spec.behavior,
    speed: arena.config.threatBaseSpeed * speedMul,
    health: spec.size * 3,
    monsterType,
  }]
}

// RPG-owned one-tick sequence for encounters that carry an elite overlay. It
// drives the existing pure primitives directly (stepSpawner → overlay transform
// → spawnThreat → advanceTick) so an RPG-local overlay can restyle exactly one
// spawn without touching shared campaign data. It settles immediately on level
// departure (or death) so no next-map spawn leaks into a settled session.
function stepEncounterFrame(session, input = {}) {
  let arena = session.arena
  const { moveX = 0, moveY = 0, firing = false, aimX = 0, aimY = 0, attack = false, powerId = null, guard = false } = input
  const unguardedThreatDamage = arena.config.threatDamage
  if (guard) arena = { ...arena, config: { ...arena.config, threatDamage: unguardedThreatDamage * 0.55 } }
  arena = setFiring(arena, firing)
  if (aimX || aimY) arena = setAim(arena, aimX, aimY)
  arena = setInput(arena, moveX, moveY)
  if (attack) arena = deityAttack(arena)
  if (powerId) {
    const mag = Math.hypot(aimX, aimY) || 1
    const targetX = arena.deity.x + (aimX / mag) * 300
    const targetY = arena.deity.y + (aimY / mag) * 300
    arena = castPowerOn(arena, powerId, targetX, targetY)
  }

  // Spawn one tick's threats through the spawner, overlaying the final spawn.
  const spawns = session.authoredOrder
    ? stepAuthoredSpawner(session, arena)
    : stepSpawner(session.spawner, arena)
  for (const s of spawns) {
    const desc = session.eliteOverlay && isFinalSpawn(session) ? applyEliteOverlay(s, session.eliteOverlay) : s
    arena = spawnThreat(arena, desc)
  }
  arena = advanceTick(arena)
  if (guard) arena = { ...arena, config: { ...arena.config, threatDamage: unguardedThreatDamage } }

  // Victory: the arena advanced past the encounter's start level (the authored
  // composition cleared) or won the campaign outright.
  const won = arena.status === 'won' || arena.levelIndex > session.startLevelIndex
  const failed = arena.status === 'failed'
  if (won || failed) {
    return { ...session, arena, settled: true, outcome: won ? OUTCOME_WON : OUTCOME_FAILED }
  }
  return { ...session, arena }
}

// Whether the spawn just produced was the final spawn of the authored
// composition (the last one in the level's encounter order).
function isFinalSpawn(session) {
  if (session.authoredOrder) return session.spawner.spawned >= session.authoredOrder.length
  const level = levelById(session.campaignLevelId)
  if (!level) return false
  const order = level.encounter && level.encounter.order
  return Boolean(order && session.spawner && session.spawner.spawned >= order.length)
}

// Transform a spawn descriptor with the elite overlay's structured stat
// modifiers + the story-variant marker. Base monster type/glyph/behavior are
// preserved so arena collision/render contracts remain compatible.
function applyEliteOverlay(desc, overlay) {
  const hm = overlay.healthMult || 1
  const sm = overlay.speedMult || 1
  const rm = overlay.radiusMult || 1
  const baseHealth = desc.health || 1
  const baseSpeed = desc.speed || 1
  return {
    ...desc,
    id: desc.id,
    radius: (desc.radius || 1) * rm,
    health: baseHealth * hm,
    maxHealth: baseHealth * hm,
    speed: baseSpeed * sm,
    damageMult: overlay.damageMult || 1,
    name: overlay.name,
    storyVariantId: overlay.id,
    baseMonsterType: desc.monsterType || overlay.baseMonsterType || 'chronos',
  }
}

// Apply a player's intended inputs and advance one logic frame. Returns the
// updated session. A session is terminal once settled: further steps are
// no-ops that keep the settled outcome and never re-emit.
export function stepCombat(session, input = {}) {
  if (!session || session.settled) return session
  // Encounters with an RPG-local elite overlay use the RPG-owned one-tick
  // sequence so exactly the final authored spawn can be restyled. Plain
  // encounters keep the existing generic stepFrame path (arena route unchanged).
  if (session.eliteOverlay || session.authoredOrder) {
    const next = stepEncounterFrame(session, input)
    return { ...next, ...recordCombatContributions(session, session.arena, next.arena, input) }
  }
  let arena = session.arena
  const { moveX = 0, moveY = 0, firing = false, aimX = 0, aimY = 0, attack = false, powerId = null, guard = false } = input
  const unguardedThreatDamage = arena.config.threatDamage
  if (guard) arena = { ...arena, config: { ...arena.config, threatDamage: unguardedThreatDamage * 0.55 } }
  arena = setFiring(arena, firing)
  if (aimX || aimY) arena = setAim(arena, aimX, aimY)
  arena = setInput(arena, moveX, moveY)
  if (attack) arena = deityAttack(arena)
  if (powerId) {
    const mag = Math.hypot(aimX, aimY) || 1
    const targetX = arena.deity.x + (aimX / mag) * 300
    const targetY = arena.deity.y + (aimY / mag) * 300
    arena = castPowerOn(arena, powerId, targetX, targetY)
  }
  arena = stepFrame(arena, session.spawner)
  if (guard) arena = { ...arena, config: { ...arena.config, threatDamage: unguardedThreatDamage } }

  // Victory: the arena advanced past the encounter's start level (the authored
  // composition cleared) or won the campaign outright.
  const won = arena.status === 'won' || arena.levelIndex > session.startLevelIndex
  const failed = arena.status === 'failed'
  if (won || failed) {
    const next = { ...session, arena, settled: true, outcome: won ? OUTCOME_WON : OUTCOME_FAILED }
    return { ...next, ...recordCombatContributions(session, session.arena, arena, input) }
  }
  const next = { ...session, arena }
  return { ...next, ...recordCombatContributions(session, session.arena, arena, input) }
}

// Accessible, non-color combat telegraph derived only from deterministic
// session state. Targetable wards are named before the core; authored phase
// names then advance with the remaining composition.
export function sessionPhaseLabel(session) {
  if (!session?.boss) return ''
  const spawned = session.spawner?.spawned || 0
  if (session.bossWardCount && spawned <= session.bossWardCount) {
    const cleared = Math.max(0, spawned - 1)
    return `Wards ${Math.min(cleared + 1, session.bossWardCount)} of ${session.bossWardCount}`
  }
  const phases = session.phases || session.boss?.phases || []
  if (!phases.length) return 'Core phase'
  const afterWards = Math.max(0, spawned - (session.bossWardCount || 0))
  const coreCount = Math.max(1, (session.authoredOrder?.length || 1) - (session.bossWardCount || 0))
  const index = Math.min(phases.length - 1, Math.floor(afterWards / coreCount * phases.length))
  const name = String(phases[index] || 'core').split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
  return `Phase ${index + 1} of ${phases.length} · ${name}`
}

function setAimSafe(arena, aimX, aimY) {
  try {
    return setAim(arena, aimX, aimY)
  } catch {
    return arena
  }
}

// Read-only helpers for the combat UI.
export function sessionOutcome(session) {
  return session ? session.outcome : OUTCOME_NONE
}

export function arenaHealth(session) {
  return session ? session.arena.deity.health / session.arena.deity.maxHealth : 0
}

export function arenaKills(session) {
  if (!session) return 0
  const level = levelById(session.campaignLevelId)
  const total = session.authoredOrder?.length || encounterSize(level)
  return total - Math.max(0, session.arena.threatsRemainingInLevel)
}

// Fixed authored progress denominator for the encounter (never waves).
export function arenaProgress(session) {
  if (!session) return { defeated: 0, total: 0 }
  const level = levelById(session.campaignLevelId)
  const total = session.authoredOrder?.length || encounterSize(level)
  return { defeated: Math.max(0, total - Math.max(0, session.arena.threatsRemainingInLevel)), total }
}

// The elite overlay's display name, when present (e.g. "Name-Cutter Captain").
export function sessionEliteName(session) {
  return session && session.eliteOverlay ? session.eliteOverlay.name : ''
}
