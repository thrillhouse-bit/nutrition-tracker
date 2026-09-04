// Pure API adapter. Persistence owns authoritative ledgers, locks, and calls
// the escrow planner; request bodies never carry balances, account ownership,
// or a caller-authored idempotency digest.
import { createHash } from 'node:crypto'

const MAX_VALUE = 1_000_000_000
const plain = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const id = (v) => typeof v === 'string' && /^[a-z][a-z0-9:_-]{0,127}$/i.test(v)
const integer = (v) => Number.isSafeInteger(v) && v >= 0 && v <= MAX_VALUE
const revision = (v) => Number.isSafeInteger(v) && v > 0 && v < Number.MAX_SAFE_INTEGER
const key = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max
const response = (status, body) => ({ status, body })
const error = (status, code, message) => response(status, { error: message, code })
const unavailable = () => error(503, 'TRADE_SERVICE_UNAVAILABLE', 'Trading is temporarily unavailable.')

function exact(body, keys) { return plain(body) && Object.keys(body).length === keys.length && keys.every((name) => Object.hasOwn(body, name)) }
function parseOffer(raw, known) {
  if (!plain(raw) || !integer(raw.currency) || !Array.isArray(raw.items) || raw.items.length > 32) return null
  let previous = ''; const items = []
  for (const row of raw.items) {
    if (!plain(row) || !id(row.itemId) || !known.has(row.itemId) || !Number.isSafeInteger(row.quantity) || row.quantity < 1 || row.quantity > MAX_VALUE || row.itemId <= previous) return null
    previous = row.itemId; items.push({ itemId: row.itemId, quantity: row.quantity })
  }
  return raw.currency || items.length ? { currency: raw.currency, items } : null
}
function auth(context) { return id(context?.userId) ? context.userId : null }
function digest(payload) { return createHash('sha256').update(JSON.stringify(payload)).digest('hex') }
function serverNow(clock) { try { const at = clock(); return integer(at) ? at : null } catch { return null } }
function serverUuid(factory) { try { const tradeId = factory(); return id(tradeId) ? tradeId : null } catch { return null } }
function mapStoreError(result) {
  if (!result) return null
  if (result?.outcome === 'not_found') return error(404, 'TRADE_NOT_FOUND', 'Trade not found.')
  if (result.outcome === 'forbidden') return error(403, 'TRADE_FORBIDDEN', 'You cannot access this trade.')
  if (result.outcome === 'expired') return error(410, 'TRADE_EXPIRED', 'Trade has expired.')
  if (result.outcome === 'conflict' || result.outcome === 'stale' || result.outcome === 'idempotency_mismatch') return error(409, 'TRADE_CONFLICT', 'Trade request conflicts with current state.')
  return null
}
function persistedTrade(raw, known) {
  const fields = ['id', 'proposerId', 'counterpartyId', 'proposerOffer', 'counterpartyOffer', 'expiresAt', 'revision', 'status', 'proposerInventoryRevisionAfterReserve']
  if (!exact(raw, fields) || !id(raw.id) || !id(raw.proposerId) || !id(raw.counterpartyId) || raw.proposerId === raw.counterpartyId || !integer(raw.expiresAt) || !revision(raw.revision) || !integer(raw.proposerInventoryRevisionAfterReserve) || !['open', 'settled', 'cancelled', 'expired'].includes(raw.status)) return null
  const proposerOffer = parseOffer(raw.proposerOffer, known)
  const counterpartyOffer = raw.counterpartyOffer === null ? null : parseOffer(raw.counterpartyOffer, known)
  if (!proposerOffer || (raw.status === 'open' ? counterpartyOffer !== null : !counterpartyOffer)) return null
  return { id: raw.id, proposerId: raw.proposerId, counterpartyId: raw.counterpartyId, proposerOffer, counterpartyOffer, expiresAt: raw.expiresAt, revision: raw.revision, status: raw.status, proposerInventoryRevisionAfterReserve: raw.proposerInventoryRevisionAfterReserve }
}
function success(result, known) {
  if (!exact(result, ['outcome', 'trade']) || !['written', 'idempotent'].includes(result.outcome)) return null
  const persisted = persistedTrade(result.trade, known)
  if (!persisted) return null
  const { proposerInventoryRevisionAfterReserve: _private, ...trade } = persisted
  return { trade, idempotent: result.outcome === 'idempotent' }
}
async function invoke(method, input) { try { return await method(input) } catch { return null } }

