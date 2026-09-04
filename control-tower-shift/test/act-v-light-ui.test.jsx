// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import ControlTowerRPG, { act5LightPresentation, routeStateForMap } from '../src/ControlTowerRPG.jsx'
import { ACT5_LIGHT_POLARITY_STATES } from '../src/rpg/act5Content.js'
import { createInitialState } from '../src/rpg/state.js'
import { rpgMapById, rpgSpawnById } from '../src/rpg/registry.js'
import { saveRPG } from '../src/rpg/save.js'
import { drawRuntimeLanes, runtimeLanePresentation } from '../src/rpg/world.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

function act5State(mapId, spawnId, position, lightStateId) {
  const initial = createInitialState()
  const map = rpgMapById(mapId)
  const spawn = rpgSpawnById(mapId, spawnId)
  return {
    ...initial,
    protagonist: { ...initial.protagonist, activePatronId: 'apollo', unlockedPatronIds: ['apollo'] },
    mainQuestId: 'mq-act5-last-name',
    quests: {
      ...initial.quests,
      'mq-act5-last-name': { state: 'active', objectiveIndex: 1, objectiveCounts: {} },
    },
    flags: { 'act5:light-state': lightStateId },
    world: {
      regionId: map.region,
      mapId,
      spawnId: spawn.id,
      position,
      facing: 0,
    },
  }
}

async function mountAt(state) {
  expect(saveRPG(window.localStorage, state)).toBe(true)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<ControlTowerRPG />))
  await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Continue').click())
}

async function clickTarget(accessibleLabel) {
  const button = container.querySelector(`button[aria-label="${accessibleLabel}"]`)
  expect(button).not.toBeNull()
  await act(async () => button.click())
  await act(async () => { await Promise.resolve() })
}

function laneIdsFor(map, stateId) {
  return map.traversalLanes
    .filter((lane) => runtimeLanePresentation(map, lane, stateId).active)
    .map((lane) => lane.id)
}

function recordingLaneContext() {
  const strokes = []
  const context = {
    globalAlpha: 1,
    lineWidth: 1,
    strokeStyle: '',
    currentDash: [],
    save() {},
    restore() {},
    setLineDash(value) { this.currentDash = [...value] },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {
      strokes.push({ dash: [...this.currentDash], lineWidth: this.lineWidth, alpha: this.globalAlpha })
    },
  }
  return { context, strokes }
}

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  if (container) document.body.removeChild(container)
  root = container = null
  window.localStorage.clear()
})

