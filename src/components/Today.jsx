import { useMemo } from 'react'
import { NUTRIENTS, sumEntries, entryNutrient, fmt, num, ymd } from '../lib/nutrition.js'
import { Card, Meter, SegmentBar, Swatch, SourceLabel, StatusTag, Why, Button, TextButton, EmptyState } from './ui.jsx'

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
function ContextCell({ tone, label, signal, missing, children }) {
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
        {missing ? <StatusTag status="unavailable" /> : <SourceLabel signal={signal} />}
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
        <span className="shrink-0 numeral text-[17px] text-ink">{fmt(entryNutrient(entry, 'calories'), 0)}</span>
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

export default function Today({ date, data, entries, loading, online, syncing, pendingCount, onSync, onEditEntry, onDeleteEntry, onPrevDay, onNextDay, onToday, openAdd, onViewLog }) {
  const totals = useMemo(() => sumEntries(entries), [entries])
  const targets = data?.adjusted || data?.baseline || {}
  const rec = data?.recommendation
  const signals = data?.signals || {}

  const calTarget = num(targets.calories)
  const calDone = num(totals.calories)
  const calLeft = calTarget - calDone
  const calPct = calTarget > 0 ? Math.min(1, calDone / calTarget) : 0
  const secondary = NUTRIENTS.filter((n) => n.key !== 'calories')

  // Sync line — honest about what actually reported. Show the live providers if
  // any signal is a real (non-demo) reading; otherwise say plainly that these are
  // sample readings or that nothing is connected. Never imply a live sync.
  const present = ['readiness', 'sleep', 'workout'].map((k) => signals[k]).filter(Boolean)
  const liveProviders = [...new Set(present.filter((s) => !s.demo && s.provider).map((s) => s.provider.toUpperCase()))]
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

  return (
    <div className="space-y-5">
      {/* Masthead: day nav + Bodoni title + date badge, then the sync line */}
      <div>
        <div className="flex items-end justify-between">
          <div className="flex items-end gap-1.5">
            <button onClick={onPrevDay} aria-label="Previous day" className="-my-2 -ml-2 flex h-11 w-11 shrink-0 items-center justify-center text-xl leading-none text-muted hover:text-ink">‹</button>
            <h1 className="serif text-[32px] leading-none text-ink">{dayLabel(date)}</h1>
          </div>
          <div className="flex items-end gap-1.5">
            <span className="eyebrow tnum pb-0.5 text-muted">{dateBadge(date)}</span>
            <button onClick={onNextDay} disabled={isToday(date)} aria-label="Next day" className="-my-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center text-xl leading-none text-muted hover:text-ink disabled:opacity-30">›</button>
          </div>
        </div>
        {!isToday(date) && (
          <button onClick={onToday} className="mt-1 text-xs font-semibold text-cobalt hover:text-cobalt-ink">‹ Back to today</button>
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
        <ContextCell tone="sage" label="Readiness" signal={rd} missing={rdMissing}>
          {rdMissing ? (
            <div className="numeral text-[30px] leading-none text-faint">—</div>
          ) : (
            <div className="numeral text-[30px] leading-none text-ink">{Math.round(num(rd.value))}</div>
          )}
        </ContextCell>

        <ContextCell tone="sage" label="Sleep" signal={sl} missing={slMissing}>
          {slMissing ? (
            <div className="numeral text-[30px] leading-none text-faint">—</div>
          ) : (
            <div className="numeral text-[30px] leading-none text-ink">
              {hm.h}<span className="font-sans text-[15px] font-normal">h</span> {hm.m}<span className="font-sans text-[15px] font-normal">m</span>
            </div>
          )}
        </ContextCell>

        <ContextCell tone="lavender" label="Training" signal={wo} missing={!wo}>
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

      {/* The white "next action" sheet — the focal moment. An audit measured
          three near-equal-weight serif moments above the fold (masthead
          32px, context numerals 30px, this title 29px) with nothing making
          the recommendation clearly win, so this card gets more weight than
          the ordinary `Card white` treatment: a heavier border
          (border-line-strong, 1.5px vs. the default 1px border-line) and a
          real lifted shadow (vs. `Card white`'s 1px/0.06-alpha hairline,
          barely visible against paper) plus a touch more top/bottom padding.
          Hand-rolled rather than `<Card white>` + className overrides:
          `Card`'s skin string and any override both land in Tailwind's
          `utilities` layer, and same-layer precedence there is generation-
          order-dependent, not source order in the className string — not
          worth relying on for a deliberate design decision. The other two
          "white moment" surfaces that need a specific weight (Plan.jsx,
          SmartPlanForm.jsx) already hand-write this same bg-card/border/
          shadow trio rather than going through `Card` for the same reason. */}
      {rec ? (
        <div className="border-[1.5px] border-line-strong bg-card px-4 pb-3.5 pt-4 shadow-[0_3px_10px_rgb(18_18_16/0.10)]">
          <div className="flex items-center justify-between">
            <span className="eyebrow text-cobalt">Recommendation</span>
            {/* Only the live branch gets a specific clock time — a fresh-
                looking "Updated 10:25 PM" stamp beside "SAMPLE SIGNALS ·
                NOT A LIVE SYNC" implied a real sync that never happened. */}
            {syncLive && syncTime && <span className="tnum text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted">Updated {syncTime}</span>}
          </div>
          <h2 className="serif mt-2.5 text-[29px] leading-[1.05] tracking-[-0.01em] text-ink">{rec.title}</h2>
          {rec.detail && <p className="mt-2 max-w-[300px] text-[13.5px] leading-[1.45] text-ink/80">{rec.detail}</p>}
          {rec.why?.length > 0 && (
            <div className="mt-2.5 border-t border-line">
              <Why items={rec.why} />
            </div>
          )}
        </div>
      ) : (
        <Card white className="px-4 py-4">
          <div className="eyebrow mb-2 text-cobalt">Recommendation</div>
          <p className="text-sm text-muted">{loading ? 'Reading your plan…' : 'Log a few items and connect a wearable to get a fueling recommendation.'}</p>
        </Card>
      )}

      {/* Intake so far — the calorie headline, budget bar, and macro grid */}
      <section>
        <div className="flex items-end justify-between">
          <div>
            <div className="eyebrow">Intake so far</div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="numeral text-[38px] leading-[0.9] text-ink">{fmt(calDone, 0)}</span>
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
