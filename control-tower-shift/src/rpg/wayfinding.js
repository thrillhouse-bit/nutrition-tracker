// Deterministic Wayfinding domain contracts for the Pelagos Chartwright slice.
//
// This module deliberately owns no map registration, inventory mutation, UI,
// or reducer wiring. Callers provide the current Wayfinding XP, carried chart
// IDs, and deterministic playtime tick; successful results describe the XP,
// permanent shortcut, and next serializable Wayfinding state to persist.

import { levelForXp } from './progression.js'

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value)) deepFreeze(nested)
  }
  return value
}

const safeTick = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null
const safeXp = (value) => Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
const known = (value, collection) => typeof value === 'string' && Object.hasOwn(collection, value)
const copyRecord = (record) => ({ ...record })

export const WAYFINDING_SKILL_ID = 'wayfinding'
export const WAYFINDING_PLAYTIME_TICKS_PER_SECOND = 30
// A dedicated World-skill mastery lane in a 35–45h campaign: 123 marker
// activations at the current curve, with 80–85 minutes of enforced active
// playtime. Route travel, combat, and inventory decisions make real play
// longer; this is intentionally a lower bound rather than an idle timer.
export const WAYFINDING_MASTERY_BUDGET = deepFreeze({
  actionCount: { min: 120, max: 130 },
  practiceCount: { min: 115, max: 125 },
  minimumActiveSeconds: { min: 4_800, max: 5_000 },
  campaignHours: { min: 35, max: 45 },
})

export const WAYFINDING_LEVEL_BANDS = deepFreeze([
  { id: 'harbor-apprentice', minLevel: 1, label: 'Harbor Apprentice' },
  { id: 'tide-reader', minLevel: 10, label: 'Tide Reader' },
  { id: 'strait-surveyor', minLevel: 25, label: 'Strait Surveyor' },
  { id: 'open-water-navigator', minLevel: 45, label: 'Open-Water Navigator' },
  { id: 'covenant-chartwright', minLevel: 70, label: 'Covenant Chartwright' },
])

export const WAYFINDING_SURVEY_CONTRACTS = deepFreeze([
  {
    id: 'pelagos-harbor-soundings', bandId: 'harbor-apprentice', requiredLevel: 1, requiredChartId: null,
    discoveryXp: 120, practiceXp: 200, practiceCooldownTicks: 240,
    discoveryReward: { kind: 'chart', itemId: 'harbor-soundings-chart' },
    shortcut: { id: 'shortcut:pelagos-chartwright-hall', fromMapId: 'pelagos-harbor', toMapId: 'chartwright-hall', toSpawnId: 'from-pelagos', destinationScope: 'isolated-chartwright' },
  },
  {
    id: 'breakwater-tide-bearing', bandId: 'tide-reader', requiredLevel: 10, requiredChartId: 'harbor-soundings-chart',
    discoveryXp: 600, practiceXp: 700, practiceCooldownTicks: 420,
    discoveryReward: { kind: 'chart', itemId: 'breakwater-tide-chart' },
    shortcut: { id: 'shortcut:breakwater-tide-shelf', fromMapId: 'breakwater-road', toMapId: 'breakwater-road', toSpawnId: 'surge-witness', destinationScope: 'external-existing' },
  },
  {
    id: 'nereid-boundary-soundings', bandId: 'strait-surveyor', requiredLevel: 25, requiredChartId: 'breakwater-tide-chart',
    discoveryXp: 1800, practiceXp: 2200, practiceCooldownTicks: 900,
    discoveryReward: { kind: 'chart', itemId: 'nereid-boundary-chart' },
    shortcut: { id: 'shortcut:nereid-enclave-current', fromMapId: 'nereid-caves', toMapId: 'nereid-caves', toSpawnId: 'threshold', destinationScope: 'external-existing' },
  },
  {
    id: 'anchorage-storm-line', bandId: 'open-water-navigator', requiredLevel: 45, requiredChartId: 'nereid-boundary-chart',
    discoveryXp: 4500, practiceXp: 8500, practiceCooldownTicks: 1500,
    discoveryReward: { kind: 'chart', itemId: 'storm-line-chart' },
    shortcut: { id: 'shortcut:anchorage-weather-lee', fromMapId: 'storm-anchorage', toMapId: 'storm-anchorage', toSpawnId: 'rope-lift', destinationScope: 'external-existing' },
  },
  {
    id: 'archive-return-bearing', bandId: 'covenant-chartwright', requiredLevel: 70, requiredChartId: 'storm-line-chart',
    discoveryXp: 12000, practiceXp: 11000, practiceCooldownTicks: 1800,
    discoveryReward: { kind: 'mastery-chart', itemId: 'covenant-return-chart' },
    shortcut: { id: 'shortcut:archive-return-course', fromMapId: 'archive-barge-deck', toMapId: 'archive-barge-deck', toSpawnId: 'post-boss', destinationScope: 'external-existing' },
  },
])

