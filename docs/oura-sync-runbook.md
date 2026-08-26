# Oura sync runbook — diagnosing a stale readiness/sleep reading

Written 26 Aug 2026 alongside the Oura sync-observability work
(`claude/oura-sync-observability`) that this runbook exists to use. It closes
a real, previously-unclosable gap: the `claude/fix-demo-data-precedence`
branch fixed a genuine demo-vs-real precedence bug, and — separately — ruled
that bug OUT as the cause of a real user report that Oura readiness/sleep
looked stale on production for one account (`/api/health` on production
already showed `oura: "oauth"`, i.e. genuinely connected, not stuck showing
demo data). That branch's own notes say the symptom "could not be fully
diagnosed without live production DB access." This is that diagnosis,
written for whoever has that access next — a human operator, or a future
Claude session handed the production `DATABASE_URL` and log access.

**Everything below reads fields this same change added.** Before this, an
Oura token-refresh failure reached only `console.error` — gone the moment
Render's log buffer rotated, and nothing an API or a SQL query could ever
read back. If the account you're investigating connected and had its
problem BEFORE this shipped, these fields will be genuinely empty (not
broken — there is simply no history to show) until the next real sync
attempt populates them; see "If everything here is empty" at the bottom.

## What you're reading

Four fields, all on the Oura row of `integrations` (one row per
`(user_id, provider)`, `schema.sql`):

