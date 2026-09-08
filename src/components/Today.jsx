import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client.js'
import HydrationPanel from './HydrationPanel.jsx'
import TodayBackdropSheet from './TodayBackdropSheet.jsx'
import { NUTRIENTS, sumEntries, entryNutrient, entryIncomplete, fmt, num, ymd } from '../lib/nutrition.js'
import { waterAmount } from '../lib/hydration.js'
import { DEFAULT_TODAY_BACKDROP, loadTodayBackdrop } from '../lib/todayBackdrop.js'
import { Disclosure, Meter, SegmentBar, SourceLabel, StatusTag, Why, Button, TextButton, EmptyState, Spinner } from './ui.jsx'

// Manual re-fetch window for the Oura backfill button below — a small
// trailing window is enough to catch anything the daily resync/connect-time
// pull missed; the endpoint itself accepts up to 90 but that's a connect-time
// concern, not a "did today's workout show up yet" one.
const OURA_REFRESH_DAYS = 5

const isToday = (d) => ymd(d) === ymd(new Date())

function primaryDayLabel(d) {
  if (isToday(d)) return 'Today'
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
  if (ymd(d) === ymd(yesterday)) return 'Yesterday'
  return new Date(d).toLocaleDateString(undefined, { weekday: 'long' })
}

function dateDetail(d) {
  const date = new Date(d)
  const options = { month: 'long', day: 'numeric' }
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric'
  return date.toLocaleDateString(undefined, options)
}

// Wall-clock helpers. Sync/updated stamps read naturally (locale, AM/PM);
// log-row times read 24h to match the artboard's dense "13:41" column.
function timeShort(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d) ? '' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
function timeHm(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d) ? '' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
}


// Decimal sleep hours -> {h, m}, so 7.7 renders "7h 42m".
function hoursToHm(v) {
  const mins = Math.max(0, Math.round(num(v) * 60))
  return { h: Math.floor(mins / 60), m: mins % 60 }
}

// A short provenance tag for a logged food, when its origin is knowable. Barcode
// items (and OFF matches) are "Scanned"; a photographed panel is "Label". Manual
// and search entries carry no capture claim, so no tag — never invent one.
function sourceTag(food) {
  const s = (food?.source || '').toLowerCase()
  if (food?.barcode) return 'Scanned'
  if (s === 'off' || s === 'barcode' || s === 'openfoodfacts') return 'Scanned'
  if (s === 'label' || s === 'ocr') return 'Label'
  return null
}

// --- Daily Signals: plain-language bands ------------------------------------
// Never a medical claim (README: "no medical, diagnostic, injury, or disease
// claims of any kind") — these are descriptive bands over the wearable's own
// 0-100 score / the night's own duration, nothing else.

// 70 mirrors server/plan.js's OWN threshold for its readiness rule ("below
// the ~70 mark that usually means recovery is still catching up") — reusing
// the exact number means this card's language and the plan engine's actual
// behavior agree about what "70" means, instead of a second, silently
// drifting definition of the same cutoff living in two files.
function readinessBand(value) {
  const v = num(value)
  if (v >= 85) return 'Strong recovery'
  if (v >= 70) return 'Solid recovery'
  if (v >= 50) return 'Moderate recovery'
  return 'Low recovery'
}

// 6.5h is server/plan.js's OWN "short sleep" threshold (its hydration/
// steady-carb note), not a new number invented for this card — same
// reasoning as readinessBand above. This is deliberately NOT a "vs. your
// baseline" comparison: that needs per-user sleep HISTORY, and nothing
// wired into Today fetches one today (the one existing history endpoint,
// server/db.js's listOuraHistory, covers readiness only, and only over the
// window Insights asks for — not this screen). Faking a personal average
// from data this screen doesn't have would be exactly the fabricated-number
// failure mode this codebase keeps re-learning from, so the comparison is
// left undone here rather than invented — see docs/DESIGN.md's open items.
function sleepBand(hours) {
  const h = num(hours)
  if (h > 0 && h < 6.5) return 'Short night'
  if (h > 9) return 'Long night'
  return 'Well rested'
}

const capFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

// The subject phrase for a workout signal — shared by the header's day
// sentence AND the Workout card below, so the same session is never
// described two different ways on one screen. A manual entry carries
// `intensity` (easy/moderate/hard — server/index.js's PUT /plan/workout);
// folded in here because it's real, user-entered data with no equivalent
// field on a wearable-synced workout.
function workoutSubject(wo) {
  const v = wo?.value
  if (!v) return null
  if (wo.provider === 'manual' && v.intensity && v.kind) return `${capFirst(v.intensity)} ${v.kind}`
  return v.label || (v.shortLabel ? capFirst(v.shortLabel) : 'Workout')
}

// Duration / energy for the Workout card. estKcal is the real field name
// every real source (synced or manual) writes; est_kcal only ever came from
// the seeded Garmin demo scenario (server/providers.js) — checked second so
// a demo session's number still renders too (same fallback Plan.jsx already
// uses for this exact field). Only the MANUAL path's number is a MET-based
// ESTIMATE (server/afp/engine.js), so only that path gets the "est." mark —
// a synced wearable's calories are the device's own measured reading.
function workoutMeta(wo) {
  const v = wo?.value
  if (!v) return null
  const parts = []
  if (v.durationMin != null) parts.push(`${Math.round(v.durationMin)} min`)
  const kcal = v.estKcal ?? v.est_kcal
  if (kcal != null) parts.push(`~${Math.round(kcal)} kcal${wo.provider === 'manual' ? ' est.' : ''}`)
  return parts.length ? parts.join(' · ') : null
}

// One clause for the header's day sentence — "Easy run planned at 5:30 PM."
// / "Evening Run completed at 6:02 AM." `status` comes straight off the
// signal (real detection sets 'completed'; manual entry and the demo
// scenario set 'planned') — never inferred from the clock, which would
// guess wrong for a synced workout logged after the fact.
//
// `isHistoricalDay` guards the one case that isn't just cosmetic: a manually
// entered workout (PUT /api/plan/workout) is stored with status:'planned'
// permanently — nothing in this app ever flips it to 'completed' after the
// fact — so viewing a PAST day with one would otherwise read "planned at
// 5:30 PM" forever, a live, forward-looking claim about a day already over.
// "Completed" stays "completed" on any day (that's a true statement
// regardless of when it's read); only the not-yet-completed case needs a
// past-safe word once the day itself is in the past.
function workoutClause(wo, isHistoricalDay) {
  const subject = workoutSubject(wo)
  if (!subject) return null
  const completed = wo.value.status === 'completed'
  const verb = completed ? 'completed' : (isHistoricalDay ? 'logged' : 'planned')
  return `${subject} ${verb}${wo.value.time ? ` at ${wo.value.time}` : ''}.`
}

