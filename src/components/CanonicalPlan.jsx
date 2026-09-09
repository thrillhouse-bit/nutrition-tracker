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
    <div className="plan-current-layout">
      <header className="current-page-intro">
        <div className="min-w-0">
          <p className="eyebrow text-white/70">Daily strategy</p>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="serif text-[34px] leading-tight text-white">Plan</h2>
            <time dateTime={ymd(date)} className="current-page-date current-page-date--inline tnum text-[11px] font-semibold uppercase tracking-[0.12em] text-white/82">{dateStamp(date)}</time>
          </div>
          <p className="current-page-intro-copy mt-2 max-w-[290px] text-[13px] leading-relaxed text-white/78">Your evidence-based targets, training context, and next adjustments in one place.</p>
        </div>
      </header>
      <AdaptiveFuelPlan date={date} refreshKey={refreshKey} onChanged={onChanged} />
    </div>
  )
}
