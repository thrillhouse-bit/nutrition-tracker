import { describe, expect, it } from 'vitest'
import { createTradeEscrowHandlers } from '../server/tradeEscrowApi.js'

const body = { counterpartyId: 'other', expiresAt: 20, idempotencyKey: 'key-1', offer: { currency: 2, items: [{ itemId: 'wood', quantity: 1 }] } }
const openTrade = (overrides = {}) => ({
  id: 'trade-1', proposerId: 'owner', counterpartyId: 'other', proposerOffer: body.offer,
  counterpartyOffer: null, expiresAt: 20, revision: 1, status: 'open', proposerInventoryRevisionAfterReserve: 4,
  ...overrides,
})
const settledTrade = () => openTrade({ counterpartyOffer: { currency: 1, items: [{ itemId: 'ore', quantity: 1 }] }, revision: 2, status: 'settled' })
const store = (outcome = 'written') => ({
  createEscrowTrade: async (input) => ({ outcome, trade: openTrade({ id: input.tradeId }) }),
  getEscrowTradeForActor: async () => ({ outcome, trade: openTrade() }),
  acceptEscrowTrade: async () => ({ outcome, trade: settledTrade() }),
  cancelEscrowTrade: async () => ({ outcome, trade: openTrade({ status: 'cancelled', counterpartyOffer: { currency: 1, items: [{ itemId: 'ore', quantity: 1 }] }, revision: 2 }) }),
})
const api = (options = {}) => createTradeEscrowHandlers({ backend: 'postgres', store: store(), now: () => 10, uuid: () => 'trade-1', knownItemIds: ['wood', 'ore'], ...options })

describe('trade escrow API adapter', () => {
  it('uses authenticated actor and a server-derived canonical digest', async () => {
    const calls = []; const s = store(); s.createEscrowTrade = async (input) => { calls.push(input); return { outcome: 'idempotent', trade: openTrade({ id: input.tradeId }) } }
    const result = await api({ store: s }).create({ userId: 'owner' }, body)
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ trade: { id: 'trade-1', proposerId: 'owner' }, idempotent: true })
    expect(calls[0]).toMatchObject({ actorId: 'owner', tradeId: 'trade-1', now: 10 })
    expect(calls[0].requestDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(calls[0].requestDigest).not.toBe('client-forged-digest')
  })

  it('rejects unauthenticated, non-postgres, forged ownership, and caller-authored digests', async () => {
    expect((await api().create({}, body)).status).toBe(401)
    expect((await api({ backend: 'json-file' }).create({ userId: 'owner' }, body)).body.code).toBe('TRADE_REQUIRES_POSTGRES')
    expect((await api().create({ userId: 'owner' }, { ...body, userId: 'victim' })).status).toBe(400)
    expect((await api().create({ userId: 'owner' }, { ...body, requestDigest: 'client-forged-digest' })).status).toBe(400)
  })

  it('maps authorization and state failures without ledger disclosure', async () => {
    for (const [outcome, status] of [['not_found', 404], ['forbidden', 403], ['conflict', 409], ['expired', 410]]) {
      const handlers = api({ store: store(outcome) })
      expect((await handlers.get({ userId: 'owner' }, 'trade-1')).status).toBe(status)
    }
    const accepted = await api().accept({ userId: 'other' }, 'trade-1', { counterpartyOffer: { currency: 1, items: [{ itemId: 'ore', quantity: 1 }] }, expectedInventoryRevision: 2, expectedTradeRevision: 1, idempotencyKey: 'key' })
    expect(accepted.body.trade.status).toBe('settled')
    expect(await api().cancel({ userId: 'owner' }, 'trade-1', { expectedTradeRevision: 1, idempotencyKey: 'key' })).toMatchObject({ status: 200 })
  })

  it('whitelists public success fields and fails closed for poisoned store rows', async () => {
    const leaking = store(); leaking.createEscrowTrade = async () => ({ outcome: 'written', trade: { ...openTrade(), ledger: { currency: 999 }, idempotencyKey: 'secret' } })
    expect((await api({ store: leaking }).create({ userId: 'owner' }, body)).body.code).toBe('TRADE_SERVICE_UNAVAILABLE')
    const good = await api().create({ userId: 'owner' }, body)
    expect(Object.keys(good.body.trade).sort()).toEqual(['counterpartyId', 'counterpartyOffer', 'expiresAt', 'id', 'proposerId', 'proposerOffer', 'revision', 'status'])
    expect(good.body.trade).not.toHaveProperty('proposerInventoryRevisionAfterReserve')
  })

  it('captures one clock value, validates UUIDs, and sanitizes dependency failures', async () => {
    const calls = []; const changing = api({ now: (() => { let tick = 0; return () => (++tick === 1 ? 10 : 30) })(), store: { ...store(), createEscrowTrade: async (input) => { calls.push(input); return { outcome: 'written', trade: openTrade({ id: input.tradeId }) } } } })
    expect((await changing.create({ userId: 'owner' }, body)).status).toBe(201)
    expect(calls).toHaveLength(1)
    expect(calls[0].now).toBe(10)
    expect((await api({ uuid: () => '../bad' }).create({ userId: 'owner' }, body)).status).toBe(503)
    expect((await api({ now: () => { throw new Error('clock') } }).create({ userId: 'owner' }, body)).body.code).toBe('TRADE_SERVICE_UNAVAILABLE')
    const thrownStore = await api({ store: { ...store(), createEscrowTrade: async () => { throw new Error('db detail') } } }).create({ userId: 'owner' }, body)
    expect(thrownStore).toEqual(expect.objectContaining({ status: 503 }))
    expect((await api({ store: { ...store(), createEscrowTrade: async () => ({ outcome: 'written' }) } }).create({ userId: 'owner' }, body)).body.code).toBe('TRADE_SERVICE_UNAVAILABLE')
  })

  it('passes a server digest to the store and maps durable replay mismatch to conflict', async () => {
    const s = store(); s.acceptEscrowTrade = async (input) => ({ outcome: input.requestDigest.length === 64 ? 'idempotency_mismatch' : 'written', trade: settledTrade() })
    const result = await api({ store: s }).accept({ userId: 'other' }, 'trade-1', { counterpartyOffer: { currency: 1, items: [{ itemId: 'ore', quantity: 1 }] }, expectedInventoryRevision: 2, expectedTradeRevision: 1, idempotencyKey: 'same-key' })
    expect(result).toMatchObject({ status: 409, body: { code: 'TRADE_CONFLICT' } })
  })
})
