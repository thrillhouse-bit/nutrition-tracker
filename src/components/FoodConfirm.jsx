import { useMemo, useState } from 'react'
import { NUTRIENTS, MEALS, num, fmt } from '../lib/nutrition.js'
import { Button, Field, ServingStepper, inputCls } from './ui.jsx'

const CORE_FIELDS = [
  'name', 'brand', 'serving_size', 'serving_unit',
  ...NUTRIENTS.map((n) => n.key),
]

// Units where entering a raw amount (weigh-out) is more natural than a serving
// count — the bulk-bin / deli case.
const MASS_VOLUME = new Set(['g', 'gram', 'grams', 'ml', 'milliliter', 'millilitre', 'oz', 'fl oz', 'l', 'kg'])

// Honest provenance wording. The backend normalises lookups from Open Food
// Facts / USDA and tags manual + OCR entries; anything unrecognised falls back
// to a title-cased version of whatever the record carries rather than inventing
// a label. NO fabricated "% match" — the source word is the whole claim.
const SOURCE_LABELS = {
  openfoodfacts: 'OpenFoodFacts', off: 'OpenFoodFacts',
  usda: 'USDA', fdc: 'USDA', fooddata: 'USDA',
  manual: 'Manual', ocr: 'OCR', label: 'OCR', vision: 'OCR',
  cache: 'Cache',
}

// HOW the user got here, which is a different fact from WHERE the data came
// from. This used to be inferred — `draft.barcode ? 'Scanned · X' : 'X'` — on
// the premise that "a barcode on the record means it came in through the
// scanner". That premise is false: every USDA Branded row carries `gtinUpc`
// and every Open Food Facts row carries `code` (server/lookup.js), so most
// branded TEXT-SEARCH hits have a barcode. Reproduced in a real browser on
// 26 Aug 2026: typing "zucchini" and picking result #1 rendered
// "SCANNED · USDA" and the barcode 812997020233 for an item nobody scanned
// (docs/food-search-baseline.md RC-6).
//
// So the method is now carried, not deduced. An untagged record (an older
// cached food, saved before this field existed) claims nothing — it falls
// through to the bare source label rather than being asserted to be a scan.
const METHOD_LABELS = {
  barcode_scan: 'Scanned',
  text_search: 'Search result',
  label_ocr: 'Label scan',
  recent: 'Recently logged',
}

// The three macros the totals band breaks out, pulled from the canonical
// NUTRIENTS list so their labels / units / rounding stay in one place.
const MACROS = ['protein_g', 'carbs_g', 'fat_g'].map((k) => NUTRIENTS.find((n) => n.key === k))

function coreChanged(a, b) {
  return CORE_FIELDS.some((k) => (a[k] ?? '') !== (b[k] ?? ''))
}

// Guess a sensible default meal from the local hour.
function defaultMeal() {
  const h = new Date().getHours()
  if (h < 11) return 'breakfast'
  if (h < 15) return 'lunch'
  if (h < 21) return 'dinner'
  return 'snack'
}

