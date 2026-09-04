// Pure server transaction plans: snapshots are supplied only after the server locks them.
const MAX_VALUE = 1_000_000_000
const MAX_ITEMS = 32
const SYSTEM_EXPIRY_ACTOR = 'system:trade-expiry'
const freeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze) } return value }
const plain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const id = (value) => typeof value === 'string' && /^[a-z][a-z0-9:_-]{0,127}$/i.test(value)
const value = (n) => Number.isSafeInteger(n) && n >= 0 && n <= MAX_VALUE
const revision = (n) => Number.isSafeInteger(n) && n >= 0 && n < Number.MAX_SAFE_INTEGER
const text = (s, max) => typeof s === 'string' && s.length > 0 && s.length <= max

function catalog(raw) { if (!Array.isArray(raw) || !raw.length || raw.length > 10_000 || raw.some((item) => !id(item))) return null; const result = new Set(raw); return result.size === raw.length ? result : null }
function ledger(raw, known) { return plain(raw) && revision(raw.revision) && value(raw.currency) && plain(raw.items) && Object.keys(raw.items).length <= MAX_ITEMS && Object.entries(raw.items).every(([item, quantity]) => known.has(item) && value(quantity)) }
function offer(raw, known) {
  if (!plain(raw) || !value(raw.currency) || !Array.isArray(raw.items) || raw.items.length > MAX_ITEMS) return null
  let previous = ''; const items = []
  for (const row of raw.items) { if (!plain(row) || !id(row.itemId) || !known.has(row.itemId) || !Number.isSafeInteger(row.quantity) || row.quantity < 1 || row.quantity > MAX_VALUE || row.itemId <= previous) return null; previous = row.itemId; items.push({ itemId: row.itemId, quantity: row.quantity }) }
  return raw.currency || items.length ? { currency: raw.currency, items } : null
}
function covers(current, requested) { return current.currency >= requested.currency && requested.items.every(({ itemId, quantity }) => current.items[itemId] >= quantity) }
function trusted(context, needsIdempotency = true) { return context?.trusted === true && id(context.actorId) && value(context.now) && (!needsIdempotency || (text(context.idempotencyKey, 128) && text(context.requestDigest, 256))) }
function openTrade(raw, known) {
  if (!plain(raw) || !id(raw.id) || !id(raw.proposerId) || !id(raw.counterpartyId) || raw.proposerId === raw.counterpartyId || raw.status !== 'open' || !revision(raw.revision) || raw.revision < 1 || !value(raw.expiresAt) || !revision(raw.proposerInventoryRevisionAfterReserve) || raw.counterpartyOffer !== null) return null
  const proposerOffer = offer(raw.proposerOffer, known)
  return proposerOffer ? { id: raw.id, proposerId: raw.proposerId, counterpartyId: raw.counterpartyId, proposerOffer, counterpartyOffer: null, expiresAt: raw.expiresAt, revision: raw.revision, status: 'open', proposerInventoryRevisionAfterReserve: raw.proposerInventoryRevisionAfterReserve } : null
}
const locks = (rows) => freeze(rows
  .map(({ userId, ledger: snapshot }) => ({
    userId,
    expectedRevision: snapshot.revision,
    snapshot: { currency: snapshot.currency, items: { ...snapshot.items } },
  }))
  .sort((a, b) => a.userId.localeCompare(b.userId)))
const reserve = (userId, amount) => freeze({ userId, kind: 'reserve', availableDebit: amount, reservedCredit: amount })
const release = (userId, amount) => freeze({ userId, kind: 'release', reservedDebit: amount, availableCredit: amount })
const consumeReserved = (userId, amount) => freeze({ userId, kind: 'consume-reserved', reservedDebit: amount })
const idem = (context, tradeId, status) => freeze({ actorId: context.actorId, key: context.idempotencyKey, digest: context.requestDigest, response: { tradeId, status } })
const audit = (kind, context, trade, beforeTradeRevision, afterTradeRevision, ledgerRevisions, reason = null) => freeze({ kind, at: context.now, actorId: context.actorId, tradeId: trade.id, beforeTradeRevision, afterTradeRevision, ledgerRevisions, reason })

export function createOffer({ context, tradeId, counterpartyId, offer: rawOffer, knownItemIds, expiresAt } = {}) {
  const known = catalog(knownItemIds); if (!trusted(context) || !known || !id(tradeId) || !id(counterpartyId) || context.actorId === counterpartyId || !value(expiresAt) || expiresAt <= context.now || context.expectedInventoryRevision !== context.ledger?.revision || !ledger(context.ledger, known)) return null
  const proposerOffer = offer(rawOffer, known); if (!proposerOffer || !covers(context.ledger, proposerOffer)) return null
  const trade = freeze({ id: tradeId, proposerId: context.actorId, counterpartyId, proposerOffer, counterpartyOffer: null, expiresAt, revision: 1, status: 'open', proposerInventoryRevisionAfterReserve: context.ledger.revision + 1 })
  return freeze({ tradeInsert: trade, lockOrder: locks([{ userId: context.actorId, ledger: context.ledger }]), ledgerDeltas: [reserve(context.actorId, proposerOffer)], audit: audit('create', context, trade, 0, 1, [{ userId: context.actorId, before: context.ledger.revision, after: context.ledger.revision + 1 }]), idempotency: idem(context, tradeId, 'open') })
}

