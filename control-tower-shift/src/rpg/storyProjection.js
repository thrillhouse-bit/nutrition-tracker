// Strict, pure story/ledger boundary. It is intentionally independent from
// save normalization: callers must reject hostile or stale server payloads.
import {
  AUTHORITATIVE_LEDGER_KEYS,
  RPG_STATE_PARTITION_KEYS,
  STORY_PARTITION_KEYS,
  emptyWayfindingState,
  isCanonicalEmptyWayfinding,
  isStrictWayfindingState,
  partitionRpgState,
} from './statePartition.js'

export const STORY_PROJECTION_VERSION = 1
const STORY_KEYS = STORY_PARTITION_KEYS
const OWNED_STATE_KEYS = AUTHORITATIVE_LEDGER_KEYS
const STATE_KEYS = RPG_STATE_PARTITION_KEYS
const EPHEMERAL_FLAGS = new Set(['rpg:active-bank-entity', 'rpg:active-shop-entity', 'rpg:active-crafting-entity', 'rpg:active-conversation', 'rpg:active-conversation-npc', 'rpg:active-shrine-entity', 'rpg:shrine-open'])
const ECONOMIC_KEYS = new Set(['inventory', 'currency', 'wallet', 'money', 'coins', 'drachma', 'items', 'item', 'stock', 'reserved', 'reserve', 'balance', 'balances', 'ledger', 'bank', 'economy', 'resources', 'equipment', 'skills', 'xp', 'totalxp', 'transactions', 'price', 'prices'])
const LIMITS = Object.freeze({ depth: 32, nodes: 2048, keys: 256, array: 256, string: 16_384 })
const plain = (value) => {
  try { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) } catch { return false }
}
const revision = (value) => Number.isSafeInteger(value) && value >= 0
const text = (value) => typeof value === 'string' && value.length <= LIMITS.string
const scalar = (value) => value === null || typeof value === 'boolean' || (typeof value === 'string' && text(value)) || (typeof value === 'number' && Number.isFinite(value))

function exact(value, keys) {
  try { return plain(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)) } catch { return false }
}
function safeClone(value, seen = new WeakSet(), budget = { nodes: 0 }, depth = 0) {
  try {
    if (depth > LIMITS.depth || ++budget.nodes > LIMITS.nodes) return null
    if (scalar(value)) return value
    if (typeof value !== 'object' || value === null || seen.has(value)) return null
    seen.add(value)
    if (Array.isArray(value)) {
      if (value.length > LIMITS.array) return null
      const out = []
      for (const item of value) { const copy = safeClone(item, seen, budget, depth + 1); if (copy === null && item !== null) return null; out.push(copy) }
      return out
    }
    if (!plain(value)) return null
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const names = Object.keys(descriptors).sort()
    if (names.length > LIMITS.keys || names.some((name) => ['__proto__', 'constructor', 'prototype'].includes(name))) return null
    const out = Object.create(null)
    for (const name of names) {
      const descriptor = descriptors[name]
      if (!Object.hasOwn(descriptor, 'value')) return null
      const copy = safeClone(descriptor.value, seen, budget, depth + 1)
      if (copy === null && descriptor.value !== null) return null
      Object.defineProperty(out, name, { value: copy, enumerable: true, writable: true, configurable: true })
    }
    return out
  } catch { return null }
}
function freezeCopy(value, seen = new WeakSet()) {
  try {
    if (!value || typeof value !== 'object' || seen.has(value)) return value
    seen.add(value); for (const child of Object.values(value)) freezeCopy(child, seen); return Object.freeze(value)
  } catch { return null }
}
function allowedKeys(value, keys) { return plain(value) && Object.keys(value).every((key) => keys.includes(key)) }

