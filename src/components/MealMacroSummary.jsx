import { entryNutrient, fmt } from '../lib/nutrition.js'

const MACROS = [
  ['protein_g', 'Protein'],
  ['carbs_g', 'Carbs'],
  ['fat_g', 'Fat'],
]

// Use the same per-serving contribution as the daily totals. Unknown fields
// are not zero; a partially known meal must not imply a complete macro sum.
export default function MealMacroSummary({ entries = [] }) {
  return (
    <dl aria-label="Meal macro totals" className="flex flex-wrap gap-x-4 gap-y-1 text-xs leading-relaxed text-muted">
      {MACROS.map(([key, label]) => {
        const values = entries.map(entry => entryNutrient(entry, key))
        const known = values.filter(value => value !== null)
        const partial = known.length > 0 && known.length < values.length
        return (
          <div key={key} className="flex items-baseline gap-1">
            <dt>{label}</dt>
            <dd className="tnum text-ink">
              {known.length ? `${fmt(known.reduce((sum, value) => sum + value, 0), 1)} g${partial ? ' known' : ''}` : '—'}
              {!known.length && <span className="sr-only"> Not recorded</span>}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
