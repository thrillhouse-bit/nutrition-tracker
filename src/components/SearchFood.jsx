import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client.js'
import { fmt } from '../lib/nutrition.js'
import { createDebouncedSearch } from '../lib/debouncedSearch.js'
import { ErrorNote, Spinner, EmptyState, inputCls } from './ui.jsx'

// Debounced text search against USDA + Open Food Facts.
//
// The single rule this component is built around: EVERY rendered state belongs
// to exactly one query, and that query is the one in the input. Before the
// overhaul the rendered state was four loose pieces (`results`, `busy`,
// `error`, `degraded`) that no one bound to anything, which produced two of the
// six reported production behaviours (docs/food-search-baseline.md):
//
//   * "No matches" rendered during the 350 ms debounce window, before any
//     request existed — the empty state keyed off `results.length === 0 &&
//     !busy`, and `busy` was only set once the request STARTED. Measured
//     in-browser at +50 ms and +150 ms after typing "zucchini".
//   * The previous query's rows stayed mounted under the new query, with no
//     spinner, for the whole debounce window; and in the race in
//     debouncedSearch.js's header comment an OLDER query's results were
//     committed under a NEWER query with the spinner off.
//
// So state is now ONE object stamped with its query, replaced wholesale the
// moment the query changes, and a response is additionally checked against the
// live query before it may commit — a query-equality guard on top of the
// generation guard, because these two have already disagreed once.
const MIN_QUERY = 2

const IDLE = { query: '', status: 'idle', results: [], degraded: false, partial: false, usdaConfigured: null, canonicalCoverage: null, error: '' }

// Which sources genuinely did not answer, in words a person can act on. Only
// ever rendered when the server actually reported a failure — never as a
// hedge on a healthy search.
function partialNote({ canonicalCoverage, providers }) {
  const failed = (providers || []).filter((p) => p.ok === false)
  if (canonicalCoverage === 'missing') {
    return 'These results are incomplete: the whole-food database (USDA) did not answer, so only branded products are shown. Retry for the full list.'
  }
  const names = [...new Set(failed.map((p) => (p.source === 'usda' ? 'USDA' : 'Open Food Facts')))]
  if (!names.length) return null
  return `These results are incomplete: ${names.join(' and ')} did not answer. Retry to search everything.`
}

