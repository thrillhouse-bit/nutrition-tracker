import { isDeepStrictEqual } from 'node:util'

export const RPG_SAVE_MAX_BYTES = 512 * 1024
export const RPG_SAVE_MAX_GAME_SCHEMA_VERSION = 2_147_483_647

const BODY_KEYS = Object.freeze(['expectedRevision', 'gameSchemaVersion', 'payload'])

function requestError(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function assertJsonValue(value, path, seen, depth = 0) {
  if (depth > 64) throw requestError('RPG save payload is nested too deeply.')
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw requestError(`RPG save ${path} must contain only finite numbers.`)
    return
  }
  if (!value || typeof value !== 'object') {
    throw requestError(`RPG save ${path} must contain only JSON values.`)
  }
  if (seen.has(value)) throw requestError('RPG save payload must not contain circular references.')
  seen.add(value)
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertJsonValue(value[index], `${path}[${index}]`, seen, depth + 1)
    }
  } else {
    if (!isPlainObject(value)) throw requestError(`RPG save ${path} must contain only plain objects.`)
    for (const [key, child] of Object.entries(value)) {
      if (key.length > 256) throw requestError('RPG save payload keys may not exceed 256 characters.')
      assertJsonValue(child, `${path}.${key}`, seen, depth + 1)
    }
  }
  seen.delete(value)
}

export function validateRpgSavePutBody(body) {
  if (!isPlainObject(body)) throw requestError('RPG save body must be an object.')
  const keys = Object.keys(body).sort()
  if (!isDeepStrictEqual(keys, BODY_KEYS)) {
    throw requestError('RPG save body must contain only payload, gameSchemaVersion, and expectedRevision.')
  }
  if (!isPlainObject(body.payload)) throw requestError('RPG save payload must be an object.')
  if (
    !Number.isSafeInteger(body.gameSchemaVersion)
    || body.gameSchemaVersion < 1
    || body.gameSchemaVersion > RPG_SAVE_MAX_GAME_SCHEMA_VERSION
  ) {
    throw requestError('gameSchemaVersion must be a positive 32-bit integer.')
  }
  if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) {
    throw requestError('expectedRevision must be a non-negative safe integer.')
  }
  assertJsonValue(body.payload, 'payload', new Set())
  let encoded
  try {
    encoded = JSON.stringify(body)
  } catch {
    throw requestError('RPG save body must be valid JSON.')
  }
  if (Buffer.byteLength(encoded, 'utf8') > RPG_SAVE_MAX_BYTES) {
    const error = requestError(`RPG save body may not exceed ${RPG_SAVE_MAX_BYTES} bytes.`, 413)
    error.code = 'RPG_SAVE_TOO_LARGE'
    throw error
  }
  return {
    payload: body.payload,
    gameSchemaVersion: body.gameSchemaVersion,
    expectedRevision: body.expectedRevision,
  }
}

export function normalizeRpgSave(row) {
  if (!row) return null
  return {
    payload: row.payload,
    gameSchemaVersion: Number(row.game_schema_version ?? row.gameSchemaVersion),
    revision: Number(row.revision),
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  }
}

export function isIdempotentRpgSaveRetry(row, input) {
  const save = normalizeRpgSave(row)
  return Boolean(
    save
    && save.revision === input.expectedRevision + 1
    && save.gameSchemaVersion === input.gameSchemaVersion
    && isDeepStrictEqual(save.payload, input.payload),
  )
}