| Field | Column | Meaning |
|---|---|---|
| Last successful sync | `last_synced_at` | Timestamp of the most recent backfill that actually stored something. Pre-existing column; was never written for Oura before this change (confirmed by reading the code — grep `last_synced_at` in `server/index.js` before this branch and it's Apple-only). |
| Last attempted sync | `settings->>'last_attempted_sync'` | Timestamp of the most recent sync ATTEMPT, success or failure. Updates from three places: the OAuth connect callback's first backfill, a manual `POST /api/oura/backfill`, and the scheduled resync loop (`resyncAllOuraAccounts`, every 24h) — plus, on FAILURE only, the live `/api/today`-style read path (a cheap read that succeeds doesn't move this; see `server/providers.js`'s `realSignals`). |
| Records fetched/accepted/deduplicated | `settings->'last_sync_counts'` | `{fetched, accepted, deduplicated, at}` from the most recent BACKFILL specifically (not the live path, which never stores anything). `fetched` = every day/workout Oura's API returned in the window; `accepted` = `daysSaved + workoutsSaved` (what actually got written); `deduplicated` = `fetched - accepted` — a readiness day with no score yet, or a workout missing the id a store upsert needs. Not a literal "already-seen" check (Oura's API doesn't mark duplicates, and a re-run workout upsert counts as accepted either way) — see the comment on `trackedOuraBackfill` in `server/index.js`. |
| Token-refresh/backfill failure reason | `error` | A short, stable code from `classifyOuraRefreshError` (`server/providers.js`): `refresh_token_expired`, `oura_api_unreachable`, `oura_api_error_<status>`, or the generic `oura_refresh_failed`. Cleared to `null` by the next SUCCESSFUL attempt — if it's non-null, it's live, not historical. |

All four are also served, per user, by `GET /api/connections` (the same JSON
the Connections tab renders) as `last_synced_at`, `last_attempted_sync`,
`last_sync_counts`, `sync_error` on the `oura` entry of `providers[]` — but
that route needs a session cookie for the AFFECTED user specifically. As an
operator you almost never have that, so every step below queries Postgres
directly instead; treat the API as a secondary check if the user themselves
can look at their own Connections tab and report what it says.

## Step 0 — find the user, and check which Render plan is live

```sql
select id, email, created_at from users where email = '<their-email>';
```

Then, in the Render dashboard for this service, check **Settings → Plan**.
This matters before anything else: `render.yaml` ships with
`plan: free  # fine for verification; upgrade for always-on`. A free-plan
Render web service spins down after ~15 minutes with no incoming HTTP
request and cold-starts on the next one — which means the scheduled resync
loop (`setInterval`, every 24h, armed once at process boot) only gets to run
at all when SOME request happens to wake the process. On the free plan,
"last_attempted_sync itself is stale" can mean "the service has been asleep,
not that anything is broken" — check the plan before concluding the resync
loop is failing. This is exactly the kind of fact this project has gotten
wrong before by inferring from local config instead of checking the live
box — check it, don't assume it.

## Step 1 — read the Oura integration row for that user

```sql
select user_id, provider, enabled, demo, connected_at, last_synced_at, error,
       settings->>'last_attempted_sync' as last_attempted_sync,
       settings->'last_sync_counts'     as last_sync_counts
from integrations
where user_id = <id> and provider = 'oura';
```

If this returns NO row at all, this user has never had `setIntegration`
called for `oura` — meaning no backfill has ever run for them, connect-time
included. That is itself the finding: something is wrong upstream of sync
entirely (did the OAuth connect flow actually complete? see `oura_accounts`
below).

## Step 2 — read their connected Oura account(s)

```sql
select id, label, expires_at, created_at
from oura_accounts
where user_id = <id>;
```

Never print `access_token`/`refresh_token` themselves — `expires_at` is the
only fact from this table that matters for diagnosis (it's what
`validAccessToken`, `server/integrations/oura.js`, checks before deciding
whether to refresh at all). If this returns zero rows, there is no OAuth
account for this user regardless of what `/api/health` says server-wide —
`ouraOAuthConfigured()` being true only means the SERVER has Oura app
credentials; it says nothing about whether this particular user ever
completed the OAuth dance. If a `user_id IS NULL` row exists in this table
for a different query (no `where`), that's the exact class of historical bug
`server/db.js`'s migration comment near `update oura_accounts set user_id …
where user_id is null` was written for — a genuinely orphaned account row
never resolves for anyone.

## Step 3 — read what actually landed in storage

```sql
select day, value as readiness_score,
       extra->>'sleep_score'     as sleep_score,
       extra->>'total_calories'  as total_calories,
       fetched_at
from wearable_signals
where user_id = <id> and provider = 'oura' and metric = 'readiness'
order by day desc
limit 14;
```

This is ground truth for "does the user's stale complaint match what's
actually stored" — cross-check the most recent `day` here against today's
date. A gap of one or two days is often just Oura's own scoring lag (a night
that hasn't finished being scored yet); a gap of a week or more, with a
`last_synced_at` that claims to be recent, would itself be a new and
different bug (the write claims success but the read shows nothing) — flag
that separately, it isn't one of the scenarios below.

## Step 4 — grep the logs

Every log line this change touches is prefixed so it's greppable without
wading through unrelated request noise. In the Render dashboard's Logs tab
for this service (or an exported log file, or the Render CLI's `render logs`
if you have it configured), search for, in order of how far upstream they
are:

```
[oura-connect-backfill]   — the very first backfill, right after OAuth connect
[oura-backfill]           — inside backfillOuraHistory itself (readiness/
                             sleep/workout endpoint-level warnings)
[oura-resync]             — the scheduled 24h loop, per account
[oura]                    — a token-refresh failure on the LIVE read path
[oura-sync-observability] — persisting an attempt's outcome itself failed
                             (this one firing at all is its own bug — it
                             means the diagnostic data below may be missing
                             even though a real attempt happened)
```

Lines are tagged with the user id and/or Oura account id, not email — use
the id from Step 0 to find the right lines.

## Decision table

Read `last_synced_at`, `settings.last_attempted_sync`, `error`, and
`settings.last_sync_counts` together — no single field answers this alone.

| last_attempted_sync | last_synced_at | error | Likely cause | What to do |
|---|---|---|---|---|
| Recent (< ~24h) | Recent (< 48h) | `null` | Working correctly. If the user STILL reports staleness, the gap is client-side (a cached service-worker response, or they're looking at a specific day Oura itself hasn't scored yet — check Step 3 for that exact day) or a UI misunderstanding, not a sync failure. | Check Step 3 for the specific day in question before assuming anything server-side is wrong. |
| Recent | Stale (or null) | `refresh_token_expired` | The stored OAuth grant is dead — revoked from the Oura app's own account settings, or the refresh token itself expired. Sync attempts are firing (last_attempted_sync proves it) but every one fails at the token step. | Nothing server-side fixes this. The user must reconnect via the Connections tab (disconnect, then Connect again) — a fresh OAuth grant is the only remedy. |
| Recent | Stale (or null) | `oura_api_unreachable` | A network-level failure reaching Oura's API (DNS, timeout, connection refused) — could be transient (an Oura outage) or a Render-side egress problem. | Check whether it clears on its own by the NEXT scheduled tick (within 24h) before escalating. If it persists across multiple ticks, check Oura's own status page and whether OTHER connected accounts on this same server are failing the same way (a per-account problem points at that account/token; an every-account problem points at the server's network path). |
| Recent | Stale (or null) | `oura_api_error_<5xx>` | Oura's API itself returned a server error on the token endpoint or a data endpoint. | Same as unreachable — check for persistence across ticks before treating it as more than a transient Oura-side blip. |
| Recent | Stale (or null) | `oura_api_error_<4xx other than 400/401>` | An unexpected client-side error against Oura's API — a real bug worth a closer look (400/401 are already classified as `refresh_token_expired` above; anything else here wasn't anticipated). | Read the raw message logged alongside it (`[oura-backfill]`/`[oura-resync]` lines, Step 4) — this classification only names the status, not the cause. |
| Stale (older than ~24-48h) or `null` | (anything) | (anything) | The sync mechanism itself isn't firing for this account at all — see Step 0's Render-plan check first. If the plan is NOT free/the service is confirmed always-on: check that `oura_accounts` (Step 2) actually has a row with a non-null `user_id` for this account, and that `/api/health`'s `oura` field is still `"oauth"` (an operator could have unset the server's Oura env vars, which disarms the WHOLE resync loop's `setInterval` guard for every user, not just this one). | If the service was asleep, wait for it to wake and re-check after ~24h, or trigger a fresh attempt (see below). If the account row is missing/orphaned, that's a separate, deeper bug — this observability alone can't fix a row that was never correctly attributed. |
| `null` | `null` | `null` | Never attempted, ever — see "If everything here is empty" below. | Distinguish "connected before this shipped, hasn't had a tick yet" from "the connect-time backfill silently failed to even try" via Step 4's `[oura-connect-backfill]` logs around the connect timestamp. |
| Recent | Recent | `null`, but `last_sync_counts.accepted` is 0 and `fetched` is small | Oura's own API returned little or nothing for the requested window — not a bug here. Common right after connecting (Oura hasn't scored recent nights yet) or for a genuinely inactive account. | Check Step 3's most recent `day` — if it roughly matches "however long Oura typically takes to score a night," this is expected, not a failure. |

## Triggering a fresh attempt right now

There is currently **no admin-facing way to force a resync for someone
else's account** — `POST /api/oura/backfill` requires that user's own
session cookie, and the scheduled resync loop only runs on its own 24h
timer (subject to the Render free-plan caveat above). In practice, forcing
a fresh attempt today means one of:

- Ask the user to open the app (any authenticated request keeps the process
  awake past the free-plan sleep window, though it does NOT by itself force
  a resync — only a live read, which only records an attempt on failure).
- Ask the user to disconnect and reconnect Oura from the Connections tab —
  this re-runs the connect-time backfill immediately, at the cost of a full
  fresh OAuth grant.
- Wait for the next scheduled tick (up to 24h away).

Adding a genuine "sync now" action (an authenticated route the SIGNED-IN
user can hit themselves, wired to a button in the Connections tab) is a real
follow-up worth doing, but it's a new capability, not a diagnostic — out of
scope for this runbook and the change that produced it.

## If everything here is empty

`last_synced_at`, `settings.last_attempted_sync`, `settings.last_sync_counts`,
and `error` are only ever populated going FORWARD from when this change
shipped — there is no retroactive backfill of history that predates it. An
account that connected and broke before this shipped will show every field
`null` until its next real attempt (the next scheduled tick, or a manual
reconnect) populates them for the first time. That is the expected, honest
state of "no history yet," not a sign the observability itself is broken —
confirm you're looking at genuinely fresh data (check `settings.last_attempted_sync`'s own timestamp) before concluding otherwise.