export default function SearchFood({ onPick }) {
  const [q, setQ] = useState('')
  const [view, setView] = useState(IDLE)
  const [active, setActive] = useState(-1)
  const debounced = useRef(null)
  const liveQuery = useRef('')
  const resultRefs = useRef([])
  if (!debounced.current) {
    debounced.current = createDebouncedSearch((query, opts) => api.searchFoods(query, opts))
  }

  const runSearch = (query) => {
    debounced.current.search(query, {
      // Only ever mutate state for the query that is still on screen. The
      // generation guard in debouncedSearch.js already drops superseded
      // responses; this is the independent second check the house rule asks
      // for, since a gate and the state it guards have drifted apart before.
      onStart: (forQuery) => {
        if (forQuery !== liveQuery.current) return
        setView((v) => ({ ...v, query: forQuery, status: 'pending', error: '' }))
      },
      onResult: (body, forQuery) => {
        if (forQuery !== liveQuery.current) return
        setView({
          query: forQuery,
          status: 'ready',
          results: body.results || [],
          degraded: !!body.degraded,
          partial: !!body.partial,
          usdaConfigured: body.usdaConfigured ?? null,
          canonicalCoverage: body.canonicalCoverage ?? null,
          providers: body.providers || body.sources || [],
          error: '',
        })
        setActive(-1)
      },
      onError: (err, forQuery) => {
        if (forQuery !== liveQuery.current) return
        setView((v) => ({ ...v, query: forQuery, status: 'error', results: [], error: err.message || 'Search failed.' }))
      },
    })
  }

  useEffect(() => {
    const trimmed = q.trim()
    liveQuery.current = trimmed
    if (trimmed.length < MIN_QUERY) {
      debounced.current.cancel()
      setView(IDLE)
      setActive(-1)
      return
    }
    // Wholesale replacement, synchronously, BEFORE the debounce is armed: the
    // previous query's rows must never be visible under this one, not even for
    // the length of the debounce.
    setView({ ...IDLE, query: trimmed, status: 'pending' })
    setActive(-1)
    runSearch(trimmed)
    return () => debounced.current.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  // Retries the SAME query immediately — the typed query is untouched through
  // every state, per the "preserve the user's query on failure" requirement.
  const retry = () => {
    const trimmed = q.trim()
    if (trimmed.length < MIN_QUERY) return
    setView({ ...IDLE, query: trimmed, status: 'pending' })
    runSearch(trimmed)
  }

  const pick = (food) => onPick({ ...food, search_method: food.search_method || 'text_search' })

  // Keyboard: Down/Up walk the results from the input, Enter takes the
  // highlighted one, Escape clears the query. Focus moves for real (rather
  // than a purely visual highlight) so a screen reader follows along.
  const onKeyDown = (e) => {
    const n = showResults.length
    if (e.key === 'Escape') { setQ(''); return }
    if (!n) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = e.key === 'ArrowDown'
        ? Math.min(n - 1, active + 1)
        : Math.max(0, active - 1)
      setActive(next)
      resultRefs.current[next]?.focus()
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      pick(showResults[active])
    }
  }

  // The view only ever renders for the query currently in the input. `bound`
  // is false for exactly one tick if a setState has not flushed yet; rendering
  // the pending state then is the honest answer, never stale rows.
  const trimmed = q.trim()
  const bound = view.query === trimmed && trimmed.length >= MIN_QUERY
  const status = trimmed.length < MIN_QUERY ? 'idle' : bound ? view.status : 'pending'
  const showResults = bound && status === 'ready' ? view.results : []
  const note = bound && status === 'ready' && (view.partial || view.canonicalCoverage === 'missing')
    ? partialNote(view)
    : null

  return (
    <div className="space-y-3">
      <input
        autoFocus
        aria-label="Search foods"
        aria-describedby="search-status"
        role="combobox"
        aria-expanded={showResults.length > 0}
        aria-controls="search-results"
        aria-autocomplete="list"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search foods (e.g. banana, cheddar)"
        className={inputCls}
      />
      {/*
        The Sheet this lives in (ui.jsx) is vertically centered on desktop
        (`sm:items-center`), so its height drives its position: a result count
        that swings keystroke to keystroke ("chick" → 12 results, "chicken" →
        3) reflows the whole sheet and visibly drags the input up and down the
        screen on almost every character — measured headlessly, up to 245px of
        vertical jump between consecutive settled searches. A FIXED height (not
        just a min/max clamp — that still let the sheet reflow between the
        floor and the ceiling, ~120px of residual jump measured) on this region
        while a search is active removes the swing at its source: the spinner,
        the empty state, and 1 result or 20 all occupy the same footprint,
        scrolling internally instead of resizing the sheet around them.
      */}
      <div className={trimmed.length >= MIN_QUERY ? 'h-[45vh] overflow-y-auto' : ''}>
        {/* One live region for the whole state machine, so a screen reader is
            told "Searching", "12 results", or "No matches" once per change
            instead of having to discover it. */}
        <div id="search-status" role="status" aria-live="polite" className="sr-only">
          {status === 'pending' && 'Searching'}
          {status === 'ready' && showResults.length > 0 && `${showResults.length} result${showResults.length === 1 ? '' : 's'} for ${view.query}`}
          {status === 'ready' && showResults.length === 0 && !view.degraded && !note && 'No matches'}
        </div>

        {/* Idle: nothing typed yet, or too short to search — no spinner, no
            empty-state message, just the plain input. */}
        {status === 'idle' && (
          <p className="px-1 py-2 text-sm text-faint">Type at least 2 characters to search.</p>
        )}

        {/* Pending covers the debounce window as well as the request itself.
            Before the overhaul this window rendered "No matches". */}
        {status === 'pending' && <Spinner label="Searching…" />}

        {status === 'error' && (
          <>
            <ErrorNote>{view.error}</ErrorNote>
            <div className="mt-3">
              <button type="button" onClick={retry} className="min-h-11 px-4 text-sm font-semibold text-cobalt hover:text-cobalt-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-cobalt">
                Retry
              </button>
            </div>
          </>
        )}

        {/* Upstream/provider failure — every source genuinely failed. Distinct
            from a real "nothing matched": the query is preserved, and Retry
            re-runs the SAME search immediately. */}
        {status === 'ready' && view.degraded && (
          <EmptyState title="Search is having trouble right now">
            We couldn't reach any food database — this is usually temporary.
            <div className="mt-3">
              <button type="button" onClick={retry} className="min-h-11 px-4 text-sm font-semibold text-cobalt hover:text-cobalt-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-cobalt">
                Retry
              </button>
            </div>
          </EmptyState>
        )}

        {/* Some sources answered and some did not. Rendered ABOVE whatever we
            do have, because the disclosure is about the list below it: a list
            that is missing its canonical whole foods looks like a complete
            list of branded packets, which is what production symptoms 3 and 4
            looked like to a user. */}
        {note && (
          <div className="mb-2 flex items-start gap-2 border border-line-strong bg-fill px-3 py-2 text-xs text-muted">
            <span>{note}</span>
            <button type="button" onClick={retry} className="ml-auto shrink-0 font-semibold text-cobalt hover:text-cobalt-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-cobalt">
              Retry
            </button>
          </div>
        )}

        {/* A genuine, complete, empty result. The USDA-key advice is shown ONLY
            when the server says USDA is genuinely unconfigured — production
            reported usda:"configured" while this line told people to add one. */}
        {status === 'ready' && !view.degraded && !note && showResults.length === 0 && (
          <EmptyState title="No matches">
            Try a different spelling, or add it with manual entry.
            {view.usdaConfigured === false && ' (This server has no USDA key configured, so whole-food coverage is limited.)'}
          </EmptyState>
        )}

        <ul id="search-results" role="listbox" aria-label="Search results" className="space-y-2">
          {showResults.map((food, i) => (
            <li key={`${food.source || 'x'}:${food.barcode || food.name}:${i}`}>
              <button
                ref={(el) => { resultRefs.current[i] = el }}
                role="option"
                aria-selected={active === i}
                onClick={() => pick(food)}
                onFocus={() => setActive(i)}
                onKeyDown={onKeyDown}
                className="flex w-full items-center justify-between gap-3 border border-line bg-card px-3 py-2.5 text-left transition hover:bg-fill focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cobalt"
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
                  {/* A null calorie figure is rendered as "—", not as fmt()'s
                      0: a confident zero on a real food is a fabricated
                      number, the same failure hasUsableNutrition exists to
                      prevent one field further up. */}
                  <div className="numeral text-lg leading-none text-ink">{food.calories == null ? '—' : fmt(food.calories, 0)}</div>
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
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
