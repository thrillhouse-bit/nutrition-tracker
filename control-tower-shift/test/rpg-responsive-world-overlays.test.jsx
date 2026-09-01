// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import ControlTowerRPG from '../src/ControlTowerRPG.jsx'
import { createInitialState } from '../src/rpg/state.js'
import { saveRPG } from '../src/rpg/save.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let viewport

function rectForViewport() {
  return {
    x: 0, y: 0, left: 0, top: 0,
    right: viewport.width, bottom: viewport.height,
    width: viewport.width, height: viewport.height,
    toJSON() {},
  }
}

async function waitForFrames(duration = 60) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, duration)) })
}

async function unmountRPG() {
  if (root) await act(async () => root.unmount())
  if (container) document.body.removeChild(container)
  root = container = null
}

async function mountAt(position) {
  const initial = createInitialState()
  const state = {
    ...initial,
    world: { ...initial.world, position, facing: 0 },
  }
  expect(saveRPG(window.localStorage, state)).toBe(true)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<ControlTowerRPG />))
  const continueButton = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Continue')
  await act(async () => continueButton.click())
  await waitForFrames()
}

beforeEach(() => {
  viewport = { width: 390, height: 844 }
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(rectForViewport)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

afterEach(async () => {
  await unmountRPG()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('responsive world overlays', () => {
  it('aligns and culls semantic targets with the live portrait camera', async () => {
    await mountAt({ x: 160, y: 400 })

    const treatyStone = container.querySelector('button[aria-label="Examine the broken stone"]')
    const wildThyme = container.querySelector('button[aria-label="Gather wild thyme"]')
    const copperSeam = container.querySelector('button[aria-label="Mine the copper seam"]')
    expect(treatyStone.hidden).toBe(true)
    expect(copperSeam.hidden).toBe(true)
    expect(wildThyme.hidden).toBe(false)
    expect(Number.parseFloat(wildThyme.style.left)).toBeCloseTo(316.9, 1)

    // Pan the saved camera to the far side: the same copper seam becomes a
    // correctly aligned target instead of retaining its raw 960px position.
    await unmountRPG()
    window.localStorage.clear()
    await mountAt({ x: 800, y: 400 })
    const pannedCopper = container.querySelector('button[aria-label="Mine the copper seam"]')
    expect(pannedCopper.hidden).toBe(false)
    expect(Number.parseFloat(pannedCopper.style.left)).toBeCloseTo(163.7, 1)
  })

  it('keeps desktop DOM targets on the same coordinates as painted geometry', async () => {
    viewport = { width: 960, height: 540 }
    await mountAt({ x: 160, y: 400 })
    const treatyStone = container.querySelector('button[aria-label="Examine the broken stone"]')
    expect(treatyStone.hidden).toBe(false)
    expect(Number.parseFloat(treatyStone.style.left)).toBeCloseTo(430)
    expect(Number.parseFloat(treatyStone.style.top)).toBeCloseTo(268)
    // Authored accessibleLabel remains authoritative over visible/fallback text.
    expect(container.querySelector('button[aria-label="Treaty Stone"]')).toBeNull()
  })

  it('clears a held W key on blur so resume cannot continue stale movement', async () => {
    await mountAt({ x: 160, y: 400 })
    const canvas = container.querySelector('canvas[aria-description]')

    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' })))
    await waitForFrames(180)
    expect(Number(canvas.dataset.playerY)).toBeLessThan(400)

    await act(async () => window.dispatchEvent(new Event('blur')))
    const resume = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Resume')
    expect(resume).toBeTruthy()
    await act(async () => resume.click())
    await waitForFrames(40)
    const resumedY = Number(canvas.dataset.playerY)
    await waitForFrames(180)
    expect(Number(canvas.dataset.playerY)).toBe(resumedY)
  })
})
