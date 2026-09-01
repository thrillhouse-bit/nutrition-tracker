import AdaptiveFuelPlan from './AdaptiveFuelPlan.jsx'

function dateStamp(date) {
  return new Date(date)
    .toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })
    .replace(/,/g, '')
    .toUpperCase()
}

// The Plan tab is intentionally thin: AFP owns the profile, planned sessions,
// targets, progress, explanations, and day-specific corrections. Keeping this
// shell free of a second calculator makes the product's daily loop unambiguous.
export default function CanonicalPlan({ date, refreshKey, onChanged }) {
  return (
    <div>
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="serif text-[32px] leading-none text-ink">Plan</h2>
        <span className="tnum text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{dateStamp(date)}</span>
      </header>
      <AdaptiveFuelPlan date={date} refreshKey={refreshKey} onChanged={onChanged} />
    </div>
  )
}
