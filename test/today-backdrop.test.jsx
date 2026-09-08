// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import Today from '../src/components/Today.jsx'
import {
  TODAY_BACKDROP_MAX_SOURCE_BYTES,
  TODAY_BACKDROP_MAX_STORED_BYTES,
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
      data={{ baseline: { calories: 2000, protein_g: 120 }, signals: {}, hydration: { total_ml: 500, entries: [], preferences: { goal_ml: 2000, unit: 'ml', quick_add_ml: [250, 500, 750] } } }}
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
    const ridge = [...dialog.querySelectorAll('button')].find((button) => button.textContent.includes('Ridge'))
    await act(async () => { ridge.click() })
    expect(ridge.getAttribute('aria-pressed')).toBe('true')
    expect(loadTodayBackdrop(77)).toEqual({ kind: 'scene', scene: 'ridge' })
  })

  it('renders honest universal rail values without inventing wearable signals', async () => {
    const el = await renderToday()
    expect(el.textContent).toMatch(/Fuel0 \/ 2,000 kcal/)
    expect(el.textContent).toMatch(/25%Water500 mL \/ 2 L/)
    expect(el.textContent).not.toMatch(/Readiness|Sleep|Activity|No workout set/)
  })
})
