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
    // The second argument is the AbortController signal the searcher now wires
    // through so a superseded search is genuinely cancelled — see
    // src/lib/debouncedSearch.js.
    expect(api.searchFoods).toHaveBeenLastCalledWith('zucchini', expect.objectContaining({ signal: expect.any(AbortSignal) }))
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

// ---------------------------------------------------------------------------
// Pipeline overhaul, 26 Aug 2026 — the states the six reported production
// behaviours live in. Every test below FAILED against the pre-overhaul
// component; see docs/food-search-baseline.md for the browser reproduction
// each one pins.
// ---------------------------------------------------------------------------

// A response body in the post-overhaul contract. `usdaConfigured` and
// `partial`/`providers` are what let the UI stop guessing.
const body = (over = {}) => ({
  results: [], degraded: false, partial: false, usdaConfigured: true,
  canonicalCoverage: 'ok', providers: [], query: 'q', ...over,
})
const row = (name, over = {}) => ({ name, calories: 100, serving_size: 100, serving_unit: 'g', source: 'usda', ...over })

async function typeOnly(el, text) {
  const input = el.querySelector('input[aria-label="Search foods"]')
  await act(async () => { setInputValue(input, text) })
}
const bodyText = (el) => el.textContent

describe('SearchFood: the empty state is bound to a COMPLETED search, not to "no rows yet"', () => {
  it('does NOT show "No matches" during the debounce window, before any request exists', async () => {
    // Reproduced in-browser: at +50ms and +150ms after typing "zucchini" the
    // user was told the food does not exist. No request had been issued.
    api.searchFoods.mockResolvedValue(body({ results: [row('Zucchini, raw')] }))
    const el = await renderSearchFood()
    await typeOnly(el, 'zucchini')
    await act(async () => { await vi.advanceTimersByTimeAsync(100) }) // still inside the 350ms debounce

    expect(api.searchFoods).not.toHaveBeenCalled()
    expect(bodyText(el)).not.toMatch(/No matches/)
  })

  it('does NOT show "No matches" while a request for the current query is in flight', async () => {
    let resolveFetch
    api.searchFoods.mockReturnValue(new Promise((r) => { resolveFetch = r }))
    const el = await renderSearchFood()
    await typeOnly(el, 'zucchini')
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })

    expect(bodyText(el)).not.toMatch(/No matches/)
    await act(async () => { resolveFetch(body()) })
  })

  it('CONTROL: it DOES show "No matches" once the current query genuinely completes empty', async () => {
    api.searchFoods.mockResolvedValue(body())
    const el = await renderSearchFood()
    await typeAndSettle(el, 'xyzzyplugh')
    expect(bodyText(el)).toMatch(/No matches/)
  })
})

describe('SearchFood: results always belong to the query on screen', () => {
  it('clears the previous query\'s results the moment the query changes', async () => {
    // Reproduced in-browser: banana rows stayed under "greek yogurt", with no
    // spinner, for the whole debounce window.
    api.searchFoods.mockResolvedValue(body({ results: [row('Banana, raw')] }))
    const el = await renderSearchFood()
    await typeAndSettle(el, 'banana')
    expect(bodyText(el)).toMatch(/Banana, raw/)

    await typeOnly(el, 'greek yogurt')
    await act(async () => { await vi.advanceTimersByTimeAsync(60) })
    expect(bodyText(el)).not.toMatch(/Banana, raw/)
  })

  it('shows a pending state (never a settled-looking one) between the query change and the new answer', async () => {
    api.searchFoods.mockResolvedValue(body({ results: [row('Banana, raw')] }))
    const el = await renderSearchFood()
    await typeAndSettle(el, 'banana')

    await typeOnly(el, 'greek yogurt')
    await act(async () => { await vi.advanceTimersByTimeAsync(60) })
    expect(bodyText(el)).toMatch(/Searching/)
    expect(bodyText(el)).not.toMatch(/No matches/)
  })

  it('an OLDER response arriving inside the NEW query\'s debounce window never reaches the screen', async () => {
    // The exact race proven in a real browser (baseline §1.3): input reads
    // "banana", committed rows were zucchini's, spinner off.
    const pending = {}
    api.searchFoods.mockImplementation((q) => new Promise((resolve) => { pending[q] = resolve }))
    const el = await renderSearchFood()

    await typeOnly(el, 'zucchini')
    await act(async () => { await vi.advanceTimersByTimeAsync(400) }) // request A starts
    await typeOnly(el, 'banana') // supersede while A is in flight
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })

    await act(async () => { pending.zucchini(body({ results: [row('ZUCCHINI (stale)')] })) }) // A resolves, inside B's debounce
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    expect(bodyText(el)).not.toMatch(/ZUCCHINI \(stale\)/)
    expect(bodyText(el)).not.toMatch(/No matches/)

    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    await act(async () => { pending.banana(body({ results: [row('Banana, raw')] })) })
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(bodyText(el)).toMatch(/Banana, raw/)
  })

  it('a fast typist (zucchini -> banana -> greek yogurt) ends showing ONLY the last query\'s results', async () => {
    const pending = {}
    api.searchFoods.mockImplementation((q) => new Promise((resolve) => { pending[q] = resolve }))
    const el = await renderSearchFood()

    await typeOnly(el, 'zucchini')
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    await typeOnly(el, 'banana')
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    await typeOnly(el, 'greek yogurt')
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })

    // Deliberately resolve them OUT OF ORDER, oldest last.
    await act(async () => { pending['greek yogurt']?.(body({ results: [row('Yogurt, Greek, plain, nonfat')] })) })
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    await act(async () => { pending.banana?.(body({ results: [row('Banana, raw')] })) })
    await act(async () => { pending.zucchini?.(body({ results: [row('Zucchini, raw')] })) })
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    const text = bodyText(el)
    expect(text).toMatch(/Yogurt, Greek, plain, nonfat/)
    expect(text).not.toMatch(/Banana, raw/)
    expect(text).not.toMatch(/Zucchini, raw/)
    expect(el.querySelector('input[aria-label="Search foods"]').value).toBe('greek yogurt')
  })
})

