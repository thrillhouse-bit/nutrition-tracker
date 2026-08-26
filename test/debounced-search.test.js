import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createDebouncedSearch } from '../src/lib/debouncedSearch.js'

// These cover the two "janky search" defects reported live 25 Aug 2026 and
// reproduced headlessly against the built app (Playwright): no debounce at
// all, and a stale (earlier, slower) response overwriting a newer one.

describe('createDebouncedSearch', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('fires exactly one fetch for a rapid burst of keystrokes (debounce)', async () => {
    const fetchFn = vi.fn(async (q) => [`result for ${q}`])
    const ds = createDebouncedSearch(fetchFn, { delay: 350 })

    // Simulate typing "chicken" one letter at a time, each keystroke well
    // inside the debounce window — a bug here means "chicken" fires 7
    // requests, one per letter, which is exactly the per-keystroke-fetch
    // shape that makes search feel janky on a real (slower) connection.
    const query = 'chicken'
    for (let i = 1; i <= query.length; i++) {
      ds.search(query.slice(0, i))
      await vi.advanceTimersByTimeAsync(90) // realistic inter-keystroke gap, < 350ms delay
    }

    expect(fetchFn).not.toHaveBeenCalled() // nothing has fired yet — still inside the debounce window

    await vi.advanceTimersByTimeAsync(350) // let the trailing debounce fire
    expect(fetchFn).toHaveBeenCalledTimes(1)
    // ...and it's for the FINAL query, not an intermediate one. The second
    // argument is the AbortController signal the searcher now wires through so
    // a superseded request is genuinely cancelled, not merely ignored — see
    // src/lib/debouncedSearch.js and test/foodSearchStaleGuard.test.js.
    expect(fetchFn).toHaveBeenCalledWith('chicken', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('drops a stale response that resolves after a newer one (out-of-order race)', async () => {
    // "chick" is slow (2000ms); "chicken" — typed right after — is fast
    // (100ms). This is the exact shape measured against a live external API:
    // an earlier, shorter query can resolve LATER than a subsequent one.
    const fetchFn = vi.fn((q) => {
      const delay = q === 'chick' ? 2000 : 100
      return new Promise((resolve) => setTimeout(() => resolve([`result for ${q}`]), delay))
    })
    const ds = createDebouncedSearch(fetchFn, { delay: 350 })
    const onResult = vi.fn()

    ds.search('chick', { onResult })
    await vi.advanceTimersByTimeAsync(350) // let "chick" fire
    ds.search('chicken', { onResult })
    await vi.advanceTimersByTimeAsync(350) // let "chicken" fire while "chick" is still in flight

    // "chicken" resolves first (100ms after it fired)...
    await vi.advanceTimersByTimeAsync(100)
    expect(onResult).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenLastCalledWith(['result for chicken'], 'chicken') // every callback names its own query

    // ...then "chick" finally resolves. Without the guard this overwrites
    // the correct, already-rendered "chicken" results.
    await vi.advanceTimersByTimeAsync(2000)
    expect(onResult).toHaveBeenCalledTimes(1) // still just the one call — the stale response was dropped
    expect(onResult).toHaveBeenLastCalledWith(['result for chicken'], 'chicken')
  })

  it('still calls onResult for a single, un-raced search (control: the guard does not fire when it should not)', async () => {
    const fetchFn = vi.fn(async (q) => [`result for ${q}`])
    const ds = createDebouncedSearch(fetchFn, { delay: 350 })
    const onResult = vi.fn()

    ds.search('egg', { onResult })
    await vi.advanceTimersByTimeAsync(350)
    await vi.advanceTimersByTimeAsync(0)

    expect(onResult).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledWith(['result for egg'], 'egg')
  })

  it('calls onSettled exactly once per non-stale request, success or failure, so a busy flag cannot get stuck', async () => {
    const fetchFn = vi.fn((q) => {
      if (q === 'chick') return new Promise((_, reject) => setTimeout(() => reject(new Error('boom')), 2000))
      return new Promise((resolve) => setTimeout(() => resolve(['ok']), 100))
    })
    const ds = createDebouncedSearch(fetchFn, { delay: 350 })
    const onSettled = vi.fn()
    const onError = vi.fn()

    ds.search('chick', { onSettled, onError })
    await vi.advanceTimersByTimeAsync(350)
    ds.search('chicken', { onSettled, onError })
    await vi.advanceTimersByTimeAsync(350)
    await vi.advanceTimersByTimeAsync(100) // "chicken" settles
    expect(onSettled).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(2000) // "chick" finally rejects, but it's stale
    expect(onSettled).toHaveBeenCalledTimes(1) // not called a second time
    expect(onError).not.toHaveBeenCalled() // the stale error was dropped too, not just the result
  })

  it('cancel() prevents a pending debounce from firing at all', async () => {
    const fetchFn = vi.fn(async () => [])
    const ds = createDebouncedSearch(fetchFn, { delay: 350 })

    ds.search('egg')
    await vi.advanceTimersByTimeAsync(200)
    ds.cancel()
    await vi.advanceTimersByTimeAsync(1000)

    expect(fetchFn).not.toHaveBeenCalled()
  })
})
