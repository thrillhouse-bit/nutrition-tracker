# Garmin capability matrix

What this app actually ingests from Garmin today, versus what Garmin's
Health API can supply, and exactly what each gap needs to close. Written
25 Aug 2026 as part of a wearable-integration-gaps pass across Oura/Apple/
Garmin.

**Context that shapes every row below:** the Garmin Connect Developer
Program (which gates the Health API) is partner-approval-only and was on
hold as of 2026 — this app has never held real Garmin credentials or
received real Garmin traffic. `server/integrations/garmin.js` was written
against public documentation only; every endpoint URL, OAuth scope name,
and payload field name in it is marked `VERIFY`. Nothing in this matrix has
been confirmed against a live account either — treat every "proposed
mapping" below the same way: a documented shape to implement against once
access exists, not a tested one.

Garmin's push model delivers each summary type as its own top-level array
in the webhook body (`{ dailies: [...] }`, `{ sleeps: [...] }`, etc., or
possibly batched together — VERIFY). `POST /api/garmin/webhook`
(`server/index.js`) now recognizes every type in the table below by name
and logs + counts each one it receives but doesn't yet ingest, rather than
silently 200-ing them into nothing.

| Metric | App status | Garmin API / payload | Approval or scope needed | Proposed mapping | Test fixture needed |
|---|---|---|---|---|---|
| **Daily summary** (calories, steps) | **Ingested.** `server/integrations/garmin.js`'s `normalizeDaily`, stored in `garmin_dailies`, served by `/api/garmin/summary` and composed into `signals.expenditure`/`signals.steps`. | Push: `dailies` (`calendarDate`, `activeKilocalories`, `bmrKilocalories`, `steps`). | None beyond the base `HEALTH_READ` scope already requested (VERIFY exact scope string). | Already mapped — no change needed. | Already covered (`test/garmin.test.js`, `test/api-routes.test.js`'s webhook tests). |
| **Sleep** | **Not ingested.** `PREFERENCE.sleep` lists `garmin` as a fallback candidate (`server/providers.js`), but no code path ever populates it from Garmin — a dead preference slot. | Push: `sleeps` (VERIFY exact fields; documented Garmin fields include sleep start/end, sleep levels/stages, overall sleep score). | Same base scope, VERIFY whether sleep needs an additional scope. | New `garmin_sleeps` table (one row per account per day, mirroring `garmin_dailies`'s shape: `account_id`, `day`, duration fields, `raw` jsonb). Webhook handler adds a `sleeps` branch alongside `dailies`. `realSignals`'s garmin branch reads it into `out.sleep` (hours), matching Oura/Apple's shape. | A `sleeps` fixture shaped like Garmin's documented payload; a webhook test proving idempotent per-day upsert (same shape as the existing `dailies` malformed-element test); a `composeSignals` test proving real Garmin sleep resolves independently of Oura/Apple. |
| **Real workout detection** | **Not ingested — demo only.** `demoSignals`'s `garmin.workout` is the only source of a Garmin `workout` signal; `realSignals`'s garmin branch never populates `workout`. A user's own manually-entered workout (`PUT /api/plan/workout`) unconditionally overrides this slot regardless of provider — that's a separate, already-working feature, not Garmin data. | Push: `activities` (individual workout summaries — activity type, start/end time, duration, calories, distance) and/or `activityDetails` (per-second detail, likely unnecessary for this app's purposes). | Same base scope, VERIFY whether activities needs an additional scope. | New `garmin_activities` table, same idempotent-upsert shape as `oura_workouts` (unique on `account_id` + Garmin's own activity id). `realSignals` picks the day's earliest-starting activity for the `workout` slot, same one-workout-per-day convention `oura_workouts` established. Needs a Garmin-activity-type → this app's `kind` vocabulary mapping, analogous to `OURA_ACTIVITY_TO_KIND` in `server/providers.js`. | An `activities` fixture; an idempotent-upsert test (re-push the same activity id, confirm one row not two); a kind-mapping test; a `composeSignals` test. |
| **Training load** | **Not ingested from Garmin.** `src/components/Insights.jsx`'s "Training load" chart is no longer an empty skeleton — a parallel change (same day as this pass) wired it to real data via `store.aggregateWorkoutRows`, summing same-day Apple Health workout `duration_min` into minutes-trained-per-day. That data comes from Apple, not Garmin — Garmin still contributes nothing to this chart, and this row is only about closing that specific gap. | Garmin's Training Status / Training Load is a proprietary Firstbeat-derived metric — VERIFY whether it's exposed via `userMetrics`, a dedicated endpoint, or not exposed to third-party Health API partners at all (this is genuinely uncertain from public docs alone). | Unknown until partner docs are in hand — this is the biggest open question in this matrix. | If exposed: extend the same chart to also read a Garmin-sourced training-load figure, analogous to how expenditure/steps already prefer Garmin over Oura/Apple — needs a precedence rule (does a Garmin number replace or combine with the existing Apple-minutes figure?) decided alongside the API question, not before it. | N/A until the data source is confirmed to exist. |
| **Body composition (weight)** | **Not ingested.** Would feed the same trend-weight feature Apple's `bodyMass` now does (see README's Apple section) — real auto-synced weight instead of manual-only. | Push: `bodyComps` (weight, and depending on the connected scale, body fat %/muscle mass — this app would only use weight, matching its non-clinical scope). | Same base scope, VERIFY whether body composition needs an additional scope, and whether it requires the user to own a Garmin Index smart scale specifically (a hardware gate, same shape as Oura's SpO2/Gen3 requirement). | Store as `provider='garmin', metric='weight'` in `wearable_signals` (reusing the same table Apple's synced weight and manual entries already share), extending `store.listWeightEntries`'s merge to consider three sources instead of two. Precedence question the current two-source merge doesn't have to answer yet: if Garmin AND Apple both sync a weight for the same day with no manual entry, which wins? Needs a product decision before implementing (this doc doesn't invent one). | A `bodyComps` fixture; a three-way merge precedence test once the above decision is made. |
| **HRV** | **Not ingested.** `PREFERENCE.hrv` doesn't even list `garmin` as a candidate (`['apple', 'oura']` only) — this would be new, not a dead slot. | Likely part of `userMetrics` or a dedicated HRV summary — VERIFY. | Same base scope, VERIFY. | Context-only, same rule as Oura/Apple's HRV (`plan.js`'s rules engine never reads it) — add `garmin` to `PREFERENCE.hrv` once real data exists. | A fixture + a `composeSignals` test proving it never influences `computeAdjustedTargets`. |
| **SpO2** | **Not ingested.** | Push: `pulseOx` — VERIFY. | Same hardware/subscription-shaped uncertainty as Oura's SpO2 (VERIFY whether Garmin gates this behind a specific watch model). | Not proposed — same reasoning as Oura's SpO2/stress section in the README: don't half-implement against an unverified hardware gate. | N/A |
| **Stress** | **Not ingested.** | Push: `stressDetails` — VERIFY. | VERIFY scope. | Not proposed for the same reason as SpO2 above — this app makes no medical/clinical claims, and an all-day stress score is closer to that line than fueling context; worth an explicit product decision before building, not just an API-access one. | N/A |

## What changed in this pass

- `POST /api/garmin/webhook` (`server/index.js`) now recognizes every type
  in this table's "Garmin API / payload" column by name and logs + counts
  it in the response (`unsupported: {sleeps: 2, ...}`) instead of silently
  discarding it with a bare `{received: N}` that implied everything in the
  push was handled. A genuinely unrecognized key (not in this list) is
  still logged, distinctly, so a future Garmin API change is visible too.
- `server/providers.js`'s `PROVIDERS.garmin.categories` no longer claims
  `workouts`/`training load` — neither is true for a real connected
  account today. That field is human-readable metadata only (nothing in
  the codebase reads it at runtime), but it still needs to stay honest.
