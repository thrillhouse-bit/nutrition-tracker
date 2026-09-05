import { createInitialState } from '../control-tower-shift/src/rpg/state.js'
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
