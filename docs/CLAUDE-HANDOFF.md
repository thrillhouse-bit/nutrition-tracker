# Body Current release handoff — through the Sep 11 Codex reset

## Candidate and operating rules

- Worktree: `/Users/jacksonkemper/Documents/Codex/2026-08-25/this/work/body-current-release`, branch `codex/body-current-weekend-release`. Release `de5c8e7` is deployed. Its release evidence recorded 138 test files / 1,866 tests passing, production backup restoration verified, migration completed, and private invites ready. Recheck live `/api/version` and the current diff before subsequent releases. Preserve intervening Oathbearer work and unknown untracked duplicate files ending in ` 2`; never reset this worktree.
- The canonical production origin is `bodycurrent.app`; preserve `omnifuelapp.tech` as a migration alias plus legacy `OMNIFUEL_*`, service IDs, callback compatibility, and DB names unless a verified coordinated change says otherwise. Product-facing identity is **Body Current**.
- Run `git status --short` before edits. Use focused tests first, then `npm test`, `npm run build`, and `git diff --check`. Do not report hardware, provider, legal, migration, or deploy readiness without evidence.
- The user authorizes continued fixes and deployment. Hermes background job `edd76da674ba` runs every two hours using direct local Ollama `gemma4` only. Preserve that no-cost execution restriction; do not substitute paid providers or Codex agents for its autonomous background work. Check its actual status before claiming it is running.
- September 5 follow-up: Body Current branding sweep and guided Apple/Garmin setup completed; existing Oura path preserved. Frozen verification: 140 files / 1,881 tests passed, build passed, dependency audit zero vulnerabilities, independent review passed. See `docs/brand-compatibility.md` and `docs/device-release-readiness.md` for capabilities and retained identifiers. Installed users should refresh/reopen after deployment; confirm `/api/version` against the latest release commit.
- Apple exporter automations now merge partial metric/day uploads, deduplicate workout retries, retain actual offsets/local days, and ignore empty payloads without changing freshness. Integration patches are atomic so concurrent ingestion cannot restore a rotated token. Focused tests (224) and real PostgreSQL concurrency checks passed using synthetic disposable data. Hardware export still needs the tester's real-device confirmation; direct Garmin partner access and Apple native signing remain unavailable.

## Identity and UI

- `public/body-current-master.png` is the approved icon master; PWA/iOS/Connect IQ sizes derive from it through `scripts/gen-icons.mjs`.
- `src/lib/accentTheme.js` owns Cobalt (default), Emerald, and Ruby. It changes only brand/progress variables; semantic alert/good/warn and mist/sand stay fixed. `SegmentBar`, `Dial`, and Insights SVG consume runtime variables.
- `docs/DESIGN.md` owns visual rationale; `docs/UX-CONTRACT.md` owns interaction behavior. Preserve the sharp, high-contrast, accessible Body Current system.

## Daily Fuel Plan and Oura

- `server/afp/science.js` is canonical. `scienceVersion` is separate from `engineVersion`; deterministic plans expose revision, calculatedAt, and input snapshot hash.
- AFP uses supplied NASEM 2023 adult 19+ EER equations (DOI `10.17226/26818`) with explicit equation stratum/activity category; never infer either from identity or wearables. Mifflin is legacy only.
- Automatic plans fail closed for missing attestation, under-19, pregnancy/lactation, renal/CKD, eating-disorder/restrictive concern, clinician diet, major illness, or glucose-lowering medication. Use manual/clinician-configured mode without diagnosing.
- Wearables provide modality/duration/timing/intensity, never a 1:1 calorie override. Keep evidence bounds/citations in `docs/adaptive-fuel-plan.md` (ACSM/AND/DC `10.1249/MSS.0000000000000852`, Burke, Morton, Helms, IOC REDs, wearable validation); no Hall-model or calibration claims.
- Oura freshness code is intended to use the requesting person's local date/bounds and successful fetch/sync time; re-run the UTC provider/Insights regression before claiming the behavior is released. Historical measurements retain their provenance.

## Security, lifecycle, providers

- Signup needs `LEGAL_REVIEWED=true`, meaningful explicit `LEGAL_VERSION`, and exactly-ten invites where enabled. Invites are **fragment-only** (`#invite=`), sanitized immediately; never accept query invites or log/store plaintext.
- Operator legal metadata is deliberately unnecessary. Export/delete are account-scoped; credentials/provider tokens stay excluded. New private data needs Pg + JSON export/delete/isolation tests.
- Never adopt ownerless rows at signup. `scripts/ownerless-legacy-cleanup.mjs` is an operator-only, backup-gated preview/execute/receipt tool; verify its collection/transaction regression and a production backup before use. Read `docs/ownerless-legacy-cleanup-runbook.md` first.
- Garmin activity ingestion remains fail-closed until a genuine partner payload/auth/signature contract and credentials exist; do not invent them. Apple release still needs verified team, bundle IDs, App Group/HealthKit/signing, and physical-device evidence; display names alone do not prove readiness.

## Hydration

- `water_entries` is an account-owned manual log (`amount_ml`, `logged_at`). Both stores implement CRUD; session-gated `/api/water` uses caller-local bounds; `/api/today` returns entries + `total_ml`.
- Today supports mL/fl oz, timestamp, quick add/edit/delete, and inline errors. Hydration is context only: no automatic fluid/sodium/AFP target, no sweat replacement guidance without measured loss data.
- Export field is `hydration_logs`; account deletion cascades rows. Coverage lives in API-route, JSON-store, and Today UI tests.

## Release checklist and residuals

1. The initial release backup/migration is complete. Before any further schema migration, take and verify a fresh production backup; apply `schema.sql` through the reviewed path, then validate account counts and `water_entries`.
2. Check legal/session/invite configuration, current `npm audit --omit=dev`, provider contract readiness, and native signing. The three moderate advisories were resolved with a targeted `qs@6.16.0` override, keeping Express 4 and body-parser compatible. Installed dependency audit returned zero vulnerabilities. Preserve this override until upstream dependency ranges include the patched release; do not run blind audit-fix downgrades.
3. Build from an identified commit only. Deploy only with authorization. Smoke-test auth/legal/invite, account isolation, AFP manual/fail-closed behavior, hydration CRUD/export/delete, and provider status; keep a rollback artifact.

The Sep 11 reset does not relax these constraints. Current repository evidence overrides this handoff.

See `docs/weekend-invite-release.md` for the concrete VPS backup, migration, release and rollback sequence. Native signing/Garmin partner readiness are separately gated capabilities; they do not establish or prevent an otherwise verified web/PWA private invite release.
