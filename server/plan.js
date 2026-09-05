// Explainable fueling rules engine. Pure functions — no I/O, no medical claims.
//
// Given baseline targets, the day's normalized wearable signals, and intake so
// far, produce (a) adjusted daily targets with a plain-language rationale and
// (b) one "next action" recommendation. Every adjustment names its reason and
// its source signal, so the UI can always answer "why?". Guidance is framed as
// nutritional planning, never as medical, diagnostic, or injury advice.
export const RULES_VERSION = 2

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
      // Explain the REASONING (carbs fuel endurance work, best eaten ahead of
      // it), not just name the trigger — direct user feedback was "this
      // section is unusable" on the old one-line "Higher-carbohydrate day —
      // X detected" phrasing. Same facts as before (label, timing, the g
      // bump), read as an explanation instead of a log line.
      detail: `${w.value.label || 'An endurance workout'} is on your schedule${w.value.time ? ` around ${w.value.time}` : ''}, so today's plan adds ${bump} g of carbs to fuel it — carbohydrates are what endurance efforts burn through fastest, and they're most useful eaten in the few hours beforehand.`,
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
      // Same facts as before (the score, the ~70 threshold, the g bump), read
      // as a reason rather than a bare log line — see the workout comment
      // above for why.
      detail: `Your readiness score is ${round(r.value)} today, below the ~70 mark that usually means recovery is still catching up — so the plan adds ${bump} g of protein and keeps fueling steady rather than cutting back.`,
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
      // Same facts as before (hours slept, the ~6.5h line, no target change),
      // read as a reason rather than a bare log line — see the workout
      // comment above for why.
      detail: `You slept ${Number(s.value).toFixed(1)} h last night, under the ~6.5 h mark where energy tends to dip — no target change today, but spreading carbohydrates through the day and staying on top of hydration should help you feel steadier.`,
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
  // Recommendations describe a remaining action, never a negative debt.
  // Preserve the signed difference only for detecting a target overage.
  const left = (k) => Math.max(0, rem(k))
  const why = []
  const w = signals.workout

  // 1. Pre-workout fueling window (0–4 h before an endurance session).
  if (usable(w, inf.workouts) && isEndurance(w.value.kind) && w.value.startHour != null) {
    const hoursUntil = num(w.value.startHour) - num(nowHour)
    if (hoursUntil > 0 && hoursUntil <= 4) {
      const desiredCarb = Math.max(30, round((adjusted.carbs_g || 0) * 0.25, 5))
      const desiredProtein = Math.max(15, round((adjusted.protein_g || 0) * 0.2, 5))
      const preCarb = Math.min(desiredCarb, left('carbs_g'))
      const preProtein = Math.min(desiredProtein, left('protein_g'))
      why.push(`${w.value.label || 'A workout'} is coming up${w.value.time ? ` around ${w.value.time}` : ''} (${w.provider}${w.demo ? ', demo' : ''}).`)
      why.push(`You've logged ${round(intake.calories)} of ${round(adjusted.calories)} kcal so far — carbohydrates fuel endurance work.`)
      if (usable(signals.readiness, inf.readiness)) why.push(`Readiness ${round(signals.readiness.value)} from ${signals.readiness.provider}.`)
      const portions = [
        preProtein > 0 ? `${round(preProtein)} g protein` : null,
        preCarb > 0 ? `${round(preCarb)} g carbs` : null,
      ].filter(Boolean)
      return {
        kind: 'pre_workout',
        title: portions.length ? `Fuel your ${w.value.shortLabel || 'workout'}` : 'Your workout fuel is covered',
        detail: portions.length
          ? `Aim for ${portions.join(' + ')} before ${w.value.time || 'you start'}; amounts are capped at what remains in today's plan.`
          : `You've already covered today's planned carbohydrate and protein. No extra macro target is needed before ${w.value.time || 'you start'}.`,
        why,
        tone: 'action',
        rulesVersion: RULES_VERSION,
      }
    }
  }

  // 2. A covered energy target takes precedence over ordinary protein pacing.
  // Without this gate a low-protein day at or above its energy target could
  // tell someone to add food before acknowledging that energy is covered.
  const energyDifference = rem('calories')
  if (num(adjusted.calories) > 0 && energyDifference <= 0) {
    const exceededEnergy = energyDifference < 0
    why.push(exceededEnergy
      ? `You're ${round(-energyDifference)} kcal over today's target of ${round(adjusted.calories)}.`
      : `You've met today's energy target of ${round(adjusted.calories)} kcal.`)
    return {
      kind: exceededEnergy ? 'over' : 'on_track',
      title: "You've covered today's energy target",
      detail: left('protein_g') > 0
        ? `${round(left('protein_g'))} g protein remains in the plan. Since energy is already covered, don't force food just to close that gap; favor protein if you eat again.`
        : 'Energy and protein targets are covered. No catch-up amount is needed.',
      why,
      tone: 'info',
      rulesVersion: RULES_VERSION,
    }
  }

  // 3. Protein pacing — behind where the day's proportion suggests.
  const dayFraction = Math.min(1, Math.max(0, (num(nowHour) - 7) / 14)) // ~7am–9pm
  const proteinTarget = num(adjusted.protein_g)
  if (proteinTarget > 0) {
    const expectedByNow = proteinTarget * dayFraction
    if (num(intake.protein_g) < expectedByNow - 15) {
      const proteinLeft = left('protein_g')
      const nextProtein = Math.min(proteinLeft, Math.max(20, round(proteinLeft / 2, 5)))
      why.push(`Protein is at ${round(intake.protein_g)} g of ${round(proteinTarget)} g with ${round(proteinLeft)} g to go.`)
      if (usable(w, inf.workouts)) why.push(`${w.value.label || 'A workout'} today raises the value of steady protein.`)
      return {
        kind: 'protein_pacing',
        title: 'Add protein at your next meal',
        detail: `You're trailing your protein target for this time of day — aim for about ${round(nextProtein)} g next, within what remains today.`,
        why,
        tone: 'nudge',
        rulesVersion: RULES_VERSION,
      }
    }
  }

  // 4. On track.
  why.push(`Intake ${round(intake.calories)} / ${round(adjusted.calories)} kcal, ${round(intake.protein_g)} / ${round(adjusted.protein_g)} g protein.`)
  if (usable(signals.readiness, inf.readiness)) why.push(`Readiness ${round(signals.readiness.value)} (${signals.readiness.provider}${signals.readiness.demo ? ', demo' : ''}).`)
  const energyLeft = left('calories')
  const proteinLeft = left('protein_g')
  let title = 'Today’s plan is covered'
  let detail = 'You’ve met or passed the energy and protein targets. No catch-up amount is needed.'
  if (energyLeft > 0 && proteinLeft > 0) {
    title = 'On track — steady as you go'
    detail = `About ${round(energyLeft)} kcal and ${round(proteinLeft)} g protein remain in today's plan.`
  } else if (energyLeft > 0) {
    title = 'Protein target covered'
    detail = `About ${round(energyLeft)} kcal remains in today's energy plan; protein is already covered.`
  } else if (proteinLeft > 0) {
    title = 'Energy target covered'
    detail = `${round(proteinLeft)} g protein remains in today's plan. If you eat again, favor protein without treating the remainder as a requirement.`
  }
  return {
    kind: 'on_track',
    title,
    detail,
    why,
    tone: 'info',
    rulesVersion: RULES_VERSION,
  }
}
