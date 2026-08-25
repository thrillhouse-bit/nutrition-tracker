import { useEffect, useState } from 'react'
import { fmt, num, kgToLb, lbToKg } from '../lib/nutrition.js'
import { api } from '../api/client.js'
import { Button, Card, EmptyState, ErrorNote, Spinner, Stat, StatusMark, TextButton, inputCls } from './ui.jsx'

const WINDOWS = [7, 14, 30]

// e.g. "2026-08-10" -> "10 AUG" — the artboard's tracked, uppercase caption date.
function shortDate(iso) {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00`)
    .toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    .toUpperCase()
}

// Section header in the artboard's language: a top hairline, an eyebrow label,
// and a right-aligned value or status chip.
function SectionHead({ label, right, strong = false }) {
  return (
    <div className={`flex items-baseline justify-between border-t ${strong ? 'border-line-strong' : 'border-line'} pt-2.5`}>
      <span className="eyebrow tracking-[0.14em]">{label}</span>
      {right}
    </div>
  )
}

// The three-part micro-caption under a chart (earliest · note · latest).
function ChartCaption({ left, mid, right }) {
  return (
    <div className="tnum mt-2 flex items-baseline justify-between text-[10px] font-medium uppercase tracking-[0.1em] text-faint">
      <span>{left}</span>
      {mid ? <span className="px-2 text-center">{mid}</span> : null}
      <span>{right}</span>
    </div>
  )
}

// ENERGY VS TARGET — a real editorial line chart of logged calories per day.
// preserveAspectRatio="none" stretches the 320×88 field to the card, exactly as
// the artboard does. Purely descriptive: it plots what was logged and makes no
// claim about cause. The dashed line is the observed AVERAGE (a real figure),
// never a fabricated target — we omit it when it would fall outside the drawn
// range so the line never lies about where the mean sits.
function EnergyChart({ days, avg, showAvg }) {
  const vals = days.map((d) => num(d.totals?.calories))
  const n = vals.length
  if (n < 2) return null
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const TOP = 16
  const BOT = 72 // vertical plot band inside the 88-tall viewBox
  const y = (v) => BOT - ((v - min) / span) * (BOT - TOP)
  const pts = vals.map((v, i) => `${((i / (n - 1)) * 320).toFixed(1)},${y(v).toFixed(1)}`)
  const lastY = y(vals[n - 1]).toFixed(1)
  const avgY = y(avg).toFixed(1)
  return (
    <svg viewBox="0 0 320 88" width="100%" height="74" preserveAspectRatio="none" className="mt-2.5 block">
      {showAvg && (
        <line x1="0" y1={avgY} x2="320" y2={avgY} stroke="#121210" strokeOpacity="0.28" strokeWidth="1" strokeDasharray="3 4" />
      )}
      <polyline points={pts.join(' ')} fill="none" stroke="#121210" strokeWidth="1.6" />
      <circle cx="320" cy={lastY} r="3.4" fill="#1F35C4" />
    </svg>
  )
}

// READINESS — the backfilled score history. Fixed 0-100 scale, unlike
// EnergyChart's min/max stretch: a readiness score already has a meaningful
// absolute range, and stretching a narrow real span (say 68-74) would make
// ordinary day-to-day variation look dramatic.
function ReadinessChart({ points }) {
  const n = points.length
  if (n < 2) return null
  const TOP = 16
  const BOT = 72
  const y = (v) => BOT - (Math.max(0, Math.min(100, v)) / 100) * (BOT - TOP)
  const pts = points.map((p, i) => `${((i / (n - 1)) * 320).toFixed(1)},${y(p.score).toFixed(1)}`)
  const lastY = y(points[n - 1].score).toFixed(1)
  return (
    <svg viewBox="0 0 320 88" width="100%" height="74" preserveAspectRatio="none" className="mt-2.5 block">
      <polyline points={pts.join(' ')} fill="none" stroke="#121210" strokeWidth="1.6" />
      <circle cx="320" cy={lastY} r="3.4" fill="#1F35C4" />
    </svg>
  )
}

// WEIGHT — the smoothed trend (server/weightTrend.js: a gap-adjusted
// exponential moving average) as the bold line, over the raw logged readings
// as faint dots, so day-to-day water-weight noise doesn't read as the real
// direction. Auto-scaled over BOTH series like EnergyChart — weight has no
// fixed universal range the way Readiness's 0-100 does — and `toDisplay`
// converts kg to whatever unit the profile prefers; the stored/API values
// stay kg regardless.
function WeightChart({ points, toDisplay }) {
  const n = points.length
  if (n < 2) return null
  const raw = points.map((p) => toDisplay(p.kg))
  const trend = points.map((p) => toDisplay(p.trend))
  const min = Math.min(...raw, ...trend)
  const max = Math.max(...raw, ...trend)
  const span = max - min || 1
  const TOP = 16
  const BOT = 72
  const y = (v) => BOT - ((v - min) / span) * (BOT - TOP)
  const x = (i) => (i / (n - 1)) * 320
  const trendPts = trend.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  const lastY = y(trend[n - 1]).toFixed(1)
  return (
    <svg viewBox="0 0 320 88" width="100%" height="74" preserveAspectRatio="none" className="mt-2.5 block">
      {raw.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r="2" fill="#121210" fillOpacity="0.25" />
      ))}
      <polyline points={trendPts.join(' ')} fill="none" stroke="#121210" strokeWidth="1.6" />
      <circle cx="320" cy={lastY} r="3.4" fill="#1F35C4" />
    </svg>
  )
}

// TRAINING LOAD — real per-day minutes trained (server/db.js's
// aggregateWorkoutRows: summed Apple Health workout durations, not a
// fabricated intensity score — HealthKit gives us duration, not strain).
// A bar per day rather than a line: unlike Readiness's fixed 0-100 scale or
// Energy/Weight's stretch-to-observed-range, minutes trained has a real zero
// floor (a rest day), so bars are scaled from 0 up to the window's own peak
// rather than stretched between min and max, which would make an ordinary
// rest day look identical to a hard one. The latest day is marked in cobalt,
// the same "current value" cue every other chart in this file uses.
function TrainingLoadChart({ points }) {
  const n = points.length
  if (n < 2) return null
  const vals = points.map((p) => num(p.minutes))
  const max = Math.max(...vals, 1)
  const TOP = 16
  const BOT = 72
  const slot = 320 / n
  const barW = slot * 0.6
  return (
    <svg viewBox="0 0 320 88" width="100%" height="74" preserveAspectRatio="none" className="mt-2.5 block">
      {vals.map((v, i) => {
        const h = (v / max) * (BOT - TOP)
        return (
          <rect
            key={i}
            x={(i * slot + (slot - barW) / 2).toFixed(1)}
            y={(BOT - h).toFixed(1)}
            width={barW.toFixed(1)}
            height={h.toFixed(1)}
            fill={i === n - 1 ? '#1F35C4' : '#EACD91'}
          />
        )
      })}
    </svg>
  )
}

// Same provider-name map Plan.jsx uses to turn a `signals.<metric>.provider`
// code into display copy — kept in sync here rather than hardcoding a single
// brand in the section header regardless of who actually connected.
const PROVIDER_NAMES = { oura: 'Oura', garmin: 'Garmin', apple: 'Apple Health' }

export default function Insights({ refreshKey }) {
  const [window, setWindow] = useState(7)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [signals, setSignals] = useState(null)
  const [profile, setProfile] = useState(null)
  const [weightInput, setWeightInput] = useState('')
  const [loggingWeight, setLoggingWeight] = useState(false)
  const [weightError, setWeightError] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api.insights(window)
      .then((r) => alive && setData(r))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [window, refreshKey])

  // Which provider is actually supplying readiness/workout right now — same
  // composed-signal source Plan.jsx and Today.jsx read, so the header names
  // whoever is really connected instead of a fixed brand. Independent of the
  // window selector, so it's fetched on its own (refetched when connections
  // change, same as Plan.jsx's refreshKey dependency).
  useEffect(() => {
    let alive = true
    api.signals()
      .then((r) => alive && setSignals(r?.signals || null))
      .catch(() => alive && setSignals(null))
    return () => { alive = false }
  }, [refreshKey])

  // units_pref decides display only — the API and stored data are always kg
  // (see server/db.js's weight-log methods and lib/nutrition.js's converters,
  // the same split SmartPlanForm already uses for height/weight input).
  useEffect(() => {
    let alive = true
    api.getProfile().then((r) => alive && setProfile(r?.profile || null)).catch(() => alive && setProfile(null))
    return () => { alive = false }
  }, [refreshKey])

  const readinessProviderLabel = PROVIDER_NAMES[signals?.readiness?.provider] || null
  const workoutProviderLabel = PROVIDER_NAMES[signals?.workout?.provider] || null

  const imperial = profile?.units_pref !== 'metric'
  const unitLabel = imperial ? 'lb' : 'kg'
  const toDisplayUnit = (kg) => (imperial ? kgToLb(kg) : kg)

  async function handleLogWeight(e) {
    e.preventDefault()
    const displayVal = num(weightInput)
    if (displayVal <= 0) { setWeightError('Enter a weight greater than 0.'); return }
    setWeightError(null)
    setLoggingWeight(true)
    try {
      await api.logWeight(imperial ? lbToKg(displayVal) : displayVal)
      setWeightInput('')
      const r = await api.insights(window)
      setData(r)
    } catch {
      setWeightError('Could not save that reading — try again.')
    } finally {
      setLoggingWeight(false)
    }
  }

  const nutrition = data?.nutrition
  const days = data?.days || []
  const correlations = data?.correlations
  const tracked = num(nutrition?.trackedDays)

  // Calorie range + observed average, used both to scale the chart and to decide
  // whether the average line can honestly be drawn inside it.
  const cals = days.map((d) => num(d.totals?.calories))
  const cMin = cals.length ? Math.min(...cals) : 0
  const cMax = cals.length ? Math.max(...cals) : 0
  const avgCal = num(nutrition?.avgCalories)
  const showAvgLine = days.length >= 2 && avgCal >= cMin && avgCal <= cMax

  const readiness = data?.ouraReadiness || []
  const avgReadiness = readiness.length ? Math.round(readiness.reduce((a, r) => a + r.score, 0) / readiness.length) : null

  const weightPoints = data?.weight || []
  const latestWeightPoint = weightPoints.length ? weightPoints[weightPoints.length - 1] : null
  const latestTrend = latestWeightPoint ? latestWeightPoint.trend : null

  const workoutLoad = data?.workoutLoad || []
  const avgMinutes = workoutLoad.length ? Math.round(workoutLoad.reduce((a, r) => a + num(r.minutes), 0) / workoutLoad.length) : null

  return (
    <div className="space-y-6">
      <header>
        <h2 className="serif text-[2rem] leading-none text-ink">Insights</h2>
        {/* Window selector — sharp, bordered, active cell in cobalt. */}
        <div className="mt-3.5 flex border border-line-strong">
          {WINDOWS.map((w, i) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindow(w)}
              aria-pressed={window === w}
              className={`flex-1 py-4 text-center text-[10.5px] font-semibold uppercase tracking-[0.12em] transition ${i > 0 ? 'border-l border-line' : ''} ${window === w ? 'bg-cobalt text-oncobalt' : 'text-muted hover:text-ink'}`}
            >
              {w} Days
            </button>
          ))}
        </div>
      </header>

      {/* WEIGHT — deliberately independent of the nutrition-logging streak
          below: someone logging weight daily but not food for a few days
          should still see their trend, not a "not enough data" wall that
          exists for food-logging consistency, not this. */}
      <section>
        <SectionHead
          label="Weight"
          strong
          right={weightPoints.length >= 2 ? (
            // Same >= 2 threshold the chart below uses — a single reading is
            // not a trend (computeTrend just seeds it as-is), so calling it
            // one here would disagree with the "one more day" copy below.
            <span className="tnum text-[13px] text-muted">trend {fmt(toDisplayUnit(latestTrend), 1)} {unitLabel}</span>
          ) : null}
        />
        <form onSubmit={handleLogWeight} className="mt-2.5 flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            placeholder={`Log today's weight (${unitLabel})`}
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            className={inputCls}
          />
          <Button type="submit" variant="outline" disabled={loggingWeight || !weightInput} className="shrink-0 px-4 py-3 text-[11px]">
            {loggingWeight ? '…' : 'Log'}
          </Button>
        </form>
        {weightError && <div className="mt-2"><ErrorNote>{weightError}</ErrorNote></div>}
        {loading && !data ? null : weightPoints.length >= 2 ? (
          <>
            <WeightChart points={weightPoints} toDisplay={toDisplayUnit} />
            <ChartCaption
              left={shortDate(weightPoints[0].day)}
              mid="Trend line · logged dots"
              right={shortDate(weightPoints[weightPoints.length - 1].day)}
            />
            {/* The most recent reading's own provenance — manual vs. synced
                from Apple Health (store.listWeightEntries merges the two,
                manual winning a same-day conflict). Not a per-dot legend
                (the chart draws every day the same way); just says where
                today's number actually came from. */}
            {latestWeightPoint?.source === 'apple' && (
              <p className="mt-1.5 text-[11px] text-muted">Latest reading synced from Apple Health.</p>
            )}
          </>
        ) : weightPoints.length === 1 ? (
          <p className="mt-2.5 text-sm text-muted">One more day of logging draws the trend line.</p>
        ) : (
          <p className="mt-2.5 text-sm text-muted">Log a weigh-in above to start your trend.</p>
        )}
      </section>

      {loading && !data ? (
        <Spinner label="Reading your history…" />
      ) : !data ? (
        <EmptyState title="Insights unavailable">
          We couldn’t load your history just now. Refresh, or try again in a moment.
        </EmptyState>
      ) : (
        <>
          {/* NUTRITION (stats + Energy) is the only part that actually depends
              on the food-logging streak `insufficientData` measures — it must
              not also hide Readiness/Training load/What-we-notice/Sleep×Fiber
              below, each of which has its own independent data source and its
              own honest per-section empty state that never got a chance to
              render while this was one coarse top-level gate. */}
          {data.insufficientData ? (
            <EmptyState title="Not enough data yet">
              {`You’ve logged ${tracked} of the last ${window} days. Trends appear once at least 3 days are logged — keep going.`}
            </EmptyState>
          ) : (
            <>
              {/* Real nutrition averages — the data we actually have. */}
              <Card className="grid grid-cols-2 gap-x-4 gap-y-5 p-4 sm:grid-cols-4">
                <Stat label="Avg calories" value={avgCal} unit="kcal" />
                <Stat label="Avg protein" value={num(nutrition?.avgProtein)} unit="g" />
                <Stat label="Days tracked" value={`${tracked}/${window}`} />
                <Stat label="On-target days" value={num(nutrition?.onTargetDays)} />
              </Card>

              {/* ENERGY — real line of logged calories. Titled by what it plots:
                  the only reference line is the observed average, so "vs target"
                  promised a comparison the graphic never made. */}
              <section>
                <SectionHead
                  label={`Energy · last ${window} days`}
                  strong
                  right={<span className="tnum text-[13px] text-muted">avg {fmt(avgCal)}</span>}
                />
                {days.length >= 2 ? (
                  <>
                    <EnergyChart days={days} avg={avgCal} showAvg={showAvgLine} />
                    <ChartCaption
                      left={shortDate(days[0].date)}
                      mid={showAvgLine ? `AVG ${fmt(avgCal)} — DASHED` : null}
                      right={shortDate(days[days.length - 1].date)}
                    />
                  </>
                ) : (
                  <p className="mt-2.5 text-sm text-muted">A day or two more of logging draws the trend line.</p>
                )}
              </section>
            </>
          )}

          {/* READINESS — real backfilled score history once a connected
              account has retained at least two days; the honest greyed
              placeholder (no invented numbers) otherwise. Labeled by whichever
              provider is actually supplying readiness today, not a fixed
              brand — see QA report "Insights hardcodes provider names." */}
          <section>
            <SectionHead
              label={readinessProviderLabel ? `Readiness · ${readinessProviderLabel}` : 'Readiness'}
              right={
                readiness.length >= 2 ? (
                  <span className="tnum text-[13px] text-muted">avg {avgReadiness}</span>
                ) : (
                  <StatusMark status="unavailable" label="Awaiting history" />
                )
              }
            />
            {readiness.length >= 2 ? (
              <>
                <ReadinessChart points={readiness} />
                <ChartCaption
                  left={shortDate(readiness[0].date)}
                  mid={`AVG ${avgReadiness}`}
                  right={shortDate(readiness[readiness.length - 1].date)}
                />
              </>
            ) : (
              <>
                <div className="relative mt-2.5 h-[62px] border-t border-b border-dashed border-line-strong">
                  <div aria-hidden className="absolute inset-x-0 top-1/2 h-5 -translate-y-1/2 bg-mist/60" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-faint">Awaiting connected history</span>
                  </div>
                </div>
                <ChartCaption left="Mist band · readiness" right={readinessProviderLabel || 'No source connected'} />
              </>
            )}
          </section>

          {/* TRAINING LOAD — real per-day minutes trained once at least two
              days of retained Apple Health workout history exist, the honest
              dashed placeholder (no invented bars) otherwise — same pattern
              as Readiness above. Labeled by whichever provider is actually
              supplying today's workout signal, not a fixed brand. */}
          <section>
            <SectionHead
              label={workoutProviderLabel ? `Training load · ${workoutProviderLabel}` : 'Training load'}
              right={
                workoutLoad.length >= 2 ? (
                  <span className="tnum text-[13px] text-muted">avg {avgMinutes} min</span>
                ) : (
                  <StatusMark status="unavailable" label="Awaiting history" />
                )
              }
            />
            {workoutLoad.length >= 2 ? (
              <>
                <TrainingLoadChart points={workoutLoad} />
                <ChartCaption
                  left={shortDate(workoutLoad[0].date)}
                  mid={`AVG ${avgMinutes} MIN`}
                  right={shortDate(workoutLoad[workoutLoad.length - 1].date)}
                />
              </>
            ) : (
              <>
                <div className="relative mt-2.5 h-[62px] border-t border-b border-dashed border-line-strong">
                  <div aria-hidden className="absolute inset-x-0 top-1/2 h-5 -translate-y-1/2 bg-sand/60" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-faint">Awaiting connected history</span>
                  </div>
                </div>
                <ChartCaption left="Sand band · training" right={workoutProviderLabel || 'No source connected'} />
              </>
            )}
          </section>

          {/* WHAT WE NOTICE — an observation only when correlations are available;
              otherwise the insufficient-data card, in the same white-moment style. */}
          <Card white className="p-4">
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-cobalt">What we notice</div>
            {correlations?.available ? (
              <>
                <p className="serif mt-2.5 text-xl leading-snug text-ink">{correlations.note}</p>
                {/* No Details control until a details view exists — a chevron
                    wired to nothing ships a dead affordance. */}
                <div className="mt-2 border-t border-line pt-3.5">
                  <span className="text-[9.5px] font-medium uppercase tracking-[0.1em] text-faint">Observation only · not medical advice</span>
                </div>
              </>
            ) : (
              <>
                <p className="mt-2.5 text-sm leading-relaxed text-muted">
                  Observations comparing your fueling with recovery and training open once enough connected history is
                  retained. Nothing here implies cause and effect.
                </p>
                {correlations?.note && <p className="mt-2 text-xs text-faint">{correlations.note}</p>}
                <div className="mt-3 border-t border-line pt-3.5">
                  <span className="text-[9.5px] font-medium uppercase tracking-[0.1em] text-faint">Observation only · not medical advice</span>
                </div>
              </>
            )}
          </Card>

          {/* SLEEP × FIBER — a dashed "not enough data" card with a real progress
              dot-bar bound to logged days. American spelling, like the Plan
              tab's "Fiber" row and every other surface. */}
          <div className="border border-dashed border-line-heavy px-4 py-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted">Sleep × Fiber</span>
              <span className="border border-line-strong px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">Not enough data</span>
            </div>
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted">
              {`${tracked} of ${window} days have a complete food log. Pairing intake with sleep opens once a recovery source is connected — keep logging.`}
            </p>
            <div className="mt-3 flex gap-0.5">
              {Array.from({ length: window }).map((_, i) => (
                <div key={i} aria-hidden className={`h-[5px] flex-1 ${i < Math.min(window, tracked) ? 'bg-ink' : 'bg-track'}`} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
