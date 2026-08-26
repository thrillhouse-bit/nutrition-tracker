// Adaptive Fuel Plan — the planning-domain calculation engine.
//
// Pure functions only: no I/O, no Date.now()/Math.random(), no store access.
// Every function here is deterministic given its inputs, which is what makes
// a historical day's saved plan reproducible from its input_snapshot (see
// docs/adaptive-fuel-plan.md and afpDb.js's freeze-on-past-day rule).
//
// This is a NEW, independently-versioned engine — it does not replace or
// read from server/planCalc.js / server/plan.js (the existing "Plan" tab's
// baseline-calculator + wearable-adjustment layer), which keep working
// exactly as before. Keeping the two fully decoupled means nothing here can
// regress the existing daily_targets/plan.js behavior other features
// (Today, Insights, the Garmin Connect IQ watch app) already depend on.
//
// Every estimate produced here is nutritional-planning guidance, not medical
// advice, not a diagnosis, and not a claimed performance outcome. Callers
// (the API layer, the UI) are responsible for surfacing that framing
// alongside any number this engine returns.
export const ENGINE_VERSION = 1

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const round = (v, step = 1) => Math.round(v / step) * step
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// --- RMR --------------------------------------------------------------
// Mifflin-St Jeor (1990) — the most widely cited resting-metabolic-rate
// equation in sports-nutrition literature, more accurate across a wider BMI
// range than the older Harris-Benedict formula. Sex changes only the
// additive constant (+5 male / -161 female); when sex is withheld ("I
// prefer not to say / use a neutral estimate"), this uses the midpoint of
// those two constants (-78) rather than guessing — a defensible neutral
// estimate, not a third sex-specific formula.
export function mifflinStJeor({ weightKg, heightCm, ageYears, sex }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears
  if (sex === 'male') return base + 5
  if (sex === 'female') return base - 161
  return base - 78
}

// Cunningham (1980) — RMR = 500 + 22 * lean body mass (kg). Widely used for
// leaner/athletic populations because it estimates from metabolically-active
// tissue directly rather than total mass, height, age and sex as a proxy for
// it. Used ONLY when a valid body-fat percentage is on file (see
// estimateRMR) — with no body-fat estimate there's no lean mass to compute
// from a percentage of.
export function cunningham({ weightKg, bodyFatPct }) {
  const leanMassKg = weightKg * (1 - bodyFatPct / 100)
  return 500 + 22 * leanMassKg
}

// A body-fat percentage is only trusted in a physiologically plausible
// range — outside it (typos, a percentage entered as a fraction, etc.) this
// falls back to Mifflin-St Jeor rather than computing from a bad number.
const BODY_FAT_PCT_MIN = 3
const BODY_FAT_PCT_MAX = 60

// Picks the equation and returns both the number and the assumptions behind
// it, so the UI can always show "how we got this" next to the figure.
export function estimateRMR({ weightKg, heightCm, ageYears, sex, bodyFatPct }) {
  const bf = num(bodyFatPct)
  const useCunningham = bf != null && bf >= BODY_FAT_PCT_MIN && bf <= BODY_FAT_PCT_MAX
  if (useCunningham) {
    const value = cunningham({ weightKg, bodyFatPct: bf })
    return {
      value: round(value),
      equation: 'cunningham',
      assumptions: [
        `Lean body mass estimated from ${weightKg} kg at ${bf}% body fat.`,
        'Cunningham (1980): RMR = 500 + 22 × lean body mass (kg).',
        'Used because a body-fat percentage is on file — it estimates from metabolically-active tissue rather than total mass.',
      ],
    }
  }
  const value = mifflinStJeor({ weightKg, heightCm, ageYears, sex })
  const sexNote =
    sex === 'male' ? 'Uses the male constant.'
      : sex === 'female' ? 'Uses the female constant.'
        : 'Sex was not provided, so this uses a neutral estimate — the midpoint of the male and female constants, not a guess.'
  return {
    value: round(value),
    equation: sex === 'male' ? 'mifflin_st_jeor_male' : sex === 'female' ? 'mifflin_st_jeor_female' : 'mifflin_st_jeor_neutral',
    assumptions: [
      'Mifflin-St Jeor (1990): 10 × kg + 6.25 × cm − 5 × age, ±a sex constant.',
      sexNote,
      'No body-fat percentage is on file (or the value on file was out of a plausible 3–60% range), so this does not use Cunningham.',
    ],
  }
}

