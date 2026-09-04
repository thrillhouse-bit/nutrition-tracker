// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const renderSpies = vi.hoisted(() => ({
  world: vi.fn(),
  combat: vi.fn(),
  observe: vi.fn(),
}))

vi.mock('../src/rpg/world.js', async (importOriginal) => ({
  ...(await importOriginal()),
  drawWorld: renderSpies.world,
}))

vi.mock('../src/renderer.js', async (importOriginal) => ({
  ...(await importOriginal()),
  draw: renderSpies.combat,
  observeFx: renderSpies.observe,
}))

import ControlTowerRPG, {
  canvasBackingPolicy,
  combatCanvasShouldAnimate,
  worldCanvasShouldAnimate,
} from '../src/ControlTowerRPG.jsx'
import { applyEvent, createInitialState } from '../src/rpg/state.js'
import { rpgMapById } from '../src/rpg/registry.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { saveRPG } from '../src/rpg/save.js'
import { moveAlongWorldPath } from './helpers/legalMovement.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let viewport
let now
let nextRafId
let rafCallbacks
let resizeObservers

const canvasContext = {
  setTransform() {}, clearRect() {}, save() {}, restore() {}, scale() {}, translate() {},
}

function rectForViewport() {
  return {
    x: 0, y: 0, left: 0, top: 0,
    right: viewport.width, bottom: viewport.height,
    width: viewport.width, height: viewport.height,
    toJSON() {},
  }
}

async function advanceFrames(count, elapsed = 34) {
  await act(async () => {
    for (let index = 0; index < count; index += 1) {
      now += elapsed
      const callbacks = [...rafCallbacks.values()]
      rafCallbacks.clear()
      for (const callback of callbacks) callback(now)
    }
  })
}

async function mount(state = null) {
  if (state) expect(saveRPG(window.localStorage, state)).toBe(true)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<ControlTowerRPG />))
  const label = state ? 'Continue' : 'New Story'
  const start = [...container.querySelectorAll('button')].find((button) => button.textContent === label)
  await act(async () => start.click())
}

async function unmount() {
  if (root) await act(async () => root.unmount())
  if (container) document.body.removeChild(container)
  root = container = null
}

function combatReadyState() {
  let state = createInitialState()
  const map = rpgMapById('beacon-overlook')
  const thessa = map.entities.find((entity) => entity.id === 'thessa')
  const thessaPath = findWorldPath(map, state.world.position, thessa)
  expect(thessaPath.length).toBeGreaterThan(0)
  state = moveAlongWorldPath(state, thessa)
  state = applyEvent(state, { type: 'TALK', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })
  state = applyEvent(state, { type: 'DIALOGUE_END', conversationId: 'act1-thessa-overlook' })
  const shrine = rpgMapById('beacon-overlook').entities.find((entity) => entity.id === 'shrine')
  const shrinePath = findWorldPath(map, state.world.position, shrine)
  expect(shrinePath.length).toBeGreaterThan(0)
  state = moveAlongWorldPath(state, shrine)
  state = applyEvent(state, { type: 'INTERACT', entityId: 'shrine' })
  state = applyEvent(state, { type: 'CHOOSE_PATRON', godId: 'apollo' })
  const exit = rpgMapById('beacon-overlook').exits.find((candidate) => candidate.id === 'to-olive-road')
  const exitPath = findWorldPath(map, state.world.position, exit)
  expect(exitPath.length).toBeGreaterThan(0)
  state = moveAlongWorldPath(state, exit)
  state = applyEvent(state, { type: 'TRAVERSE', viaGate: 'to-olive-road', toMapId: 'olive-road', spawnId: 'from-beacon' })
  const gate = rpgMapById('olive-road').exits.find((exit) => exit.kind === 'combat')
  return moveAlongWorldPath(state, gate, { facing: 1 })
}

beforeEach(() => {
  viewport = { width: 390, height: 844 }
  now = 1_000
  nextRafId = 1
  rafCallbacks = new Map()
  resizeObservers = []
  renderSpies.world.mockClear()
  renderSpies.combat.mockClear()
  renderSpies.observe.mockClear()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = nextRafId++
    rafCallbacks.set(id, callback)
    return id
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { rafCallbacks.delete(id) })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(rectForViewport)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext)
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 })
  class MockResizeObserver {
    constructor(callback) {
      this.callback = callback
      this.target = null
      this.disconnected = false
      resizeObservers.push(this)
    }
    observe(target) { this.target = target }
    disconnect() { this.disconnected = true }
  }
  vi.stubGlobal('ResizeObserver', MockResizeObserver)
})