export const WAYFINDING_CONTRACT_BY_ID = deepFreeze(Object.fromEntries(
  WAYFINDING_SURVEY_CONTRACTS.map((contract) => [contract.id, contract]),
))

// Explicit cross-module destination contract. Integration must resolve
// `isolated-chartwright` against the Chartwright runtime maps and
// `external-existing` against the canonical registry; neither form permits an
// inferred map or spawn name.
export const WAYFINDING_SHORTCUT_DESTINATION_SEAMS = deepFreeze(
  WAYFINDING_SURVEY_CONTRACTS.map((contract) => ({ contractId: contract.id, ...contract.shortcut })),
)

export function createWayfindingState() {
  return { discoveries: {}, practices: {}, shortcuts: {} }
}

export function normalizeWayfindingState(raw) {
  const state = createWayfindingState()
  for (const contract of WAYFINDING_SURVEY_CONTRACTS) {
    const discovery = raw?.discoveries?.[contract.id]
    if (safeTick(discovery?.discoveredAtTick) != null) {
      state.discoveries[contract.id] = { discoveredAtTick: discovery.discoveredAtTick }
    }
    const practice = raw?.practices?.[contract.id]
    if (safeTick(practice?.lastAwardedTick) != null && Number.isSafeInteger(practice?.count) && practice.count >= 0) {
      state.practices[contract.id] = { lastAwardedTick: practice.lastAwardedTick, count: practice.count }
    }
    // A shortcut is durable evidence of this exact completed survey, never a
    // standalone save flag that can unlock travel without its discovery.
    if (state.discoveries[contract.id] && raw?.shortcuts?.[contract.shortcut.id] === true) {
      state.shortcuts[contract.shortcut.id] = true
    }
  }
  return state
}

export function wayfindingBandForLevel(level) {
  const safeLevel = Number.isFinite(level) ? Math.floor(level) : 0
  return [...WAYFINDING_LEVEL_BANDS].reverse().find((band) => safeLevel >= band.minLevel) || null
}

export function surveyContractById(contractId) {
  return known(contractId, WAYFINDING_CONTRACT_BY_ID) ? WAYFINDING_CONTRACT_BY_ID[contractId] : null
}

export function surveyCooldownRemaining(state, contractId, playtimeTicks) {
  const contract = surveyContractById(contractId)
  const tick = safeTick(playtimeTicks)
  if (!contract || tick == null) return null
  const normalized = normalizeWayfindingState(state)
  const practice = normalized.practices[contractId]
  if (!practice) return 0
  return Math.max(0, contract.practiceCooldownTicks - (tick - practice.lastAwardedTick))
}

export function wayfindingMasteryStatus(state, skillXp) {
  const normalized = normalizeWayfindingState(state)
  const level = levelForXp(safeXp(skillXp))
  const missingContracts = WAYFINDING_SURVEY_CONTRACTS
    .filter((contract) => !normalized.discoveries[contract.id])
    .map((contract) => contract.id)
  const missingShortcuts = WAYFINDING_SURVEY_CONTRACTS
    .filter((contract) => !normalized.shortcuts[contract.shortcut.id])
    .map((contract) => contract.shortcut.id)
  const masteryBand = WAYFINDING_LEVEL_BANDS.at(-1)
  return {
    mastered: level >= masteryBand.minLevel && missingContracts.length === 0 && missingShortcuts.length === 0,
    level,
    requiredLevel: masteryBand.minLevel,
    missingContracts,
    missingShortcuts,
  }
}