// --- BMI (optional context only — never used below to set a target) -------
export function computeBMI(weightKg, heightCm) {
  const w = num(weightKg), h = num(heightCm)
  if (!w || !h) return null
  const value = w / ((h / 100) ** 2)
  const category =
    value < 18.5 ? 'underweight' : value < 25 ? 'moderate' : value < 30 ? 'elevated' : 'high'
  return { value: Math.round(value * 10) / 10, category }
}

// --- baseline (non-training) daily energy ----------------------------------
// Deliberately NOT the classic Harris-Benedict TDEE multipliers (1.2–1.9,
// which already bake in "hard exercise 6-7 days/week") — this engine adds
// exercise energy separately from real/planned workouts, so folding it into
// the activity multiplier too would double-count it. These describe
// non-training daily movement only (desk job vs. an on-your-feet job), which
// is why they read lower than the TDEE table in server/planCalc.js.
export const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.15,
  light: 1.2,
  moderate: 1.3,
  active: 1.4,
  very_active: 1.5,
}

export function baselineEnergy(rmrValue, activityLevel) {
  const mult = ACTIVITY_MULTIPLIERS[activityLevel]
  if (!mult) return null
  return rmrValue * mult
}

// --- exercise energy: MET-based estimate -----------------------------------
// Approximate MET values (Compendium of Physical Activities-style, rounded)
// per sport and intensity band. This is an ESTIMATE for planning purposes,
// not a measured energy expenditure — a device's own reported calories (a
// synced completed workout) is always preferred over this table when one
// exists; see reconcileSessions.
export const MET_TABLE = {
  run: { easy: 8, moderate: 10, hard: 13 },
  ride: { easy: 6, moderate: 8, hard: 10.5 },
  swim: { easy: 6, moderate: 8.5, hard: 11 },
  row: { easy: 6, moderate: 8.5, hard: 12 },
  walk: { easy: 3, moderate: 3.8, hard: 5 },
  hike: { easy: 5, moderate: 6, hard: 7.5 },
  strength: { easy: 4, moderate: 5, hard: 6.5 },
  hiit: { easy: 6, moderate: 8, hard: 10 },
  cardio: { easy: 5, moderate: 6.5, hard: 8 },
  mobility: { easy: 2.5, moderate: 3, hard: 3.5 },
  workout: { easy: 5, moderate: 6, hard: 7.5 }, // generic/unmapped kind
}

// kcal/min = METs × 3.5 × bodyweight(kg) / 200 — the standard MET-to-kcal
// conversion. Falls back to the generic 'workout' row for an unmapped sport
// so an unrecognized kind still produces a conservative estimate rather than
// silently contributing zero exercise energy.
export function estimateSessionEnergyKcal(session, weightKg) {
  const table = MET_TABLE[session.sport] || MET_TABLE.workout
  const met = table[session.intensity] ?? table.moderate
  const minutes = num(session.durationMin) || 0
  return (met * 3.5 * weightKg / 200) * minutes
}

// --- reconciling planned vs. synced sessions for one day -------------------
// A synced completed workout (real device/provider data) always wins the
// ENERGY contribution over a planned session of the same sport that day —
// otherwise a planned run matched by a real completed run would double-count
// its calories. The planned session's own attributes (key-session/race
// flags, carb-loading opt-in) still flow through for periodization purposes
// even when its energy is superseded, because completed-workout data never
// carries those flags.
export function reconcileSessions(planned = [], synced = []) {
  const syncedSports = new Set(synced.map((s) => s.sport))
  const sessions = []
  for (const s of synced) {
    sessions.push({
      sport: s.sport,
      intensity: s.intensity || 'moderate',
      durationMin: num(s.durationMin) || 0,
      distanceKm: num(s.distanceKm),
      source: 'synced',
      provider: s.provider || null,
      energyKcal: s.calories != null ? num(s.calories) : null, // filled in below if null
      isKeySession: false,
      isRace: false,
      carbLoadingOptIn: false,
    })
  }
  for (const p of planned) {
    if (syncedSports.has(p.sport)) {
      // Energy is superseded by the matching synced session(s); still surface
      // this planned session's periodization-relevant flags by merging them
      // onto the first matching synced entry rather than dropping them.
      const match = sessions.find((s) => s.sport === p.sport && s.source === 'synced')
      if (match) {
        match.isKeySession = match.isKeySession || !!p.isKeySession
        match.isRace = match.isRace || !!p.isRace
        match.carbLoadingOptIn = match.carbLoadingOptIn || !!p.carbLoadingOptIn
        match.plannedDurationMin = num(p.durationMin) || 0
      }
      continue
    }
    sessions.push({
      sport: p.sport,
      intensity: p.intensity || 'moderate',
      durationMin: num(p.durationMin) || 0,
      distanceKm: num(p.distanceKm),
      source: 'planned',
      provider: null,
      energyKcal: null,
      isKeySession: !!p.isKeySession,
      isRace: !!p.isRace,
      carbLoadingOptIn: !!p.carbLoadingOptIn,
    })
  }
  return sessions
}

