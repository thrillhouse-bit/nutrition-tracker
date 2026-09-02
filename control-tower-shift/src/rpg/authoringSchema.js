// Release-authoring contract for scalable Oathbearer content.
//
// Runtime registries remain deliberately permissive while the complete game is
// authored. These pure validators and builders define the stricter editorial
// boundary required for release-ready quests, scenes, places, encounters, and
// systemic world objects. They never repair or mutate legacy content.

export const AUTHORING_SCHEMA_VERSION = 1

export const AUTHORING_CATEGORIES = Object.freeze([
  'main-quest',
  'regional-side-quest',
  'cross-act-character-quest',
  'system-mastery-quest',
  'quest-objective',
  'conversation',
  'region-map',
  'world-entity',
  'story-encounter',
  'boss-encounter',
  'wilderness-encounter',
  'regional-merchant',
  'gathering-resource',
])

export const REQUIRED_AUTHORING_METADATA_FIELDS = Object.freeze([
  'category',
  'dramaticQuestion',
  'systemsUsed',
  'durableReward',
  'downstreamConsequence',
  'recoveryBehavior',
  'expectedMinutes',
  'originalityNotes',
  'levelBand',
  'regionBand',
])

export const AUTHORING_RECORD_KINDS = Object.freeze([
  'quest',
  'objective',
  'conversation',
  'map',
  'entity',
  'encounter',
  'merchant',
  'resource',
])

const CATEGORY_BY_KIND = Object.freeze({
  quest: Object.freeze(['main-quest', 'regional-side-quest', 'cross-act-character-quest', 'system-mastery-quest']),
  objective: Object.freeze(['quest-objective']),
  conversation: Object.freeze(['conversation']),
  map: Object.freeze(['region-map']),
  entity: Object.freeze(['world-entity']),
  encounter: Object.freeze(['story-encounter', 'boss-encounter', 'wilderness-encounter']),
  merchant: Object.freeze(['regional-merchant']),
  resource: Object.freeze(['gathering-resource']),
})

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze(value[key])
  }
  return value
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, clone(nested)]))
  }
  return value
}

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function stringList(value) {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmptyText)
}

function safePositiveInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function issue(code, path, message) {
  return { code, path, message }
}

function compareIssues(left, right) {
  return left.code.localeCompare(right.code)
    || left.path.localeCompare(right.path)
    || left.message.localeCompare(right.message)
}

function missing(issues, field) {
  issues.push(issue('MISSING_AUTHORING_FIELD', `authoring.${field}`, `Required authoring metadata is missing: ${field}.`))
}

function invalid(issues, field, message) {
  issues.push(issue('INVALID_AUTHORING_FIELD', `authoring.${field}`, message))
}

function validateBand(issues, field, value, minimum, maximum) {
  if (!value || typeof value !== 'object') { missing(issues, field); return }
  if (!safePositiveInteger(value.min) || !safePositiveInteger(value.max) || value.min > value.max || value.max > maximum || value.min < minimum) {
    invalid(issues, field, `${field} must have integer min/max values within ${minimum}–${maximum}.`)
  }
}

export function validateAuthoringMetadata(authoring, kind) {
  const issues = []
  const allowedCategories = CATEGORY_BY_KIND[kind]
  if (!allowedCategories) {
    return deepFreeze({ valid: false, issues: [issue('UNKNOWN_AUTHORING_KIND', 'kind', `Unknown authoring record kind: ${String(kind)}.`)] })
  }
  const value = authoring && typeof authoring === 'object' && !Array.isArray(authoring) ? authoring : null

  for (const field of REQUIRED_AUTHORING_METADATA_FIELDS) {
    if (!value || value[field] === undefined || value[field] === null || value[field] === '') missing(issues, field)
  }
  if (!value) return deepFreeze({ valid: false, issues: issues.sort(compareIssues) })

  if (value.schemaVersion !== undefined && value.schemaVersion !== AUTHORING_SCHEMA_VERSION) {
    invalid(issues, 'schemaVersion', `schemaVersion must equal ${AUTHORING_SCHEMA_VERSION}.`)
  }
  if (value.category != null && value.category !== '' && !allowedCategories.includes(value.category)) {
    invalid(issues, 'category', `${kind} category must be one of: ${allowedCategories.join(', ')}.`)
  }
  for (const field of ['dramaticQuestion', 'durableReward', 'downstreamConsequence', 'recoveryBehavior', 'originalityNotes']) {
    if (value[field] != null && value[field] !== '' && !nonEmptyText(value[field])) invalid(issues, field, `${field} must be non-empty text.`)
  }
  if (value.systemsUsed != null && !stringList(value.systemsUsed)) {
    invalid(issues, 'systemsUsed', 'systemsUsed must be a non-empty array of system IDs.')
  }
  if (value.expectedMinutes != null && !safePositiveInteger(value.expectedMinutes)) {
    invalid(issues, 'expectedMinutes', 'expectedMinutes must be a positive integer playtime estimate.')
  }
  if (value.levelBand != null) validateBand(issues, 'levelBand', value.levelBand, 1, 99)
  if (value.regionBand != null) {
    const band = value.regionBand
    if (!band || typeof band !== 'object') {
      missing(issues, 'regionBand')
    } else {
      if (!stringList(band.regionIds)) invalid(issues, 'regionBand.regionIds', 'regionBand.regionIds must name at least one authored region.')
      validateBand(issues, 'regionBand.acts', band.acts, 1, 5)
    }
  }
  const sorted = issues.sort(compareIssues)
  return deepFreeze({ valid: sorted.length === 0, issues: sorted })
}

