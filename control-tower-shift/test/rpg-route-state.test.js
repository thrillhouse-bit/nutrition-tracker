import { afterEach, describe, expect, it, vi } from 'vitest'
import { routeStateForMap } from '../src/rpg/routeState.js'

describe('canonical dynamic route state', () => {
  afterEach(() => {
    vi.doUnmock('../src/rpg/registry.js')
    vi.resetModules()
  })

  it('makes physical access use the active tide rather than the route-state-free fallback', async () => {
    const map = {
      id: 'route-state-bank-fixture', act: 2, bounds: { w: 320, h: 320 },
      entities: [{ id: 'tide-bank', kind: 'bank', x: 100, y: 260 }],
      collisions: [{ x: 72, y: 0, w: 16, h: 284 }],
      // With no route state a path can use the lower gap. At ebb the two
      // legal lane segments terminate on opposite sides of the barrier.
      traversalLanes: [
        { id: 'ebb-west', width: 40, stateIds: ['ebb'], points: [{ x: 20, y: 260 }, { x: 64, y: 260 }] },
        { id: 'ebb-east', width: 40, stateIds: ['ebb'], points: [{ x: 96, y: 260 }, { x: 280, y: 260 }] },
      ],
    }
    const state = { flags: { 'act2:tide-state': 'ebb' } }
    const position = { x: 50, y: 260 }
    expect(routeStateForMap(state, map)).toBe('ebb')

    vi.resetModules()
    vi.doMock('../src/rpg/registry.js', () => ({ REGISTERED_MAPS: { [map.id]: map } }))
    const { physicalSystemAccessDecision } = await import('../src/rpg/systemAccess.js')
    expect(physicalSystemAccessDecision({ mapId: map.id, position, entityId: 'tide-bank', kind: 'bank' })).toMatchObject({ available: true })
    expect(physicalSystemAccessDecision({
      mapId: map.id,
      position,
      entityId: 'tide-bank',
      kind: 'bank',
      routeStateId: routeStateForMap(state, map),
    })).toMatchObject({ available: false, reason: 'No clear path reaches this system object.' })
  })

  it('uses valid deterministic defaults for later route systems', () => {
    expect(routeStateForMap({}, { act: 3, season: { initialStateId: 'harvest' } })).toBe('harvest')
    expect(routeStateForMap({}, { act: 4, pressure: { initialStateId: 'venting' } })).toBe('venting')
  })

  it('rejects corrupt Act III and IV route-state flags instead of failing open', () => {
    expect(routeStateForMap({ flags: { 'act3:season-state': 'untrusted' } }, { act: 3, season: { initialStateId: 'winter' } })).toBe('winter')
    expect(routeStateForMap({ flags: { 'act4:pressure-state': 'untrusted' } }, { act: 4, pressure: { initialStateId: 'safe' } })).toBe('safe')
  })
})