function fillSessionEnergy(sessions, weightKg) {
  return sessions.map((s) => ({
    ...s,
    energyKcal: s.energyKcal != null ? s.energyKcal : estimateSessionEnergyKcal(s, weightKg),
  }))
}

// --- training-load classification ------------------------------------------
// Thresholds are total session minutes for the day. A short but hard session
// is bumped up one tier (never two) because intensity, not just duration,
// drives glycogen demand — a 30-minute hard interval session belongs above
// "rest/light" even though its raw minutes alone would land it there.
export const TRAINING_LOAD_TIERS = [
  { tier: 'rest_light', maxMinutes: 20, carbBand: [3, 5] },
  { tier: 'moderate', maxMinutes: 75, carbBand: [5, 7] },
  { tier: 'endurance_high', maxMinutes: 180, carbBand: [6, 10] },
  { tier: 'very_high_extreme', maxMinutes: Infinity, carbBand: [8, 12] },
]

export function classifyTrainingLoad(sessions) {
  const totalMinutes = sessions.reduce((sum, s) => sum + (num(s.durationMin) || 0), 0)
  const hasHardSession = sessions.some((s) => s.intensity === 'hard' && (num(s.durationMin) || 0) >= 20)
  let idx = TRAINING_LOAD_TIERS.findIndex((t) => totalMinutes <= t.maxMinutes)
  if (idx === -1) idx = TRAINING_LOAD_TIERS.length - 1
  if (hasHardSession && idx < TRAINING_LOAD_TIERS.length - 1 && idx < 2) idx += 1
  const tier = TRAINING_LOAD_TIERS[idx]
  const prevMax = idx === 0 ? 0 : TRAINING_LOAD_TIERS[idx - 1].maxMinutes
  const tierSpan = tier.maxMinutes === Infinity ? 120 : tier.maxMinutes - prevMax
  const loadFraction = clamp((totalMinutes - prevMax) / tierSpan, 0, 1)
  return { tier: tier.tier, totalMinutes, hasHardSession, carbBand: tier.carbBand, loadFraction }
}

// --- goal adjustment (kcal/day) --------------------------------------------
// 7700 kcal ≈ 1 kg of body fat — the standard, widely-cited approximation
// used to convert a desired weekly rate of change into a daily energy
// adjustment.
export const KCAL_PER_KG = 7700

// Conservative bounds on the INPUT itself (not just the resulting calories) —
// a sustainable rate of loss/gain, enforced defensively here even though the
// API layer and UI also validate it, so a bad value can never reach the
// energy math from any caller.
export const WEEKLY_CHANGE_LIMITS = {
  gradual_loss: { min: 0, max: 1.0 },
  gradual_gain: { min: 0, max: 0.5 },
}

// A goal-driven deficit/surplus is capped as a fraction of total energy
// (baseline + exercise) so a technically-safe-in-absolute-terms request
// still can't become an aggressive percentage cut. Applied on top of, not
// instead of, the absolute minimum-energy guardrail below.
const MAX_DEFICIT_FRACTION = 0.25
const MAX_SURPLUS_FRACTION = 0.20