describe('SearchFood: partial provider failure is disclosed, never presented as a complete answer', () => {
  it('says which source did not answer and still shows what it has', async () => {
    api.searchFoods.mockResolvedValue(body({
      results: [row('ZUCCHINI', { brand: 'KMB, LLC', source: 'usda' })],
      partial: true, canonicalCoverage: 'missing',
      providers: [
        { source: 'usda', dataset: 'generic', ok: false, error: 'HTTP 400' },
        { source: 'usda', dataset: 'branded', ok: true, count: 8 },
        { source: 'openfoodfacts', dataset: 'branded', ok: true, count: 15 },
      ],
    }))
    const el = await renderSearchFood()
    await typeAndSettle(el, 'zucchini')

    expect(bodyText(el)).toMatch(/ZUCCHINI/) // what we DO have is still shown
    expect(bodyText(el)).toMatch(/incomplete|partial|didn't answer|did not answer/i)
    expect(bodyText(el)).not.toMatch(/No matches/)
  })

  it('a partial failure with ZERO results is never rendered as a plain "No matches"', async () => {
    api.searchFoods.mockResolvedValue(body({
      results: [], partial: true, canonicalCoverage: 'missing',
      providers: [{ source: 'usda', dataset: 'generic', ok: false, error: 'HTTP 400' }, { source: 'openfoodfacts', dataset: 'branded', ok: true, count: 0 }],
    }))
    const el = await renderSearchFood()
    await typeAndSettle(el, 'zucchini')
    expect(bodyText(el)).not.toMatch(/^No matches$/m)
    expect(bodyText(el)).toMatch(/incomplete|partial|didn't answer|did not answer/i)
  })

  it('CONTROL: a complete search with results shows no partial-failure note at all', async () => {
    api.searchFoods.mockResolvedValue(body({
      results: [row('Zucchini, raw')],
      providers: [{ source: 'usda', dataset: 'generic', ok: true, count: 10 }],
    }))
    const el = await renderSearchFood()
    await typeAndSettle(el, 'zucchini')
    expect(bodyText(el)).not.toMatch(/incomplete|partial|didn't answer|did not answer/i)
  })
})

describe('SearchFood: the USDA-key advice is conditional on USDA actually being unconfigured', () => {
  it('does NOT suggest adding a USDA key when the server reports USDA configured', async () => {
    // Production reports usda:"configured" and was still being told to add a key.
    api.searchFoods.mockResolvedValue(body({ results: [], usdaConfigured: true }))
    const el = await renderSearchFood()
    await typeAndSettle(el, 'xyzzyplugh')
    expect(bodyText(el)).toMatch(/No matches/)
    expect(bodyText(el)).not.toMatch(/USDA key/i)
  })

  it('CONTROL: it DOES suggest it when the server reports USDA unconfigured', async () => {
    api.searchFoods.mockResolvedValue(body({ results: [], usdaConfigured: false }))
    const el = await renderSearchFood()
    await typeAndSettle(el, 'xyzzyplugh')
    expect(bodyText(el)).toMatch(/USDA key/i)
  })
})

describe('SearchFood: a picked result is tagged as having come from a text search', () => {
  it('hands onPick a food carrying search_method:"text_search"', async () => {
    api.searchFoods.mockResolvedValue(body({ results: [row('ZUCCHINI', { brand: 'KMB, LLC', barcode: '812997020233' })] }))
    container = document.createElement('div')
    document.body.appendChild(container)
    const picked = []
    const root = createRoot(container)
    await act(async () => { root.render(<SearchFood onPick={(f) => picked.push(f)} />) })
    await typeAndSettle(container, 'zucchini')

    const resultBtn = Array.from(container.querySelectorAll('button')).find((b) => /ZUCCHINI/.test(b.textContent))
    await act(async () => { resultBtn.click() })

    expect(picked).toHaveLength(1)
    expect(picked[0].search_method).toBe('text_search')
    expect(picked[0].barcode).toBe('812997020233') // the datum is preserved; only the CLAIM about it changes
  })
})
