import { describe, expect, it } from 'vitest'
import { acceptOffer, cancelOffer, createOffer, expireOffer, TRADE_ESCROW_LIMITS } from '../src/rpg/tradeEscrow.js'

const catalog = ['ore', 'wood']
const proposerOffer = { currency: 2, items: [{ itemId: 'wood', quantity: 1 }] }
const counterpartyOffer = { currency: 1, items: [{ itemId: 'ore', quantity: 2 }] }
const ledger = (revision, currency = 9, items = { wood: 2, ore: 3 }) => ({ revision, currency, items })
const context = (actorId = 'proposer', extra = {}) => ({ trusted: true, actorId, now: 10, idempotencyKey: 'request-1', requestDigest: 'digest-1', ledger: ledger(3), expectedInventoryRevision: 3, ...extra })
const create = () => createOffer({ context: context(), tradeId: 'trade-1', counterpartyId: 'counterparty', offer: proposerOffer, knownItemIds: catalog, expiresAt: 20 })
const acceptContext = (extra = {}) => context('counterparty', { expectedTradeRevision: 1, expectedInventoryRevisions: { proposer: 4, counterparty: 8 }, ledgers: { proposer: ledger(4, 7, { wood: 1, ore: 3 }), counterparty: ledger(8) }, counterpartyOffer, ...extra })
const copy = (value) => JSON.parse(JSON.stringify(value))
const total = (accounts) => Object.values(accounts).reduce((sum, account) => {
  for (const balance of [account.available, account.reserved]) {
    sum.currency += balance.currency
    for (const [itemId, quantity] of Object.entries(balance.items)) sum.items[itemId] = (sum.items[itemId] || 0) + quantity
  }
  return sum
}, { currency: 0, items: {} })
const applyDeltas = (accounts, deltas) => {
  const next = copy(accounts)
  const move = (from, to, amount) => {
    from.currency -= amount.currency
    to.currency += amount.currency
    for (const { itemId, quantity } of amount.items) {
      from.items[itemId] -= quantity
      to.items[itemId] = (to.items[itemId] || 0) + quantity
      if (from.items[itemId] === 0) delete from.items[itemId]
      if (to.items[itemId] === 0) delete to.items[itemId]
    }
  }
  for (const delta of deltas) {
    const account = next[delta.userId]
    if (delta.kind === 'reserve') move(account.available, account.reserved, delta.availableDebit)
    if (delta.kind === 'release') move(account.reserved, account.available, delta.reservedDebit)
    if (delta.kind === 'consume-reserved') move(account.reserved, { currency: 0, items: {} }, delta.reservedDebit)
    if (delta.kind === 'transfer-in') move({ currency: 0, items: {} }, account.available, delta.availableCredit)
  }
  return next
}