export default function FoodConfirm({ food, onLog, onBack, logging }) {
  const [draft, setDraft] = useState(() => ({ ...food }))
  const [servings, setServings] = useState(1)
  const [mode, setMode] = useState('servings') // 'servings' | 'amount'
  const [amount, setAmount] = useState(() => num(food.serving_size) || 100)
  const [meal, setMeal] = useState(defaultMeal())
  const [editing, setEditing] = useState(false)

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }))

  const canAmount = MASS_VOLUME.has(String(draft.serving_unit || '').toLowerCase()) && num(draft.serving_size) > 0

  // Nutrients are stored per serving; logging by amount just converts the
  // weighed amount back into a serving multiplier.
  const effServings = mode === 'amount' && canAmount ? num(amount) / num(draft.serving_size) : num(servings)

  const totals = useMemo(
    () => Object.fromEntries(NUTRIENTS.map((n) => [n.key, num(draft[n.key]) * effServings])),
    [draft, effServings],
  )

  const submit = () => {
    const payload = { servings_consumed: num(effServings) || 1, meal }
    // Don't mutate a canonical cached/looked-up product: if the user edited the
    // numbers, log a fresh food instead of overwriting the shared one.
    if (food.id && !coreChanged(food, draft)) {
      // Postgres bigint ids come back over JSON as strings (confirmed live,
      // production-verification audit 25 Aug 2026) — the server's own
      // food_id schema is deliberately z.number(), strict, so an unconverted
      // string 400s. This was the primary log-an-existing-food path (scan,
      // search, or re-log with no edits) failing in production outright.
      payload.food_id = Number(food.id)
    } else {
      const { id, created_at, ...rest } = draft
      payload.food = rest
    }
    onLog(payload)
  }

  /* --- presentation-only derivations (no behavior) --------------------- */
  const srcKey = String(draft.source || 'manual').toLowerCase()
  const sourceLabel = SOURCE_LABELS[srcKey] || (draft.source ? draft.source[0].toUpperCase() + draft.source.slice(1) : 'Manual')
  const methodLabel = METHOD_LABELS[String(draft.search_method || '').toLowerCase()] || null
  const provenance = methodLabel ? `${methodLabel} · ${sourceLabel}` : sourceLabel
  // The barcode is shown whenever the record genuinely carries one — it is
  // real, useful data. What it must not do is imply a scan; that claim lives
  // in `provenance` above and comes from search_method alone.
  const scanned = draft.search_method === 'barcode_scan'
  // brand · serving descriptor · source — only the parts we actually have.
  const subParts = [
    draft.brand,
    draft.serving_size ? `${fmt(draft.serving_size, 0)} ${draft.serving_unit || ''}`.trim() : draft.serving_unit || null,
    sourceLabel,
  ].filter(Boolean)
  // The totals reflect the CHOSEN quantity, so the label under CALORIES must
  // say so — "per serving" is only honest at exactly one serving.
  const qtyLabel =
    effServings === 1
      ? 'per serving'
      : mode === 'amount' && canAmount
        ? `for ${fmt(amount, 0)} ${draft.serving_unit}`
        : `for ${fmt(effServings, 2)} serving${effServings === 1 ? '' : 's'}`

  const segCls = (active) =>
    // h-11 = the 44px touch floor; the switch measured 36px tall.
    `h-11 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] transition ${
      active ? 'bg-cobalt text-oncobalt' : 'text-muted hover:bg-fill'
    }`

  return (
    <div>
      {/* Provenance line — cobalt eyebrow (built from utilities so it wins the
          color cascade over the unlayered .eyebrow rule), barcode on the right */}
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-sans text-[10px] font-semibold uppercase leading-none tracking-[0.15em] text-cobalt">
          {provenance}
        </span>
        {draft.barcode && (
          <span
            className="tnum shrink-0 text-[11px] font-medium tracking-[0.12em] text-muted"
            aria-label={scanned ? `Scanned barcode ${draft.barcode}` : `Product barcode ${draft.barcode}`}
          >
            {draft.barcode}
          </span>
        )}
      </div>

      {/* Product identity — big Bodoni name, then a muted sub-line */}
      {/* line-clamp-3: an unclamped real-length product name set five lines of
          31px Bodoni at 320px, pushing serving/meal/CTA below the fold; the
          full name still appears in the editable Name field. */}
      <h2 className="serif mt-3 line-clamp-3 text-[31px] leading-[1.06] tracking-[-0.01em] text-ink">{draft.name || 'Food'}</h2>
      {subParts.length > 0 && <p className="mt-2 text-[12px] text-muted">{subParts.join(' · ')}</p>}

      {/* SERVING — bordered −/value/+ stepper (or a weighed amount for bulk) */}
      <section className="mt-4 border-t border-line pt-3">
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow">Serving</span>
          {mode === 'amount' && canAmount ? (
            <div className="flex items-center border-[1.5px] border-ink">
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label={`Amount in ${draft.serving_unit}`}
                className="numeral h-11 w-[92px] bg-transparent text-center text-[19px] text-ink outline-none focus:bg-fill"
              />
              <span className="flex h-11 items-center border-l-[1.5px] border-ink px-3 lowercase eyebrow">
                {draft.serving_unit}
              </span>
            </div>
          ) : (
            <ServingStepper value={servings} onChange={setServings} />
          )}
        </div>

        {/* helper line, and the Servings/amount switch for weigh-out items */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-[12px] text-faint">
            {mode === 'amount' && canAmount
              ? `≈ ${fmt(effServings, 2)} serving${effServings === 1 ? '' : 's'} (1 = ${fmt(draft.serving_size, 0)} ${draft.serving_unit})`
              : `1 serving = ${draft.serving_size ? fmt(draft.serving_size, 2) : '1'} ${draft.serving_unit || 'serving'}`}
          </span>
          {canAmount && (
            <div className="flex shrink-0 border-[1.5px] border-ink">
              <button onClick={() => setMode('servings')} className={segCls(mode === 'servings')}>
                Servings
              </button>
              <button
                onClick={() => setMode('amount')}
                className={`${segCls(mode === 'amount')} border-l-[1.5px] border-ink lowercase`}
              >
                {draft.serving_unit}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* MEAL & TIMING — sharp bordered chips, selected = cobalt */}
      <section className="mt-4 border-t border-line pt-3">
        <div className="eyebrow">Meal &amp; timing</div>
        <div className="mt-3 flex flex-wrap gap-[7px]">
          {MEALS.map((m) => (
            <button
              key={m}
              onClick={() => setMeal(m)}
              className={`px-3 py-4 text-[10.5px] font-semibold uppercase tracking-[0.08em] transition ${
                meal === m ? 'border border-cobalt bg-cobalt text-oncobalt' : 'border border-line-strong text-muted hover:bg-fill'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </section>

      {/* TOTALS — heavy rule, big cobalt Bodoni calorie figure */}
      <section className="mt-4 border-t-2 border-ink pt-3.5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="eyebrow">Calories</div>
            <div className="mt-2 text-[11.5px] text-muted">{qtyLabel}</div>
          </div>
          {/* leading-none, not 0.82: the tighter line box (measured 44.28px for
              54px glyphs) overpainted the hairline into the macro band below */}
          <div className="numeral text-[54px] leading-none text-cobalt">{fmt(totals.calories, 0)}</div>
        </div>
      </section>

      {/* Macro breakout — hairline-divided PROTEIN / CARBS / FAT */}
      <div className="flex border-t border-line">
        {MACROS.map((n, i) => (
          <div key={n.key} className={`flex-1 py-3 ${i > 0 ? 'border-l border-line pl-3.5' : ''}`}>
            <div className="eyebrow">{n.label}</div>
            <div className="numeral mt-2 text-[22px] leading-none text-ink">
              {fmt(totals[n.key], n.decimals)}
              <span className="ml-1 font-sans text-[11px] font-normal text-muted">{n.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Edit details — sharp cobalt disclosure over the full 7-nutrient panel */}
      <div className="mt-4 border-t border-line pt-3">
        <button
          onClick={() => setEditing((e) => !e)}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-cobalt hover:text-cobalt-ink"
        >
          {editing ? 'Hide details' : 'Edit details'}
        </button>

        {editing && (
          <div className="mt-3 space-y-3 border border-line bg-card p-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <input value={draft.name || ''} onChange={(e) => set('name', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Brand">
                <input value={draft.brand || ''} onChange={(e) => set('brand', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Serving size">
                <input type="number" value={draft.serving_size ?? ''} onChange={(e) => set('serving_size', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Serving unit">
                <input value={draft.serving_unit || ''} onChange={(e) => set('serving_unit', e.target.value)} className={inputCls} />
              </Field>
              {NUTRIENTS.map((n) => (
                <Field key={n.key} label={`${n.label} (${n.unit})`}>
                  <input
                    type="number"
                    value={draft[n.key] ?? ''}
                    onChange={(e) => set(n.key, e.target.value === '' ? null : Number(e.target.value))}
                    className={inputCls}
                  />
                </Field>
              ))}
            </div>
            <p className="text-xs text-faint">Values are per single serving.</p>
          </div>
        )}
      </div>

      {/* Actions — full-width cobalt ADD TO LOG + subtle CANCEL */}
      <div className="mt-5 flex gap-[9px]">
        <Button onClick={submit} disabled={logging} className="flex-1">
          {logging ? 'Adding…' : 'Add to log'}
        </Button>
        {onBack && (
          <Button variant="subtle" onClick={onBack} className="w-[104px]">
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
