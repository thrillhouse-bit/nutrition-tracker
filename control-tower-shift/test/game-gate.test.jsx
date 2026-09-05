// @vitest-environment jsdom
// Keep routing behavior separate from the canvas/animation harness. The gate
// owns hash state; the lazy game chunks are covered by their own render tests.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../src/ControlTowerShift.jsx', () => ({ default: () => <div data-testid="arena">arena</div> }))
vi.mock('../src/RPGAccountGate.jsx', () => ({ default: () => <div data-testid="rpg">rpg</div> }))

const { default: GameGate, GAME_HASH, RPG_HASH, routeFor } = await import('../src/GameGate.jsx')
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container; let root
async function mount(node) {
  container = document.createElement('div'); document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(node); await Promise.resolve() })
}
beforeEach(() => { window.location.hash = '' })
afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove(); container = root = null; window.location.hash = ''
})

describe('GameGate hash routing', () => {
  it('keeps the app visible without an exact game hash', async () => {
    await mount(<GameGate app={<div data-testid="the-app">app</div>} />)
    expect(container.querySelector('[data-testid="the-app"]')).toBeTruthy()
    expect(routeFor('#control-tower-extra')).toBeNull()
  })

  it('switches to the exact arena hash and returns on hashchange', async () => {
    window.location.hash = GAME_HASH
    await mount(<GameGate app={<div data-testid="the-app">app</div>} />)
    expect(container.querySelector('[data-testid="arena"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="the-app"]')).toBeNull()
    await act(async () => { window.location.hash = ''; window.dispatchEvent(new Event('hashchange')) })
    expect(container.querySelector('[data-testid="the-app"]')).toBeTruthy()
  })

  it('does not conflate the RPG route with the arena', () => {
    expect(routeFor(GAME_HASH)).toBe('arena')
    expect(routeFor(RPG_HASH)).toBe('rpg')
  })
})
