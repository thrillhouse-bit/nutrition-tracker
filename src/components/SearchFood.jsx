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
  const debounced = useRef(null)
  if (!debounced.current) {
    debounced.current = createDebouncedSearch((query) => api.searchFoods(query).then((r) => r.results))
  }

  useEffect(() => {
    if (q.trim().length < 2) {
      debounced.current.cancel()
      setResults([])
      return
    }
    debounced.current.search(q.trim(), {
      onStart: () => {
        setBusy(true)
        setError('')
      },
      onResult: (results) => setResults(results),
      onError: (err) => setError(err.message || 'Search failed.'),
      onSettled: () => setBusy(false),
    })
    return () => debounced.current.cancel()
  }, [q])

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
        {busy && <Spinner label="Searching…" />}
        <ErrorNote>{error}</ErrorNote>
        {!busy && q.trim().length >= 2 && results.length === 0 && (
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
                  {food.serving_size ? `${fmt(food.serving_size, 0)} ${food.serving_unit}` : food.serving_unit} · {food.source}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="numeral text-lg leading-none text-ink">{fmt(food.calories, 0)}</div>
                <div className="eyebrow mt-1">kcal</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
