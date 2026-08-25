# Production-verification audit — 25 Aug 2026

Read-only release-verification pass: turn recent production-status claims into
evidence, fix what's provably broken, report what can't be verified from this
environment. No deploy, credential rotation, or data deletion was performed.

**Environment constraints, stated up front**: this session has HTTPS access to
`omnifuelapp.tech`, a local clone of the repo with push access, and a local
dev server. It has **no VPS shell, no production database access, and no
channel to command the VPS-side Claude Code session that actually deploys**.
Every finding below is scoped to what's provable from that position; where a
check needed more, it's named as a blocker, not guessed at.

## Release gate

- **READY TO ROTATE NEON CREDENTIALS: NO.** Not because rotation is risky —
  the plan below is safe — but because a critical fix (below) isn't deployed
  yet, and rotation should happen against the fixed, deployed build so the
  post-rotation smoke test exercises real code, not a build about to be
  replaced. Rotate after the next deploy.
- **READY TO MERGE TREND-WEIGHT BRANCH: YES**, with a caveat — it isn't a
  separate branch to merge. It was pushed directly onto
  `claude/nutrition-tracking-pwa-g8kyfi` mid-audit and is already part of this
  branch's history (merge commit `de9c17b`). No schema change (verified: zero
  `schema.sql` diff), full suite green (225/225) after merge, build clean.
  Nothing left to "merge" — it ships with the next deploy of this branch.
- **READY FOR NEXT PREMIUM FEATURE: NO.** Prerequisite: deploy this branch.
  Production is currently running a build where the single most common user
  action — logging a food you didn't just edit (a barcode scan, a search
  result, a recent re-log) — fails outright. See Finding 1.

## Findings, most severe first

### Finding 1 — CRITICAL, FIXED: primary log flow broken in production

`food.id` (and `entry.food_id`, `entry.servings_consumed`) round-trip over
JSON as **strings**, not numbers — a Postgres bigint/numeric serialization
fact, confirmed live:

```
$ curl -s -X POST .../api/foods -d '{"name":"x","source":"manual","calories":100}'
{"food":{"id":"4", ..., "calories":"100", ...}}          # "4" and "100" — strings
```

`server/validation.js`'s `EntryCreateSchema.food_id` is deliberately
`z.number()` — strict by design (its own comment: reject the wrong type
before it reaches the store). `FoodConfirm.jsx`'s `submit()` took the
food-already-exists shortcut — the path taken every time a user logs a food
**without editing it**, i.e. barcode scan → confirm, search → confirm, or
re-logging a recent food — and sent `food.id` straight through, unconverted.

Reproduced against production, unambiguously:

```
POST /entries {"food_id":"4", ...}        -> 400 "food_id: Expected number, received string"
POST /entries {"food_id":4, ...}          -> 201
```

The identical bug existed in the "undo delete" restore path (`App.jsx`) for
both `food_id` and `servings_consumed`.

**Fixed** (commit `86a3ee7`): both call sites now wrap in `Number(...)`.
Regression test added (`test/foodconfirm.test.jsx`) — mutation-tested: fails
red against the unfixed line, passes on the fix. The undo-restore path shares
the identical, already-proven fix but has no independent regression test —
`App.jsx` has no existing component-test harness; building one from scratch
was judged out of scope for a one-line fix. Full suite: 225/225. Build:
clean.

**This is not yet deployed.** It is committed and pushed to
`claude/nutrition-tracking-pwa-g8kyfi` (HEAD `9bf8c0d`). Deploying it is the
single highest-priority action item from this audit.

### Finding 2 — FIXED: Oura backfill could silently erase good data on a flaky re-run

Audited per the explicit ask: idempotency, destructive-overwrite, per-day
logging.

- **No duplicate records**: pass, by design (delete-then-insert per day).
- **No destructive overwrite of correct records**: **failed**, reproduced.
- **Clear per-day error logging**: **failed** — none existed.

`saveOuraHistory` deleted **every requested day's** existing row before
re-inserting, regardless of whether the incoming row for that day had a
score. A re-run backfill that got a transient `score: null` for one day
(Oura rate-limited, a partial-outage response — the readiness endpoint still
returns an entry for every day in range, just with no score) silently erased
that day's previously-correct value and never put anything back.

Reproduced against the real, unmodified store before fixing:

```
run 1: 2026-08-01=82, 2026-08-02=75, 2026-08-03=90
run 2 (08-02 transient null): 2026-08-01=82, 2026-08-03=90   # 08-02 GONE
```

