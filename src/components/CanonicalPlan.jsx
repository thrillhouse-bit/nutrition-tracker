import AdaptiveFuelPlan from './AdaptiveFuelPlan.jsx'
import { ymd } from '../lib/nutrition.js'

function dateStamp(date) {
  return new Date(date)
    .toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

// The Plan tab is intentionally thin: AFP owns the profile, planned sessions,
// targets, progress, explanations, and day-specific corrections. Keeping this
// shell free of a second calculator makes the product's daily loop unambiguous.
export default function CanonicalPlan({ date, refreshKey, onChanged }) {
  return (
    <div>
      <header className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2 border-b border-line pb-4">
        <h2 className="serif text-[32px] leading-tight text-ink">Plan</h2>
        <time dateTime={ymd(date)} className="tnum text-base font-medium leading-relaxed text-ink">{dateStamp(date)}</time>
      </header>
      <AdaptiveFuelPlan date={date} refreshKey={refreshKey} onChanged={onChanged} />
    </div>
  )
}