// The header's one-sentence day summary (product ask's own example: "Solid
// recovery. Easy run planned at 5:30 PM."). Built ONLY from real (non-demo)
// present signals — the demo/no-connection states get their own honest
// message instead (see the render below) — and deliberately distinct
// wording from the Recommendation card beneath it (which is about calories/
// macros) and from the raw numerals the Daily Signals cards themselves show:
// this is a plain-language translation, not a restatement.
function daySentenceParts({ rd, sl, wo, hm, isHistoricalDay }) {
  const parts = []
  if (rd && rd.value != null && !rd.demo) parts.push(`${readinessBand(rd.value)}.`)
  const wc = wo && !wo.demo ? workoutClause(wo, isHistoricalDay) : null
  if (wc) parts.push(wc)
  if (parts.length === 0 && sl && sl.value != null && !sl.demo && hm) {
    parts.push(`Slept ${hm.h}h ${hm.m}m last night.`)
  }
  return parts
}

// A compact explanation of what influenced the readiness score, straight off
// Oura's own contributor sub-scores (server/integrations/oura.js's
// normalizeReadiness) — present only for real Oura data; the demo scenario
// and every other provider carry no `contributors` field, so this stays
// silent for them rather than fabricating a breakdown that isn't there.
function contributorLine(rd) {
  const c = rd?.contributors
  if (!c) return null
  const parts = []
  if (c.hrv_balance != null) parts.push(`HRV ${Math.round(c.hrv_balance)}`)
  if (c.resting_heart_rate != null) parts.push(`RHR ${Math.round(c.resting_heart_rate)}`)
  if (c.body_temperature != null) parts.push(`Temp ${Math.round(c.body_temperature)}`)
  return parts.length ? parts.join(' · ') : null
}

// One glance-rail instrument. Bounded readings get a real progress arc;
// unbounded readings keep the circle as a stable visual slot without implying
// a target. It becomes a button only when there is a useful destination
// (Activity → Plan); nutrition/readiness/sleep remain plain readings.
const GLANCE_MARKS = {
  Fuel: '↗',
  Protein: 'P',
  Water: '◒',
  Carbs: 'C',
  Readiness: '◇',
  Sleep: '☾',
  Activity: '↟',
}

