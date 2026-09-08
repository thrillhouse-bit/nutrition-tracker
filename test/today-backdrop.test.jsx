// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import Today from '../src/components/Today.jsx'
import {
  TODAY_BACKDROP_MAX_SOURCE_BYTES,
  TODAY_BACKDROP_MAX_STORED_BYTES,
  TODAY_BACKDROP_SCENES,
  loadTodayBackdrop,
  normalizeTodayBackdrop,
  saveTodayBackdrop,
  validateTodayBackdropFile,
} from '../src/lib/todayBackdrop.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root
let container

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  localStorage.clear()
  vi.restoreAllMocks()
})

const noop = () => {}

async function renderToday(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<Today
      date={new Date()}
      data={{ baseline: { calories: 2000, protein_g: 120, carbs_g: 250 }, signals: {}, hydration: { total_ml: 500, entries: [], preferences: { goal_ml: 2000, unit: 'ml', quick_add_ml: [250, 500, 750] } } }}
      entries={[]}
      loading={false}
      online
      syncing={false}
      pendingCount={0}
      onSync={noop}
      onEditEntry={noop}
      onDeleteEntry={noop}
      onPrevDay={noop}
      onNextDay={noop}
      onToday={noop}
      openAdd={noop}
      onViewLog={noop}
      onChanged={noop}
      userId={77}
      {...props}
    />)
  })
  return container
}