export function computeGoalAdjustment({ goal, weeklyChangeKg, calorieAdjustment, totalEnergyBeforeGoal }) {
  const warnings = []
  if (goal === 'maintain') return { adjustmentKcal: 0, requestedKcal: 0, warnings }

  if (goal === 'custom') {
    let requested = num(calorieAdjustment) || 0
    const cap = requested < 0 ? totalEnergyBeforeGoal * MAX_DEFICIT_FRACTION : totalEnergyBeforeGoal * MAX_SURPLUS_FRACTION
    let adjustment = requested
    if (Math.abs(requested) > cap) {
      adjustment = requested < 0 ? -cap : cap
      warnings.push({
        code: 'custom_adjustment_capped',
        message: `Your custom ${requested < 0 ? 'deficit' : 'surplus'} of ${Math.round(Math.abs(requested))} kcal/day was capped to a more conservative ${Math.round(cap)} kcal/day.`,
      })
    }
    return { adjustmentKcal: round(adjustment), requestedKcal: round(requested), warnings }
  }

  if (goal === 'gradual_loss' || goal === 'gradual_gain') {
    const limits = WEEKLY_CHANGE_LIMITS[goal]
    let weekly = num(weeklyChangeKg)
    if (weekly == null) weekly = limits.max === 1.0 ? 0.5 : 0.25 // a sensible conservative default if unset
    const clamped = clamp(weekly, limits.min, limits.max)
    if (clamped !== weekly) {
      warnings.push({
        code: 'weekly_change_clamped',
        message: `Your requested weekly rate of ${weekly} kg was adjusted to a more conservative ${clamped} kg/week.`,
      })
    }
    const magnitude = (clamped * KCAL_PER_KG) / 7
    const requested = goal === 'gradual_loss' ? -magnitude : magnitude
    const cap = goal === 'gradual_loss' ? totalEnergyBeforeGoal * MAX_DEFICIT_FRACTION : totalEnergyBeforeGoal * MAX_SURPLUS_FRACTION
    let adjustment = requested
    if (Math.abs(requested) > cap) {
      adjustment = requested < 0 ? -cap : cap
      warnings.push({
        code: 'goal_adjustment_capped',
        message: `The ${goal === 'gradual_loss' ? 'deficit' : 'surplus'} implied by your weekly-change target was capped to a more conservative ${Math.round(cap)} kcal/day.`,
      })
    }
    return { adjustmentKcal: round(adjustment), requestedKcal: round(requested), warnings }
  }

  return { adjustmentKcal: 0, requestedKcal: 0, warnings }
}

// --- minimum-energy safety guardrail ---------------------------------------
// Never below an absolute floor (1200 kcal — common guidance for not going
// lower without clinical supervision, regardless of sex) AND never below the
// person's own RMR (their body's resting requirement). Whichever floor is
// higher wins. When a requested target would fall under it, this clamps to
// the floor and returns a clear warning — it never silently forces the
// aggressive number through.
export const ABSOLUTE_MIN_KCAL = 1200

export function applyMinEnergyGuardrail(targetCalories, rmrValue) {
  const floor = Math.max(ABSOLUTE_MIN_KCAL, rmrValue)
  if (targetCalories >= floor) return { calories: round(targetCalories, 10), guardrailApplied: false, floor: round(floor) }
  return {
    calories: round(floor, 10),
    guardrailApplied: true,
    floor: round(floor),
    warning: {
      code: 'min_energy_guardrail',
      message: `Your plan's calorie target was raised to ${round(floor, 10)} kcal — a safety floor (the greater of ${ABSOLUTE_MIN_KCAL} kcal or your estimated resting rate). We won't set a target below this without clinical supervision.`,
    },
  }
}

// --- protein target (g/kg bodyweight) --------------------------------------
export const PROTEIN_PER_KG = {
  maintain: 1.6,
  gradual_loss: 2.0, // higher to help preserve lean mass in a deficit
  gradual_gain: 1.8,
  custom: 1.8,
}
const PROTEIN_PER_KG_BOUNDS = [1.2, 2.4]

export function proteinTarget(weightKg, goal) {
  const perKg = clamp(PROTEIN_PER_KG[goal] ?? PROTEIN_PER_KG.maintain, ...PROTEIN_PER_KG_BOUNDS)
  return { grams: round(weightKg * perKg), perKg }
}

// --- fat floor ---------------------------------------------------------
// The higher of ~0.3 g/kg bodyweight or 20% of calories — a defensible
// minimum below which essential fatty acid and fat-soluble vitamin intake
// becomes a real concern, not a target to aim for.
export function fatFloor(weightKg, calories) {
  return Math.max(round(weightKg * 0.3), round((calories * 0.2) / 9))
}