export function acceptOffer({ context, trade: rawTrade, knownItemIds } = {}) {
  const known = catalog(knownItemIds); if (!trusted(context) || !known) return null
  const trade = openTrade(rawTrade, known); if (!trade || context.actorId !== trade.counterpartyId || context.now >= trade.expiresAt || context.expectedTradeRevision !== trade.revision || !plain(context.ledgers) || !plain(context.expectedInventoryRevisions)) return null
  const proposerLedger = context.ledgers[trade.proposerId], counterpartyLedger = context.ledgers[trade.counterpartyId]
  if (!ledger(proposerLedger, known) || !ledger(counterpartyLedger, known) || context.expectedInventoryRevisions[trade.proposerId] !== proposerLedger.revision || context.expectedInventoryRevisions[trade.counterpartyId] !== counterpartyLedger.revision || proposerLedger.revision !== trade.proposerInventoryRevisionAfterReserve) return null
  const counterpartyOffer = offer(context.counterpartyOffer, known); if (!counterpartyOffer || !covers(counterpartyLedger, counterpartyOffer)) return null
  const ledgers = [{ userId: trade.proposerId, ledger: proposerLedger }, { userId: trade.counterpartyId, ledger: counterpartyLedger }]
  return freeze({ tradePatch: { ...trade, counterpartyOffer, status: 'settled', revision: trade.revision + 1 }, lockOrder: locks(ledgers), ledgerDeltas: [reserve(trade.counterpartyId, counterpartyOffer), consumeReserved(trade.proposerId, trade.proposerOffer), consumeReserved(trade.counterpartyId, counterpartyOffer), { userId: trade.proposerId, kind: 'transfer-in', availableCredit: counterpartyOffer }, { userId: trade.counterpartyId, kind: 'transfer-in', availableCredit: trade.proposerOffer }], audit: audit('settle', context, trade, trade.revision, trade.revision + 1, ledgers.map(({ userId, ledger: row }) => ({ userId, before: row.revision, after: row.revision + 1 }))), idempotency: idem(context, trade.id, 'settled') })
}

function terminal(context, trade, proposerLedger, reason, idempotency) { return freeze({ tradePatch: { ...trade, status: reason, revision: trade.revision + 1 }, lockOrder: locks([{ userId: trade.proposerId, ledger: proposerLedger }]), ledgerDeltas: [release(trade.proposerId, trade.proposerOffer)], audit: audit(reason === 'expired' ? 'expire' : 'cancel', context, trade, trade.revision, trade.revision + 1, [{ userId: trade.proposerId, before: proposerLedger.revision, after: proposerLedger.revision + 1 }], reason), idempotency: idempotency ? idem(context, trade.id, reason) : null }) }
function terminalInput(context, rawTrade, knownItemIds) { const known = catalog(knownItemIds), trade = known && openTrade(rawTrade, known), proposerLedger = context?.proposerLedger; return { known, trade, proposerLedger } }
export function cancelOffer({ context, trade: rawTrade, knownItemIds } = {}) { const { known, trade, proposerLedger } = terminalInput(context, rawTrade, knownItemIds); if (!trusted(context) || !trade || ![trade.proposerId, trade.counterpartyId].includes(context.actorId) || context.expectedTradeRevision !== trade.revision || context.expectedProposerInventoryRevision !== proposerLedger?.revision || proposerLedger?.revision !== trade.proposerInventoryRevisionAfterReserve || !ledger(proposerLedger, known)) return null; return terminal(context, trade, proposerLedger, 'cancelled', true) }
export function expireOffer({ context, trade: rawTrade, knownItemIds } = {}) { const { known, trade, proposerLedger } = terminalInput(context, rawTrade, knownItemIds); if (!trusted(context, false) || context.actorId !== SYSTEM_EXPIRY_ACTOR || !trade || context.now < trade.expiresAt || context.expectedTradeRevision !== trade.revision || context.expectedProposerInventoryRevision !== proposerLedger?.revision || proposerLedger?.revision !== trade.proposerInventoryRevisionAfterReserve || !ledger(proposerLedger, known)) return null; return terminal(context, trade, proposerLedger, 'expired', false) }
export const TRADE_ESCROW_LIMITS = freeze({ MAX_VALUE, MAX_ITEMS, SYSTEM_EXPIRY_ACTOR })