// Flags are an intentionally narrow narrative protocol, not a convenient
// extension bag. New durable story facts must be registered here with their
// value shape before projections can carry them across a ledger boundary.
// Scoped forms are reducer-authored namespaces whose segment grammar is part
// of the protocol; they are not a fallback for arbitrary flag names.
const FLAG_TOKEN = /^[a-z][a-z0-9-]{0,127}$/
const FLAG_VALUE = Object.freeze({ boolean: (value) => value === true || value === false, text: (value) => text(value) })
const narrativeToken = (value) => FLAG_TOKEN.test(value) && !ECONOMIC_KEYS.has(value.toLowerCase())
export const NARRATIVE_FLAG_SCHEMAS = Object.freeze({
  'act1-far-sighted-restored': FLAG_VALUE.boolean,
  'act2:tide-state': (value) => ['ebb', 'crossing', 'surge'].includes(value),
  'act3:season-state': (value) => ['winter', 'harvest'].includes(value),
  'act4:pressure-state': (value) => ['safe', 'venting', 'critical'].includes(value),
  'act5:light-state': (value) => ['shadow', 'moon', 'sun'].includes(value),
  'act5-accord-choice': FLAG_VALUE.text,
  'act5-ending': FLAG_VALUE.text,
  'act5-regent-testimony-heard': FLAG_VALUE.boolean,
})
const SCOPED_NARRATIVE_FLAG_SCHEMAS = Object.freeze([
  { expression: /^choice:([a-z][a-z0-9-]{0,127})$/, valid: FLAG_VALUE.text },
  { expression: /^conversation:completed:([a-z][a-z0-9-]{0,127})$/, valid: FLAG_VALUE.boolean },
  { expression: /^marker:([a-z][a-z0-9-]{0,127}):([a-z][a-z0-9-]{0,127})$/, valid: FLAG_VALUE.boolean },
  { expression: /^objective:([a-z][a-z0-9-]{0,127}):([a-z][a-z0-9-]{0,127}):([a-z][a-z0-9-]{0,127})$/, valid: FLAG_VALUE.boolean },
  { expression: /^region:([a-z][a-z0-9-]{0,127}):unlocked$/, valid: FLAG_VALUE.boolean },
  { expression: /^codex:([a-z][a-z0-9-]{0,127})$/, valid: FLAG_VALUE.boolean },
  { expression: /^epilogue:([a-z][a-z0-9-]{0,127})$/, valid: FLAG_VALUE.boolean },
  { expression: /^seen:([a-z][a-z0-9-]{0,127})$/, valid: FLAG_VALUE.boolean },
  { expression: /^steward:restored:([a-z][a-z0-9-]{0,127}):([a-z][a-z0-9-]{0,127})$/, valid: FLAG_VALUE.boolean },
])
function registeredNarrativeFlag(key, value) {
  const exactSchema = NARRATIVE_FLAG_SCHEMAS[key]
  if (exactSchema) return exactSchema(value)
  return SCOPED_NARRATIVE_FLAG_SCHEMAS.some(({ expression, valid }) => {
    const match = expression.exec(key)
    return Boolean(match) && match.slice(1).every(narrativeToken) && valid(value)
  })
}
function narrativeFlags(value) {
  return plain(value) && Object.entries(value).every(([key, child]) => text(key) && registeredNarrativeFlag(key, child))
}
function questRecord(value) {
  if (!allowedKeys(value, ['state', 'objectiveIndex', 'objectiveCounts', 'acceptedAtTick'])) return false
  if (typeof value.state !== 'string' || !Number.isSafeInteger(value.objectiveIndex) || value.objectiveIndex < 0) return false
  if (value.acceptedAtTick !== undefined && !revision(value.acceptedAtTick)) return false
  return plain(value.objectiveCounts) && Object.entries(value.objectiveCounts).every(([key, count]) => text(key) && !ECONOMIC_KEYS.has(key.toLowerCase()) && revision(count))
}
function narrativeQuests(value) { return plain(value) && Object.entries(value).every(([id, quest]) => text(id) && !ECONOMIC_KEYS.has(id.toLowerCase()) && questRecord(quest)) }
function narrativeWorld(value) {
  return exact(value, ['regionId', 'mapId', 'spawnId', 'position', 'facing'])
    && text(value.regionId) && text(value.mapId) && text(value.spawnId) && Number.isFinite(value.facing)
    && exact(value.position, ['x', 'y']) && Number.isFinite(value.position.x) && Number.isFinite(value.position.y)
}
function narrativeProtagonist(value) {
  return exact(value, ['presentation', 'activePatronId', 'unlockedPatronIds'])
    && text(value.presentation) && (value.activePatronId === null || text(value.activePatronId))
    && Array.isArray(value.unlockedPatronIds) && value.unlockedPatronIds.every(text)
}
function canonicalStory(value) {
  if (!exact(value, STORY_KEYS) || !Number.isSafeInteger(value.schemaVersion) || value.schemaVersion < 1 || !['playing', 'ending'].includes(value.status) || !text(value.mainQuestId)) return null
  const flags = Object.create(null)
  for (const key of Object.keys(value.flags).sort()) if (!EPHEMERAL_FLAGS.has(key)) flags[key] = value.flags[key]
  if (!narrativeProtagonist(value.protagonist) || !narrativeWorld(value.world) || !narrativeQuests(value.quests) || !narrativeFlags(flags)) return null
  return { schemaVersion: value.schemaVersion, status: value.status, protagonist: value.protagonist, world: value.world, quests: value.quests, mainQuestId: value.mainQuestId, flags }
}