function SignalOrb({ label, value, detail, secondaryDetail, detailWrap = false, progress, onClick, actionLabel }) {
  const Tag = onClick ? 'button' : 'div'
  const boundedProgress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : null
  const radius = 38
  const circumference = 2 * Math.PI * radius
  const accessibleValue = [label, value, detail, secondaryDetail].filter(Boolean).join('. ')
  return (
    <Tag
      {...(onClick
        ? { type: 'button', onClick, 'aria-label': actionLabel || accessibleValue }
        : { role: 'group', 'aria-label': accessibleValue })}
      className={`today-glance-orb ${detailWrap ? 'w-[112px]' : 'w-[98px]'} shrink-0 text-center ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="relative mx-auto h-[88px] w-[88px]">
        <svg aria-hidden viewBox="0 0 88 88" className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx="44" cy="44" r={radius} fill="rgb(255 255 255 / 0.09)" stroke="rgb(255 255 255 / 0.30)" strokeWidth="1.5" />
          {boundedProgress != null && boundedProgress > 0 && (
            <circle
              cx="44"
              cy="44"
              r={radius}
              fill="none"
              stroke="var(--color-current-glow)"
              strokeWidth="4"
              strokeLinecap="butt"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={circumference * (1 - boundedProgress)}
            />
          )}
        </svg>
        <span aria-hidden className="absolute inset-x-0 top-[13px] text-[11px] font-bold leading-none tracking-[0.06em] text-white/90">{GLANCE_MARKS[label] || '·'}</span>
        <span className="numeral absolute inset-x-0 bottom-[19px] flex items-center justify-center px-1 text-[21px] font-semibold leading-none text-white">{value}</span>
      </div>
      <span className="mt-1.5 block text-[12px] font-bold leading-tight text-white">{label}</span>
      {detail && <span title={detail} className={`mt-0.5 block text-[10px] leading-[1.25] text-white/90 ${detailWrap ? 'whitespace-normal' : 'truncate'}`}>{detail}</span>}
      {secondaryDetail && <span title={secondaryDetail} className={`mt-0.5 block text-[9.5px] leading-[1.25] text-white/86 ${detailWrap ? 'whitespace-normal' : 'truncate'}`}>{secondaryDetail}</span>}
    </Tag>
  )
}

function CurrentArc({ progress, hasTarget }) {
  const pct = hasTarget ? Math.max(0, Math.min(1, progress)) : 0
  return (
    <svg aria-hidden viewBox="0 0 360 152" className="h-auto w-full overflow-visible">
      <path d="M 14 137 Q 180 -20 346 137" pathLength="100" fill="none" stroke="rgb(255 255 255 / 0.72)" strokeWidth="6.5" />
      {hasTarget && pct > 0 && (
        <path
          d="M 14 137 Q 180 -20 346 137"
          pathLength="100"
          fill="none"
          stroke="var(--color-current-glow)"
          strokeWidth="8"
          strokeDasharray={`${pct * 100} 100`}
          strokeLinecap="butt"
        />
      )}
      <circle cx="14" cy="137" r="3" fill="rgb(255 255 255 / 0.78)" />
      <circle cx="346" cy="137" r="3" fill="rgb(255 255 255 / 0.78)" />
    </svg>
  )
}

// A chronological log line: time, name (+ capture/pending tags), calories.
// Tapping edits (pending entries are not yet editable); ✕ deletes.
function LogRow({ entry, onEdit, onDelete }) {
  const food = entry.food || {}
  const pending = entry._pending
  const tag = sourceTag(food)
  // A manually-entered food whose nutrition fields were never filled in (as
  // opposed to a food genuinely logged at 0, e.g. black coffee) would
  // otherwise render as an indistinguishable "0 kcal" and count as a
  // verified zero in the day's totals — entryIncomplete/sumEntries
  // (nutrition.js) are what keep the two apart.
  const incomplete = entryIncomplete(entry)
  return (
    <div className="flex min-h-11 items-center gap-2 border-t border-line first:border-t-0">
      <button
        onClick={() => !pending && onEdit(entry)}
        disabled={pending}
        // self-stretch: the row is min-h-11 but the button shrank to its text
        // (measured 41px) — stretching it makes the whole 44px row tappable.
        className="flex min-w-0 flex-1 items-baseline gap-3.5 self-stretch py-2 text-left disabled:cursor-default"
      >
        <span className="w-[42px] shrink-0 tnum text-[10.5px] font-medium text-muted">{timeHm(entry.logged_at)}</span>
        <span className="min-w-0 flex-1 truncate text-[14.5px] leading-tight text-ink">
          {food.name || 'Food'}
          {tag && <span className="ml-1.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted">· {tag}</span>}
          {pending && (
            // Sand, not amber warn — "in progress" reads with the app's own
            // training-context tone (Plan.jsx's tag chips are the same
            // bg-sand + text-ink combination) rather than a 7th hue.
            <span className="ml-1.5 rounded bg-sand px-1 py-0.5 align-middle text-[9px] font-semibold uppercase tracking-wide text-ink">pending</span>
          )}
        </span>
        {/* Shape + word, same "missing data" language as ContextCell's
            em-dash + "No data" mark for a missing reading — never a silent
            zero standing in for an unknown value. self-center: the row is
            items-baseline for the text columns either side of it, which
            would otherwise sit this glyph+word mark off the text baseline. */}
        {incomplete ? (
          <StatusTag status="unavailable" label="Needs details" className="shrink-0 self-center" />
        ) : (
          <span className="shrink-0 numeral text-[17px] text-ink">{fmt(entryNutrient(entry, 'calories'), 0)}</span>
        )}
      </button>
      <button
        onClick={() => onDelete(entry.id)}
        className="flex h-11 w-11 shrink-0 items-center justify-center text-faint hover:text-alert"
        aria-label="Delete entry"
      >
        ✕
      </button>
    </div>
  )
}

// Which signal drove computeRecommendation's fired rule (server/plan.js) —
// `rec.kind` is exactly one of these four; used by the enriched Why content
// below to name the driver rather than leave it implicit in the prose.
const DRIVER_LABEL = {
  pre_workout: 'Workout timing',
  protein_pacing: 'Protein pacing vs. time of day',
  over: "Today's calorie target",
  on_track: "Today's calorie target",
}

// Day-nav (‹ ›) sits at the top of a screen with everything else reachable
// lower down — a real one-handed-reach gap on a tall phone. A swipe adds a
// second, thumb-friendly way to change days without moving or duplicating
// the existing buttons. Deliberately NOT an edge swipe (iOS Safari reserves
// screen-edge horizontal swipes for browser back/forward) — it only
// triggers from a touch that starts and stays within ordinary content, and
// backs off the moment a gesture reads as more vertical than horizontal so
// it never fights the page's own scroll.
const SWIPE_MIN_PX = 60
const SWIPE_MAX_VERTICAL_PX = 50

function useDaySwipe(onPrevDay, onNextDay, canGoNext) {
  const start = useRef(null)
  return {
    onTouchStart: (e) => {
      const t = e.touches[0]
      start.current = { x: t.clientX, y: t.clientY }
    },
    onTouchEnd: (e) => {
      if (!start.current) return
      const t = e.changedTouches[0]
      const dx = t.clientX - start.current.x
      const dy = t.clientY - start.current.y
      start.current = null
      if (Math.abs(dy) > SWIPE_MAX_VERTICAL_PX || Math.abs(dx) < SWIPE_MIN_PX) return
      // Mirrors the › button's own disabled={isToday(date)} guard — shiftDay
      // itself has no floor/ceiling, so without this a swipe could reach
      // into the future where the button can't.
      if (dx < 0) { if (canGoNext) onNextDay() }
      else onPrevDay()
    },
  }
}

export default function Today({ date, data, dataError, entries, loading, online, syncing, pendingCount, onSync, onEditEntry, onDeleteEntry, onPrevDay, onNextDay, onToday, openAdd, onViewLog, onGoToPlan, onGoToConnections, onChanged, userId }) {
  const swipeHandlers = useDaySwipe(onPrevDay, onNextDay, !isToday(date))
  const glanceRailRef = useRef(null)
  // A workout's own 'planned'/'completed' status never changes itself once a
  // day is over (see workoutClause's own comment) — this is what lets any
  // rendering of it stay honest about tense once the VIEWED day, not the
  // workout's status, has moved into the past.
  const isHistoricalDay = !isToday(date)
  const [ouraBusy, setOuraBusy] = useState(false)
  const [ouraError, setOuraError] = useState('')
  const [backdropOpen, setBackdropOpen] = useState(false)
  const [backdrop, setBackdrop] = useState(() => userId ? loadTodayBackdrop(userId) : { ...DEFAULT_TODAY_BACKDROP })
  useEffect(() => {
    setBackdrop(userId ? loadTodayBackdrop(userId) : { ...DEFAULT_TODAY_BACKDROP })
    setBackdropOpen(false)
  }, [userId])
  const totals = useMemo(() => sumEntries(entries), [entries])
  // The composite hasn't arrived yet (App.jsx starts `todayData` at null and
  // only replaces it once /api/today resolves) — distinct from a resolved
  // composite that genuinely has no signals/recommendation. Only the header
  // and Daily Signals below read this; the log list already has its own
  // `loading` (entries) handling further down, unchanged. Deliberately does
  // NOT distinguish loading from `dataError` here — a plain skeleton is a
  // safe placeholder either way for the Daily Signals cards below; only the
  // status line and day-sentence slot (which is where a user actually looks
  // to understand "why isn't anything here") separately check `dataError` to
  // give an honest message and a real retry action instead of a skeleton
  // that would otherwise wait forever.
  const todayLoading = data == null
  const targets = data?.adjusted || data?.baseline || {}
  const rec = data?.recommendation
  const signals = data?.signals || {}
  const providerStates = data?.providers || []

  const calTarget = num(targets.calories)
  const calDone = num(totals.calories)
  const calLeft = calTarget - calDone
  const calPct = calTarget > 0 ? Math.min(1, calDone / calTarget) : 0
  const secondary = NUTRIENTS.filter((n) => n.key !== 'calories')
  const proteinDone = num(totals.protein_g)
  const proteinTarget = num(targets.protein_g)
  const carbsDone = num(totals.carbs_g)
  const carbsTarget = num(targets.carbs_g)
  const nutrientCoverage = (key) => {
    if (entries.length === 0) return { complete: true, partial: false }
    const known = entries.filter((entry) => entryNutrient(entry, key) !== null).length
    return { complete: known === entries.length, partial: known > 0 && known < entries.length }
  }
  const proteinCoverage = nutrientCoverage('protein_g')
  const carbsCoverage = nutrientCoverage('carbs_g')
  const hydration = data?.hydration || {}
  const hydrationPreferences = hydration.preferences || {}
  const hydrationTotal = hydration.total_ml == null
    ? (hydration.entries || []).reduce((sum, entry) => sum + num(entry.amount_ml), 0)
    : num(hydration.total_ml)
  const hydrationGoal = isToday(date) ? num(hydrationPreferences.goal_ml) : 0

  // Energy balance — calories logged (in) vs. wearable-reported expenditure
  // (out) = net deficit/surplus, plus steps. README has described this card
  // since the original Oura integration (123d951) but the "Fueling-
  // intelligence" redesign (d2e0829) never carried it into the rebuilt
  // Today — signals.expenditure/signals.steps kept flowing through
  // /api/today (composeSignals, with the same demo/freshness/provenance
  // every other card here already uses) with no surface rendering them.
  const exp = signals.expenditure?.demo === true ? null : signals.expenditure
  const steps = signals.steps?.demo === true ? null : signals.steps
  const expMissing = !exp || exp.value == null
  const stepsMissing = !steps || steps.value == null
  const netBalance = expMissing ? null : calDone - num(exp.value)

  // Context readings — computed up front so the header's sync line and day
  // sentence below (which read rd/sl/wo) and the Daily Signals cards further
  // down share exactly one set of values, never two.
  // Ignore any legacy sample payload defensively while cached clients and old
  // server responses age out. The provider layer no longer emits demo data.
  const rd = signals.readiness?.demo === true ? null : signals.readiness
  const sl = signals.sleep?.demo === true ? null : signals.sleep
  const wo = signals.workout?.demo === true ? null : signals.workout
  const rdMissing = !rd || rd.value == null
  const slMissing = !sl || sl.value == null
  const woLabel = wo?.value?.shortLabel || wo?.value?.label
  const wearableWorkout = wo && ['oura', 'garmin', 'apple'].includes(wo.provider) ? wo : null
  const hm = slMissing ? null : hoursToHm(sl.value)

  // Sync line — honest about what actually reported. Manual workout input is
  // useful plan context, but it is not a wearable connection and must never
  // make the header claim a device synced.
  const present = ['readiness', 'sleep', 'workout'].map((k) => signals[k]).filter(Boolean)
  const wearablePresent = present.filter((s) => !s.demo && ['oura', 'garmin', 'apple'].includes(s.provider))
  const liveProviders = [...new Set(wearablePresent.map((s) => s.provider.toUpperCase()))]
  const linkedProviders = providerStates.filter((p) => ['connected', 'syncing', 'stale'].includes(p.status))
  const linkedProviderDisplayNames = [...new Set(linkedProviders.map((p) => String(p.name || p.id || '')).filter(Boolean))]
  const linkedProviderNames = linkedProviderDisplayNames.map((name) => name.toUpperCase())
  const connectedWithoutData = liveProviders.length === 0 && linkedProviders.length > 0
  const linkedHasError = providerStates.some((p) => p.status === 'error' || p.sync_error)
  const linkedNeedsAttention = linkedHasError || (!isHistoricalDay && linkedProviders.some((p) => p.status === 'stale'))
  const hasWearableConnection = linkedProviders.length > 0 || wearablePresent.length > 0
  const showWearableSignals = !todayLoading && wearablePresent.length > 0

  // Wearable refresh / honest per-provider capability, for the header below.
  // Oura is the only one of the three with a real "ask for fresh data"
  // action — POST /api/oura/backfill (server/index.js) re-pulls readiness/
  // sleep-score/activity/workouts straight from Oura's live API; it already
  // existed with no client caller before this. Offered only when Oura is
  // genuinely the live (non-demo) source for one of these three signals —
  // never for a disconnected account, and never dressed up for a demo
  // scenario. Garmin's Health API is push-only here (data arrives solely via
  // the inbound webhook — no route calls out to ask Garmin for anything) and
  // Apple has no cloud API at all (a companion app pushes to
  // /api/apple/ingest, already re-read fresh on every /api/today load) — so
  // neither gets a button that would fire against nothing; both get plain,
  // true copy about how their data actually arrives, shown only once one of
  // them is genuinely (non-demo) the source for a card, same reasoning as
  // Oura's gate.
  const ouraLive = present.some((s) => s.provider === 'oura' && !s.demo)
  const garminLive = present.some((s) => s.provider === 'garmin' && !s.demo)
  const appleLive = present.some((s) => s.provider === 'apple' && !s.demo)
  const ouraConnected = linkedProviders.some((p) => p.id === 'oura')

  const refreshOura = async () => {
    setOuraBusy(true)
    setOuraError('')
    try {
      await api.ouraBackfill(OURA_REFRESH_DAYS)
      onChanged?.()
    } catch (err) {
      setOuraError(err.message || 'Could not refresh from Oura — try again.')
    } finally {
      setOuraBusy(false)
    }
  }

  const syncTime = timeShort(data?.generatedAt)
  const syncLive = liveProviders.length > 0
  // A real (non-demo) reading recorded 18-48h ago (freshnessOf,
  // server/providers.js) — old enough that plan.js stops trusting it, but a
  // genuine reading, not an outright missing one. Named here so the header
  // can say so plainly and offer a real next step, rather than silently
  // showing the same "SYNCED" copy for a signal that quietly stopped updating.
  const staleSignal = isHistoricalDay ? null : present.find((s) => !s.demo && s.freshness === 'stale')
  // The header's one-sentence day summary, or an honest alternate message —
  // built from the same source classification as the connection row so the
  // two never disagree about live, linked-without-data, or food-only state.
  let daySentence = []
  let altMessage = null
  if (syncLive) {
    daySentence = daySentenceParts({ rd, sl, wo, hm, isHistoricalDay })
  } else if (connectedWithoutData && isHistoricalDay) {
    const displayNames = linkedProviderDisplayNames.join(' + ')
    const verb = linkedProviderNames.length === 1 ? 'is' : 'are'
    altMessage = `${displayNames} ${verb} connected — no readings were recorded for this day.`
  } else if (connectedWithoutData) {
    const displayNames = linkedProviderDisplayNames.join(' + ')
    const verb = linkedProviderNames.length === 1 ? 'is' : 'are'
    altMessage = linkedNeedsAttention
      ? `${displayNames} ${verb} connected, but recent readings have not arrived. Check the connection.`
      : `${displayNames} ${verb} connected — awaiting today's readings.`
  } else {
    altMessage = 'Food, hydration, and your daily plan work without a wearable.'
  }

  const contribLine = contributorLine(rd)
  const workoutInteractive = typeof onGoToPlan === 'function'

  // Enriched "Why this?" content for the recommendation card. An audit found
  // the disclosure was just rec.why (server/plan.js) — the reasoning text for
  // whichever rule fired, but never naming which signal drove it, today's
  // actual intake-vs-target, or each signal's own freshness. Built only from
  // what Today already holds: rec.kind names the rule (computeRecommendation
  // returns exactly these four), calDone/calTarget are the same totals the
  // "Intake so far" section renders below, and signals carries each reading's
  // own {provider, freshness, demo} — SourceLabel is the same component the
  // context strip above uses for that, so freshness reads identically in
  // both places rather than a new copy of the wording.
  const whyItems = useMemo(() => {
    if (!rec) return []
    const items = [...(rec.why || [])]
    if (DRIVER_LABEL[rec.kind]) {
      items.push(
        <div key="driver" className="flex items-baseline justify-between gap-3">
          <span>Driven by</span>
          <span className="font-semibold text-ink">{DRIVER_LABEL[rec.kind]}</span>
        </div>,
      )
    }
    if (calTarget > 0) {
      items.push(
        <div key="intake" className="flex items-baseline justify-between gap-3">
          <span>Current intake vs. target</span>
          <span className="tnum font-semibold text-ink">{fmt(calDone, 0)} / {fmt(calTarget, 0)} kcal</span>
        </div>,
      )
    }
    const sigRows = [['readiness', 'Readiness', rd], ['sleep', 'Sleep', sl], ['workout', 'Workouts', wo]].filter(([, , s]) => s)
    if (sigRows.length > 0) {
      items.push(
        <div key="freshness" className="space-y-1.5">
          <div>Signal freshness</div>
          {sigRows.map(([k, label, s]) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <span className="text-xs">{label}</span>
              <SourceLabel signal={s} historical={isHistoricalDay} />
            </div>
          ))}
        </div>,
      )
    }
    return items
  }, [rec, rd, sl, wo, calDone, calTarget, isHistoricalDay])

  const providerHeading = liveProviders.map((name) => name[0] + name.slice(1).toLowerCase()).join(' + ')
  const staleWhen = staleSignal ? timeShort(staleSignal.recorded_at) : ''
  let connectionHeading
  let connectionDetail
  if (dataError && todayLoading) {
    connectionHeading = "Couldn't update today"
    connectionDetail = 'Check your connection and try again'
  } else if (todayLoading) {
    connectionHeading = 'Updating today'
    connectionDetail = 'Reading your latest plan and signals'
  } else if (syncLive) {
    connectionHeading = isHistoricalDay ? `Recorded by ${providerHeading}` : `${providerHeading} ${staleSignal ? 'needs attention' : 'synced'}`
    if (isHistoricalDay) {
      const recordedSignal = wearablePresent.find((signal) => signal.recorded_at)
      const recordedDetail = recordedSignal ? `Recorded ${timeShort(recordedSignal.recorded_at)}` : `Recorded for ${dateDetail(date)}`
      connectionDetail = linkedHasError ? `${recordedDetail} · Connection needs attention` : recordedDetail
    } else if (staleSignal) connectionDetail = staleWhen ? `Last synced ${staleWhen}` : 'Recent readings may be out of date'
    else if (garminLive && !ouraLive && !appleLive) connectionDetail = 'Garmin syncs automatically'
    else if (appleLive && !ouraLive && !garminLive) connectionDetail = 'Open the companion app to sync Apple Health'
    else connectionDetail = syncTime ? `Updated ${syncTime}` : 'Latest readings available'
  } else if (connectedWithoutData && isHistoricalDay) {
    connectionHeading = `${linkedProviderDisplayNames.join(' + ')} connected`
    connectionDetail = `No readings recorded for ${dateDetail(date)}`
  } else if (connectedWithoutData) {
    connectionHeading = `${linkedProviderDisplayNames.join(' + ')} ${linkedNeedsAttention ? 'needs attention' : 'connected'}`
    connectionDetail = linkedNeedsAttention ? 'Recent readings have not arrived' : "Awaiting today's readings"
  } else {
    connectionHeading = 'Fuel + hydration mode'
    connectionDetail = 'Food, water, and your daily plan work without a wearable'
  }

  const recentEntries = entries.slice(-3)
  const hiddenEntryCount = Math.max(0, entries.length - recentEntries.length)

  const hasCalorieTarget = calTarget > 0
  const calorieProgressText = hasCalorieTarget ? `${Math.round((calDone / calTarget) * 100)}%` : `${fmt(calDone, 0)} kcal logged`
  const heroTitle = rec?.title || (dataError && todayLoading
    ? 'Today needs a refresh'
    : todayLoading
      ? 'Building today’s current'
      : !hasCalorieTarget
        ? 'Finish your daily fuel plan'
        : entries.length === 0
          ? 'Log your first meal'
          : 'Keep logging your day')
  const heroDetail = rec?.detail || (dataError && todayLoading
    ? 'Your saved logs are still here. Try the update again to rebuild the daily plan.'
    : todayLoading
      ? 'Reading your plan, intake, and connected signals.'
      : !hasCalorieTarget
        ? 'Complete Plan setup to measure intake against a personal target.'
        : 'Each food and water entry sharpens the next recommendation.')
  const backdropStyle = backdrop.kind === 'photo' ? { backgroundImage: `url(${backdrop.dataUrl})` } : undefined
  const scrollGlanceRail = (direction) => {
    glanceRailRef.current?.scrollBy?.({ left: direction * 118, behavior: 'smooth' })
  }

  return (
    <div className="-mx-4 -mt-4" {...swipeHandlers}>
      <section
        aria-labelledby="today-recommendation"
        className="today-current-field relative min-h-[710px] overflow-hidden text-white"
        data-scene={backdrop.kind === 'scene' ? backdrop.scene : 'photo'}
      >
        <div aria-hidden className="today-current-backdrop absolute inset-0 bg-cover bg-center" style={backdropStyle} />
        <div aria-hidden className="today-current-scrim absolute inset-0" />
        <div aria-hidden="true" className="today-hero-outcome-protection absolute inset-x-0 bottom-0 top-[43%]" />
        <div className="relative z-[1] flex min-h-[710px] flex-col pb-16 pt-4">
          <div className="today-hero-information-backplate pb-4">
          <header className="px-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 pt-1">
                <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/90">Body Current</div>
                <h1 className="serif mt-1 text-[31px] font-semibold leading-none tracking-[-0.02em] text-white">{primaryDayLabel(date)}</h1>
                <p className="tnum mt-1 text-[11px] font-medium text-white/90">{dateDetail(date)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <nav aria-label="Choose day" className="flex items-center">
                  <button onClick={onPrevDay} aria-label="Previous day" className="today-hero-control flex h-11 w-11 items-center justify-center text-xl leading-none text-white">‹</button>
                  <button onClick={onNextDay} disabled={isToday(date)} aria-label="Next day" className="today-hero-control flex h-11 w-11 items-center justify-center text-xl leading-none text-white disabled:cursor-not-allowed disabled:opacity-35">›</button>
                </nav>
                <button type="button" onClick={() => setBackdropOpen(true)} className="today-hero-control flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center text-white" aria-label="Change Today backdrop" title="Change backdrop">
                  <svg aria-hidden viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="M4 16.5 9.2 11l3.2 3.1 2.1-2.2L20 17.5" />
                    <rect x="3.5" y="4" width="17" height="16" />
                    <circle cx="16.8" cy="8.2" r="1.4" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="mt-3 flex min-h-[52px] items-stretch border-b border-white/32 bg-white/[0.035] backdrop-blur-[1px]">
              <div className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5">
                <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${dataError && todayLoading ? 'border border-white bg-transparent' : linkedHasError ? 'border border-white bg-transparent' : syncLive && !staleSignal ? 'bg-white' : syncLive || linkedNeedsAttention ? 'border border-white bg-transparent' : connectedWithoutData ? 'border border-white bg-transparent' : 'border border-white/60 bg-transparent'}`} />
                <div className="min-w-0">
                  <div className="text-[12px] font-bold leading-snug text-white">{connectionHeading}</div>
                  <div className="mt-0.5 text-[10.5px] leading-snug text-white/90">{connectionDetail}</div>
                </div>
              </div>
              <div className="flex shrink-0 items-center border-l border-white/24">
                {!isHistoricalDay && (ouraLive || ouraConnected) && (
                  <button type="button" onClick={refreshOura} disabled={ouraBusy} aria-label="Refresh Oura data" className="today-hero-action flex min-h-11 min-w-14 items-center justify-center px-3 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                    {ouraBusy ? <Spinner /> : 'Refresh'}
                  </button>
                )}
                {!todayLoading && (linkedHasError || (!isHistoricalDay && ((syncLive && staleSignal) || connectedWithoutData))) && onGoToConnections && (
                  <button type="button" onClick={onGoToConnections} className="today-hero-action flex min-h-11 items-center border-l border-white/24 px-3 text-[11px] font-bold text-white">Manage</button>
                )}
                {!todayLoading && !isHistoricalDay && !hasWearableConnection && onGoToConnections && (
                  <button type="button" onClick={onGoToConnections} className="today-hero-action flex min-h-11 items-center px-3 text-[11px] font-bold text-white">Connect</button>
                )}
              </div>
            </div>

            {altMessage && <p className="sr-only">{altMessage}</p>}
            {(todayLoading || (syncLive && daySentence.length > 0)) && (
              <div className="mt-2 min-h-[20px]">
                {dataError && todayLoading ? (
                  <div className="border-l-2 border-white bg-black/28 px-3 py-2">
                    <p className="text-[13px] font-semibold leading-snug text-white">Today’s information couldn’t load.</p>
                    {onChanged && <button type="button" onClick={onChanged} className="mt-1 min-h-11 text-[12px] font-bold text-white underline underline-offset-4">Try again</button>}
                  </div>
                ) : todayLoading ? (
                  <div className="h-5 w-3/4 bg-white/16" />
                ) : (
                  <p className="text-[13px] font-semibold leading-snug text-white">{daySentence.join(' ')}</p>
                )}
              </div>
            )}
            {ouraError && <div role="alert" className="mt-2 border-l-2 border-white bg-black/35 px-3 py-2 text-[12px] font-semibold text-white">{ouraError}</div>}
            {!isToday(date) && <button type="button" onClick={onToday} className="mt-1 min-h-11 text-[11px] font-bold text-white underline underline-offset-4">Return to today</button>}
          </header>

          <section aria-labelledby="today-at-a-glance" className="mt-2">
            <div className="flex items-baseline justify-between gap-3 px-4">
              <h2 id="today-at-a-glance" className="text-[15px] font-bold leading-tight text-white">At a glance</h2>
              <span aria-hidden className="text-[10px] text-white/90">Swipe</span>
              <span id="today-glance-instructions" className="sr-only text-white/90">Swipe or use arrow keys</span>
            </div>
            {showWearableSignals && <h3 className="sr-only">Daily signals</h3>}
            <div
              ref={glanceRailRef}
              role="region"
              tabIndex="0"
              aria-label="Nutrition, hydration, and available wearable signals"
              aria-describedby="today-glance-instructions"
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                event.preventDefault()
                scrollGlanceRail(event.key === 'ArrowRight' ? 1 : -1)
              }}
              onTouchStart={(event) => event.stopPropagation()}
              onTouchEnd={(event) => event.stopPropagation()}
              className="today-glance-rail mt-2 flex gap-2.5 overflow-x-auto px-4 pb-2 [scrollbar-gutter:stable]"
            >
              <SignalOrb
                label="Fuel"
                value={todayLoading ? '—' : hasCalorieTarget ? `${Math.round((calDone / calTarget) * 100)}%` : `${fmt(calDone, 0)}`}
                detail={todayLoading ? 'Updating' : hasCalorieTarget ? `${fmt(calDone, 0)} / ${fmt(calTarget, 0)} kcal` : 'kcal logged'}
                progress={hasCalorieTarget ? calDone / calTarget : undefined}
              />
              <SignalOrb
                label="Protein"
                value={todayLoading || !proteinCoverage.complete && !proteinCoverage.partial ? '—' : proteinCoverage.partial ? `${fmt(proteinDone, 0)}g` : proteinTarget > 0 ? `${Math.round((proteinDone / proteinTarget) * 100)}%` : `${fmt(proteinDone, 0)}g`}
                detail={todayLoading ? 'Updating' : !proteinCoverage.complete && !proteinCoverage.partial ? 'No protein data' : proteinCoverage.partial ? `${fmt(proteinDone, 0)} g known · partial` : proteinTarget > 0 ? `${fmt(proteinDone, 0)} / ${fmt(proteinTarget, 0)} g` : 'g logged'}
                secondaryDetail={proteinCoverage.partial ? 'Some entries are missing protein' : null}
                progress={proteinCoverage.complete && proteinTarget > 0 ? proteinDone / proteinTarget : undefined}
              />
              <SignalOrb
                label="Water"
                value={todayLoading ? '—' : hydrationGoal > 0 ? `${Math.round((hydrationTotal / hydrationGoal) * 100)}%` : waterAmount(hydrationTotal, hydrationPreferences.unit || 'ml')}
                detail={todayLoading ? 'Updating' : hydrationGoal > 0 ? `${waterAmount(hydrationTotal, hydrationPreferences.unit || 'ml')} / ${waterAmount(hydrationGoal, hydrationPreferences.unit || 'ml')}` : 'Logged'}
                progress={hydrationGoal > 0 ? hydrationTotal / hydrationGoal : undefined}
              />
              <SignalOrb
                label="Carbs"
                value={todayLoading || !carbsCoverage.complete && !carbsCoverage.partial ? '—' : carbsCoverage.partial ? `${fmt(carbsDone, 0)}g` : carbsTarget > 0 ? `${Math.round((carbsDone / carbsTarget) * 100)}%` : `${fmt(carbsDone, 0)}g`}
                detail={todayLoading ? 'Updating' : !carbsCoverage.complete && !carbsCoverage.partial ? 'No carb data' : carbsCoverage.partial ? `${fmt(carbsDone, 0)} g known · partial` : carbsTarget > 0 ? `${fmt(carbsDone, 0)} / ${fmt(carbsTarget, 0)} g` : 'g logged'}
                secondaryDetail={carbsCoverage.partial ? 'Some entries are missing carbs' : null}
                progress={carbsCoverage.complete && carbsTarget > 0 ? carbsDone / carbsTarget : undefined}
              />
              {!rdMissing && <SignalOrb label="Readiness" value={`${Math.round(num(rd.value))}`} detail={isHistoricalDay ? `${capFirst(rd.provider || 'wearable')} · recorded ${timeShort(rd.recorded_at) || primaryDayLabel(date)}` : `${capFirst(rd.provider || 'wearable')} · ${readinessBand(rd.value)}`} secondaryDetail={contribLine} progress={num(rd.value) / 100} />}
              {!slMissing && <SignalOrb label="Sleep" value={`${hm.h}h ${hm.m}m`} detail={isHistoricalDay ? `${capFirst(sl.provider || 'wearable')} · recorded ${timeShort(sl.recorded_at) || primaryDayLabel(date)}` : `${capFirst(sl.provider || 'wearable')} · ${sl.score != null ? `Score ${Math.round(num(sl.score))}` : sleepBand(sl.value)}`} secondaryDetail={sl.score != null && isHistoricalDay ? `Score ${Math.round(num(sl.score))}` : null} />}
              {wearableWorkout && (
                <SignalOrb
                  label="Activity"
                  value={woLabel ? capFirst(wearableWorkout.value.shortLabel || wearableWorkout.value.kind || 'Done') : 'Rest'}
                  detail={`${capFirst(wearableWorkout.provider || 'wearable')} · ${wearableWorkout.value.status === 'completed' ? 'Completed' : isHistoricalDay ? 'Logged' : 'Planned'}${wearableWorkout.value.time ? ` · ${wearableWorkout.value.time}` : ''}`}
                  secondaryDetail={[workoutMeta(wearableWorkout), isHistoricalDay ? `Recorded ${new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : null].filter(Boolean).join(' · ')}
                  detailWrap
                  onClick={workoutInteractive ? onGoToPlan : undefined}
                  actionLabel={`View ${workoutSubject(wearableWorkout) || 'activity'} details in Plan. ${capFirst(wearableWorkout.provider || 'wearable')}. ${wearableWorkout.value.status === 'completed' ? 'Completed' : isHistoricalDay ? 'Logged' : 'Planned'}${wearableWorkout.value.time ? ` at ${wearableWorkout.value.time}` : ''}${workoutMeta(wearableWorkout) ? `. ${workoutMeta(wearableWorkout)}` : ''}`}
                />
              )}
            </div>
          </section>
          </div>

          <div className="mx-auto mt-2 w-full max-w-[410px] px-3">
            <CurrentArc progress={calPct} hasTarget={hasCalorieTarget} />
            <div className="-mt-7 text-center">
              <div className="text-[10px] font-bold uppercase tracking-[0.21em] text-white/90">{hasCalorieTarget ? 'Fuel today' : 'Fuel logged'}</div>
              <div className="numeral mt-1 text-[56px] font-semibold leading-none text-white">{todayLoading ? '—' : fmt(calDone, 0)}</div>
              <div className="tnum mt-1 text-[11px] font-medium text-white/90">{todayLoading ? 'Reading your plan' : hasCalorieTarget ? `${fmt(calDone, 0)} of ${fmt(calTarget, 0)} kcal · ${calorieProgressText}` : 'kcal today · no target set'}</div>
            </div>
          </div>

          <div className="mt-auto px-5 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.21em] text-white/90">Today’s priority</div>
            <h2 id="today-recommendation" className="serif mx-auto mt-2 max-w-[31rem] text-[38px] font-semibold leading-[0.98] tracking-[-0.025em] text-white">{heroTitle}</h2>
            <p className="mx-auto mt-3 max-w-[31rem] text-[13px] leading-relaxed text-white/94">{heroDetail}</p>
            {whyItems.length > 0 && <div className="mx-auto mt-3 max-w-[14rem]"><Why items={whyItems} label="Learn why" variant="hero" /></div>}
          </div>
        </div>
      </section>

      <div className="today-paper-sheet relative z-[2] -mt-10 space-y-6 bg-paper px-4 pb-1 pt-7">
        {/* Offline / pending-sync strip — Sand, the same "pending, not yet
            synced" tone as the log-row tag above, not the legacy amber warn. */}
        {(pendingCount > 0 || !online) && (
          <div className="flex items-center justify-between gap-3 border border-line-strong bg-sand/50 px-3 py-2 text-sm text-ink">
            <span>{!online && '◐ Offline. '}{pendingCount > 0 ? `${pendingCount} log${pendingCount === 1 ? '' : 's'} waiting to sync` : 'Logs save locally and sync later.'}</span>
            {pendingCount > 0 && online && (
              <button onClick={onSync} disabled={syncing} className="shrink-0 border border-ink/30 px-2 py-1 text-xs font-semibold disabled:opacity-50">{syncing ? 'Syncing…' : 'Sync now'}</button>
            )}
          </div>
        )}

      {/* Intake so far — the calorie headline, budget bar, and macro grid.
          The numeral here used to render at 38px, larger than the
          recommendation card's own 29px title above — the single largest,
          boldest thing on the screen was the calorie count, not the "single
          focal recommendation" README describes. Sized down to 27px so the
          recommendation stays the visual anchor. */}
      <section>
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-[15px] font-bold leading-tight text-ink">Intake so far</h2>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="numeral text-[30px] font-semibold leading-[0.9] text-ink">{fmt(calDone, 0)}</span>
              <span className="tnum text-[12.5px] text-muted">/ {fmt(calTarget, 0)} kcal</span>
            </div>
          </div>
          {calTarget > 0 && (
            <span className={`tnum pb-1 text-[10px] font-medium uppercase tracking-[0.1em] ${calLeft < 0 ? 'text-cobalt' : 'text-muted'}`}>
              {calLeft < 0 ? `${fmt(-calLeft, 0)} over` : `${fmt(calLeft, 0)} left`}
            </span>
          )}
        </div>

        <SegmentBar total={15} filled={15 * calPct} height={7} className="mt-2.5" />

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
          {secondary.map((n) => {
            const v = num(totals[n.key]); const t = num(targets[n.key])
            return (
              <div key={n.key}>
                <div className="flex items-baseline justify-between">
                  <span className="eyebrow">{n.label}</span>
                  <span className="tnum">
                    <span className={`numeral text-[15px] ${t > 0 && v > t ? 'text-cobalt' : 'text-ink'}`}>{fmt(v, n.decimals)}</span>
                    <span className="text-[10.5px] text-muted">{t > 0 ? ` / ${fmt(t, n.decimals)} ${n.unit}` : ` ${n.unit}`}</span>
                  </span>
                </div>
                <Meter value={v} target={t} height={3} className="mt-1.5" />
              </div>
            )
          })}
        </div>
      </section>

      {/* Energy and movement are useful supporting context, not a second
          headline. Match the Today hierarchy by omitting the section when a
          wearable supplied neither reading and revealing its arithmetic on
          demand when data exists. */}
      {(!expMissing || !stepsMissing) && (
        <Disclosure
          label="Energy & movement"
          meta={!stepsMissing ? `${fmt(steps.value, 0)} steps` : netBalance == null ? 'Wearable context' : `${fmt(Math.abs(netBalance), 0)} kcal ${netBalance > 0 ? 'surplus' : netBalance < 0 ? 'deficit' : 'balanced'}`}
          className="bg-rail/70 px-3"
          contentClassName="pb-3 pt-3"
        >
          <div className="flex items-end gap-2.5">
            <div className="flex-1">
              <div className="numeral text-[22px] leading-none text-ink">{fmt(calDone, 0)}</div>
              <div className="mt-1 eyebrow text-[9px]">In</div>
            </div>
            <span className="pb-3 text-muted">−</span>
            <div className="flex-1">
              <div className={`numeral text-[22px] leading-none ${expMissing ? 'text-faint' : 'text-ink'}`}>
                {expMissing ? '—' : fmt(exp.value, 0)}
              </div>
              <div className="mt-1 eyebrow text-[9px]">Out</div>
            </div>
            <span className="pb-3 text-muted">=</span>
            <div className="flex-1">
              <div className={`numeral text-[22px] leading-none ${netBalance == null ? 'text-faint' : netBalance > 0 ? 'text-cobalt' : 'text-ink'}`}>
                {netBalance == null ? '—' : fmt(Math.abs(netBalance), 0)}
              </div>
              <div className="mt-1 eyebrow text-[9px]">
                {netBalance == null ? 'Balance' : netBalance === 0 ? 'Balanced' : netBalance > 0 ? 'Surplus' : 'Deficit'}
              </div>
            </div>
          </div>
          <div className="mt-3 border-t border-line pt-2">
            {expMissing ? <StatusTag status="unavailable" /> : <SourceLabel signal={exp} />}
          </div>
        </Disclosure>
      )}

      {/* Today's log — chronological, on the paper ground */}
      <HydrationPanel date={date} hydration={data?.hydration} onChanged={onChanged} />

      {/* Today's log — chronological, on the paper ground */}
      <section>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-bold leading-tight text-ink">Today’s log</h2>
            {hiddenEntryCount > 0 && <p className="mt-0.5 text-[10.5px] text-muted">Latest {recentEntries.length} of {entries.length}</p>}
          </div>
          {/* "View all" views: it goes to the Log tab's grouped day view. It
              used to open the Add sheet — a logging flow under a reviewing
              label. */}
          <TextButton chevron onClick={() => (onViewLog ? onViewLog() : openAdd('menu'))} className="-my-2 text-[10.5px] uppercase tracking-[0.1em]">
            View all {entries.length}
          </TextButton>
        </div>
        {loading && entries.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted">Loading…</div>
        ) : entries.length === 0 ? (
          <EmptyState title="Nothing logged yet" className="mt-2">Tap Log food to scan a barcode, photograph a label, or add manually.</EmptyState>
        ) : (
          <div className="mt-1">
            {recentEntries.map((e) => <LogRow key={e.id} entry={e} onEdit={onEditEntry} onDelete={onDeleteEntry} />)}
          </div>
        )}
      </section>

      {/* Bottom action — full-width LOG FOOD beside a square scan button */}
      <div className="flex gap-2.5 pt-1">
        <Button onClick={() => openAdd('menu')} className="flex-1">Log food</Button>
        <Button variant="outline" onClick={() => openAdd('scan')} aria-label="Scan a barcode" className="w-[60px] shrink-0 px-0">
          {/* Barcode pictogram — bars of varying width, not a frame (the old
              two-edge-bars glyph read as an empty square). currentColor
              inherits the outline button's ink/hover fill. */}
          <svg aria-hidden viewBox="0 0 22 18" width="22" height="18" fill="currentColor">
            <rect x="0" width="1" height="18" />
            <rect x="2" width="2" height="18" />
            <rect x="5" width="1" height="18" />
            <rect x="7" width="1" height="18" />
            <rect x="9" width="3" height="18" />
            <rect x="13" width="1" height="18" />
            <rect x="15" width="2" height="18" />
            <rect x="18" width="1" height="18" />
            <rect x="20" width="2" height="18" />
          </svg>
        </Button>
      </div>
      </div>
      <TodayBackdropSheet
        open={backdropOpen}
        onClose={() => setBackdropOpen(false)}
        userId={userId}
        backdrop={backdrop}
        onChange={setBackdrop}
      />
    </div>
  )
}
