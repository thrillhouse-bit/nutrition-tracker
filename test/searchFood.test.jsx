// @vitest-environment jsdom
//
// Component tests for the redesigned search UX states: idle, loading,
// no-match, upstream/provider failure with retry (preserving the typed
// query), and rendering real results. Uses the same raw react-dom/client +
// act() pattern as the other component tests in this repo (no
// testing-library dependency) and fake timers to control the search
// debounce (see test/debounced-search.test.js for the same convention).
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../src/api/client.js', () => ({
  api: { searchFoods: vi.fn() },
}))

const { api } = await import('../src/api/client.js')
const { default: SearchFood } = await import('../src/components/SearchFood.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  if (container) { document.body.removeChild(container); container = null }
  // resetAllMocks (not clearAllMocks) — a mockResolvedValueOnce left
  // unconsumed by a failing assertion earlier in a test must never leak its
  // queued response into the NEXT test.
  vi.resetAllMocks()
})

function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function renderSearchFood() {
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(<SearchFood onPick={() => {}} />) })
  return container
}

async function typeAndSettle(el, text) {
  const input = el.querySelector('input[aria-label="Search foods"]')
  await act(async () => { setInputValue(input, text) })
  await act(async () => { await vi.advanceTimersByTimeAsync(400) }) // past the 350ms debounce
  await act(async () => { await Promise.resolve(); await Promise.resolve() }) // flush the resolved fetch
}

describe('SearchFood: idle state', () => {
  it('shows a prompt, not a spinner or empty-state, before 2 characters are typed', async () => {
    const el = await renderSearchFood()
    expect(el.textContent).toMatch(/Type at least 2 characters/)
    expect(el.textContent).not.toMatch(/No matches/)
    expect(api.searchFoods).not.toHaveBeenCalled()
  })
})

describe('SearchFood: loading state', () => {
  it('shows a spinner while a search is in flight', async () => {
    let resolveFetch
    api.searchFoods.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve }))
    const el = await renderSearchFood()
    const input = el.querySelector('input[aria-label="Search foods"]')
    await act(async () => { setInputValue(input, 'banana') })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(el.textContent).toMatch(/Searching/)
    await act(async () => { resolveFetch({ results: [], degraded: false }) })
  })
})

describe('SearchFood: real results', () => {
  it('renders results returned from the server', async () => {
    api.searchFoods.mockResolvedValue({
      results: [{ name: 'Zucchini, raw', calories: 17, serving_size: 100, serving_unit: 'g', source: 'usda' }],
      degraded: false,
    })
    const el = await renderSearchFood()
    await typeAndSettle(el, 'zucchini')
    expect(el.textContent).toMatch(/Zucchini, raw/)
  })
})

describe('SearchFood: no-match state', () => {
  it('shows "No matches" when the search genuinely found nothing (degraded:false)', async () => {
    api.searchFoods.mockResolvedValue({ results: [], degraded: false })
    const el = await renderSearchFood()
    await typeAndSettle(el, 'xyzzyplugh')
    expect(el.textContent).toMatch(/No matches/)
    expect(el.textContent).not.toMatch(/having trouble/)
  })
})

describe('SearchFood: upstream/provider-failure state', () => {
  it('shows a distinct "having trouble" state with a Retry action when degraded:true', async () => {
    api.searchFoods.mockResolvedValue({ results: [], degraded: true })
    const el = await renderSearchFood()
    await typeAndSettle(el, 'zucchini')
    expect(el.textContent).toMatch(/having trouble/)
    expect(el.textContent).not.toMatch(/^No matches$/m)
    const retryBtn = Array.from(el.querySelectorAll('button')).find((b) => /Retry/.test(b.textContent))
    expect(retryBtn).toBeTruthy()
  })

  it('Retry re-issues the SAME query the user typed, without clearing the input', async () => {
    api.searchFoods.mockResolvedValueOnce({ results: [], degraded: true })
    const el = await renderSearchFood()
    await typeAndSettle(el, 'zucchini')
    const input = el.querySelector('input[aria-label="Search foods"]')
    expect(input.value).toBe('zucchini') // preserved through the failure

    api.searchFoods.mockResolvedValueOnce({ results: [{ name: 'Zucchini, raw', calories: 17, source: 'usda' }], degraded: false })
    const retryBtn = Array.from(el.querySelectorAll('button')).find((b) => /Retry/.test(b.textContent))
    await act(async () => { retryBtn.click() })
    // Retry still goes through the same debounced search path (re-arming its
    // timer), so the fetch itself only fires after the debounce delay too.
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    expect(api.searchFoods).toHaveBeenCalledTimes(2)
    expect(api.searchFoods).toHaveBeenLastCalledWith('zucchini')
    expect(el.textContent).toMatch(/Zucchini, raw/)
  })

  it('a thrown network error keeps the typed query and shows an error note (control: a different failure shape still preserves input)', async () => {
    api.searchFoods.mockRejectedValue(new Error('Failed to fetch'))
    const el = await renderSearchFood()
    await typeAndSettle(el, 'zucchini')
    const input = el.querySelector('input[aria-label="Search foods"]')
    expect(input.value).toBe('zucchini')
    expect(el.textContent).toMatch(/Failed to fetch/)
  })
})
