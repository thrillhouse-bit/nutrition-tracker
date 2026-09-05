# Daily Fuel Plan v1

Daily Fuel Plan is Body Current's canonical nutrition-planning system. It is an evidence-based **starting estimate**, not a diagnosis, prescription, or real-time metabolic-adaptation system. It is not calibrated to an individual's observed response.

## Contract and reproducibility

`server/afp/science.js` is the canonical, reviewable science registry. Every rule has a stable citation ID, DOI or official URL, population, confidence, limits, review date, and the exact constants used by the engine. The response returns both `scienceVersion` (the evidence registry) and `engineVersion` (the implementation), plus `revision`, `calculatedAt`, and an `inputSnapshotHash`. For the same normalized inputs and science version the pure engine is deterministic. A revision changes only when the server computes a materially different current-day input/output snapshot.

Today is intentionally live: it reads the latest successfully synced activity sessions as planning context. It is retained as a snapshot for historical dates unless a person deliberately requests recomputation. A browser refreshes a visible current-day plan at a bounded interval, so another signed-in device's newer revision appears without a page reload. No browser determines the calculation.

## Maintenance estimate

For adults aged 19 or older, the engine uses the NASEM 2023 Estimated Energy Requirement (EER) equations directly. Height is cm, weight is kg, and age is years. These are population predictions of weight-stable total energy expenditure; they are not an RMR multiplier and training calories are never added 1:1 to them.

| Equation stratum | Inactive | Low active | Active | Very active |
| --- | --- | --- | --- | --- |
| Men | `753.07 − 10.83a + 6.50h + 14.10w` | `581.47 − 10.83a + 8.30h + 14.94w` | `1004.82 − 10.83a + 6.52h + 15.91w` | `−517.88 − 10.83a + 15.61h + 19.11w` |
| Women | `584.90 − 7.01a + 5.72h + 11.71w` | `575.77 − 7.01a + 6.60h + 12.14w` | `710.25 − 7.01a + 6.54h + 12.34w` | `511.83 − 7.01a + 9.07h + 12.56w` |

The user explicitly selects both an activity category and an equation stratum. Body Current does not infer either from a name, gender identity, steps, Oura, Apple Health, Garmin, workout minutes, or wearable calories. The NASEM report does not validate such a mapping. The source data use two sex strata labelled men and women; this is an evidence limitation, not a claim about gender identity. If a person cannot select a supported stratum, automatic targets are not produced and manual/clinician-configured targets remain available.

The UI shows the selected stratum/category and source uncertainty. NASEM reports approximately RMSE 339 kcal/day and MAE 266 kcal/day for men, and RMSE 246 kcal/day and MAE 191 kcal/day for women (with reported MAPE 9.4% and 8.7%, respectively). Those population errors are why results are rounded and never presented as a measured metabolic fact.

The pre-v1 Mifflin/RMR-times-activity calculator is retained only for old data compatibility. It is not an active Daily Fuel Plan target generator.

## Goal strategies and guardrails

The supported strategy is explicit: `maintenance`, `fat_loss`, `muscle_gain`, or `endurance_performance`. Historic aliases are migrated compatibly; they do not preserve the old static 7,700 kcal/kg forecast behavior.

- Maintenance has no automatic deficit or surplus.
- Fat loss is a conservative, self-selected adult policy. It never increases a deficit on hard or long training days, and it is disabled if the eligibility guardrail applies. It makes no predicted-weight-loss promise.
- Muscle gain begins at maintenance through a modest, evidence-bounded surplus of up to 5%; it is not a claim of a guaranteed rate of tissue gain.
- Endurance performance never receives an automatic deficit. A high-load day cannot be combined with an aggressive-loss target.

The server, rather than the browser, enforces automatic-plan eligibility. Pregnancy/lactation, age under 19, kidney/renal disease, an eating-disorder or restrictive-eating concern, clinician-prescribed diet, major illness, and glucose-lowering medication route the account to manual/clinician-configured mode. These are self-reported flags, not diagnoses. The service stores one eligibility attestation and only the reason flags needed to honor it; it does not store a medical narrative.

## Training and carbohydrates

Wearables provide modality, duration, timing, and intensity as planning inputs. Their calorie fields remain low-confidence provenance and are never a direct calorie target override. Missing or stale wearable data is labelled unknown, not rest or zero. The reconciler deduplicates overlapping multi-provider sessions; Garmin is included when activity data is available.

