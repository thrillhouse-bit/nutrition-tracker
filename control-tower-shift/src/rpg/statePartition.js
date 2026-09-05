// Canonical v2 ownership boundary. Story projection and the authoritative
// ledger must derive their keys from this one source or a durable field can
// silently disappear between bootstrap and reload.

import { WAYFINDING_SURVEY_CONTRACTS, createWayfindingState } from './wayfinding.js'

export const STORY_PARTITION_KEYS = Object.freeze([
  'schemaVersion', 'status', 'protagonist', 'world', 'quests', 'mainQuestId', 'flags',
])

export const AUTHORITATIVE_LEDGER_KEYS = Object.freeze([
  'inventory', 'resources', 'progression', 'wilderness', 'crafting', 'economy',
  'combatSnapshot', 'playtimeTicks', 'savedAt', 'wayfinding',
])

export const RPG_STATE_PARTITION_KEYS = Object.freeze([
  ...STORY_PARTITION_KEYS,
  ...AUTHORITATIVE_LEDGER_KEYS,
])

const plain = (value) => {
  try {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
      && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  } catch {
    return false
  }
}

const exact = (value, keys) => {
  try { return plain(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)) } catch { return false }
}

const safeTick = (value) => Number.isSafeInteger(value) && value >= 0
const CONTRACT_IDS = new Set(WAYFINDING_SURVEY_CONTRACTS.map((contract) => contract.id))
const SHORTCUT_TO_CONTRACT = new Map(WAYFINDING_SURVEY_CONTRACTS.map((contract) => [contract.shortcut.id, contract.id]))

export function isCanonicalEmptyWayfinding(value) {
  return exact(value, ['discoveries', 'practices', 'shortcuts'])
    && Object.keys(value.discoveries).length === 0
    && Object.keys(value.practices).length === 0
    && Object.keys(value.shortcuts).length === 0
}

// Stored v2 ledger rows are server-generated, but read validation still fails
// closed: unknown IDs, malformed records, or a shortcut without its discovery
// cannot become durable authority by surviving a reload.
export function isStrictWayfindingState(value) {
  if (!exact(value, ['discoveries', 'practices', 'shortcuts'])) return false
  if (![value.discoveries, value.practices, value.shortcuts].every(plain)) return false
  for (const [contractId, discovery] of Object.entries(value.discoveries)) {
    if (!CONTRACT_IDS.has(contractId) || !exact(discovery, ['discoveredAtTick']) || !safeTick(discovery.discoveredAtTick)) return false
  }
  for (const [contractId, practice] of Object.entries(value.practices)) {
    if (!CONTRACT_IDS.has(contractId) || !value.discoveries[contractId]
      || !exact(practice, ['lastAwardedTick', 'count'])
      || !safeTick(practice.lastAwardedTick) || !safeTick(practice.count)) return false
  }
  for (const [shortcutId, enabled] of Object.entries(value.shortcuts)) {
    const contractId = SHORTCUT_TO_CONTRACT.get(shortcutId)
    if (!contractId || !value.discoveries[contractId] || enabled !== true) return false
  }
  return true
}

export function emptyWayfindingState() {
  return createWayfindingState()
}

export function partitionRpgState(state) {
  if (!exact(state, RPG_STATE_PARTITION_KEYS)) return null
  return {
    story: Object.fromEntries(STORY_PARTITION_KEYS.map((key) => [key, state[key]])),
    authoritative: Object.fromEntries(AUTHORITATIVE_LEDGER_KEYS.map((key) => [key, state[key]])),
  }
}
