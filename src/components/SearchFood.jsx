import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client.js'
import { fmt } from '../lib/nutrition.js'
import { createDebouncedSearch } from '../lib/debouncedSearch.js'
import { ErrorNote, Spinner, EmptyState, inputCls } from './ui.jsx'

// Debounced text search against USDA + Open Food Facts. Good for produce, bulk
// bins, and restaurant/deli items that have no barcode. The debounce and
// stale-response guard live in ../lib/debouncedSearch.js — see that file for
// the two bugs they fix and how they're tested.
export default function SearchFood({ onPick }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Whether the LAST completed search's providers all genuinely failed
  // (a transient outage) — distinct from a real, honest "nothing matched".
  // The query text itself is never cleared on failure (below), so retrying
  // doesn't mean re-typing.
  const [degraded, setDegraded] = useState(false)
  const debounced = useRef(null)
  if (!debounced.current) {
    debounced.current = createDebouncedSearch((query) => api.searchFoods(query))
  }

  const runSearch = (query) => {
    debounced.current.search(query, {
      onStart: () => {
        setBusy(true)
        setError('')
      },
      onResult: (body) => {
        setResults(body.results)
        setDegraded(!!body.degraded)
      },
      onError: (err) => setError(err.message || 'Search failed.'),
      onSettled: () => setBusy(false),
    })
  }

  useEffect(() => {
    if (q.trim().length < 2) {
      debounced.current.cancel()
      setResults([])
      setDegraded(false)
      setError('')
      return
    }
    runSearch(q.trim())
    return () => debounced.current.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  // Retries the SAME query immediately (bypassing the debounce delay) — the
  // query the user already typed is untouched throughout, per the "preserve
  // the user's query on failure" requirement.
  const retry = () => q.trim().length >= 2 && runSearch(q.trim())

  return (
    <div className="space-y-3">
      <input
        autoFocus
        aria-label="Search foods"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search foods (e.g. banana, cheddar)"
        className={inputCls}
      />
      {/*
        The Sheet this lives in (ui.jsx) is vertically centered on desktop
        (`sm:items-center`), so its height driving its position: a result
        count that swings keystroke to keystroke ("chick" → 12 results,
        "chicken" → 3) reflows the whole sheet and visibly drags the input
        up and down the screen on almost every character — measured
        headlessly, up to 245px of vertical jump between consecutive
        settled searches. A FIXED height (not just a min/max clamp — that
        still let the sheet reflow between the floor and the ceiling, ~120px
        of residual jump measured) on this region while a search is active
        removes the swing at its source: the spinner, the empty state, and
        1 result or 20 all occupy the same footprint, scrolling internally
        instead of resizing the sheet around them.
      */}
      <div className={q.trim().length >= 2 ? 'h-[45vh] overflow-y-auto' : ''}>
        {/* Idle: nothing typed yet, or too short to search — no spinner, no
            empty-state message, just the plain input. */}
        {q.trim().length < 2 && (
          <p className="px-1 py-2 text-sm text-faint">Type at least 2 characters to search.</p>
        )}
        {busy && <Spinner label="Searching…" />}
        <ErrorNote>{error}</ErrorNote>
        {/* Upstream/provider failure — every source genuinely failed. Distinct
            from a real "nothing matched": the query is preserved, and a Retry
            action re-runs the SAME search immediately. */}
        {!busy && !error && q.trim().length >= 2 && degraded && (
          <EmptyState title="Search is having trouble right now">
            We couldn't reach any food database — this is usually temporary.
            <div className="mt-3">
              <button type="button" onClick={retry} className="min-h-11 px-4 text-sm font-semibold text-cobalt hover:text-cobalt-ink">
                Retry
              </button>
            </div>
          </EmptyState>
        )}
        {!busy && !error && q.trim().length >= 2 && !degraded && results.length === 0 && (
          <EmptyState title="No matches">
            Try manual entry instead — or, on the server, add a USDA key for better whole-food coverage.
          </EmptyState>
        )}
        <div className="space-y-2">
          {results.map((food, i) => (
            <button
              key={i}
              onClick={() => onPick(food)}
              className="flex w-full items-center justify-between gap-3 border border-line bg-card px-3 py-2.5 text-left transition hover:bg-fill"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-ink">{food.name}</div>
                <div className="truncate text-xs text-muted">
                  {food.brand ? `${food.brand} · ` : ''}
                  {food.serving_size ? `${fmt(food.serving_size, 0)} ${food.serving_unit}` : food.serving_unit}
                  {food.household_serving ? ` (${food.household_serving})` : ''} · {food.source}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="numeral text-lg leading-none text-ink">{fmt(food.calories, 0)}</div>
                <div className="eyebrow mt-1">kcal</div>
                {/* A comparable figure across results with different native
                    serving sizes (30 g vs 170 g vs 100 g) — null (rendered
                    as nothing) for any unit that can't be safely converted,
                    e.g. "serving"/"cup"/"can" — see comparablePer100. */}
                {food.per100 && (
                  <div className="mt-0.5 text-[11px] text-faint">
                    ≈{fmt(food.per100.calories, 0)}/100{food.per100.basis}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
