// Explainable fueling rules engine. Pure functions — no I/O, no medical claims.
//
// Given baseline targets, the day's normalized wearable signals, and intake so
// far, produce (a) adjusted daily targets with a plain-language rationale and
// (b) one "next action" recommendation. Every adjustment names its reason and
// its source signal, so the UI can always answer "why?". Guidance is framed as
// nutritional planning, never as medical, diagnostic, or injury advice.
export const RULES_VERSION = 1

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const round = (v, step = 1) => Math.round(num(v) / step) * step

// Normalized signal shapes this engine reads (all optional, all may be `demo`):
//   readiness: { value: 0..100, provider, freshness, demo }
//   sleep:     { value: hours, score: 0..100, provider, freshness, demo }
//   workout:   { value: { label, shortLabel, kind, time, startHour, est_kcal, status }, provider, freshness, demo }
//   expenditure:{ value: kcal, active: kcal, provider, freshness, demo }

function isEndurance(kind = '') {
  return /run|ride|bike|cycl|swim|row|cardio|endurance|long/.test(String(kind).toLowerCase())
}

// A signal only influences the plan when it exists, isn't unavailable, and the
// user hasn't switched its category off.
function usable(sig, enabled = true) {
  return Boolean(enabled && sig && sig.value != null && sig.freshness !== 'unavailable')
}

// --- adjusted targets ------------------------------------------------------
export function computeAdjustedTargets(baseline = {}, signals = {}, opts = {}) {
  const influence = opts.influence || { readiness: true, sleep: true, workouts: true }
  const adjusted = { ...baseline }
  const rationale = []
  const b = (k) => num(baseline[k])

  // Endurance workout today → higher-carbohydrate day.
  const w = signals.workout
  if (usable(w, influence.workouts) && isEndurance(w.value.kind) && b('carbs_g') > 0) {
    const bump = round(b('carbs_g') * 0.25, 5)
    adjusted.carbs_g = b('carbs_g') + bump
    if (b('calories') > 0) adjusted.calories = b('calories') + bump * 4 // ~4 kcal per g carb
    rationale.push({
      factor: 'workout',
      effect: `+${bump} g carbs`,
      detail: `Higher-carbohydrate day — ${w.value.label || 'endurance workout'} detected${w.value.time ? ` around ${w.value.time}` : ''}.`,
      source: w.provider,
      demo: !!w.demo,
    })
  }

  // Lower readiness → keep protein up and don't under-fuel (fueling framing).
  const r = signals.readiness
  if (usable(r, influence.readiness) && num(r.value) < 70 && b('protein_g') > 0) {
    const bump = round(b('protein_g') * 0.1, 5)
    adjusted.protein_g = b('protein_g') + bump
    rationale.push({
      factor: 'readiness',
      effect: `+${bump} g protein`,
      detail: `Readiness ${round(r.value)} is below ~70 — a little more protein and steady fueling today.`,
      source: r.provider,
      demo: !!r.demo,
    })
  }

  // Short sleep → a gentle hydration/steady-carb note (no target change).
  const s = signals.sleep
  if (usable(s, influence.sleep) && num(s.value) > 0 && num(s.value) < 6.5) {
    rationale.push({
      factor: 'sleep',
      effect: 'no change',
      detail: `Sleep was ${Number(s.value).toFixed(1)} h — spread carbohydrates through the day and keep hydration up.`,
      source: s.provider,
      demo: !!s.demo,
    })
  }

  return { baseline, adjusted, rationale, rulesVersion: RULES_VERSION }
}

// --- next-action recommendation -------------------------------------------
// `nowHour` is the local hour as a float (e.g. 15.5 = 3:30pm).
export function computeRecommendation({ baseline = {}, adjusted = {}, intake = {}, signals = {}, nowHour = 12, influence } = {}) {
  const inf = influence || { readiness: true, sleep: true, workouts: true }
  const rem = (k) => num(adjusted[k]) - num(intake[k])
  const why = []
  const w = signals.workout

  // 1. Pre-workout fueling window (0–4 h before an endurance session).
  if (usable(w, inf.workouts) && isEndurance(w.value.kind) && w.value.startHour != null) {
    const hoursUntil = num(w.value.startHour) - num(nowHour)
    if (hoursUntil > 0 && hoursUntil <= 4) {
      const preCarb = Math.max(30, round((adjusted.carbs_g || 0) * 0.25, 5))
      const preProtein = Math.max(15, round((adjusted.protein_g || 0) * 0.2, 5))
      why.push(`${w.value.label || 'A workout'} is coming up${w.value.time ? ` around ${w.value.time}` : ''} (${w.provider}${w.demo ? ', demo' : ''}).`)
      why.push(`You've logged ${round(intake.calories)} of ${round(adjusted.calories)} kcal so far — carbohydrates fuel endurance work.`)
      if (usable(signals.readiness, inf.readiness)) why.push(`Readiness ${round(signals.readiness.value)} from ${signals.readiness.provider}.`)
      return {
        kind: 'pre_workout',
        title: `Fuel your ${w.value.shortLabel || 'workout'}`,
        detail: `Aim for ${preProtein} g protein + ${preCarb} g carbs before ${w.value.time || 'you start'}.`,
        why,
        tone: 'action',
        rulesVersion: RULES_VERSION,
      }
    }
  }

  // 2. Protein pacing — behind where the day's proportion suggests.
  const dayFraction = Math.min(1, Math.max(0, (num(nowHour) - 7) / 14)) // ~7am–9pm
  const proteinTarget = num(adjusted.protein_g)
  if (proteinTarget > 0) {
    const expectedByNow = proteinTarget * dayFraction
    if (num(intake.protein_g) < expectedByNow - 15) {
      why.push(`Protein is at ${round(intake.protein_g)} g of ${round(proteinTarget)} g with ${round(rem('protein_g'))} g to go.`)
      if (usable(w, inf.workouts)) why.push(`${w.value.label || 'A workout'} today raises the value of steady protein.`)
      return {
        kind: 'protein_pacing',
        title: 'Add protein at your next meal',
        detail: `You're trailing your protein target for this time of day — aim for ~${Math.max(20, round(rem('protein_g') / 2, 5))} g next.`,
        why,
        tone: 'nudge',
        rulesVersion: RULES_VERSION,
      }
    }
  }

  // 3. Over the calorie target already.
  if (num(adjusted.calories) > 0 && num(intake.calories) > num(adjusted.calories)) {
    why.push(`You're ${round(num(intake.calories) - num(adjusted.calories))} kcal over today's target of ${round(adjusted.calories)}.`)
    return {
      kind: 'over',
      title: "You've hit today's energy target",
      detail: 'If you have a session left, keep additions light and protein-forward.',
      why,
      tone: 'info',
      rulesVersion: RULES_VERSION,
    }
  }

  // 4. On track.
  why.push(`Intake ${round(intake.calories)} / ${round(adjusted.calories)} kcal, ${round(intake.protein_g)} / ${round(adjusted.protein_g)} g protein.`)
  if (usable(signals.readiness, inf.readiness)) why.push(`Readiness ${round(signals.readiness.value)} (${signals.readiness.provider}${signals.readiness.demo ? ', demo' : ''}).`)
  return {
    kind: 'on_track',
    title: rem('calories') > 0 ? 'On track — steady as you go' : 'Nicely balanced today',
    detail: rem('calories') > 0
      ? `About ${round(rem('calories'))} kcal and ${round(rem('protein_g'))} g protein left to hit today's plan.`
      : 'Your intake lines up with the plan.',
    why,
    tone: 'info',
    rulesVersion: RULES_VERSION,
  }
}