**Fixed** (commit `8638cbc`): only delete/replace days whose incoming row has
a real score; a day with no score this run is left untouched. Both PgStore
and JsonStore had the identical bug (verified by reading both); both fixed
identically. Added per-day observability: `backfillOuraHistory` now logs
which specific days came back with no score, by name, not just a count.
Regression test added (JsonStore), mutation-verified the same way as Finding
1. **PgStore has no integration-test harness in this environment (no
DATABASE_URL) — fixed by code symmetry with JsonStore, not independently
test-run against real Postgres. Residual gap.**

**The 27/30-days-corrected figure from the VPS-side session's own report is
plausible but not independently confirmed.** I cannot produce the requested
30-day table (date / source present / readiness / sleep / steps / backfill
result / reason) for the actual affected production user — that needs either
production database access or that user's own authenticated session, neither
of which this environment has. Whether the original 3-day gap was genuinely
benign (Oura had no data) or partly an artifact of this exact bug (an
in-progress re-run hiccup during verification) is now unanswerable in
retrospect — the fix prevents it going forward, but doesn't tell us which
case the historical gap was. **Named blocker, not guessed at.**

### Finding 3 — verified clean: multi-user isolation

Live end-to-end, throwaway accounts, local server running the fixed/merged
code (production isolation logic is unchanged by anything in this audit, so
this is representative of production behavior):

- Cross-user entry PATCH/DELETE by ID: blocked with `404` (no ownership
  leak — same response as "doesn't exist"), verified against a real entry
  (not a malformed-ID false negative — see note below).
- The blocked attempt left the real owner's entry byte-for-byte untouched.
- A second user's targets/entries reads return empty/`hasTargets:false` —
  fully independent per-user state.
- `deleteEntry`/`updateEntry`/`deleteOuraAccount`/`deleteGarminAccount` all
  scope by `user_id` in the actual SQL/filter, in both PgStore and JsonStore
  — verified by reading every implementation, not just the route layer.
- `neverConnected()` per-user fallback reconfirmed live: a fresh user with
  no Oura connection gets `demo:true` readiness, independent of any other
  account's real connection (this was this session's earlier fix, re-checked
  here from a fresh angle).

**Process note**: my first pass at this check produced two false FAILs —
both traced to my own test script sending `food_id` as an unconverted
string (the same defect as Finding 1, hit incidentally before I'd found and
named it), which 400'd the entry creation and made two later assertions
compare against a `entryId` of `undefined`. Re-run after isolating and fixing
Finding 1 passed cleanly. Recorded here because the QA/QC report's own
house rule applies: don't report a false negative as a finding — the actual
finding was Finding 1, discovered a section early.

### Finding 4 — verified: Delete Synced History

- Zero-synced-data account: `{"removed":0}`, no error.
- Retry (called twice in a row): both calls `200`, idempotent.
- Food log entries confirmed to survive a Delete Synced History call — it
  only touches `wearable_signals` (oura/apple) and `garmin_dailies`, never
  `log_entries` — verified both by reading `clearSyncedHistory` in both
  stores and by a live before/after check.
- Not tested: deleting *real* synced Oura/Garmin/Apple data specifically,
  since producing real synced wearable rows needs real provider credentials
  this environment doesn't have. The code path is symmetric with the
  Oura-history delete-then-insert logic already exercised in Finding 2, but
  that's inference, not a direct test of this exact method.

### Finding 5 — verified: incomplete entries never silently count as zero

API-level: a food logged with no calories value returns `calories: null` in
the raw entry response — never a fabricated `0`. The sum-skipping and
"Needs details" UI behavior is this session's own earlier fix
(`entryNutrient`/`sumEntries`/`entryIncomplete` in `src/lib/nutrition.js`,
commit `1972547`), covered by 11 existing unit tests, all passing in the full
suite. Note on rigor: a live total-unchanged check alone can't distinguish
"correctly skipped" from "coerced to 0 and summed" (both leave the total
unchanged) — the real proof is the `null` field value plus the existing unit
tests, not the live total by itself.

### Finding 6 — verified: onboarding gate condition

Fresh signup → `GET /api/targets` → `hasTargets:false` (the exact condition
`App.jsx` gates `<Onboarding>` on). After completing onboarding (`PUT
/targets`) → `hasTargets:true`. `Today`'s composite response reflects the
just-set value (2300 kcal), not the old 2000-kcal fallback. Cross-tab
agreement on targets is structural, not just observed: `getLatestTargets`
has exactly one implementation per store and is the sole source for every
consuming endpoint (4 call sites, all reading the same method) — verified by
reading all four, not just spot-checking one tab.

### Finding 7 — Trend weight: merge-ready, no migration, no conflicts

Landed directly on `claude/nutrition-tracking-pwa-g8kyfi` mid-audit (commit
`917237e`) rather than a separate branch — by the time I could locate it,
there was nothing left to coordinate a merge *for*.

- **Migrations: none.** Reuses `wearable_signals` (`provider='manual',
  metric='weight'`), same shape as manual workout input. Verified directly:
  `git diff` on `schema.sql` across the whole audit window is empty.
