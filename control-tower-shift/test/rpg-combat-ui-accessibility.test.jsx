// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { applyEvent, createInitialState } from '../src/rpg/state.js'
import { rpgMapById } from '../src/rpg/registry.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { saveRPG } from '../src/rpg/save.js'
import { moveAlongWorldPath } from './helpers/legalMovement.js'

const combatProbe = vi.hoisted(() => ({ inputs: [] }))

vi.mock('../src/rpg/combatAdapter.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    stepCombat: (session, input) => {
      combatProbe.inputs.push(input)
      return { ...session, arena: { ...session.arena, tick: session.arena.tick + 1 } }
    },
  }
})

const { default: ControlTowerRPG } = await import('../src/ControlTowerRPG.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let now = 1_000
let nextRafId = 1
let rafCallbacks

function entryCourtState() {
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

async function mountCombat() {
  expect(saveRPG(window.localStorage, entryCourtState())).toBe(true)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<ControlTowerRPG />))
  await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Continue').click())
  await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Interact')
    .dispatchEvent(new Event('pointerdown', { bubbles: true })))
}

async function frame() {
  await act(async () => {
    now += 34
    const callbacks = [...rafCallbacks.values()]
    rafCallbacks.clear()
    callbacks.forEach((callback) => callback(now))
  })
}

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove()
  container = root = null
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('combat button accessibility', () => {
  it('accepts native keyboard clicks once, keeps pointer click pairs exact-once, and labels ready-gated controls', async () => {
    rafCallbacks = new Map()
    combatProbe.inputs.length = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextRafId++
      rafCallbacks.set(id, callback)
      return id
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { rafCallbacks.delete(id) })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    await mountCombat()
    const melee = container.querySelector('button[aria-label="Melee attack"]')
    const bow = container.querySelector('button[aria-label="Solar Bow, keyboard K"]')
    expect(melee).not.toBeNull()
    expect(melee.getAttribute('aria-keyshortcuts')).toBe('j')
    expect(bow).not.toBeNull()
    expect(melee.disabled).toBe(true)
    expect(bow.disabled).toBe(true)
    expect(container.querySelector('[aria-label="Encounter ready"]').textContent).toContain('J attack')
    expect(container.querySelector('[aria-label="Encounter ready"]').textContent).toContain('WASD move and aim')

    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Begin encounter').click())
    expect(melee.disabled).toBe(false)
    expect(bow.disabled).toBe(false)

    // detail=0 is the native click shape for Enter/Space activation.
    await act(async () => melee.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })))
    await frame()
    expect(combatProbe.inputs.filter((input) => input.attack).length).toBe(1)

    combatProbe.inputs.length = 0
    await act(async () => {
      melee.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      melee.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    })
    await frame()
    expect(combatProbe.inputs.filter((input) => input.attack).length).toBe(1)

    combatProbe.inputs.length = 0
    await act(async () => bow.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })))
    await frame()
    expect(combatProbe.inputs.filter((input) => input.powerId === 'solarBow').length).toBe(1)
  })
})
