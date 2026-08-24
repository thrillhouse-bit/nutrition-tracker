import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client.js'
import { fmt } from '../lib/nutrition.js'
import { ErrorNote, Spinner, EmptyState, inputCls } from './ui.jsx'

// Debounced text search against USDA + Open Food Facts. Good for produce, bulk
// bins, and restaurant/deli items that have no barcode.
export default function SearchFood({ onPick }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const timer = useRef(null)

  useEffect(() => {
    clearTimeout(timer.current)
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    timer.current = setTimeout(async () => {
      setBusy(true)
      setError('')
      try {
        const { results } = await api.searchFoods(q.trim())
        setResults(results)
      } catch (err) {
        setError(err.message || 'Search failed.')
      } finally {
        setBusy(false)
      }
    }, 350)
    return () => clearTimeout(timer.current)
  }, [q])

  return (
    <div className="space-y-3">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search foods (e.g. banana, cheddar)"
        className={inputCls}
      />
      {busy && <Spinner label="Searching…" />}
      <ErrorNote>{error}</ErrorNote>
      {!busy && q.trim().length >= 2 && results.length === 0 && (
        <EmptyState title="No matches">
          Try manual entry, or add a USDA key for better whole-food coverage.
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
  )
}