describe('Today backdrop preference', () => {
  it('keeps curated choices account-scoped', () => {
    expect(saveTodayBackdrop(10, { kind: 'scene', scene: 'ridge' })).toBe(true)
    expect(saveTodayBackdrop(11, { kind: 'scene', scene: 'dawn' })).toBe(true)
    expect(loadTodayBackdrop(10)).toEqual({ kind: 'scene', scene: 'ridge' })
    expect(loadTodayBackdrop(11)).toEqual({ kind: 'scene', scene: 'dawn' })
  })

  it('validates type, empty files, and the 10 MB source cap before decoding', () => {
    expect(validateTodayBackdropFile(new File([], 'empty.jpg', { type: 'image/jpeg' }))).toMatch(/not empty/i)
    expect(validateTodayBackdropFile(new File(['text'], 'notes.txt', { type: 'text/plain' }))).toMatch(/not supported/i)
    expect(validateTodayBackdropFile({ name: 'huge.jpg', type: 'image/jpeg', size: TODAY_BACKDROP_MAX_SOURCE_BYTES + 1 })).toMatch(/larger than 10 MB/i)
    expect(validateTodayBackdropFile(new File(['ok'], 'photo.webp', { type: 'image/webp' }))).toBe('')
  })

  it('rejects a prepared photo that would exceed the 2 MB device-storage cap', () => {
    const oversized = `data:image/webp;base64,${'a'.repeat(TODAY_BACKDROP_MAX_STORED_BYTES)}`
    expect(normalizeTodayBackdrop({ kind: 'photo', dataUrl: oversized, name: 'too-large.webp' })).toEqual({ kind: 'scene', scene: 'tide' })
  })

  it('opens the canonical sheet, explains local-only storage, and persists a curated choice', async () => {
    const el = await renderToday()
    const trigger = el.querySelector('[aria-label="Change Today backdrop"]')
    expect(trigger).toBeTruthy()
    await act(async () => { trigger.click() })
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toMatch(/never uploaded/i)
    expect(dialog?.textContent).toMatch(/JPEG, PNG, or WebP · 10 MB maximum/i)
    expect(dialog?.textContent).toMatch(/Alpine/)
    const ridge = [...dialog.querySelectorAll('button')].find((button) => button.textContent.includes('Ridge'))
    await act(async () => { ridge.click() })
    expect(ridge.getAttribute('aria-pressed')).toBe('true')
    expect(loadTodayBackdrop(77)).toEqual({ kind: 'scene', scene: 'ridge' })
  })

  it('offers source-verified real photographs with visible credit and bundled assets', async () => {
    const expected = [
      ['laguna', 'Laguna', 'laguna-beach-v1.jpg'],
      ['manhattan', 'Manhattan', 'manhattan-night-v1.jpg'],
      ['big-sur', 'Big Sur', 'big-sur-v1.jpg'],
      ['joshua-tree', 'Joshua Tree', 'joshua-tree-v1.jpg'],
      ['lake-tahoe', 'Lake Tahoe', 'lake-tahoe-v1.jpg'],
    ]
    for (const [id, label, asset] of expected) {
      const scene = TODAY_BACKDROP_SCENES.find((candidate) => candidate.id === id)
      expect(scene).toMatchObject({ id, label, sourceName: 'Unsplash' })
      expect(scene.credit).toBeTruthy()
      expect(scene.sourceUrl).toMatch(/^https:\/\/unsplash\.com\/photos\//)
      expect(scene.licenseUrl).toBe('https://unsplash.com/license')
      expect(existsSync(path.resolve(process.cwd(), 'public/current-fields', asset))).toBe(true)
    }

    const el = await renderToday()
    await act(async () => { el.querySelector('[aria-label="Change Today backdrop"]').click() })
    const dialog = document.querySelector('[role="dialog"]')
    const laguna = [...dialog.querySelectorAll('button')].find((button) => button.textContent.includes('Laguna'))
    await act(async () => { laguna.click() })
    expect(loadTodayBackdrop(77)).toEqual({ kind: 'scene', scene: 'laguna' })
    expect(dialog.textContent).toMatch(/Selected photo by Dan Begel on Unsplash/i)
    expect(dialog.querySelector('a[href*="3WWZItF7GBU"]')).toBeTruthy()

    const css = readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8')
    for (const [id, , asset] of expected) {
      expect(css).toContain(`[data-scene='${id}']`)
      expect(css).toContain(`url('/current-fields/${asset}')`)
    }
    const vite = readFileSync(path.resolve(process.cwd(), 'vite.config.js'), 'utf8')
    for (const [, , asset] of expected) expect(vite).toContain(`current-fields/${asset}`)
  })

  it('renders honest universal rail values without inventing wearable signals', async () => {
    const el = await renderToday()
    expect(el.textContent).toMatch(/Fuel0 \/ 2,000 kcal/)
    expect(el.textContent).toMatch(/25%Water500 mL \/ 2 L/)
    expect(el.textContent).toMatch(/Carbs0 \/ 250 g/)
    expect(el.querySelector('[role="group"][aria-label^="Carbs."]')?.getAttribute('aria-label')).toMatch(/Carbs\. 0%\. 0 \/ 250 g/)
    expect(el.textContent).not.toMatch(/Readiness|Sleep|Activity|No workout set/)
  })

  it('integrates At a glance into the photographic Current Field instead of a separate paper section', async () => {
    const el = await renderToday()
    const hero = el.querySelector('.today-current-field')
    const glanceHeading = el.querySelector('#today-at-a-glance')
    expect(hero?.dataset.scene).toBe('tide')
    expect(hero?.contains(glanceHeading)).toBe(true)
    expect(glanceHeading?.className).toContain('text-white')
    expect(el.querySelector('.today-paper-sheet')).toBeTruthy()
  })

  it('keeps the curated image luminous while locally protecting provider and glance text', async () => {
    const el = await renderToday()
    const hero = el.querySelector('.today-current-field')
    const backplate = hero?.querySelector('.today-hero-information-backplate')
    const glanceHeading = el.querySelector('#today-at-a-glance')
    expect(backplate).toBeTruthy()
    expect(backplate?.contains(glanceHeading)).toBe(true)
    expect(backplate?.textContent).toMatch(/Fuel \+ hydration mode/)
    expect(el.querySelector('#today-glance-instructions')?.className).toContain('text-white/90')
    const fuelDetail = el.querySelector('[role="group"][aria-label^="Fuel."] span[title]')
    expect(fuelDetail?.className).toContain('text-white/90')
    const underContrastText = [...backplate.querySelectorAll('[class*="text-white/"]')]
      .filter((node) => /text-white\/(66|72|76|78|82|84)(?:\s|$)/.test(node.className))
    expect(underContrastText).toEqual([])

    const css = readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8')
    expect(css).toMatch(/\.today-hero-information-backplate\s*\{[^}]*linear-gradient\(180deg, rgb\(4 8 11 \/ 0\.30\)[^}]*transparent 100%/s)
    expect(css).toMatch(/\[data-scene='tide'\] \.today-current-backdrop\s*\{[^}]*brightness\(1\.12\)[^}]*saturate\(1\.12\)/s)
  })

  it('protects lower outcome microcopy independently of curated or personal photos', async () => {
    const el = await renderToday()
    const hero = el.querySelector('.today-current-field')
    const protection = hero?.querySelector('.today-hero-outcome-protection')
    const fuelLabel = [...hero.querySelectorAll('div')].find((node) => node.textContent === 'Fuel today')
    const priorityLabel = [...hero.querySelectorAll('div')].find((node) => node.textContent === 'Today’s priority')
    expect(protection).toBeTruthy()
    expect(protection?.getAttribute('aria-hidden')).toBe('true')
    expect(fuelLabel?.className).toContain('text-white/90')
    expect(priorityLabel?.className).toContain('text-white/90')

    const css = readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8')
    expect(css).toMatch(/\.today-hero-outcome-protection\s*\{[^}]*linear-gradient\([^}]*transparent 0%[^}]*rgb\(4 8 11 \/ 0\.04\) 24%[^}]*rgb\(4 8 11 \/ 0\.24\) 54%[^}]*rgb\(4 8 11 \/ 0\.58\) 78%[^}]*rgb\(4 8 11 \/ 0\.80\) 100%/s)
  })

  it('exposes the glance rail as a named keyboard-scrollable region', async () => {
    const el = await renderToday()
    const rail = el.querySelector('[role="region"][aria-label="Nutrition, hydration, and available wearable signals"]')
    rail.scrollBy = vi.fn()
    rail.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    expect(rail.tabIndex).toBe(0)
    expect(rail.getAttribute('aria-describedby')).toBe('today-glance-instructions')
    expect(rail.scrollBy).toHaveBeenCalledWith({ left: 118, behavior: 'smooth' })
  })

  it('does not let a horizontal glance-rail swipe navigate to another day', async () => {
    const onPrevDay = vi.fn()
    const onNextDay = vi.fn()
    const el = await renderToday({ onPrevDay, onNextDay })
    const rail = el.querySelector('[role="region"][aria-label="Nutrition, hydration, and available wearable signals"]')
    const start = new Event('touchstart', { bubbles: true })
    Object.defineProperty(start, 'touches', { value: [{ clientX: 260, clientY: 120 }] })
    const end = new Event('touchend', { bubbles: true })
    Object.defineProperty(end, 'changedTouches', { value: [{ clientX: 120, clientY: 124 }] })
    rail.dispatchEvent(start)
    rail.dispatchEvent(end)
    expect(onPrevDay).not.toHaveBeenCalled()
    expect(onNextDay).not.toHaveBeenCalled()
  })

  it('does not turn missing carbohydrate data into a false zero', async () => {
    const entries = [{ id: 1, servings_consumed: 1, logged_at: new Date().toISOString(), food: { name: 'Unknown carbs', calories: 200, protein_g: 12, carbs_g: null } }]
    const el = await renderToday({ entries })
    const carbs = el.querySelector('[role="group"][aria-label^="Carbs."]')
    expect(carbs?.textContent).toMatch(/CarbsNo carb data/)
    expect(carbs?.getAttribute('aria-label')).toMatch(/Carbs\. —\. No carb data/)
    expect(carbs?.textContent).not.toMatch(/0%|0 \/ 250 g/)
  })

  it('labels a mixed carbohydrate total as partial instead of showing a misleading target percentage', async () => {
    const entries = [
      { id: 1, servings_consumed: 1, logged_at: new Date().toISOString(), food: { name: 'Known', calories: 200, carbs_g: 30 } },
      { id: 2, servings_consumed: 1, logged_at: new Date().toISOString(), food: { name: 'Unknown', calories: 150, carbs_g: null } },
    ]
    const el = await renderToday({ entries })
    const carbs = el.querySelector('[role="group"][aria-label^="Carbs."]')
    expect(carbs?.textContent).toMatch(/30gCarbs30 g known · partial/)
    expect(carbs?.textContent).toMatch(/Some entries are missing carbs/)
    expect(carbs?.textContent).not.toMatch(/12%/)
  })

  it('keeps a known zero distinct from unknown carbohydrate data', async () => {
    const entries = [{ id: 1, servings_consumed: 1, logged_at: new Date().toISOString(), food: { name: 'Known zero', calories: 0, carbs_g: 0 } }]
    const el = await renderToday({ entries })
    const carbs = el.querySelector('[role="group"][aria-label^="Carbs."]')
    expect(carbs?.getAttribute('aria-label')).toMatch(/Carbs\. 0%\. 0 \/ 250 g/)
    expect(carbs?.textContent).not.toMatch(/No carb data|partial/)
  })
})