function recordIssue(issues, path, message) {
  issues.push(issue('INVALID_AUTHORED_RECORD', path, message))
}

function validateStructure(kind, record, issues) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    recordIssue(issues, kind, `${kind} must be an object.`)
    return
  }
  if (!nonEmptyText(record.id)) recordIssue(issues, 'id', `${kind} requires a stable id.`)
  if (kind === 'quest' && (!Array.isArray(record.objectives) || record.objectives.length === 0)) {
    recordIssue(issues, 'objectives', 'Quest requires at least one objective.')
  }
  if (kind === 'objective' && !nonEmptyText(record.kind)) recordIssue(issues, 'kind', 'Objective requires an interaction kind.')
  if (kind === 'conversation') {
    if (!nonEmptyText(record.start)) recordIssue(issues, 'start', 'Conversation requires a start node id.')
    if (!record.nodes || typeof record.nodes !== 'object' || !Object.keys(record.nodes).length) recordIssue(issues, 'nodes', 'Conversation requires authored nodes.')
    else if (record.start && !record.nodes[record.start]) recordIssue(issues, 'start', 'Conversation start must resolve to an authored node.')
  }
  if (kind === 'map') {
    if (!(record.bounds?.w > 0 && record.bounds?.h > 0)) recordIssue(issues, 'bounds', 'Map requires positive finite bounds.')
    if (!record.spawns || typeof record.spawns !== 'object' || !Object.keys(record.spawns).length) recordIssue(issues, 'spawns', 'Map requires at least one spawn.')
    if (!Array.isArray(record.entities)) recordIssue(issues, 'entities', 'Map requires an entity array.')
  }
  if (kind === 'entity' || kind === 'resource') {
    if (!nonEmptyText(record.kind)) recordIssue(issues, 'kind', 'World entity requires a kind.')
    if (!Number.isFinite(record.x) || !Number.isFinite(record.y)) recordIssue(issues, 'position', 'World entity requires finite x/y coordinates.')
  }
  if (kind === 'encounter' && !nonEmptyText(record.mapId || record.activationMapId)) {
    recordIssue(issues, 'mapId', 'Encounter requires a map or activation-map id.')
  }
  if (kind === 'merchant') {
    if (!stringList(record.mapIds)) recordIssue(issues, 'mapIds', 'Merchant requires at least one physical map id.')
    if (!record.listings || typeof record.listings !== 'object' || !Object.keys(record.listings).length) recordIssue(issues, 'listings', 'Merchant requires specialized listings.')
  }
  if (kind === 'resource') {
    if (!nonEmptyText(record.itemId)) recordIssue(issues, 'itemId', 'Resource requires a yielded item id.')
    if (!nonEmptyText(record.skillId)) recordIssue(issues, 'skillId', 'Resource requires a gathering skill id.')
  }
}

export function validateAuthoredRecord(kind, record) {
  const issues = []
  if (!AUTHORING_RECORD_KINDS.includes(kind)) {
    return deepFreeze({ valid: false, issues: [issue('UNKNOWN_AUTHORING_KIND', 'kind', `Unknown authoring record kind: ${String(kind)}.`)] })
  }
  validateStructure(kind, record, issues)
  const metadata = validateAuthoringMetadata(record?.authoring, kind)
  issues.push(...metadata.issues)
  issues.sort(compareIssues)
  return deepFreeze({ valid: issues.length === 0, issues })
}