// This is a balance proof, not a gameplay shortcut. It uses the exact public
// survey transition, starts at zero XP/charts, and advances only deterministic
// active-play ticks needed to satisfy cooldowns. Integration must still invoke
// each physical marker and run its own strict reachability check.
export function simulateWayfindingMasteryPath() {
  let state = createWayfindingState()
  let skillXp = 0
  let playtimeTicks = 0
  let chartIds = []
  const actions = []
  for (let index = 0; index < WAYFINDING_SURVEY_CONTRACTS.length; index += 1) {
    const contract = WAYFINDING_SURVEY_CONTRACTS[index]
    const discover = surveyWayfindingContract({ state, contractId: contract.id, playtimeTicks, skillXp, chartIds })
    if (!discover.ok) return deepFreeze({ valid: false, reason: discover.reason, actions, state, skillXp, playtimeTicks, chartIds })
    state = discover.state
    skillXp += discover.reward.xp
    chartIds = [...chartIds, discover.reward.discoveryReward.itemId]
    actions.push({ kind: 'discovery', contractId: contract.id, tick: playtimeTicks, xp: discover.reward.xp })
    const next = WAYFINDING_SURVEY_CONTRACTS[index + 1]
    while (next && levelForXp(skillXp) < next.requiredLevel) {
      playtimeTicks += contract.practiceCooldownTicks
      const practice = surveyWayfindingContract({ state, contractId: contract.id, playtimeTicks, skillXp, chartIds })
      if (!practice.ok) return deepFreeze({ valid: false, reason: practice.reason, actions, state, skillXp, playtimeTicks, chartIds })
      state = practice.state
      skillXp += practice.reward.xp
      actions.push({ kind: 'practice', contractId: contract.id, tick: playtimeTicks, xp: practice.reward.xp })
    }
  }
  const mastery = wayfindingMasteryStatus(state, skillXp)
  return deepFreeze({
    valid: mastery.mastered,
    state,
    skillXp,
    level: mastery.level,
    playtimeTicks,
    minimumActiveSeconds: playtimeTicks / WAYFINDING_PLAYTIME_TICKS_PER_SECOND,
    actionCount: actions.length,
    discoveryCount: actions.filter((action) => action.kind === 'discovery').length,
    practiceCount: actions.filter((action) => action.kind === 'practice').length,
    actions,
  })
}

function failure(state, reason, detail) {
  return { ok: false, reason, detail, state: normalizeWayfindingState(state), reward: null }
}

function hasChart(chartIds, chartId) {
  return chartId == null || (Array.isArray(chartIds) && chartIds.includes(chartId))
}

// Resolves a physical survey-marker activation. The first valid activation of
// a contract awards its exact-once discovery reward and permanent shortcut.
// Subsequent activations award repeatable practice XP only after the contract's
// deterministic playtime cooldown has elapsed.
export function surveyWayfindingContract({ state, contractId, playtimeTicks, skillXp, chartIds = [] } = {}) {
  const contract = surveyContractById(contractId)
  const tick = safeTick(playtimeTicks)
  if (!contract) return failure(state, 'unknown_contract', { contractId })
  if (tick == null) return failure(state, 'invalid_playtime_tick', { playtimeTicks })
  if (!Number.isFinite(skillXp) || skillXp < 0) return failure(state, 'invalid_skill_xp', { contractId })
  if (!Array.isArray(chartIds) || chartIds.some((itemId) => typeof itemId !== 'string')) {
    return failure(state, 'invalid_chart_ids', { contractId })
  }

  const level = levelForXp(safeXp(skillXp))
  if (level < contract.requiredLevel) {
    return failure(state, 'level_too_low', { contractId, required: contract.requiredLevel, current: level })
  }
  if (!hasChart(chartIds, contract.requiredChartId)) {
    return failure(state, 'missing_chart', { contractId, requiredChartId: contract.requiredChartId })
  }

  const normalized = normalizeWayfindingState(state)
  if (!normalized.discoveries[contractId]) {
    const next = {
      ...normalized,
      discoveries: { ...normalized.discoveries, [contractId]: { discoveredAtTick: tick } },
      practices: { ...normalized.practices, [contractId]: { lastAwardedTick: tick, count: 0 } },
      shortcuts: { ...normalized.shortcuts, [contract.shortcut.id]: true },
    }
    return {
      ok: true,
      reason: 'discovered',
      state: next,
      reward: {
        kind: 'discovery', skillId: WAYFINDING_SKILL_ID, xp: contract.discoveryXp,
        discoveryReward: copyRecord(contract.discoveryReward), shortcut: copyRecord(contract.shortcut),
      },
    }
  }

  const remaining = surveyCooldownRemaining(normalized, contractId, tick)
  if (remaining > 0) return failure(normalized, 'practice_cooldown', { contractId, remainingTicks: remaining })
  const previous = normalized.practices[contractId] || { lastAwardedTick: tick, count: 0 }
  const next = {
    ...normalized,
    practices: {
      ...normalized.practices,
      [contractId]: { lastAwardedTick: tick, count: previous.count + 1 },
    },
  }
  return {
    ok: true,
    reason: 'practiced',
    state: next,
    reward: { kind: 'practice', skillId: WAYFINDING_SKILL_ID, xp: contract.practiceXp, contractId },
  }
}
