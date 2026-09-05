import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/rpg/state.js'
import { AUTHORITATIVE_LEDGER_KEYS } from '../src/rpg/statePartition.js'
import { composeAuthoritativeState, extractStoryProjection, STORY_PROJECTION_VERSION } from '../src/rpg/storyProjection.js'

const owned = (state) => Object.fromEntries(AUTHORITATIVE_LEDGER_KEYS.map((key) => [key, state[key]]))
const story = () => createInitialState()
const deep = (count) => { let value = true; for (let i = 0; i < count; i += 1) value = { value }; return value }

describe('story projection boundary', () => {
  it('round-trips the real canonical state, strips leases, and freezes a detached canonical copy', () => {
    const input = story(); input.flags['act1-far-sighted-restored'] = true; input.flags['rpg:active-bank-entity'] = 'bank'
    const projection = extractStoryProjection(input)
    expect(projection).toMatchObject({ projectionVersion: STORY_PROJECTION_VERSION, story: { world: { mapId: 'beacon-overlook' } } })
    expect(projection.story.flags['rpg:active-bank-entity']).toBeUndefined()
    input.world.mapId = 'forged'; expect(projection.story.world.mapId).toBe('beacon-overlook')
    const merged = composeAuthoritativeState({ ...projection, storyRevision: 3 }, { inventoryRevision: 7, authoritative: owned(story()) })
    expect(merged.state).toMatchObject({ world: { mapId: 'beacon-overlook' }, inventory: input.inventory, economy: input.economy })
    expect(Object.keys(merged.state).sort()).toEqual(Object.keys(story()).sort())
    expect(Object.isFrozen(projection.story)).toBe(true); expect(Object.isFrozen(merged.state)).toBe(true)
  })

  it('rejects unknown roots, economic aliases, malformed authoritative ownership, aliases, cycles, and bounds', () => {
    expect(extractStoryProjection({ ...story(), unknown: true })).toBeNull()
    for (const smuggled of [
      { flags: { wallet: 99 } }, { flags: { items: [{ itemId: 'ore', quantity: 2 }] } },
      { flags: { balance: 2 } }, { quests: { side: { state: 'active', objectiveIndex: 0, objectiveCounts: { stock: 1 } } } },
      { world: { ...story().world, currency: 1 } },
    ]) expect(extractStoryProjection({ ...story(), ...smuggled })).toBeNull()
    const cyclic = story(); cyclic.flags.self = cyclic.flags; expect(extractStoryProjection(cyclic)).toBeNull()
    const alias = deep(2); expect(extractStoryProjection({ ...story(), flags: { a: alias, b: alias } })).toBeNull()
    expect(extractStoryProjection({ ...story(), flags: { deep: deep(33) } })).toBeNull()
    expect(extractStoryProjection({ ...story(), flags: { long: 'x'.repeat(16_385) } })).toBeNull()
    const projection = extractStoryProjection(story())
    expect(composeAuthoritativeState({ ...projection, storyRevision: 1 }, { inventoryRevision: 1, authoritative: { ...owned(story()), extra: true } })).toBeNull()
  })

  it('fails closed for getters, proxies, hostile prototypes, and invalid revisions', () => {
    const getter = story(); Object.defineProperty(getter.flags, 'trap', { enumerable: true, get: () => { throw new Error('read') } }); expect(extractStoryProjection(getter)).toBeNull()
    expect(extractStoryProjection(Object.assign(Object.create({ polluted: true }), story()))).toBeNull()
    expect(extractStoryProjection(new Proxy(story(), { ownKeys() { throw new Error('ownKeys') } }))).toBeNull()
    expect(extractStoryProjection(new Proxy(story(), { getPrototypeOf() { throw new Error('prototype') } }))).toBeNull()
    const projection = extractStoryProjection(story())
    expect(composeAuthoritativeState({ ...projection, storyRevision: -1 }, { inventoryRevision: 1, authoritative: owned(story()) })).toBeNull()
    expect(composeAuthoritativeState(new Proxy({}, { ownKeys() { throw new Error('ownKeys') } }), {})).toBeNull()
  })

  it('orders keys canonically for stable serialized digests', () => {
    const left = story(); left.flags = { 'act2:tide-state': 'crossing', 'act1-far-sighted-restored': true }
    const right = story(); right.flags = { 'act1-far-sighted-restored': true, 'act2:tide-state': 'crossing' }
    expect(JSON.stringify(extractStoryProjection(left))).toBe(JSON.stringify(extractStoryProjection(right)))
  })

  it('accepts only registered narrative flags and rejects economic/save aliases in any casing or compound form', () => {
    const safe = story()
    safe.flags = {
      'act2:tide-state': 'crossing',
      'objective:mq-act2-salt-covenant:free-nereid-witnesses:nereid-witness-1': true,
      'steward:restored:pelagos-harbor:steward-salt-garden': true,
    }
    expect(extractStoryProjection(safe)).not.toBeNull()

    for (const alias of ['inventoryRevision', 'currencyBonus', 'inventory-capacity', 'balances', 'wallets', 'trade', 'escrow', 'account', 'save', 'ACT2:INVENTORY']) {
      expect(extractStoryProjection({ ...story(), flags: { [alias]: true } }), alias).toBeNull()
    }
    expect(extractStoryProjection({ ...story(), flags: { 'act2:tide-state': 'forged' } })).toBeNull()
    expect(extractStoryProjection({ ...story(), flags: { 'objective:inventory:progress:entity': true } })).toBeNull()
  })

  it('keeps Wayfinding out of story projections and restores only strict ledger-owned discoveries', () => {
    const forged = story()
    forged.wayfinding = {
      discoveries: { 'pelagos-harbor-soundings': { discoveredAtTick: 4 } },
      practices: {},
      shortcuts: { 'shortcut:pelagos-chartwright-hall': true },
    }
    const projection = extractStoryProjection(forged)
    expect(projection?.story.wayfinding).toBeUndefined()
    const ledger = owned(story())
    ledger.wayfinding = forged.wayfinding
    const composed = composeAuthoritativeState({ ...projection, storyRevision: 1 }, { inventoryRevision: 1, authoritative: ledger })
    expect(composed?.state.wayfinding).toEqual(forged.wayfinding)
  })

  it('rejects Wayfinding ownership smuggling and accepts only the exact old empty bootstrap pair', () => {
    const projection = extractStoryProjection(story())
    const ledger = owned(story())
    const nonemptyLegacyStory = { ...projection.story, wayfinding: { discoveries: { 'pelagos-harbor-soundings': { discoveredAtTick: 1 } }, practices: {}, shortcuts: {} } }
    const emptyLegacyStory = { ...projection.story, wayfinding: { discoveries: {}, practices: {}, shortcuts: {} } }
    const oldLedger = Object.fromEntries(Object.entries(ledger).filter(([key]) => key !== 'wayfinding'))

    expect(composeAuthoritativeState({ projectionVersion: STORY_PROJECTION_VERSION, story: nonemptyLegacyStory, storyRevision: 1 }, { inventoryRevision: 1, authoritative: oldLedger })).toBeNull()
    expect(composeAuthoritativeState({ projectionVersion: STORY_PROJECTION_VERSION, story: emptyLegacyStory, storyRevision: 1 }, { inventoryRevision: 1, authoritative: oldLedger })?.state.wayfinding).toEqual({ discoveries: {}, practices: {}, shortcuts: {} })
    expect(composeAuthoritativeState({ ...projection, storyRevision: 1 }, { inventoryRevision: 1, authoritative: { ...ledger, wayfinding: { discoveries: {}, practices: {}, shortcuts: { 'shortcut:pelagos-chartwright-hall': true } } } })).toBeNull()
    expect(composeAuthoritativeState({ projectionVersion: STORY_PROJECTION_VERSION, story: emptyLegacyStory, storyRevision: 1 }, { inventoryRevision: 1, authoritative: ledger })).toBeNull()
  })
})