afterEach(async () => {
  await unmount()
  window.localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('canvas performance policy', () => {
  it('caps DPR3 mobile backing while leaving DPR1 desktop dimensions unchanged', () => {
    expect(canvasBackingPolicy({ cssWidth: 390, cssHeight: 844, devicePixelRatio: 3 })).toMatchObject({
      cssWidth: 390, cssHeight: 844, scale: 2, width: 780, height: 1688,
    })
    expect(canvasBackingPolicy({ cssWidth: 960, cssHeight: 540, devicePixelRatio: 1 })).toMatchObject({
      cssWidth: 960, cssHeight: 540, scale: 1, width: 960, height: 540,
    })
    const largeDisplay = canvasBackingPolicy({ cssWidth: 4000, cssHeight: 3000, devicePixelRatio: 2 })
    expect(largeDisplay.width * largeDisplay.height).toBeLessThanOrEqual(2_500_000)
  })

  it('keeps CSS layout dimensions separate and deduplicates backing resizes', async () => {
    await mount()
    const canvas = container.querySelector('canvas[aria-description]')
    expect(canvas.getBoundingClientRect()).toMatchObject({ width: 390, height: 844 })
    expect({ width: canvas.width, height: canvas.height }).toEqual({ width: 780, height: 1688 })

    const worldObserver = resizeObservers.find((observer) => observer.target === canvas)
    expect(worldObserver).toBeTruthy()
    const before = renderSpies.world.mock.calls.length
    viewport = { width: 420, height: 840 }
    await act(async () => window.dispatchEvent(new Event('resize')))
    expect({ width: canvas.width, height: canvas.height }).toEqual({ width: 840, height: 1680 })
    expect(renderSpies.world).toHaveBeenCalledTimes(before + 1)
    await act(async () => worldObserver.callback([]))
    expect(renderSpies.world).toHaveBeenCalledTimes(before + 1)
  })

  it('draws active world frames, freezes on pause, and safely restarts on resume', async () => {
    await mount()
    const initial = renderSpies.world.mock.calls.length
    await advanceFrames(8)
    expect(renderSpies.world.mock.calls.length).toBeGreaterThan(initial)

    const pause = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Pause')
    await act(async () => pause.click())
    const frozen = renderSpies.world.mock.calls.length
    await advanceFrames(20)
    expect(renderSpies.world).toHaveBeenCalledTimes(frozen)

    const resume = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Resume')
    await act(async () => resume.click())
    const restarted = renderSpies.world.mock.calls.length
    await advanceFrames(5)
    expect(renderSpies.world.mock.calls.length).toBeGreaterThan(restarted)

    await unmount()
    expect(rafCallbacks.size).toBe(0)
    expect(resizeObservers.every((observer) => observer.disconnected)).toBe(true)
  })

  it('classifies every non-animating world overlay and settled combat as frozen', () => {
    const base = {
      started: true, status: 'playing', paused: false, dialogue: null, shrineOpen: false,
      choicePrompt: null, panelOpen: null, skillAction: null, combatEnd: null,
    }
    expect(worldCanvasShouldAnimate(base)).toBe(true)
    for (const frozen of [
      { paused: true }, { dialogue: {} }, { shrineOpen: true }, { choicePrompt: {} },
      { panelOpen: 'skills' }, { skillAction: {} }, { combatEnd: {} }, { status: 'ending' },
    ]) expect(worldCanvasShouldAnimate({ ...base, ...frozen }), JSON.stringify(frozen)).toBe(false)

    const session = { settled: false }
    expect(combatCanvasShouldAnimate({ status: 'in-combat', session, paused: false, combatEnd: null })).toBe(true)
    expect(combatCanvasShouldAnimate({ status: 'in-combat', session: { settled: true }, paused: false, combatEnd: null })).toBe(false)
    expect(combatCanvasShouldAnimate({ status: 'in-combat', session, paused: true, combatEnd: null })).toBe(false)
    expect(combatCanvasShouldAnimate({ status: 'playing', session, paused: false, combatEnd: null })).toBe(false)
  })

  it('repaints live combat, freezes it on pause, and resumes without duplicate loops', async () => {
    await mount(combatReadyState())
    const interact = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Interact')
    await act(async () => interact.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    expect(container.querySelector('[aria-label="Combat controls"]')).not.toBeNull()

    const initial = renderSpies.combat.mock.calls.length
    await advanceFrames(6, 17)
    expect(renderSpies.combat.mock.calls.length).toBeGreaterThan(initial)

    const pause = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Pause')
    await act(async () => pause.click())
    const frozen = renderSpies.combat.mock.calls.length
    await advanceFrames(20, 17)
    expect(renderSpies.combat).toHaveBeenCalledTimes(frozen)

    const resume = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Resume')
    await act(async () => resume.click())
    const restarted = renderSpies.combat.mock.calls.length
    await advanceFrames(5, 17)
    expect(renderSpies.combat.mock.calls.length).toBeGreaterThan(restarted)
  })
})
