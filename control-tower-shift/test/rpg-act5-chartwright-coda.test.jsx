// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import ControlTowerRPG from '../src/ControlTowerRPG.jsx'
import { createInitialState } from '../src/rpg/state.js'
import { saveRPG } from '../src/rpg/save.js'
import { rpgMapById, rpgSpawnById } from '../src/rpg/registry.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

function resolvedActFiveState(flags) {
  const initial = createInitialState()
  const map = rpgMapById('accord-overlook')
  const spawn = rpgSpawnById('accord-overlook', 'epilogue')
  return {
    ...initial,
    status: 'ending',
    mainQuestId: 'mq-act5-last-name',
    protagonist: { ...initial.protagonist, activePatronId: 'apollo', unlockedPatronIds: ['apollo'] },
    quests: {
      ...initial.quests,
      'mq-act5-last-name': { state: 'completed', objectiveIndex: 10, objectiveCounts: {} },
    },
    flags: { 'act5-regent-testimony-heard': true, ...flags },
    world: { regionId: map.region, mapId: map.id, spawnId: spawn.id, position: { x: spawn.x, y: spawn.y }, facing: 0 },
  }
}

async function mount(state) {
  expect(saveRPG(window.localStorage, state)).toBe(true)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  await act(async () => root.render(<ControlTowerRPG />))
  await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Continue').click())
}

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove()
  root = container = null
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('Act V Chartwright resolution coda', () => {
  it('renders the resolved public-ledge witness exactly once after the Act V testimony/accord boundary and survives reload', async () => {
    const state = resolvedActFiveState({
      'act2-chartwright-publication-model': 'public-ledge',
      'act2-published-route-first-copy': 'ledge',
      'act5-accord-choice': 'mortal-witness',
    })
    await mount(state)
    expect(container.querySelectorAll('[data-testid="act5-chartwright-resolution"]')).toHaveLength(1)
    expect(container.textContent).toContain('The ledge line traveled')
    expect(container.textContent).toContain('Local consent means the southern copies')

    await act(async () => root.unmount())
    container.remove()
    root = container = null
    await mount(state)
    expect(container.querySelectorAll('[data-testid="act5-chartwright-resolution"]')).toHaveLength(1)
    expect(container.textContent).toContain('The ledge line traveled')
  })

  it('uses the neutral witness and migrated act5-ending coda when Act II flags are absent', async () => {
    await mount(resolvedActFiveState({ 'act5-ending': 'renewed-compact' }))
    expect(container.textContent).toContain('No publication model was ever settled')
    expect(container.textContent).toContain('An accord of many signatures, signed beside a decision unwritten')
  })

  it('does not project a coda before the required Regent testimony', async () => {
    await mount(resolvedActFiveState({
      'act2-chartwright-publication-model': 'public-ledge',
      'act2-published-route-first-copy': 'ledge',
      'act5-accord-choice': 'bounded-patrons',
      'act5-regent-testimony-heard': false,
    }))
    expect(container.querySelector('[data-testid="act5-chartwright-resolution"]')).toBeNull()
  })
})
