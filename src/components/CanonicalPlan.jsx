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
      <header className="current-page-intro flex flex-wrap items-end justify-between gap-x-5 gap-y-4">
        <div>
          <p className="eyebrow text-white/70">Daily strategy</p>
          <h2 className="serif mt-1.5 text-[34px] leading-tight text-white">Plan</h2>
          <p className="current-page-intro-copy mt-2 max-w-[290px] text-[13px] leading-relaxed text-white/78">Your evidence-based targets, training context, and next adjustments in one place.</p>
        </div>
        <time dateTime={ymd(date)} className="current-page-date tnum max-w-[170px] border border-white/28 bg-black/15 px-3 py-2.5 text-right text-[15px] font-semibold leading-snug text-white">{dateStamp(date)}</time>
      </header>
      <AdaptiveFuelPlan date={date} refreshKey={refreshKey} onChanged={onChanged} />
    </div>
  )
}
