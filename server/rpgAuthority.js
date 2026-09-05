import { applyEvent, createInitialState } from '../control-tower-shift/src/rpg/state.js'
import crypto from 'node:crypto'
import { AUTHORITATIVE_LEDGER_KEYS, partitionRpgState } from '../control-tower-shift/src/rpg/statePartition.js'
import {
  STORY_PROJECTION_VERSION,
  composeAuthoritativeState,
  extractStoryProjection,
} from '../control-tower-shift/src/rpg/storyProjection.js'

function plain(value) {
  try {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
      && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  } catch {
    return false
  }
}

function bad(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

const COMMAND_KEYS = Object.freeze(['protocolVersion', 'commandId', 'idempotencyKey', 'expectedStoryRevision', 'expectedInventoryRevision', 'command'])
const MAX_COMMAND_ID_LENGTH = 128
const MAX_IDEMPOTENCY_KEY_LENGTH = 192
const token = (value, max = MAX_COMMAND_ID_LENGTH) => typeof value === 'string' && value.length > 0 && value.length <= max && /^[a-zA-Z0-9:_-]+$/.test(value)
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
const COMMAND_SCHEMA = Object.freeze({
  // Initial public protocol intentionally contains only the acceptance event.
  // It has reducer-enforced physical presence and stays in the durable
  // `playing` projection. Dialogue/choice/reach events can settle rewards or
  // represent local UI leases, so they remain server-internal for now.
  ACCEPT_QUEST: Object.freeze({ required: ['questId', 'entityId', 'trigger'], optional: [], valid: (p) => token(p.questId) && token(p.entityId) && ['talk', 'station'].includes(p.trigger) }),
})

// JSON.stringify preserves insertion order, so it is not a signature format.
// Commands and authority partitions are recursively canonicalized before either
// a digest or equality decision. Inputs are already strict JSON shapes at the
// HTTP boundary; this guard keeps internal callers equally fail-closed.
export function canonicalRpgJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : null
  if (Array.isArray(value)) {
    const entries = value.map(canonicalRpgJson)
    return entries.some((entry) => entry == null) ? null : `[${entries.join(',')}]`
  }
  if (!plain(value)) return null
  const keys = Object.keys(value).sort()
  const entries = []
  for (const key of keys) {
    const entry = canonicalRpgJson(value[key])
    if (entry == null) return null
    entries.push(`${JSON.stringify(key)}:${entry}`)
  }
  return `{${entries.join(',')}}`
}

export function rpgAuthorityCommandDigest(envelope) {
  const canonical = canonicalRpgJson({
    protocolVersion: envelope?.protocolVersion,
    commandId: envelope?.commandId,
    command: envelope?.command,
  })
  if (!canonical) throw bad('Invalid RPG authority command digest input.')
  return crypto.createHash('sha256').update(canonical).digest('hex')
}

export function validateRpgAuthorityCommandBody(body) {
  if (!exact(body, COMMAND_KEYS) || body.protocolVersion !== 1 || !token(body.commandId)
    || !token(body.idempotencyKey, MAX_IDEMPOTENCY_KEY_LENGTH)
    || !Number.isSafeInteger(body.expectedStoryRevision) || body.expectedStoryRevision < 1
    || !Number.isSafeInteger(body.expectedInventoryRevision) || body.expectedInventoryRevision < 1 || !plain(body.command)) throw bad('Invalid RPG authority command envelope.')
  const type = body.command.type
  const contract = COMMAND_SCHEMA[type]
  const payload = Object.fromEntries(Object.entries(body.command).filter(([key]) => key !== 'type'))
  if (!contract) throw bad('RPG authority command is not allowed.', 422)
  const allowed = ['type', ...contract.required, ...contract.optional]
  if (!Object.keys(body.command).every((key) => allowed.includes(key))
    || !contract.required.every((key) => Object.hasOwn(payload, key))
    || !contract.valid(payload)) throw bad('Invalid RPG authority command payload.')
  const command = Object.freeze({ type, ...payload })
  const envelope = Object.freeze({
    protocolVersion: body.protocolVersion,
    commandId: body.commandId,
    idempotencyKey: body.idempotencyKey,
    expectedStoryRevision: body.expectedStoryRevision,
    expectedInventoryRevision: body.expectedInventoryRevision,
    command,
  })
  return Object.freeze({ ...envelope, digest: rpgAuthorityCommandDigest(envelope) })
}

export function replayRpgAuthorityCommand(row, envelope) {
  const current = presentRpgAuthority(row)
  if (!current || current.storyRevision !== envelope.expectedStoryRevision || current.inventoryRevision !== envelope.expectedInventoryRevision) throw bad('RPG authority revision conflict.', 409)
  const next = applyEvent(current.state, envelope.command)
  if (next === current.state) throw bad('RPG authority command made no state change.', 422)
  const before = owned(current.state); const after = owned(next)
  const beforeLedger = canonicalRpgJson(before)
  const afterLedger = canonicalRpgJson(after)
  if (!beforeLedger || !afterLedger || beforeLedger !== afterLedger) throw bad('RPG authority command touches ledger-owned state.', 422)
  const projection = extractStoryProjection(next)
  if (!projection) throw bad('RPG authority command produced invalid story state.', 422)
  return Object.freeze({ story: projection.story, storyRevision: current.storyRevision + 1, inventoryRevision: current.inventoryRevision })
}

function owned(state) {
  const partition = partitionRpgState(state)
  if (!partition || !AUTHORITATIVE_LEDGER_KEYS.every((key) => Object.hasOwn(partition.authoritative, key))) {
    throw new Error('Unable to partition canonical RPG authority bootstrap.')
  }
  return partition.authoritative
}

// The bootstrap is generated in server code only. A new account never gets to
// upload an inventory, currency, or ledger revision through this endpoint.
export function createRpgAuthorityBootstrap() {
  const initial = createInitialState()
  const projection = extractStoryProjection(initial)
  if (!projection) throw new Error('Unable to construct canonical RPG authority bootstrap.')
  return Object.freeze({
    story: projection.story,
    storyRevision: 1,
    inventoryRevision: 1,
    authoritative: owned(initial),
  })
}

export function validateRpgAuthorityBootstrapBody(body) {
  if (!plain(body) || Object.keys(body).length !== 0) {
    throw bad('RPG authority bootstrap body must be an empty object.')
  }
  return Object.freeze({})
}

export function presentRpgAuthority(row) {
  if (!row) return null
  const composed = composeAuthoritativeState({
    projectionVersion: STORY_PROJECTION_VERSION,
    story: row.story,
    storyRevision: row.storyRevision,
  }, {
    inventoryRevision: row.inventoryRevision,
    authoritative: row.authoritative,
  })
  if (!composed) throw new Error('Stored RPG authority record is invalid.')
  return {
    story: row.story,
    state: composed.state,
    storyRevision: composed.storyRevision,
    inventoryRevision: composed.inventoryRevision,
  }
}