describe('Act V light-polarity shared UI integration', () => {
  it('selects the exact authored Night Stair and False Sky lanes for all three light states', () => {
    const nightStair = rpgMapById('night-stair')
    const falseSky = rpgMapById('false-sky')
    const expectations = {
      shadow: {
        night: ['night-stair-shadow', 'night-stair-transition'],
        sky: ['false-sky-transition', 'false-sky-shadow-recovery'],
      },
      moon: {
        night: ['night-stair-transition', 'night-stair-moon'],
        sky: ['false-sky-moon-arrival', 'false-sky-transition'],
      },
      sun: {
        night: ['night-stair-transition', 'night-stair-sun-recovery'],
        sky: ['false-sky-transition', 'false-sky-sun-road', 'false-sky-apollo-sun-witness', 'false-sky-sun-fractures'],
      },
    }

    for (const [stateId, expected] of Object.entries(expectations)) {
      const state = { ...createInitialState(), flags: { 'act5:light-state': stateId } }
      expect(routeStateForMap(state, nightStair)).toBe(stateId)
      expect(routeStateForMap(state, falseSky)).toBe(stateId)
      expect(laneIdsFor(nightStair, stateId)).toEqual(expected.night)
      expect(laneIdsFor(falseSky, stateId)).toEqual(expected.sky)
      expect(act5LightPresentation(state, nightStair)).toMatchObject(ACT5_LIGHT_POLARITY_STATES[stateId])
    }
  })

  it('keeps active solid/raised lanes structurally distinct from inactive broken/recessed lanes', () => {
    const map = rpgMapById('night-stair')
    const active = runtimeLanePresentation(map, map.traversalLanes.find((lane) => lane.id === 'night-stair-moon'), 'moon')
    const inactive = runtimeLanePresentation(map, map.traversalLanes.find((lane) => lane.id === 'night-stair-shadow'), 'moon')
    expect(active).toMatchObject({ active: true, motif: 'continuous-raised-solid', dash: [] })
    expect(inactive).toMatchObject({ active: false, motif: 'recessed-broken-dashed', dash: [14, 12] })

    const { context, strokes } = recordingLaneContext()
    drawRuntimeLanes(context, map, 'moon')
    expect(strokes.some((stroke) => stroke.dash.length === 0 && stroke.lineWidth === 3)).toBe(true)
    expect(strokes.some((stroke) => stroke.dash.join(',') === '14,12' && stroke.alpha < 1)).toBe(true)
  })

  it('updates the canonical Night Stair HUD glyph and label when Selene changes shadow to moon', async () => {
    const map = rpgMapById('night-stair')
    const controller = map.entities.find((entity) => entity.id === 'selene-witness')
    await mountAt(act5State('night-stair', 'from-foothold', { x: controller.x, y: controller.y }, 'shadow'))

    const shadow = container.querySelector('[data-light-state="shadow"]')
    expect(shadow.dataset.shapeGlyph).toBe('filled-crescent')
    expect(shadow.textContent).toContain('◕')
    expect(shadow.textContent).toContain(ACT5_LIGHT_POLARITY_STATES.shadow.label)
    expect(shadow.getAttribute('aria-label')).toContain(ACT5_LIGHT_POLARITY_STATES.shadow.shapeGlyph)

    await clickTarget(controller.accessibleLabel)
    const moon = container.querySelector('[data-light-state="moon"]')
    expect(moon.dataset.shapeGlyph).toBe('split-disc')
    expect(moon.textContent).toContain('◐')
    expect(moon.textContent).toContain(ACT5_LIGHT_POLARITY_STATES.moon.label)
    expect(container.querySelector('[data-light-state="shadow"]')).toBeNull()
  })

  it('updates the canonical False Sky HUD glyph and label when Helios changes moon to sun', async () => {
    const map = rpgMapById('false-sky')
    const controller = map.entities.find((entity) => entity.id === 'sun-mirror-1')
    await mountAt(act5State('false-sky', 'from-night-stair', { x: controller.x, y: controller.y }, 'moon'))

    expect(container.querySelector('[data-light-state="moon"]')?.dataset.shapeGlyph).toBe('split-disc')
    await clickTarget(controller.accessibleLabel)
    const sun = container.querySelector('[data-light-state="sun"]')
    expect(sun.dataset.shapeGlyph).toBe('rayed-disc')
    expect(sun.textContent).toContain('☀')
    expect(sun.textContent).toContain(ACT5_LIGHT_POLARITY_STATES.sun.label)
  })

  it('preserves Act III season and Act IV pressure route-state behavior', () => {
    const act3 = rpgMapById('winter-orchard')
    const act4 = rpgMapById('bronze-foundry')
    const state = {
      ...createInitialState(),
      flags: { 'act3:season-state': 'harvest', 'act4:pressure-state': 'venting', 'act5:light-state': 'sun' },
    }
    expect(routeStateForMap(state, act3)).toBe('harvest')
    expect(routeStateForMap(state, act4)).toBe('venting')
    expect(runtimeLanePresentation(act3, act3.traversalLanes[0], 'harvest').motif).toBe('legacy-solid')
    expect(runtimeLanePresentation(act4, act4.traversalLanes[0], 'venting').motif).toBe('legacy-solid')
  })
})
