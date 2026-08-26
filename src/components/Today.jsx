import { useMemo, useRef, useState } from 'react'
import { api } from '../api/client.js'
import { NUTRIENTS, sumEntries, entryNutrient, entryIncomplete, fmt, num, ymd } from '../lib/nutrition.js'
import { Card, Meter, SegmentBar, Swatch, SourceLabel, StatusTag, Why, Button, TextButton, EmptyState, Spinner, ErrorNote } from './ui.jsx'

// Manual re-fetch window for the Oura backfill button below — a small
// trailing window is enough to catch anything the daily resync/connect-time
// pull missed; the endpoint itself accepts up to 90 but that's a connect-time
// concern, not a "did today's workout show up yet" one.
const OURA_REFRESH_DAYS = 5

const isToday = (d) => ymd(d) === ymd(new Date())

function dayLabel(d) {
  if (isToday(d)) return 'Today'
  const y = new Date(); y.setDate(y.getDate() - 1)
  if (ymd(d) === ymd(y)) return 'Yesterday'
  return new Date(d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

// The masthead's right-hand date badge, e.g. "SAT 23 AUG" (the eyebrow class
// uppercases it). Built from parts so the day sits between weekday and month.
function dateBadge(d) {
  const dt = new Date(d)
  const wk = dt.toLocaleDateString(undefined, { weekday: 'short' })
  const mo = dt.toLocaleDateString(undefined, { month: 'short' })
  return `${wk} ${dt.getDate()} ${mo}`
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

// One column of the recovery/training context strip: a semantic swatch + label,
// the reading itself, and its source/freshness provenance beneath. A missing
// reading shows an em-dash and an explicit "No data" mark, never a zero.
function ContextCell({ tone, label, signal, missing, compact, children }) {
  return (
    <div className="min-w-0 px-3 py-3">
      <div className="flex items-center gap-1.5">
        <Swatch tone={tone} size={9} />
        {/* At 320px this row is ~71px wide; "Readiness" alone measured 77px
            (10px eyebrow font + 0.15em tracking), overflowing ~14px past the
            row's own content box and eating the column's right padding
            almost entirely. text-[9px]/tighter tracking recovers that
            width; break-words is a graceful fallback (not the primary
            fix — a single all-caps word has no natural break point without
            it) so a longer label degrades to two lines, at fix #2's now-
            legible 1.3 line-height, instead of overflowing again. */}
        <span className="eyebrow break-words text-[9px] tracking-[0.09em]">{label}</span>
      </div>
      <div className="mt-2.5">{children}</div>
      <div className="mt-2">
        {missing ? <StatusTag status="unavailable" /> : <SourceLabel signal={signal} compact={compact} />}
      </div>
    </div>
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

export default function Today({ date, data, entries, loading, online, syncing, pendingCount, onSync, onEditEntry, onDeleteEntry, onPrevDay, onNextDay, onToday, openAdd, onViewLog, onChanged }) {
  const swipeHandlers = useDaySwipe(onPrevDay, onNextDay, !isToday(date))
  const [ouraBusy, setOuraBusy] = useState(false)
  const [ouraError, setOuraError] = useState('')
  const totals = useMemo(() => sumEntries(entries), [entries])
  const targets = data?.adjusted || data?.baseline || {}
  const rec = data?.recommendation
  const signals = data?.signals || {}

  const calTarget = num(targets.calories)
  const calDone = num(totals.calories)
  const calLeft = calTarget - calDone
  const calPct = calTarget > 0 ? Math.min(1, calDone / calTarget) : 0
  const secondary = NUTRIENTS.filter((n) => n.key !== 'calories')

  // Energy balance — calories logged (in) vs. wearable-reported expenditure
  // (out) = net deficit/surplus, plus steps. README has described this card
  // since the original Oura integration (123d951) but the "Fueling-
  // intelligence" redesign (d2e0829) never carried it into the rebuilt
  // Today — signals.expenditure/signals.steps kept flowing through
  // /api/today (composeSignals, with the same demo/freshness/provenance
  // every other card here already uses) with no surface rendering them.
  const exp = signals.expenditure
  const steps = signals.steps
  const expMissing = !exp || exp.value == null
  const stepsMissing = !steps || steps.value == null
  const netBalance = expMissing ? null : calDone - num(exp.value)

  // Sync line — honest about what actually reported. Show the live providers if
  // any signal is a real (non-demo) reading; otherwise say plainly that these are
  // sample readings or that nothing is connected. Never imply a live sync.
  const present = ['readiness', 'sleep', 'workout'].map((k) => signals[k]).filter(Boolean)
  const liveProviders = [...new Set(present.filter((s) => !s.demo && s.provider).map((s) => s.provider.toUpperCase()))]

  // Wearable refresh / honest per-provider capability, for the context strip
  // below. Oura is the only one of the three with a real "ask for fresh
  // data" action — POST /api/oura/backfill (server/index.js) re-pulls
  // readiness/sleep-score/activity/workouts straight from Oura's live API;
  // it already existed with no client caller before this. Offered only when
  // Oura is genuinely the live (non-demo) source for one of these three
  // signals — never for a disconnected account, and never dressed up for a
  // demo scenario. Garmin's Health API is push-only here (data arrives
  // solely via the inbound webhook — no route calls out to ask Garmin for
  // anything) and Apple has no cloud API at all (a companion app pushes to
  // /api/apple/ingest, already re-read fresh on every /api/today load) — so
  // neither gets a button that would fire against nothing; both get plain,
  // true copy about how their data actually arrives, shown only once one of
  // them is genuinely (non-demo) the source for a card, same reasoning as
  // Oura's gate.
  const ouraLive = present.some((s) => s.provider === 'oura' && !s.demo)
  const garminLive = present.some((s) => s.provider === 'garmin' && !s.demo)
  const appleLive = present.some((s) => s.provider === 'apple' && !s.demo)

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
  let syncText
  if (syncLive) {
    syncText = `${liveProviders.join(' + ')} · SYNCED${syncTime ? ` ${syncTime}` : ''}`
  } else if (present.length > 0) {
    syncText = 'SAMPLE SIGNALS · NOT A LIVE SYNC'
  } else {
    syncText = 'NO WEARABLES CONNECTED'
  }

  // Context readings.
  const rd = signals.readiness
  const sl = signals.sleep
  const wo = signals.workout
  const rdMissing = !rd || rd.value == null
  const slMissing = !sl || sl.value == null
  const woLabel = wo?.value?.shortLabel || wo?.value?.label
  const woTime = wo?.value?.time
  const hm = slMissing ? null : hoursToHm(sl.value)

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
              <SourceLabel signal={s} />
            </div>
          ))}
        </div>,
      )
    }
    return items
  }, [rec, rd, sl, wo, calDone, calTarget])

  return (
    <div className="space-y-5" {...swipeHandlers}>
      {/* Masthead: Bodoni title, then day nav flanking the date (owner, 25 Aug
          2026: the date read as an afterthought at eyebrow size — 10px next
          to the 32px title — while functionally being the one piece of state
          this whole screen pivots on). The date is now its own line, sized to
          actually read at a glance (18px, tnum, semibold) rather than
          matched flat to the 32px title — two 32px elements side by side
          measured well past 320px's width with the nav buttons included, so
          "on par" is honored in legibility/prominence, not literal px parity.
          Prev/next now sit directly beside the date they navigate, not the
          static "Today"/weekday label, since that's the control they
          actually act on. */}
      <div>
        <h1 className="serif text-[32px] leading-none text-ink">{dayLabel(date)}</h1>
        <div className="mt-1.5 flex items-center gap-1">
          <button onClick={onPrevDay} aria-label="Previous day" className="-my-2 -ml-2 flex h-11 w-11 shrink-0 items-center justify-center text-xl leading-none text-muted hover:text-ink">‹</button>
          <span className="tnum text-[18px] font-semibold tracking-[0.02em] text-ink">{dateBadge(date)}</span>
          <button onClick={onNextDay} disabled={isToday(date)} aria-label="Next day" className="-my-2 flex h-11 w-11 shrink-0 items-center justify-center text-xl leading-none text-muted hover:text-ink disabled:opacity-30">›</button>
        </div>
        {!isToday(date) && (
          <button onClick={onToday} className="text-xs font-semibold text-cobalt hover:text-cobalt-ink">‹ Back to today</button>
        )}
        <div className="mt-2.5 flex items-center gap-2">
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${syncLive ? 'bg-cobalt' : 'border border-line-heavy bg-transparent'}`} />
          <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted tnum">{syncText}</span>
        </div>
      </div>

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

      {/* Context strip — recovery / training, three columns split by hairlines */}
      <div className="grid grid-cols-3 divide-x divide-line border-y border-line-strong">
        <ContextCell tone="sage" label="Readiness" signal={rd} missing={rdMissing} compact={!syncLive}>
          {rdMissing ? (
            <div className="numeral text-[30px] leading-none text-faint">—</div>
          ) : (
            <div className="numeral text-[30px] leading-none text-ink">{Math.round(num(rd.value))}</div>
          )}
        </ContextCell>

        <ContextCell tone="sage" label="Sleep" signal={sl} missing={slMissing} compact={!syncLive}>
          {slMissing ? (
            <div className="numeral text-[30px] leading-none text-faint">—</div>
          ) : (
            <>
              <div className="numeral text-[30px] leading-none text-ink">
                {hm.h}<span className="font-sans text-[15px] font-normal">h</span> {hm.m}<span className="font-sans text-[15px] font-normal">m</span>
              </div>
              {/* daily_sleep's own 0-100 quality score — a different Oura
                  endpoint from the duration above, so it's genuinely absent
                  (not just unfetched) whenever a provider only ever supplies
                  duration. The demo scenario already anticipated this field
                  (sig(7.4, {score: 78, ...})) since before any real fetch
                  populated it. */}
              {sl.score != null && (
                <div className="mt-0.5 text-[10.5px] font-medium text-muted">Score {Math.round(num(sl.score))}</div>
              )}
            </>
          )}
        </ContextCell>

        <ContextCell tone="lavender" label="Workouts" signal={wo} missing={!wo} compact={!syncLive}>
          {!wo ? (
            <div className="numeral text-[17px] leading-[1.15] text-faint">—</div>
          ) : woLabel ? (
            <div className="numeral text-[17px] leading-[1.15] text-ink">
              {woLabel}
              {woTime && <><br /><span className="tnum">{woTime}</span></>}
            </div>
          ) : (
            <div className="numeral text-[17px] leading-[1.15] text-faint">Rest</div>
          )}
        </ContextCell>
      </div>

      {/* Wearable refresh strip, directly under the context cells above —
          same hairline panel language, no new white/cobalt "special" surface.
          Oura gets a real, working manual refresh; Garmin/Apple get honest,
          non-actionable copy instead of a button with nothing real to do
          (see ouraLive/garminLive/appleLive above for exactly why). Nothing
          renders here at all for a disconnected or all-demo account — an
          empty strip under an honest demo/unavailable context strip is the
          correct state, not a bug to fill with a fake control. */}
      {(ouraLive || garminLive || appleLive || ouraError) && (
        <div className="space-y-2 border-b border-line-strong px-3 py-2.5">
          {ouraLive && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10.5px] leading-snug text-muted">
                Pull the latest readiness, sleep, and workouts from Oura.
              </span>
              <Button
                variant="outline"
                onClick={refreshOura}
                disabled={ouraBusy}
                aria-label="Refresh Oura data"
                className="shrink-0"
              >
                {ouraBusy ? <Spinner /> : 'Refresh'}
              </Button>
            </div>
          )}
          {garminLive && (
            <p className="text-[10.5px] leading-snug text-faint">
              Garmin syncs automatically when connected — there's no manual refresh to trigger.
            </p>
          )}
          {appleLive && (
            <p className="text-[10.5px] leading-snug text-faint">
              Open the companion app on your phone or watch to sync new Apple Health data.
            </p>
          )}
          {ouraError && <ErrorNote>{ouraError}</ErrorNote>}
        </div>
      )}

      {/* The "next action" sheet — the focal moment. An audit measured three
          near-equal-weight serif moments above the fold (masthead 32px,
          context numerals 30px, this title 29px) with nothing making the
          recommendation clearly win, so this card gets more weight than the
          ordinary `Card white` treatment: a heavier border (border-line-
          strong, 1.5px vs. the default 1px border-line) and a real lifted
          shadow (vs. `Card white`'s 1px/0.06-alpha hairline, barely visible
          against paper) plus a touch more top/bottom padding. Background is
          cobalt-soft, not bg-card's pure #fff — flagged 25 Aug 2026 (owner:
          "stark", "jarring") as the one surface where that treatment reads
          as a glaring white cutout rather than a lifted sheet, being the
          first and most emphasized thing on the page. cobalt-soft is the
          SAME wash the app already uses for a positive/highlighted moment
          (App.jsx's success toast: border-cobalt/40 bg-cobalt-soft
          text-cobalt) and pairs with the eyebrow/Why-this icon already
          being cobalt here, so the card reads as one cohesive
          cobalt-accented highlight instead of an unrelated color. Border
          and shadow are untouched — both are neutral ink-alpha tones (see
          index.css's --color-line-strong), so they read the same regardless
          of what's under them, and the weight this whole treatment was
          built to win stays intact. Hand-rolled rather than `<Card white>` +
          className overrides: `Card`'s skin string and any override both
          land in Tailwind's `utilities` layer, and same-layer precedence
          there is generation-order-dependent, not source order in the
          className string — not worth relying on for a deliberate design
          decision. The other two "white moment" surfaces that need a
          specific weight (Plan.jsx, SmartPlanForm.jsx) still hand-write the
          bg-card/border/shadow trio for the same reason — this card is
          deliberately the only one of the three that's no longer white. */}
      {rec ? (
        <div className="border-[1.5px] border-line-strong bg-cobalt-soft px-4 pb-3.5 pt-4 shadow-[0_3px_10px_rgb(18_18_16/0.10)]">
          <div className="flex items-center justify-between">
            <span className="eyebrow text-cobalt">Recommendation</span>
            {/* Only the live branch gets a specific clock time — a fresh-
                looking "Updated 10:25 PM" stamp beside "SAMPLE SIGNALS ·
                NOT A LIVE SYNC" implied a real sync that never happened. */}
            {syncLive && syncTime && <span className="tnum text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted">Updated {syncTime}</span>}
          </div>
          <h2 className="serif mt-2.5 text-[29px] leading-[1.05] tracking-[-0.01em] text-ink">{rec.title}</h2>
          {rec.detail && <p className="mt-2 max-w-[300px] text-[13.5px] leading-[1.45] text-ink/80">{rec.detail}</p>}
          {whyItems.length > 0 && (
            <div className="mt-2.5 border-t border-line">
              <Why items={whyItems} />
            </div>
          )}
        </div>
      ) : (
        <Card white className="px-4 py-4">
          <div className="eyebrow mb-2 text-cobalt">Recommendation</div>
          <p className="text-sm text-muted">{loading ? 'Reading your plan…' : 'Log a few items and connect a wearable to get a fueling recommendation.'}</p>
        </Card>
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
            <div className="eyebrow">Intake so far</div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="numeral text-[27px] leading-[0.9] text-ink">{fmt(calDone, 0)}</span>
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

      {/* Energy balance — in vs. out, plus steps. Missing/disabled reads as
          an em-dash, same "no data, never a silent number" rule as the
          context strip and log rows above. Given a contained panel 25 Aug
          2026 (owner: wanted a "face lift") — it used to be bare text
          sitting directly on the page ground, the only numeral-bearing
          section on Today with no visual container of its own (Intake so
          far has its segment bar + macro grid, Recommendation its card).
          bg-rail (not bg-card): this is a grouped INFO panel, not a
          "moment that matters" the way Recommendation is — reusing the same
          neutral wash the nav bar already reads as "contained chrome" keeps
          the one white/cobalt-soft "this is special" cue meaningful instead
          of every section fighting for the same visual weight. */}
      <section className="border border-line bg-rail px-4 py-3.5">
        <div className="flex items-baseline justify-between">
          <span className="eyebrow">Energy balance</span>
          {!stepsMissing && (
            <span className="tnum text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">{fmt(steps.value, 0)} steps</span>
          )}
        </div>
        <div className="mt-3 flex items-end gap-2.5">
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
      </section>

      {/* Today's log — chronological, on the paper ground */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="eyebrow">Today's log</h3>
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
            {entries.map((e) => <LogRow key={e.id} entry={e} onEdit={onEditEntry} onDelete={onDeleteEntry} />)}
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
  )
}
