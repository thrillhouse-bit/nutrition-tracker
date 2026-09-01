# Daily Fuel Plan — canonical architecture

Originally added on 25 Aug 2026 as a parallel "Adaptive Fuel Plan". Made the
canonical planning system on 31 Aug 2026 after the parallel calculator,
editable static targets, wearable-adjustment rules, and AFP engine created
contradictory answers and duplicate setup.

AFP now owns the user profile, planned sessions, computed targets, progress,
safety rules, and historical snapshots. The visible Plan tab is a thin shell
over this system. Today reads the same AFP baseline and adjusted target object,
and planned AFP sessions feed Today's workout context and recommendation. The
Garmin summary compatibility endpoint also reads AFP targets.

## Compatibility and migration

Existing accounts are migrated lazily by `server/afp/migration.js`. The bridge
copies only missing height, weight, age, sex, unit, activity, and goal fields
from the old calculator profile. It never overwrites an AFP profile the person
already edited. Legacy endurance maps to maintenance because training energy is
periodized separately; mapping it to an additional surplus would double-count
the same intent.

The old `profile`, `daily_targets`, `daily_plans`, `server/planCalc.js`, and
`server/plan.js` surfaces remain temporarily for API/data compatibility. They
are not a second visible product and must not become the source of truth for a
new screen. `/api/plan/today` is a compatibility adapter over AFP. New product
work uses `/api/afp/*` and the contract in `docs/UX-CONTRACT.md`.

## The engine (`server/afp/engine.js`)

Pure functions only — no I/O, no `Date.now()`/`Math.random()` — so a
historical day's plan is exactly reproducible from its `input_snapshot`.

1. **RMR** — Mifflin-St Jeor (sex-specific, or a neutral estimate — the
   midpoint of the male/female constants — when sex is withheld) by default;
   Cunningham (`500 + 22 × lean mass`) when a body-fat percentage in a
   plausible 3–60% range is on file. `estimateRMR` returns the equation name
   and the assumptions behind it, always shown next to the figure.
2. **Baseline energy** — RMR × a NEAT-only activity multiplier
   (`ACTIVITY_MULTIPLIERS`, 1.15–1.5). Deliberately lower than the legacy
   `planCalc.js` TDEE table (1.2–1.9): that table already bakes in "hard
   exercise 6–7 days/week", and this engine adds exercise energy separately,
   so reusing the same numbers would double-count training.
3. **Exercise energy** — `reconcileSessions(planned, synced)` merges a day's
   planned sessions with real completed workouts by sport: a synced session
   always supersedes a planned one of the SAME sport for ENERGY (a device
   measurement beats an estimate), while the planned session's key-session/
   race/carb-loading flags still carry over (completed-workout data has no
   such flags). Energy itself comes from the provider's own reported calories
   when present, else a MET-based estimate (`MET_TABLE`, standard
   Compendium-of-Physical-Activities-style values, `kcal/min = MET × 3.5 ×
   kg / 200`).
4. **Goal adjustment** — `maintain` (0), `gradual_loss`/`gradual_gain`
   (weekly kg → kcal/day via the standard 7700 kcal/kg approximation), or
   `custom` (a direct kcal/day delta). Three guardrails apply, all
   independently triggerable and all surfaced as a `warnings[]` entry: the
   requested weekly rate is clamped to a conservative range
   (`WEEKLY_CHANGE_LIMITS`: 0–1.0 kg/week loss, 0–0.5 kg/week gain), the
   resulting deficit/surplus is capped at 25%/20% of total energy
   respectively, and the final calorie figure is never allowed below
   `max(1200 kcal, RMR)` (`applyMinEnergyGuardrail`) — clamped with an
   explicit message, never silently forced through.
5. **Macros** — protein by g/kg (goal-dependent, 1.6–2.0, itself clamped to
   1.2–2.4 g/kg regardless of input); carbohydrate from the day's
   periodization band (below); fat from whichever is larger of 0.3 g/kg or
   20% of calories. The final `calories` figure is **always exactly** the sum
   of the three macros in kcal (never a separately-rounded number that can
   drift from what the grams add up to) — if the fat floor pushes that sum
   above the energy-budget figure, the total is raised to match and a warning
   names it, rather than silently reporting two disagreeing numbers.