export function createTradeEscrowHandlers({ backend, store, now, uuid, knownItemIds } = {}) {
  const known = Array.isArray(knownItemIds) && knownItemIds.length > 0 && knownItemIds.length <= 10_000 && knownItemIds.every(id) ? new Set(knownItemIds) : null
  const available = () => backend === 'postgres' && store && typeof now === 'function' && typeof uuid === 'function' && known
  const gate = (context) => {
    const actorId = auth(context); if (!actorId) return [null, error(401, 'AUTH_REQUIRED', 'Not signed in.')]
    if (!available()) return [null, error(501, 'TRADE_REQUIRES_POSTGRES', 'Trading requires PostgreSQL-backed authoritative inventory.')]
    return [actorId, null]
  }
  const clock = () => serverNow(now)
  return {
    async create(context, body) {
      const [actorId, blocked] = gate(context); if (blocked) return blocked
      const requestNow = clock(); if (requestNow == null) return unavailable()
      if (!exact(body, ['counterpartyId', 'expiresAt', 'idempotencyKey', 'offer']) || !id(body.counterpartyId) || body.counterpartyId === actorId || !integer(body.expiresAt) || body.expiresAt <= requestNow) return error(400, 'TRADE_INVALID_REQUEST', 'Invalid trade offer.')
      const offer = parseOffer(body.offer, known), tradeId = serverUuid(uuid)
      if (!offer || !key(body.idempotencyKey, 128)) return error(400, 'TRADE_INVALID_REQUEST', 'Invalid trade offer.')
      if (!tradeId || typeof store.createEscrowTrade !== 'function') return unavailable()
      const requestDigest = digest({ action: 'create', actorId, counterpartyId: body.counterpartyId, expiresAt: body.expiresAt, offer })
      const result = await invoke(store.createEscrowTrade.bind(store), { actorId, tradeId, counterpartyId: body.counterpartyId, expiresAt: body.expiresAt, offer, idempotencyKey: body.idempotencyKey, requestDigest, now: requestNow })
      const mapped = mapStoreError(result); if (mapped) return mapped
      const accepted = success(result, known); return accepted ? response(accepted.idempotent ? 200 : 201, accepted) : unavailable()
    },
    async get(context, tradeId) {
      const [actorId, blocked] = gate(context); if (blocked) return blocked
      const requestNow = clock(); if (requestNow == null) return unavailable()
      if (!id(tradeId)) return error(404, 'TRADE_NOT_FOUND', 'Trade not found.')
      if (typeof store.getEscrowTradeForActor !== 'function') return unavailable()
      const result = await invoke(store.getEscrowTradeForActor.bind(store), { actorId, tradeId, now: requestNow })
      const mapped = mapStoreError(result); if (mapped) return mapped
      const accepted = success(result, known); return accepted ? response(200, { trade: accepted.trade }) : unavailable()
    },
    async accept(context, tradeId, body) {
      const [actorId, blocked] = gate(context); if (blocked) return blocked
      const requestNow = clock(); if (requestNow == null) return unavailable()
      if (!id(tradeId) || !exact(body, ['counterpartyOffer', 'expectedInventoryRevision', 'expectedTradeRevision', 'idempotencyKey']) || !integer(body.expectedInventoryRevision) || !integer(body.expectedTradeRevision)) return error(400, 'TRADE_INVALID_REQUEST', 'Invalid acceptance request.')
      const counterpartyOffer = parseOffer(body.counterpartyOffer, known)
      if (!counterpartyOffer || !key(body.idempotencyKey, 128)) return error(400, 'TRADE_INVALID_REQUEST', 'Invalid acceptance request.')
      if (typeof store.acceptEscrowTrade !== 'function') return unavailable()
      const requestDigest = digest({ action: 'accept', actorId, tradeId, counterpartyOffer, expectedInventoryRevision: body.expectedInventoryRevision, expectedTradeRevision: body.expectedTradeRevision })
      const result = await invoke(store.acceptEscrowTrade.bind(store), { actorId, tradeId, counterpartyOffer, expectedInventoryRevision: body.expectedInventoryRevision, expectedTradeRevision: body.expectedTradeRevision, idempotencyKey: body.idempotencyKey, requestDigest, now: requestNow })
      const mapped = mapStoreError(result); if (mapped) return mapped
      const accepted = success(result, known); return accepted ? response(200, accepted) : unavailable()
    },
    async cancel(context, tradeId, body) {
      const [actorId, blocked] = gate(context); if (blocked) return blocked
      const requestNow = clock(); if (requestNow == null) return unavailable()
      if (!id(tradeId) || !exact(body, ['expectedTradeRevision', 'idempotencyKey']) || !integer(body.expectedTradeRevision) || !key(body.idempotencyKey, 128)) return error(400, 'TRADE_INVALID_REQUEST', 'Invalid cancellation request.')
      if (typeof store.cancelEscrowTrade !== 'function') return unavailable()
      const requestDigest = digest({ action: 'cancel', actorId, tradeId, expectedTradeRevision: body.expectedTradeRevision })
      const result = await invoke(store.cancelEscrowTrade.bind(store), { actorId, tradeId, expectedTradeRevision: body.expectedTradeRevision, idempotencyKey: body.idempotencyKey, requestDigest, now: requestNow })
      const mapped = mapStoreError(result); if (mapped) return mapped
      const accepted = success(result, known); return accepted ? response(200, accepted) : unavailable()
    },
  }
}
