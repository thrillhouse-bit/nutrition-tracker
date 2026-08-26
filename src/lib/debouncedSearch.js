// Debounce a query, cancel superseded requests, and guarantee no response can
// ever be committed under a query the user has already moved on from. Pulled
// out of SearchFood.jsx so it can be driven directly by a test with fake
// timers.
//
// Three defects live here, all reproduced against the running app:
//
//   1. (25 Aug 2026) No debounce at all — a request fired on every keystroke.
//      Fixed by the timer below; a burst of keystrokes now fires exactly one
//      request (test/debounced-search.test.js).
//
//   2. (25 Aug 2026) An earlier request resolving after a LATER one had
//      started would stomp the later one's already-rendered results. Fixed
//      with a sequence number.
//
//   3. (26 Aug 2026) The sequence number was bumped when a request STARTED,
//      not when the query CHANGED — so it did not cover the 350 ms debounce
//      window in between. Reproduced in a real browser
//      (docs/food-search-baseline.md §1.3):
//
//        t=0    type "zucchini"                  -> debounce armed
//        t=350  request A starts, seq := 1
//        t=400  type "banana"                    -> timer re-armed for t=750
//        t=500  A resolves; id(1) === seq(1)     -> A COMMITS, under "banana"
//        t=750  request B starts, seq := 2
//
//      The input read "banana", the committed rows were zucchini's, and the
//      spinner was OFF — one query's answer presented as another's finished
//      result. `cancel()` had the same hole: it cleared the pending timer
//      without invalidating anything already in flight, so erasing the query
//      below the minimum length still let a late response land.
//
// The fix is that the generation is owned by the QUERY, not by the request:
// `search()` and `cancel()` both bump it synchronously, before anything can
// await. Superseded requests are also genuinely ABORTED via AbortController
// rather than merely ignored, so they stop consuming a connection and the
// provider budget. Every callback is handed the query it belongs to, so the
// caller can bind its rendered state to that query rather than trusting order.
export function createDebouncedSearch(fetchFn, { delay = 350 } = {}) {
  let timer = null
  let generation = 0
  let controller = null

  // Invalidate everything currently pending or in flight. Synchronous by
  // design: it must complete before any caller can await, or the window it
  // exists to close reopens.
  function invalidate() {
    generation += 1
    clearTimeout(timer)
    timer = null
    controller?.abort()
    controller = null
    return generation
  }

  const isAbort = (err) => err?.name === 'AbortError'

  return {
    // Call on every keystroke (or query change). Callbacks fire only for the
    // most recent query — a response for an earlier one is dropped whether it
    // arrives while that request is in flight, during the next query's
    // debounce window, or after cancel(). `onSettled` fires once per
    // still-current request regardless of outcome (mirrors a `finally`), so a
    // caller driving a busy flag off it never gets stuck true.
    search(query, { onStart, onResult, onError, onSettled } = {}) {
      const mine = invalidate()
      timer = setTimeout(async () => {
        if (mine !== generation) return
        const ctrl = new AbortController()
        controller = ctrl
        onStart?.(query)
        try {
          const results = await fetchFn(query, { signal: ctrl.signal })
          if (mine !== generation) return
          onResult?.(results, query)
        } catch (err) {
          if (mine !== generation || isAbort(err)) return
          onError?.(err, query)
        } finally {
          if (mine === generation) {
            controller = null
            onSettled?.(query)
          }
        }
      }, delay)
    },

    // Cancel any pending debounce AND abort anything already in flight, e.g.
    // on unmount or when the query drops below the caller's minimum length.
    cancel() {
      invalidate()
    },
  }
}
