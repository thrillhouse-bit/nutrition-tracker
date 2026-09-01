import { describe, it, expect, beforeEach } from 'vitest'
import {
  addToQueue,
  removeFromQueue,
  pendingEntry,
  enqueue,
  dequeue,
  getQueue,
} from '../src/lib/outbox.js'

// Minimal localStorage mock for the storage-backed functions.
beforeEach(() => {
  const store = {}
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v)
    },
    removeItem: (k) => {
      delete store[k]
    },
  }
})

describe('outbox pure helpers', () => {
  it('adds and removes by clientId', () => {
    let q = []
    q = addToQueue(q, { clientId: 'a' })
    q = addToQueue(q, { clientId: 'b' })
    expect(q.map((i) => i.clientId)).toEqual(['a', 'b'])
    q = removeFromQueue(q, 'a')
    expect(q.map((i) => i.clientId)).toEqual(['b'])
  })

  it('projects an outbox item into a renderable pending entry', () => {
    const e = pendingEntry({
      clientId: 'x',
      food: { name: 'Oats', calories: 150 },
      payload: { servings_consumed: 2, meal: 'breakfast', logged_at: '2026-08-24T12:00:00Z' },
    })
    expect(e).toMatchObject({ id: 'x', servings_consumed: 2, meal: 'breakfast', _pending: true })
    expect(e.food.name).toBe('Oats')
  })
})

describe('outbox storage round-trip', () => {
  it('enqueues, reads back, and dequeues within one account', () => {
    enqueue(7, { clientId: 'a', ownerUserId: 7, payload: {}, food: {} })
    enqueue(7, { clientId: 'b', ownerUserId: 7, payload: {}, food: {} })
    expect(getQueue(7).map((i) => i.clientId)).toEqual(['a', 'b'])
    dequeue(7, 'a')
    expect(getQueue(7).map((i) => i.clientId)).toEqual(['b'])
  })

  it('never exposes one account queue to another account', () => {
    enqueue(7, { clientId: 'private-a', ownerUserId: 7, payload: {}, food: {} })
    enqueue(8, { clientId: 'private-b', ownerUserId: 8, payload: {}, food: {} })
    expect(getQueue(7).map((i) => i.clientId)).toEqual(['private-a'])
    expect(getQueue(8).map((i) => i.clientId)).toEqual(['private-b'])
  })

  it('returns an empty queue when account storage is corrupt', () => {
    globalThis.localStorage.setItem('nt_outbox_v2:user:7', 'not json')
    expect(getQueue(7)).toEqual([])
  })

  it('requires an authenticated user id', () => {
    expect(() => getQueue()).toThrow(/authenticated user id/i)
  })
})
