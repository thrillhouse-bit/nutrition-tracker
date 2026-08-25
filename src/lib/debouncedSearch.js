// Debounce a query and guard against stale responses — pulled out of
// SearchFood.jsx so it can be driven directly by a test with fake timers,
// instead of needing a DOM/render harness this repo doesn't have (no jsdom,
// no @testing-library/react; every other test here drives a plain function).
//
// Two bugs live here, both reported live 25 Aug 2026 as "janky" search:
//   1. No debounce at all — a request fires on every keystroke. Fixed by the
//      setTimeout below; measured headlessly (test/debounced-search.test.js
//      and a live-page probe) that a burst of keystrokes now fires exactly
//      one request.
//   2. A stale response overwriting a newer one. The debounce only throttles
//      when a request STARTS, not the order responses arrive in: typing
//      "chick" then pausing fires request A, typing on to "chicken" and
//      pausing fires request B — and the live /api/search call (USDA, then
//      OFF) has enough latency variance that A can resolve AFTER B. Without
//      a guard, A's "chick" results then stomp B's already-rendered
//      "chicken" results — reproduced headlessly by delaying the earlier
//      query's response past the later one. Fixed by stamping every request
//      with a sequence number and dropping any response that isn't for the
//      most recently started one.
export function createDebouncedSearch(fetchFn, { delay = 350 } = {}) {
  let timer = null
  let seq = 0

  return {
    // Call on every keystroke (or query change). Callbacks fire only for the
    // most recently started request — an in-flight response for an earlier
    // query is dropped silently once a newer one has started. `onSettled`
    // fires once per non-stale request regardless of outcome (mirrors a
    // `finally` block), so a caller driving a busy/spinner flag off it never
    // gets stuck true because a stale response's callbacks were skipped.
    search(query, { onStart, onResult, onError, onSettled } = {}) {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        const id = ++seq
        onStart?.()
        try {
          const results = await fetchFn(query)
          if (id !== seq) return // a newer search has since started; this response is stale
          onResult?.(results)
        } catch (err) {
          if (id !== seq) return
          onError?.(err)
        } finally {
          if (id === seq) onSettled?.()
        }
      }, delay)
    },

    // Cancel any pending (not-yet-fired) debounce timer, e.g. on unmount or
    // when the query drops below the caller's minimum length.
    cancel() {
      clearTimeout(timer)
    },
  }
}