// --- carbohydrate periodization ---------------------------------------
// Chooses a point within the day's recommended g/kg band by where the day's
// training load sits within its own tier (loadFraction, from
// classifyTrainingLoad) — a harder/longer day within the same tier lands
// higher in the band, never outside it.
export function carbTargetFromBand(weightKg, carbBand, loadFraction) {
  const [lo, hi] = carbBand
  const perKg = lo + loadFraction * (hi - lo)
  return { grams: round(weightKg * perKg), perKg: Math.round(perKg * 10) / 10, band: carbBand }
}

const TIER_LABEL = {
  rest_light: 'a rest or light day',
  moderate: 'a moderate training day (~1 h)',
  endurance_high: 'an endurance/high-volume day (1–3 h)',
  very_high_extreme: 'a very high/extreme training day',
}

// Pre-run / during-run / recovery guidance, and a meal-slot allocation of the
// day's carbohydrate target. Only produced for sessions long/intense enough
// that the guidance is actionable — a 20-minute easy walk gets none of this.
export function buildCarbGuidance({ sessions, tier, carbGrams, nextDayHasDemandingSession }) {
  const keySession = sessions.find((s) => s.isKeySession || s.isRace) || null
  const longestSession = [...sessions].sort((a, b) => b.durationMin - a.durationMin)[0] || null
  const focus = keySession || longestSession

  const preworkout =
    focus && focus.durationMin >= 60
      ? {
          grams: Math.max(30, round(carbGrams * 0.15, 5)),
          timing: '1–4 hours before the session',
          note: `${TIER_LABEL[tier]} — a carbohydrate-forward pre-session meal or snack helps top off glycogen before ${focus.sport === 'run' ? 'the run' : 'the session'}.`,
        }
      : null

  const duringWorkout =
    focus && (focus.durationMin >= 90 || (focus.durationMin >= 60 && focus.intensity === 'hard'))
      ? {
          gramsPerHour: focus.intensity === 'hard' ? 60 : 45,
          note: 'Sessions this long benefit from carbohydrate intake during the session itself (e.g. a sports drink, gel, or chews) — aim for the low end if this is new to you and build up gradually.',
        }
      : null

  const recovery = nextDayHasDemandingSession
    ? {
        note: 'Another demanding session is coming up soon — prioritize carbohydrate-forward recovery meals in the hours after today\'s session to help restock glycogen in time.',
      }
    : null

  // Allocation is a plain percentage split of the day's carb target across
  // the slots that actually apply — always sums to EXACTLY 100 among
  // applicable slots, never a fabricated per-gram meal plan. Fixed
  // percentages are carved out for whichever of pre/during/recovery apply;
  // breakfast and "remaining" then split whatever percentage is left, so
  // adding a slot can never push the total over (or leave it under) 100.
  const slots = {}
  let appliedExtras = 0
  if (preworkout) { slots.preWorkout = 15; appliedExtras += 15 }
  if (duringWorkout) { slots.duringWorkout = 10; appliedExtras += 10 }
  if (recovery) { slots.recovery = 20; appliedExtras += 20 }
  const leftover = 100 - appliedExtras
  slots.breakfast = Math.round(leftover * 0.4)
  slots.remaining = leftover - slots.breakfast

  return { preworkout, duringWorkout, recovery, allocationPct: slots }
}

// --- carbohydrate loading (opt-in, event-specific only) --------------------
// Never applied automatically. Only surfaced as a suggestion for the day
// before a session the user has BOTH flagged as a race AND explicitly opted
// into carb-loading for, and only when the event is long/intense enough that
// loading is an established practice (endurance events ~90+ minutes, or a
// run of half-marathon distance or further).
const CARB_LOADING_RANGE = [8, 12]

export function evaluateCarbLoading(nextDaySessions = []) {
  const candidate = nextDaySessions.find((s) => s.isRace && s.carbLoadingOptIn)
  if (!candidate) return null
  const qualifies = (num(candidate.durationMin) || 0) >= 90 || (num(candidate.distanceKm) || 0) >= 21
  if (!qualifies) {
    return {
      eligible: false,
      reason: 'This event is shorter than the ~90-minute (or half-marathon-distance) threshold where carbohydrate loading is an established practice.',
    }
  }
  return {
    eligible: true,
    optIn: true,
    gramsPerKgRange: CARB_LOADING_RANGE,
    note: 'Carbohydrate loading (elevated carbohydrate intake, typically 8–12 g/kg, in the 24–36 hours before a long/key event) is an established endurance-nutrition practice — not a default recommendation. Practice it in training first; it can cause GI discomfort for some people, and it is not necessary for shorter or lower-intensity sessions.',
    forSport: candidate.sport,
  }
}