describe('server escrow transaction plans', () => {
  it('reserves only proposer and settles atomically after counterparty consent', () => {
    const created = create()
    expect(created.ledgerDeltas).toEqual([{ userId: 'proposer', kind: 'reserve', availableDebit: proposerOffer, reservedCredit: proposerOffer }])
    expect(created.tradeInsert.counterpartyOffer).toBeNull()
    const settled = acceptOffer({ context: acceptContext(), trade: created.tradeInsert, knownItemIds: catalog })
    expect(settled.tradePatch.status).toBe('settled')
    expect(settled.lockOrder.map((row) => row.userId)).toEqual(['counterparty', 'proposer'])
    expect(settled.audit.ledgerRevisions).toEqual(expect.arrayContaining([{ userId: 'proposer', before: 4, after: 5 }, { userId: 'counterparty', before: 8, after: 9 }]))
    expect(settled.idempotency).toMatchObject({ actorId: 'counterparty', key: 'request-1', digest: 'digest-1' })
  })

  it('rejects malformed trusted context, overflow, malformed catalog, and unknown inventory', () => {
    const input = { context: context(), tradeId: 'trade-1', counterpartyId: 'counterparty', offer: proposerOffer, knownItemIds: catalog, expiresAt: 20 }
    expect(createOffer({ ...input, context: context('proposer', { idempotencyKey: '' }) })).toBeNull()
    expect(createOffer({ ...input, context: context('proposer', { now: -1 }) })).toBeNull()
    expect(createOffer({ ...input, offer: { currency: TRADE_ESCROW_LIMITS.MAX_VALUE + 1, items: [] } })).toBeNull()
    expect(createOffer({ ...input, offer: { currency: 0, items: [{ itemId: 'unknown', quantity: 1 }] } })).toBeNull()
    expect(createOffer({ ...input, knownItemIds: ['wood', 'wood'] })).toBeNull()
    expect(createOffer({ ...input, context: context('proposer', { ledger: ledger(3, 9, { unknown: 1 }) }) })).toBeNull()
  })

  it('rejects stale, malformed persisted, and replay-mismatched accepts', () => {
    const trade = create().tradeInsert
    expect(acceptOffer({ context: acceptContext({ expectedInventoryRevisions: { proposer: 3, counterparty: 8 } }), trade, knownItemIds: catalog })).toBeNull()
    expect(acceptOffer({ context: acceptContext({ requestDigest: '' }), trade, knownItemIds: catalog })).toBeNull()
    expect(acceptOffer({ context: acceptContext(), trade: { ...trade, proposerOffer: { currency: 0, items: [{ itemId: 'unknown', quantity: 1 }] } }, knownItemIds: catalog })).toBeNull()
    expect(acceptOffer({ context: acceptContext(), trade: { ...trade, counterpartyOffer }, knownItemIds: catalog })).toBeNull()
  })

  it('uses persisted reserve only for cancel/expiry and never forges expiry actor metadata', () => {
    const trade = create().tradeInsert
    const proposerLedger = ledger(4, 7, { wood: 1, ore: 3 })
    const cancelled = cancelOffer({ context: context('counterparty', { expectedTradeRevision: 1, expectedProposerInventoryRevision: 4, proposerLedger }), trade, knownItemIds: catalog })
    expect(cancelled.ledgerDeltas).toEqual([{ userId: 'proposer', kind: 'release', reservedDebit: proposerOffer, availableCredit: proposerOffer }])
    expect(cancelled.idempotency.actorId).toBe('counterparty')
    expect(cancelOffer({ context: context('intruder', { expectedTradeRevision: 1, expectedProposerInventoryRevision: 4, proposerLedger }), trade, knownItemIds: catalog })).toBeNull()
    const expired = expireOffer({ context: context(TRADE_ESCROW_LIMITS.SYSTEM_EXPIRY_ACTOR, { now: 20, expectedTradeRevision: 1, expectedProposerInventoryRevision: 4, proposerLedger, idempotencyKey: undefined, requestDigest: undefined }), trade, knownItemIds: catalog })
    expect(expired.audit.actorId).toBe(TRADE_ESCROW_LIMITS.SYSTEM_EXPIRY_ACTOR)
    expect(expired.idempotency).toBeNull()
  })

  it('is serializable, non-mutating, and conservation-checkable', () => {
    const trade = create().tradeInsert
    const c = acceptContext(); const before = JSON.stringify(c.ledgers)
    const settled = acceptOffer({ context: c, trade, knownItemIds: catalog })
    expect(JSON.stringify(c.ledgers)).toBe(before)
    expect(JSON.parse(JSON.stringify(settled)).tradePatch.status).toBe('settled')
    const incoming = settled.ledgerDeltas.filter((row) => row.kind === 'transfer-in').flatMap((row) => row.availableCredit.items)
    expect(incoming.sort((a, b) => a.itemId.localeCompare(b.itemId))).toEqual([{ itemId: 'ore', quantity: 2 }, { itemId: 'wood', quantity: 1 }])
    expect(settled.ledgerDeltas.filter((row) => row.kind === 'transfer-in').reduce((sum, row) => sum + row.availableCredit.currency, 0)).toBe(3)
  })

  it('consumes escrow before exchange and conserves both parties across create plus accept', () => {
    const initial = {
      proposer: { available: { currency: 9, items: { wood: 2, ore: 3 } }, reserved: { currency: 0, items: {} } },
      counterparty: { available: { currency: 9, items: { wood: 2, ore: 3 } }, reserved: { currency: 0, items: {} } },
    }
    const created = create()
    const afterCreate = applyDeltas(initial, created.ledgerDeltas)
    const settled = acceptOffer({ context: acceptContext(), trade: created.tradeInsert, knownItemIds: catalog })
    const final = applyDeltas(afterCreate, settled.ledgerDeltas)
    expect(settled.ledgerDeltas.filter((row) => row.kind === 'release')).toEqual([])
    expect(settled.ledgerDeltas.filter((row) => row.kind === 'consume-reserved')).toHaveLength(2)
    expect(total(final)).toEqual(total(initial))
    expect(final).toEqual({
      proposer: { available: { currency: 8, items: { wood: 1, ore: 5 } }, reserved: { currency: 0, items: {} } },
      counterparty: { available: { currency: 10, items: { wood: 3, ore: 1 } }, reserved: { currency: 0, items: {} } },
    })
  })

  it('canonicalizes persisted trades instead of retaining injected fields', () => {
    const trade = { ...create().tradeInsert, injected: 'not persisted' }
    const settled = acceptOffer({ context: acceptContext(), trade, knownItemIds: catalog })
    expect(settled.tradePatch).not.toHaveProperty('injected')
  })
})
