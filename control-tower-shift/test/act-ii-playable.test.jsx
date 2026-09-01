// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import ControlTowerRPG from '../src/ControlTowerRPG.jsx'
import { applyEvent, createInitialState } from '../src/rpg/state.js'
import { questDefById } from '../src/rpg/content.js'
import { loadRPG, saveRPG } from '../src/rpg/save.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

async function mountRPG(state) {
  expect(saveRPG(window.localStorage, state)).toBe(true)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<ControlTowerRPG />))
  await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Continue').click())
}

function act2State(objectiveIndex, mapId, position) {
  let state = createInitialState()
  state = {
    ...state,
    status: 'ending',
    protagonist: { ...state.protagonist, activePatronId: 'apollo', unlockedPatronIds: ['apollo'] },
    quests: {
      ...state.quests,
      'mq-act1-ash-at-dawn': {
        ...state.quests['mq-act1-ash-at-dawn'],
        state: 'completed',
        objectiveIndex: questDefById('mq-act1-ash-at-dawn').objectives.length,
      },
    },
    inventory: { ...state.inventory, epithetFragments: ['far-sighted'] },
  }
  state = applyEvent(state, { type: 'BEGIN_ACT', act: 2 })
  return {
    ...state,
    world: {
      ...state.world,
      regionId: 'pelagos-isles',
      mapId,
      spawnId: mapId === 'nereid-caves' ? 'threshold' : 'post-covenant',
      position,
      facing: 1,
    },
    quests: {
      ...state.quests,
      'mq-act2-salt-covenant': { ...state.quests['mq-act2-salt-covenant'], objectiveIndex },
    },
  }
}

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  if (container) document.body.removeChild(container)
  container = root = null
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('Act II playable world hooks', () => {
  it('keeps the First Surge witness and breakwater defense independently pointer-clickable', async () => {
    const staged = act2State(1, 'breakwater-road', { x: 478, y: 258 })
    staged.world.spawnId = 'surge-witness'
    await mountRPG(staged)
    const witness = container.querySelector('button[aria-label="Witness the tide change"]')
    const defend = container.querySelector('button[aria-label="Defend the crossing"]')
    expect(witness).not.toBeNull()
    expect(defend).not.toBeNull()
    expect(Math.hypot(
      Number(witness.dataset.worldX) - Number(defend.dataset.worldX),
      Number(witness.dataset.worldY) - Number(defend.dataset.worldY),
    )).toBeGreaterThanOrEqual(48)

    await act(async () => witness.click())
    expect(container.querySelector('[aria-label="Combat controls"]')).toBeNull()
    expect(container.textContent).toContain('Clear the caves and release the three named witnesses')
  })

  it('launches the separated breakwater defense activator without consuming the Witness objective', async () => {
    const staged = act2State(1, 'breakwater-road', { x: 560, y: 314 })
    staged.world.spawnId = 'surge-witness'
    await mountRPG(staged)
    const defend = container.querySelector('button[aria-label="Defend the crossing"]')
    expect(defend).not.toBeNull()
    await act(async () => defend.click())
    expect(container.querySelector('[aria-label="Combat controls"]')).not.toBeNull()
    expect(container.textContent).toContain('Begin encounter')
    expect(container.textContent).toContain('Breakwater Road')
  })

  it('paths from the Ebb post-combat return spawn to a tide well and cycles it', async () => {
    let now = 1_000
    let nextRafId = 1
    const rafCallbacks = new Map()
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextRafId++
      rafCallbacks.set(id, callback)
      return id
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { rafCallbacks.delete(id) })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    let returned = act2State(1, 'breakwater-road', { x: 560, y: 314 })
    returned = applyEvent(returned, { type: 'ENTER_ENCOUNTER', encounterId: 'enc-act2-breakwater' })
    returned = applyEvent(returned, { type: 'COMBAT_WON', encounterId: 'enc-act2-breakwater' })
    expect(returned.world).toMatchObject({ mapId: 'breakwater-road', spawnId: 'from-caves', position: { x: 886, y: 250 } })
    expect(returned.flags['act2:tide-state']).toBe('ebb')
    await mountRPG(returned)

    const caveWell = container.querySelector('button[aria-label="Turn the tide toward the caves"]')
    expect(caveWell).not.toBeNull()
    await act(async () => caveWell.click())
    expect(container.textContent).not.toContain('No clear path to that point.')

    await act(async () => {
      for (let index = 0; index < 90; index += 1) {
        now += 34
        const callbacks = [...rafCallbacks.values()]
        rafCallbacks.clear()
        for (const callback of callbacks) callback(now)
      }
    })
    expect(container.textContent).toContain('Crossing — both lanes passable')
    expect(container.textContent).not.toContain('No clear path to that point.')
  })

  it('launches the authored cave encounter from its visible world activator', async () => {
    await mountRPG(act2State(2, 'nereid-caves', { x: 216, y: 284 }))
    const interact = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Interact')
    await act(async () => interact.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    expect(container.querySelector('[aria-label="Combat controls"]')).not.toBeNull()
    expect(container.textContent).toContain('Nereid Caves')
  })

  it('uses one honest skiff affordance and traverses to the archive barge', async () => {
    const staged = act2State(5, 'storm-anchorage', { x: 866, y: 402 })
    staged.world = { ...staged.world, spawnId: 'from-barge' }
    staged.flags = { ...staged.flags, 'act2-anchorage-cleared': true }
    await mountRPG(staged)

    const skiffTargets = container.querySelectorAll('button[aria-label="Take the skiff to the barge"]')
    expect(skiffTargets).toHaveLength(1)
    expect(container.querySelector('button[aria-label="Archive Skiff Dock"]')).toBeNull()

    await act(async () => skiffTargets[0].click())
    await act(async () => { await Promise.resolve() })
    expect(loadRPG(window.localStorage).save.world).toMatchObject({
      mapId: 'archive-barge-deck',
      spawnId: 'from-anchorage',
    })
  })

  it('accepts the optional Unmoored Heart loop from its authored echo', async () => {
    await mountRPG(act2State(3, 'nereid-caves', { x: 414, y: 414 }))
    const interact = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Interact')
    await act(async () => interact.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    await act(async () => { await Promise.resolve() })
    const { save } = loadRPG(window.localStorage)
    expect(save.quests['sq-act2-unmoored-heart']).toMatchObject({ state: 'active', objectiveIndex: 0 })
  })

  it('offers and persists an explicit covenant-ratification choice', async () => {
    await mountRPG(act2State(7, 'pelagos-harbor', { x: 442, y: 246 }))
    const interact = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Interact')
    await act(async () => interact.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    const shared = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Shared crossing')
    expect(shared).toBeTruthy()
    await act(async () => shared.click())
    await act(async () => { await Promise.resolve() })
    const { save } = loadRPG(window.localStorage)
    expect(save.flags['choice:ratify-salt-covenant']).toBe('shared-crossing')
    expect(save.quests['mq-act2-salt-covenant'].state).toBe('completed')
  })
})