// --- safety boundaries ------------------------------------------------
// Only DEFICIT advice is suppressed (a maintenance or surplus goal is never
// blocked) for a minor, a pregnancy/postpartum context, or a self-reported
// eating-disorder/medical-risk flag. Suppression replaces the calculated
// deficit with a maintenance-level target and surfaces a clinician/dietitian
// referral instead — it never just silently zeroes the deficit with no
// explanation.
export function evaluateSafety({ ageYears, isPregnantOrPostpartum, hasEdRiskFlag }, goal, calorieAdjustment) {
  const isMinor = num(ageYears) != null && num(ageYears) < 18
  const wantsDeficit = goal === 'gradual_loss' || (goal === 'custom' && num(calorieAdjustment) < 0)
  if (!wantsDeficit) return { suppressed: false, reason: null }

  const reason = isMinor ? 'minor' : isPregnantOrPostpartum ? 'pregnancy_postpartum' : hasEdRiskFlag ? 'ed_risk' : null
  if (!reason) return { suppressed: false, reason: null }

  const messages = {
    minor: 'A calorie-deficit plan is not offered for users under 18 — this plan uses a maintenance-level target instead. Please talk with a pediatrician or registered dietitian about nutrition needs during growth.',
    pregnancy_postpartum: 'A calorie-deficit plan is not offered during pregnancy or postpartum — this plan uses a maintenance-level target instead. Please talk with your OB/GYN or a registered dietitian about your nutrition needs.',
    ed_risk: 'Based on what you shared, a calorie-deficit plan is not offered here — this plan uses a maintenance-level target instead. Please talk with a doctor or a registered dietitian with eating-disorder experience.',
  }
  return { suppressed: true, reason, message: messages[reason] }
}

// --- progress against actual logged intake --------------------------------
// A tiny, separate pure helper (not folded into computeAdaptivePlan) so that
// progress can always be computed fresh from the current food log, even for
// a historical day whose TARGETS are frozen — see docs/adaptive-fuel-plan.md
// on why targets freeze but intake never does.
export function computeProgress(targets, actualIntake = {}) {
  const keys = ['calories', 'protein_g', 'carbs_g', 'fat_g']
  const out = {}
  for (const k of keys) {
    const raw = targets?.[k]
    if (raw === null || raw === undefined) { out[k] = null; continue }
    const target = num(raw)
    const actual = num(actualIntake?.[k]) || 0
    out[k] = { target, actual, remaining: round(target - actual, 0.1), pct: target > 0 ? Math.round((actual / target) * 100) : 0 }
  }
  return out
}

const REQUIRED_PROFILE_FIELDS = ['weightKg', 'heightCm', 'ageYears', 'activityLevel', 'goal']