When selected protein and carbohydrate targets would otherwise leave zero fat,
AFP raises the displayed energy target to retain a 0.5 g/kg fat floor. This is
transparent product safety arithmetic for a physically reconcilable plan, not
an evidence-derived clinical minimum or a medical nutrition prescription.

Daily carbohydrate bands are part of the single daily carbohydrate target, not extra carbohydrate added on top of it:

| Day/session context | Daily CHO band |
| --- | --- |
| Light | 3–5 g/kg/day |
| Moderate, about 1 hour | 5–7 g/kg/day |
| High, 1–3 hours | 6–10 g/kg/day |
| Very high, over 4–5 hours | 8–12 g/kg/day |

Pre-session guidance is 1–4 g/kg 1–4 hours before. An easy session shorter than 45 minutes has no during-session requirement. For 1–2.5 hours the guide may be 30–60 g/hour. Up to 90 g/hour is only disclosed for a hard, tolerated session over roughly 2.5–3 hours, with a multi-transportable-carbohydrate and gut-training disclosure. Optional carbohydrate loading is 10–12 g/kg/day for 36–48 hours only when the person opts in for an event longer than 90 minutes.

Protein is shown as an evidence-bound range, not a false exact personal need: general athletes 1.2–2.0 g/kg/day, resistance default 1.6 g/kg/day, weight-loss 1.2–1.6 g/kg/day, and endurance 1.4–1.8 g/kg/day. The plan makes the selected range and basis visible.

## API and user experience

`/api/afp/profile` owns the profile and minimal eligibility contract; `/api/afp/plan` returns the canonical plan. The UI distinguishes measured, estimated, and manual-override values; shows input freshness and unknown data; and links each applied rule to the registry source. A manual day override is kept distinct from the computed estimate.

## Bibliography

1. `NASEM-ENERGY-2023` — National Academies of Sciences, Engineering, and Medicine. *Dietary Reference Intakes for Energy* (2023). DOI: [10.17226/26818](https://doi.org/10.17226/26818).
2. `ACSM-NUTRITION-2025` — ACSM/Academy of Nutrition and Dietetics/Dietitians of Canada position stand. DOI: [10.1249/MSS.0000000000000852](https://doi.org/10.1249/MSS.0000000000000852).
3. `BURKE-CARB-2011` — DOI: [10.1080/02640414.2011.585473](https://doi.org/10.1080/02640414.2011.585473).
4. `BURKE-CARB-2019` — DOI: [10.1123/ijsnem.2019-0004](https://doi.org/10.1123/ijsnem.2019-0004).
5. `CRAVEN-GLYCOGEN-2020` — *The Effect of Consuming Carbohydrate With and Without Protein on the Rate of Muscle Glycogen Re-synthesis During Short-Term Post-exercise Recovery* (systematic review/meta-analysis; recovery evidence, not a protein-target rule). DOI: [10.1186/s40798-020-00297-0](https://doi.org/10.1186/s40798-020-00297-0).
6. `MORTON-PROTEIN-2018` — DOI: [10.1136/bjsports-2017-097608](https://doi.org/10.1136/bjsports-2017-097608).
7. `LEIDY-PROTEIN-2015` — DOI: [10.3945/ajcn.114.084038](https://doi.org/10.3945/ajcn.114.084038).
8. `HELMS-ENERGY-SURPLUS-2023` — *Effect of Small and Large Energy Surpluses on Strength, Muscle, and Skinfold Thickness in Resistance-Trained Individuals: A Parallel Groups Design* (parallel-groups trial; surplus evidence, not weight-loss evidence). DOI: [10.1186/s40798-023-00651-y](https://doi.org/10.1186/s40798-023-00651-y).
9. `IOC-REDS-2023` — DOI: [10.1136/bjsports-2023-106994](https://doi.org/10.1136/bjsports-2023-106994).
10. `WEARABLE-VALIDATION-2024` — DOI: [10.1007/s40279-024-02077-2](https://doi.org/10.1007/s40279-024-02077-2).

Mifflin–St Jeor (DOI [10.1093/ajcn/51.2.241](https://doi.org/10.1093/ajcn/51.2.241)) is noted solely for legacy compatibility. Body Current does not implement the Hall body-weight model or claim metabolic calibration until reference validation and licensing questions are resolved.