export function extractStoryProjection(state) {
  try {
    if (!exact(state, STATE_KEYS)) return null
    const clone = safeClone(state)
    if (!clone) return null
    const partition = partitionRpgState(clone)
    // Client inputs may contain Wayfinding state locally, but that field is
    // ledger-owned and is never accepted through a story projection.
    const story = partition && canonicalStory(partition.story)
    return story ? freezeCopy(Object.assign(Object.create(null), { projectionVersion: STORY_PROJECTION_VERSION, story })) : null
  } catch { return null }
}

// Nested authoritative data is intentionally a trusted ledger/store contract;
// this boundary exact-clones its top-level ownership surface but does not
// reinterpret inventory/economy semantics before the authoritative store does.
export function composeAuthoritativeState(projectionEnvelope, ledgerEnvelope) {
  try {
    if (!exact(projectionEnvelope, ['projectionVersion', 'story', 'storyRevision']) || projectionEnvelope.projectionVersion !== STORY_PROJECTION_VERSION || !revision(projectionEnvelope.storyRevision)) return null
    if (!exact(ledgerEnvelope, ['inventoryRevision', 'authoritative']) || !revision(ledgerEnvelope.inventoryRevision)) return null
    const legacyStory = plain(projectionEnvelope.story) && Object.hasOwn(projectionEnvelope.story, 'wayfinding')
    const storyInput = legacyStory
      ? Object.fromEntries(STORY_KEYS.map((key) => [key, projectionEnvelope.story[key]]))
      : projectionEnvelope.story
    const story = canonicalStory(storyInput)
    const expectedLedgerKeys = legacyStory ? OWNED_STATE_KEYS.filter((key) => key !== 'wayfinding') : OWNED_STATE_KEYS
    if (!story || !exact(ledgerEnvelope.authoritative, expectedLedgerKeys)) return null
    const authoritative = safeClone(ledgerEnvelope.authoritative)
    if (!authoritative) return null
    // Compatibility is intentionally one narrow old-server shape only: the
    // former bootstrap stored an empty Wayfinding object in story and omitted
    // it from the ledger. Any nonempty/malformed legacy projection is a
    // rejected ownership-smuggling attempt, not a migration input.
    if (legacyStory) {
      if (!isCanonicalEmptyWayfinding(projectionEnvelope.story.wayfinding)) return null
      authoritative.wayfinding = emptyWayfindingState()
    } else if (!isStrictWayfindingState(authoritative.wayfinding)) return null
    const state = safeClone(story)
    if (!state) return null
    Object.assign(state, authoritative)
    return freezeCopy(Object.assign(Object.create(null), { state, storyRevision: projectionEnvelope.storyRevision, inventoryRevision: ledgerEnvelope.inventoryRevision }))
  } catch { return null }
}