function normalizedAuthoring(authoring) {
  const next = clone(authoring)
  next.schemaVersion = AUTHORING_SCHEMA_VERSION
  if (Array.isArray(next.systemsUsed)) {
    next.systemsUsed = [...new Set(next.systemsUsed)].sort((left, right) => left.localeCompare(right))
  }
  if (next.regionBand && Array.isArray(next.regionBand.regionIds)) {
    next.regionBand.regionIds = [...new Set(next.regionBand.regionIds)].sort((left, right) => left.localeCompare(right))
  }
  return next
}

export function buildAuthoredRecord(kind, definition) {
  const candidate = clone(definition)
  if (candidate?.authoring && typeof candidate.authoring === 'object') candidate.authoring = normalizedAuthoring(candidate.authoring)
  const validation = validateAuthoredRecord(kind, candidate)
  if (!validation.valid) {
    throw new TypeError(validation.issues.map((entry) => `${entry.code}:${entry.path}`).join(', '))
  }
  return deepFreeze(candidate)
}

export const validateAuthoredQuest = (definition) => validateAuthoredRecord('quest', definition)
export const validateAuthoredObjective = (definition) => validateAuthoredRecord('objective', definition)
export const validateAuthoredConversation = (definition) => validateAuthoredRecord('conversation', definition)
export const validateAuthoredMap = (definition) => validateAuthoredRecord('map', definition)
export const validateAuthoredEntity = (definition) => validateAuthoredRecord('entity', definition)
export const validateAuthoredEncounter = (definition) => validateAuthoredRecord('encounter', definition)
export const validateAuthoredMerchant = (definition) => validateAuthoredRecord('merchant', definition)
export const validateAuthoredResource = (definition) => validateAuthoredRecord('resource', definition)

export const buildAuthoredQuest = (definition) => buildAuthoredRecord('quest', definition)
export const buildAuthoredObjective = (definition) => buildAuthoredRecord('objective', definition)
export const buildAuthoredConversation = (definition) => buildAuthoredRecord('conversation', definition)
export const buildAuthoredMap = (definition) => buildAuthoredRecord('map', definition)
export const buildAuthoredEntity = (definition) => buildAuthoredRecord('entity', definition)
export const buildAuthoredEncounter = (definition) => buildAuthoredRecord('encounter', definition)
export const buildAuthoredMerchant = (definition) => buildAuthoredRecord('merchant', definition)
export const buildAuthoredResource = (definition) => buildAuthoredRecord('resource', definition)

function emptyDepthCounts() {
  return { total: 0, legacy: 0, incomplete: 0, releaseReady: 0 }
}

export function createAuthoredDepthReport(records) {
  const normalized = Array.isArray(records) ? records : []
  const entries = normalized.map((entry) => {
    const validation = validateAuthoredRecord(entry.kind, entry.value)
    const hasAuthoring = entry.value?.authoring && typeof entry.value.authoring === 'object' && !Array.isArray(entry.value.authoring)
    const status = validation.valid ? 'release-ready' : hasAuthoring ? 'incomplete' : 'legacy'
    const missingFields = validation.issues
      .filter((item) => item.code === 'MISSING_AUTHORING_FIELD')
      .map((item) => item.path.replace(/^authoring\./, ''))
      .sort((left, right) => left.localeCompare(right))
    return {
      kind: entry.kind,
      id: entry.id,
      path: entry.path,
      status,
      missingFields,
      issues: validation.issues.map((item) => ({ ...item })),
    }
  }).sort((left, right) => (
    left.kind.localeCompare(right.kind)
    || left.id.localeCompare(right.id)
    || left.path.localeCompare(right.path)
  ))

  const counts = emptyDepthCounts()
  const byKind = Object.fromEntries(AUTHORING_RECORD_KINDS.map((kind) => [kind, emptyDepthCounts()]))
  for (const entry of entries) {
    counts.total += 1
    byKind[entry.kind].total += 1
    const key = entry.status === 'release-ready' ? 'releaseReady' : entry.status
    counts[key] += 1
    byKind[entry.kind][key] += 1
  }
  return deepFreeze({ schemaVersion: AUTHORING_SCHEMA_VERSION, counts, byKind, records: entries })
}