- **Implementation**: `server/weightTrend.js` is a pure gap-adjusted
  exponential-moving-average function (no I/O) — reasonable design for
  irregular (not-daily) logging. `PUT /api/weight` explicitly does
  `Number(kg)` server-side before validating finite/positive — it does
  **not** carry Finding 1's string/number defect; checked specifically given
  what I'd just found elsewhere in the codebase.
- **Conflicts with my own changes**: none. Different files (`db.js`/
  `index.js` touched by both, but different functions — auto-merged clean,
  no conflict markers). Full suite green after merge (225/225,
  `weightTrend.test.js`: 7/7), build clean.
- **Not independently verified**: the Insights-tab weight UI itself (chart
  rendering, unit-preference display) — that's a live-click-through check,
  which would duplicate the originating session's own verification and was
  explicitly out of scope ("do not duplicate its work").

### Finding 8 — no schema/migration version tracking exists

Not a bug, a structural gap worth naming: `schema.sql` is idempotent
(`create table if not exists`) applied via a manual `npm run db:init`; there
is no `schema_version` table and no migrations directory. A dangling comment
in `server/db.js` references a `migrate.sql` that doesn't exist in the repo
(the actual legacy-data migration is application code,
`migrateLegacyDataToUser`, not a SQL file). Recommend: at minimum, fix the
comment; ideally, a real schema-version table before this matters more than
it does today.

### Finding 9 — no version/commit endpoint exists

There's no `/api/version` or equivalent — the only way to verify what's
actually deployed is content fingerprinting (below), which works but is
more effort than it should be and only covers the frontend directly.
Recommend adding a minimal endpoint that reports the build's git SHA (bake it
in at `docker build` time via `--build-arg`).

## Production provenance

- **Frontend, confirmed byte-for-byte**: rebuilt locally at the
  then-current HEAD (`d10c9a1`) and compared SHA-256 against the live
  bundle — **identical** (`8de767ab...`) for both the JS bundle and the CSS
  bundle. Vite's content-hashed filenames matching (`index-C1YNUd9B.js`
  locally == `index-C1YNUd9B.js` live) was the first signal; full byte
  comparison is the actual proof.
- **Backend**: not independently provable without a version endpoint (see
  Finding 9) or shell access. Strong circumstantial evidence it matches the
  same commit: the Dockerfile builds frontend and backend from one `COPY .
  .` in a single build stage, so a deploy that produces the exact frontend
  bytes above did so from the exact source tree that also contains that
  commit's backend code. Not independent proof of the backend specifically.
- **Node version**: 22.x (`node:22-alpine`, both Dockerfile stages) — a
  floating tag, not pinned to an exact patch version. This is unrelated to
  the Node 18→22 upgrade done earlier in this session on the VPS *host* for
  the Claude Code CLI — the containerized app has always built on Node 22,
  independent of the host's own Node install.
- **Build timestamp**: best available evidence is the live asset's
  `last-modified: Tue, 25 Aug 2026 17:03:10 GMT` header (Express's static
  middleware reflects the file's mtime, which tracks close to build time,
  not container-inspect ground truth).
- **DB migration/schema version**: none exists (Finding 8).
- **Rollback SHA**: `d10c9a1` — confirmed live and healthy at the start of
  this audit via the byte-for-byte match above. This is the correct rollback
  target *until* the next deploy, at which point (once Finding 1's fix
  ships) it should become the new baseline.
- **`origin/main` drift check**: at audit start, `main` had moved one commit
  past what this branch had merged (`cf5fda7`) — checked, it's a
  documentation-only commit to `docs/qa-qc-report.md`, no app code. No
  action needed.

## Security / logs

Code-level audit only — **no VPS log access from this environment**, so this
covers what code paths *could* write to logs, not a review of actual
captured log output.

- No `console.*` call anywhere in `server/` references an OAuth token,
  `DATABASE_URL`, or a password hash directly — checked explicitly, none
  found.
- Client-facing 500s are already sanitized (`asyncH`'s catch-all, this
  session's earlier fix, PR #45 per the QA/QC report) — a generic `"Server
  error"` goes to the client; the real error only goes to `console.error`
  server-side.
- **Residual, narrower risk**: several `console.error(err)` calls log the
  *raw* error object server-side (not client-facing) on unexpected
  failures — a DB constraint-violation error, for instance, can embed the
  offending value (e.g., a duplicate email) in its message. This is a real
  but low-severity gap: it's server-log exposure of user-submitted values,
  not credential exposure, and I can't confirm from here whether it has
  ever actually fired in a way that logged something sensitive — flagging
  the code pattern, not a confirmed incident.
- `SESSION_SECRET`: unset in **this session's own local dev server** — I
  cannot confirm whether it's set in production without shell access. This
  matters for the rotation plan below: if unset in production, *any*
  restart (for any reason, including this rotation) logs out every signed-in
  user, independent of the DB credential change itself. **Worth checking
  before rotating, not after.**

## Neon credential rotation plan — NOT EXECUTED, plan only

Grounded in the repo's actual deploy mechanics (`docker-compose.app-only.yml`
reads `DATABASE_URL` from `.env` on the VPS via `env_file: .env`; `./set-env.sh`
is the repo's own sanctioned way to write a secret into that file without it
touching shell history, argv, or git).