// --- the composed plan -------------------------------------------------
// profile: { weightKg, heightCm, ageYears, sex, bodyFatPct, activityLevel,
//            goal, weeklyChangeKg, calorieAdjustment, isPregnantOrPostpartum,
//            hasEdRiskFlag }
// plannedSessions / syncedSessions: [{ sport, intensity, durationMin,
//            distanceKm, isKeySession, isRace, carbLoadingOptIn, calories?,
//            provider? }]
// nextDaySessions: same shape as plannedSessions, for tomorrow — used only
//            for the recovery note and the carb-loading opt-in check.
// overrides: optional { calories?, protein_g?, carbs_g?, fat_g? } — a user's
//            day-specific correction, applied last and always labeled.
//
// Returns { ok:false, missing:[...] } when a required profile field is
// absent — it never guesses a target from an incomplete profile.
export function computeAdaptivePlan({
  profile = {},
  plannedSessions = [],
  syncedSessions = [],
  nextDaySessions = [],
  overrides = null,
} = {}) {
  const missing = REQUIRED_PROFILE_FIELDS.filter((f) => profile[f] === null || profile[f] === undefined)
  if (missing.length) return { ok: false, missing }

  const weightKg = profile.weightKg
  const warnings = []

  const rmr = estimateRMR(profile)
  const bmi = computeBMI(weightKg, profile.heightCm)

  let sessions = reconcileSessions(plannedSessions, syncedSessions)
  sessions = fillSessionEnergy(sessions, weightKg)
  const exerciseEnergy = sessions.reduce((sum, s) => sum + (s.energyKcal || 0), 0)

  const load = classifyTrainingLoad(sessions)

  const baseline = baselineEnergy(rmr.value, profile.activityLevel)
  if (baseline == null) return { ok: false, missing: ['activityLevel'] }

  const totalEnergyBeforeGoal = baseline + exerciseEnergy

  const safety = evaluateSafety(profile, profile.goal, profile.calorieAdjustment)
  const effectiveGoal = safety.suppressed ? 'maintain' : profile.goal

  const goalAdj = computeGoalAdjustment({
    goal: effectiveGoal,
    weeklyChangeKg: profile.weeklyChangeKg,
    calorieAdjustment: profile.calorieAdjustment,
    totalEnergyBeforeGoal,
  })
  warnings.push(...goalAdj.warnings)

  const requestedCalories = totalEnergyBeforeGoal + goalAdj.adjustmentKcal
  const guardrail = applyMinEnergyGuardrail(requestedCalories, rmr.value)
  if (guardrail.guardrailApplied) warnings.push(guardrail.warning)

  const preMacroCalories = guardrail.calories
  const protein = proteinTarget(weightKg, effectiveGoal)
  const carb = carbTargetFromBand(weightKg, load.carbBand, load.loadFraction)
  const floor = fatFloor(weightKg, preMacroCalories)
  const remainderFatKcal = preMacroCalories - protein.grams * 4 - carb.grams * 4
  let fatGrams = Math.max(floor, round(remainderFatKcal / 9))

  // The final "calories" figure is always exactly the sum of the three
  // macro targets — never a separately-rounded number that can drift from
  // what the grams actually add up to. When the fat floor pushes that sum
  // above the energy target computed above, fueling correctly wins over a
  // strict calorie ceiling, and it's recorded as a warning rather than a
  // silent gap between "calories" and what the macros add up to.
  const macroTotal = protein.grams * 4 + carb.grams * 4 + fatGrams * 9
  if (macroTotal > preMacroCalories) {
    warnings.push({
      code: 'fat_floor_raised_calories',
      message: `Your protein, carbohydrate and fat targets add up to ${round(macroTotal)} kcal, ${round(macroTotal - preMacroCalories)} kcal above the energy target — raised to keep fat above its safe minimum.`,
    })
  }
  const calories = macroTotal

  const carbGuidance = buildCarbGuidance({
    sessions,
    tier: load.tier,
    carbGrams: carb.grams,
    nextDayHasDemandingSession: nextDaySessions.some((s) => (num(s.durationMin) || 0) >= 60 || s.intensity === 'hard'),
  })
  const carbLoading = evaluateCarbLoading(nextDaySessions)

  let targets = { calories, protein_g: protein.grams, carbs_g: carb.grams, fat_g: fatGrams }
  let appliedOverrides = null
  if (overrides && typeof overrides === 'object') {
    appliedOverrides = {}
    for (const k of ['calories', 'protein_g', 'carbs_g', 'fat_g']) {
      const v = num(overrides[k])
      if (v != null) appliedOverrides[k] = v
    }
    if (Object.keys(appliedOverrides).length) targets = { ...targets, ...appliedOverrides }
    else appliedOverrides = null
  }

  return {
    ok: true,
    engineVersion: ENGINE_VERSION,
    bmi,
    rmr,
    energy: {
      baselineNonTraining: round(baseline),
      exercise: round(exerciseEnergy),
      goalAdjustment: goalAdj.adjustmentKcal,
      requestedGoalAdjustment: goalAdj.requestedKcal,
      total: round(totalEnergyBeforeGoal),
      guardrailApplied: guardrail.guardrailApplied,
      guardrailFloor: guardrail.floor,
    },
    targets,
    computedTargets: { calories: guardrail.calories, protein_g: protein.grams, carbs_g: carb.grams, fat_g: fatGrams },
    overridesApplied: appliedOverrides,
    trainingLoad: { tier: load.tier, totalMinutes: load.totalMinutes, sessions },
    carbPlan: {
      band: carb.band,
      gPerKgChosen: carb.perKg,
      reason: `${TIER_LABEL[load.tier]} (${load.totalMinutes} min planned/synced training) → ${carb.band[0]}–${carb.band[1]} g/kg recommended; chosen ${carb.perKg} g/kg for today's load within that band.`,
      ...carbGuidance,
    },
    carbLoading,
    safety,
    warnings,
  }
}
