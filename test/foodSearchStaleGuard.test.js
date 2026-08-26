// The stale-response guard, driven directly with fake timers.
//
// test/debounced-search.test.js already covers the two 25 Aug 2026 defects
// (no debounce; an earlier request resolving after a LATER one has STARTED).
// This file covers the hole those tests could not see, reproduced in a real
// browser on 26 Aug 2026 (docs/food-search-baseline.md §1.3): a response for
// the OLD query arriving while the NEW query is still inside its debounce
// window — i.e. before the new request has started and bumped the sequence.
//
// Timeline of the reproduced bug:
//   t=0    type "zucchini"                        -> debounce armed
//   t=350  request A starts, seq := 1
//   t=400  type "banana"                          -> timer re-armed for t=750
//   t=500  A resolves; id(1) === seq(1)           -> A COMMITS, under "banana"
//   t=750  request B starts, seq := 2
// The fix is to bump the generation the moment the query CHANGES, not when a
// request happens to start, and to abort the superseded request rather than
// merely discard its answer.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createDebouncedSearch } from '../src/lib/debouncedSearch.js'

describe('createDebouncedSearch: the debounce-window stale hole', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('drops a response for the OLD query that arrives while the NEW query is still debouncing', async () => {
    const fetchFn = vi.fn((q) => new Promise((resolve) => setTimeout(() => resolve([`result for ${q}`]), 150)))
    const ds = createDebouncedSearch(fetchFn, { delay: 350 })
    const onResult = vi.fn()

    ds.search('zucchini', { onResult })
    await vi.advanceTimersByTimeAsync(350) // request A starts
    ds.search('banana', { onResult }) // superseded 50ms before A resolves
    await vi.advanceTimersByTimeAsync(200) // A's 150ms response lands inside B's debounce window

    expect(onResult).not.toHaveBeenCalled() // A is stale from the moment the query changed

    await vi.advanceTimersByTimeAsync(350 + 150) // B fires and resolves
    expect(onResult).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledWith(['result for banana'], 'banana')
  })

  it('does not report the OLD query as settled either, so a busy flag cannot be cleared by a superseded request', async () => {
    const fetchFn = vi.fn((q) => new Promise((resolve) => setTimeout(() => resolve([`result for ${q}`]), 150)))
    const ds = createDebouncedSearch(fetchFn, { delay: 350 })
    const onSettled = vi.fn()

    ds.search('zucchini', { onSettled })
    await vi.advanceTimersByTimeAsync(350)
    ds.search('banana', { onSettled })
    await vi.advanceTimersByTimeAsync(200)

    expect(onSettled).not.toHaveBeenCalled()
  })

  it('drops a response that arrives after cancel(), e.g. the query was erased below the minimum length', async () => {
    const fetchFn = vi.fn((q) => new Promise((resolve) => setTimeout(() => resolve([`result for ${q}`]), 150)))
    const ds = createDebouncedSearch(fetchFn, { delay: 350 })
    const onResult = vi.fn()
    const onSettled = vi.fn()

    ds.search('banana', { onResult, onSettled })
    await vi.advanceTimersByTimeAsync(350) // in flight
    ds.cancel() // user deleted back to "b"
    await vi.advanceTimersByTimeAsync(500)

    expect(onResult).not.toHaveBeenCalled()
    expect(onSettled).not.toHaveBeenCalled()
  })

  it('CONTROL: the guard does not fire when it should not — a lone search still commits and settles', async () => {
    // A guard stuck ON passes every test that only asks "did the stale
    // response get dropped". This is its sibling.
    const fetchFn = vi.fn((q) => new Promise((resolve) => setTimeout(() => resolve([`result for ${q}`]), 150)))
    const ds = createDebouncedSearch(fetchFn, { delay: 350 })
    const onResult = vi.fn()
    const onSettled = vi.fn()

    ds.search('banana', { onResult, onSettled })
    await vi.advanceTimersByTimeAsync(350 + 150)

    expect(onResult).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledWith(['result for banana'], 'banana')
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('every callback is told WHICH query it belongs to, so a caller can verify identity before committing', async () => {
    const fetchFn = vi.fn(async (q) => [`result for ${q}`])
    const ds = createDebouncedSearch(fetchFn, { delay: 350 })
    const onStart = vi.fn()
    const onResult = vi.fn()
    const onSettled = vi.fn()

    ds.search('greek yogurt', { onStart, onResult, onSettled })
    await vi.advanceTimersByTimeAsync(400)

    expect(onStart).toHaveBeenCalledWith('greek yogurt')
    expect(onResult).toHaveBeenCalledWith(['result for greek yogurt'], 'greek yogurt')
    expect(onSettled).toHaveBeenCalledWith('greek yogurt')
  })
})

describe('createDebouncedSearch: cancellation is real, not just discarded', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('passes an AbortSignal to the fetcher', async () => {
    const fetchFn = vi.fn(async () => [])
    const ds = createDebouncedSearch(fetchFn, { delay: 350 })
    ds.search('banana')
    await vi.advanceTimersByTimeAsync(400)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [query, options] = fetchFn.mock.calls[0]
    expect(query).toBe('banana')
    expect(options?.signal).toBeInstanceOf(AbortSignal)
    expect(options.signal.aborted).toBe(false)
  })

  it('ABORTS the in-flight request when a newer query supersedes it', async () => {
    const signals = []
    const fetchFn = vi.fn((q, { signal } = {}) => {
      signals.push(signal)
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => resolve([`result for ${q}`]), 5000)
        signal?.addEventListener('abort', () => { clearTimeout(t); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })) })
      })
    })
    const ds = createDebouncedSearch(fetchFn, { delay: 350 })
    const onError = vi.fn()

    ds.search('zucchini', { onError })
    await vi.advanceTimersByTimeAsync(350)
    expect(signals[0].aborted).toBe(false)

    ds.search('banana', { onError })
    expect(signals[0].aborted).toBe(true) // superseded -> genuinely cancelled, not just ignored

    await vi.advanceTimersByTimeAsync(1000)
    expect(onError).not.toHaveBeenCalled() // an abort is not an error the user should see
  })

  it('cancel() aborts the in-flight request too', async () => {
    const signals = []
    const fetchFn = vi.fn((q, { signal } = {}) => { signals.push(signal); return new Promise(() => {}) })
    const ds = createDebouncedSearch(fetchFn, { delay: 350 })
    ds.search('banana')
    await vi.advanceTimersByTimeAsync(350)
    ds.cancel()
    expect(signals[0].aborted).toBe(true)
  })

  it('CONTROL: a request that is never superseded is never aborted', async () => {
    const signals = []
    const fetchFn = vi.fn((q, { signal } = {}) => { signals.push(signal); return Promise.resolve([]) })
    const ds = createDebouncedSearch(fetchFn, { delay: 350 })
    ds.search('banana')
    await vi.advanceTimersByTimeAsync(400)
    expect(signals[0].aborted).toBe(false)
  })
})