6. **Carbohydrate periodization** — `classifyTrainingLoad` buckets the day's
   total planned+synced minutes into four tiers (rest/light ≤20min,
   moderate ≤75min, endurance/high ≤180min, very-high/extreme beyond) with a
   one-tier bump for any ≥20-minute hard session (a short-but-hard interval
   session outranks pure duration). Each tier maps to the requested g/kg band
   (3–5 / 5–7 / 6–10 / 8–12); the specific point within the band scales with
   how far into the tier the day's load sits (`loadFraction`). Pre-workout
   (≥60min sessions), during-workout (≥90min, or ≥60min hard), and recovery
   (a demanding session coming up tomorrow) guidance is added only when it's
   actionable, plus a percentage allocation across meal slots that always
   sums to exactly 100.
7. **Carbohydrate loading** is never automatic: `evaluateCarbLoading` only
   surfaces a suggestion for the day before a session BOTH flagged as a race
   AND explicitly opted in, and only when it's long/intense enough
   (≥90 min or ≥half-marathon distance) that loading is an established
   practice — otherwise it explains why it doesn't apply.
8. **Safety** — `evaluateSafety` suppresses goal-driven DEFICIT advice only
   (never a surplus or maintenance target) for a self-reported minor,
   pregnancy/postpartum, or eating-disorder-risk context, substituting a
   maintenance-level target and a clinician/dietitian referral message.

## Data model and the freeze rule

`afp_daily_plans` (`user_id`, `date` primary key) stores the full engine
output plus `input_snapshot` (the exact profile/session data used) and
`engine_version` — an explanation of a past day's plan is always
reproducible without recomputing anything.

**Reconciliation rule** (`server/afp/plan.js`'s `getOrComputeAfpPlan`):
TODAY always recomputes on every read (a synced workout landing mid-morning,
a body-weight log, a profile edit all take effect immediately). A PAST day,
once it has a saved snapshot, is FROZEN — a later profile change or newly
synced wearable data can never silently rewrite what its plan said at the
time. The one explicit escape hatch is `POST /api/afp/plan/:date/recompute`,
used only when a user deliberately corrects a data-entry mistake — never
called automatically. Day-specific overrides (`PATCH .../overrides`) are
layered the same way: they persist across a same-day recompute, and clearing
them (an empty PATCH body) reverts to the engine's own numbers without
touching `afp_profile`'s defaults.

## Runtime ownership

- `server/afp/engine.js` is the pure calculation engine.
- `server/afp/plan.js` reconciles planned and completed sessions and persists
  versioned snapshots.
- `server/afp/migration.js` is the one-way compatibility bridge.
- `src/components/AdaptiveFuelPlan.jsx` owns profile, workout, target,
  explanation, progress, override, and safety interactions.
- `src/components/CanonicalPlan.jsx` is the visible Plan route.
- `server/index.js`'s Today composite uses AFP `computedTargets` as baseline
  and AFP `targets` as adjusted. A real completed wearable workout wins over a
  planned session; otherwise the AFP planned session is surfaced consistently.

## Known limitations / future integration points

- Garmin contributes no completed-workout data to `gatherSyncedSessions`
  (matching `docs/garmin-capability-matrix.md` — no real Garmin workout
  ingestion exists yet). The engine works fully from planned sessions and
  Oura/Apple synced data; this is a documented gap, not a silent one.
- Apple-synced workouts carry no per-session calories (HealthKit ingestion
  records duration/kind only — see `ios/Shared/HealthModel.swift`), so their
  energy is always MET-estimated even though the session itself is real.
- The carbohydrate-band/MET tables are plain exported constants
  (`CARB_BANDS` via `TRAINING_LOAD_TIERS`, `MET_TABLE`) rather than a runtime
  admin-editable config — deliberately, to keep the engine pure and
  reviewable; wiring them to a product-level settings surface is a natural
  next step the code was structured to make easy (no call site reaches into
  them beyond the engine itself).
- Removal of legacy profile/targets tables and endpoints is a separate schema
  deprecation after native clients and old deployments have moved to AFP.