1. **Generate the replacement credential** — Neon console (operator action,
   outside this session's reach): create a new role password (or a new role
   entirely, if Neon's plan supports keeping the old one live in parallel for
   a true overlap window — check before assuming a straight reset, which
   invalidates the old credential immediately).
2. **Confirm `SESSION_SECRET` is set on the VPS first** (see above) — if not,
   set it now, independent of this rotation, so the restart this rotation
   requires doesn't also mass-log-out every user as an unplanned side effect.
3. **Update VPS secret management**: `ssh` to the VPS, `cd` to the app
   directory, run `./set-env.sh DATABASE_URL`, paste the new connection
   string at the hidden prompt. Keep the old value noted somewhere safe
   outside `.env` until step 7.
4. **Restart**: `docker compose -f docker-compose.app-only.yml up -d` (no
   `--build` needed — only the env changed, not the source). `restart:
   unless-stopped` with no blue-green mechanism in this compose file means
   this is **low-downtime, not zero-downtime** — there's a brief window
   between the old container stopping and the new one becoming ready.
5. **Health-check**: `curl http://127.0.0.1:3001/api/health` — but note
   `backend: "postgres"` only reflects that `DATABASE_URL` is *set*, not that
   it *authenticates*. The Neon serverless driver is lazy (HTTP-based, no
   persistent pool) — a wrong password won't fail at boot, only on the first
   real query. **This step alone is insufficient.**
6. **Verify DB connectivity for real**: exercise an actual DB round-trip —
   sign up one throwaway account and set targets, confirm both succeed
   (`201`/`200`, not `500`). This is the step that actually proves the new
   credential works.
7. **Revoke the old credential** — Neon console, only after step 6 passes.
8. **Rollback procedure**: if step 5/6 fails, `./set-env.sh DATABASE_URL`
   back to the noted old value, `docker compose up -d` again. The old
   credential must still be live (not yet revoked — this is why step 7 waits
   until last).
9. **Post-rotation evidence to capture**: before/after `/api/health` output
   with timestamps, the throwaway signup+targets round-trip's request/response,
   and confirmation the old credential was revoked (Neon console screenshot
   or API response, operator-side).

## Verification commands run (abbreviated — full output above)

```
npm run build                                    # local rebuild for provenance check
sha256sum dist/assets/index-*.js  (vs curl'd live bundle)
npx vitest run                                    # 225/225 after all fixes+merges
node <repro scripts>                              # backfill overwrite, food_id string bug
curl https://omnifuelapp.tech/api/...              # live provenance + isolation probes (pre-fix)
node <local multi-user/first-use scripts against 127.0.0.1:3001>  # post-fix verification
git diff cf5fda7 HEAD -- schema.sql                # empty — no schema drift
git log d10c9a1..HEAD --oneline                    # everything landed this audit
```

## Commits landed this audit (all pushed to `claude/nutrition-tracking-pwa-g8kyfi`, none deployed)

- `8638cbc` — Fix Oura backfill destructive-overwrite on transient re-run hiccup
- `86a3ee7` — Fix broken primary log flow: food_id sent as string, not number
- `bf5d76b`, `c718f39`, `de9c17b`, `9bf8c0d` — merges reconciling this work with
  the parallel VPS-side session's own commits (per-endpoint-failure test,
  trend weight, backfill-fix test sync) — no conflicts, full suite green
  throughout
- Final HEAD: `9bf8c0d`

## Unresolved risks (summary)

1. **Deploy is the blocker** — Finding 1 (and Finding 2) are fixed in git,
   not in production.
2. Finding 2's original 27/30 figure can't be independently confirmed
   without production DB/API access to the actual affected account.
3. PgStore's backfill fix has no integration-test proof in this environment
   (JsonStore-only, by code symmetry for PgStore).
4. `SESSION_SECRET`'s production state is unconfirmed — check before any
   restart-requiring operation, including the Neon rotation.
5. Raw-error server-side logging (Security/logs, above) is a narrow,
   unconfirmed-in-practice residual risk, not a fixed item.
6. The undo-restore path's fix (Finding 1) has no independent regression
   test, only the same-pattern fix.
