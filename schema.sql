-- Nutrition Tracker — Postgres schema (Neon).
-- Apply with:  npm run db:init      (reads DATABASE_URL, runs this file)
-- or paste into the Neon SQL editor.

-- Multi-user accounts. Password hashing + session tokens live in
-- server/auth.js (scrypt + a stateless signed cookie) — this table only
-- holds what login needs to check. `foods` stays table-wide/unscoped: it's a
-- shared nutrition lookup cache (barcode -> product data), not personal data,
-- so there's nothing to isolate per user there.
create table if not exists users (
  id            bigint generated always as identity primary key,
  email         text not null unique,
  password_hash text not null,
  legal_version text,
  legal_accepted_at timestamptz,
  invite_code_digest text unique,
  created_at    timestamptz not null default now()
);

-- `create table if not exists` does not add columns to an existing deployment.
-- Keep the init script safely re-runnable so established databases gain the
-- auditable signup-acceptance fields before the new server code is deployed.
alter table users add column if not exists legal_version text;
alter table users add column if not exists legal_accepted_at timestamptz;
alter table users add column if not exists invite_code_digest text;
create unique index if not exists users_invite_code_digest_idx on users (invite_code_digest) where invite_code_digest is not null;

-- Oathbearer RPG save state. One authoritative snapshot per account keeps
-- cross-device play deterministic while `revision` provides optimistic
-- concurrency: clients must write against the revision they last read.
-- Ownership comes exclusively from the authenticated user/session; API
-- callers never supply this foreign key themselves. Account deletion removes
-- the save through the same cascade as every other account-owned record.
create table if not exists rpg_saves (
  user_id             bigint primary key references users (id) on delete cascade,
  payload             jsonb not null,
  game_schema_version integer not null check (game_schema_version > 0),
  revision            bigint not null check (revision > 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Immutable restore points for the latest twenty successful RPG writes per
-- account. The application prunes older rows inside the same atomic statement
-- that writes each new revision. Payloads are available only to restore/export
-- paths; the ordinary history endpoint exposes metadata.
create table if not exists rpg_save_history (
  user_id             bigint not null references users (id) on delete cascade,
  revision            bigint not null check (revision > 0),
  payload             jsonb not null,
  game_schema_version integer not null check (game_schema_version > 0),
  created_at          timestamptz not null,
  saved_at            timestamptz not null default now(),
  primary key (user_id, revision)
);
create index if not exists rpg_save_history_user_revision_idx
  on rpg_save_history (user_id, revision desc);

-- Postgres-only v2 authority split. Narrative projection and the economic
-- ledger have independent revisions. Story writes remain reserved for
-- server-replayed commands; this first slice exposes only read/bootstrap.
-- v1 rows are deliberately not promoted: bootstrap is server-generated for
-- accounts without either authority state or a legacy rpg_saves row.
create table if not exists rpg_authority_ledgers (
  user_id             bigint primary key references users (id) on delete cascade,
  authoritative       jsonb not null,
  inventory_revision  bigint not null check (inventory_revision > 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create table if not exists rpg_story_projections (
  user_id             bigint primary key references users (id) on delete cascade,
  story               jsonb not null,
  story_revision      bigint not null check (story_revision > 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
-- Plan-only server movement state. The current checkpoint deliberately stores
-- no materialized position: M3 will consume active_plan against trusted time.
-- `last_response` is the exact canonical response for sequence replay.
create table if not exists rpg_story_movement (
  user_id             bigint primary key references users (id) on delete cascade,
  movement_revision   bigint not null check (movement_revision > 0),
  active_plan         jsonb,
  last_response       jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
-- Existing v2 accounts become eligible only when their projection and ledger
-- are both present. Never invent a third row for a partial/corrupt authority.
insert into rpg_story_movement (user_id, movement_revision, active_plan, last_response)
select projection.user_id, 1, null, null
from rpg_story_projections projection
join rpg_authority_ledgers ledger using (user_id)
left join rpg_story_movement movement using (user_id)
where movement.user_id is null
on conflict (user_id) do nothing;
create table if not exists rpg_story_projection_history (
  user_id             bigint not null references users (id) on delete cascade,
  story_revision      bigint not null check (story_revision > 0),
  story               jsonb not null,
  created_at          timestamptz not null,
  saved_at            timestamptz not null default now(),
  primary key (user_id, story_revision)
);
create index if not exists rpg_story_projection_history_user_revision_idx
  on rpg_story_projection_history (user_id, story_revision desc);
-- Idempotency tombstones are intentionally durable in this first authority
-- checkpoint.  Do not add a TTL delete until compaction can atomically retain
-- enough command identity to prevent a retired key from mutating story again.
create table if not exists rpg_story_command_receipts (
  user_id bigint not null references users (id) on delete cascade,
  command_id text not null check (char_length(command_id) between 1 and 128),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 192),
  command_digest text not null check (command_digest ~ '^[0-9a-f]{64}$'),
  response_story jsonb not null,
  story_revision bigint not null check (story_revision >= 1),
  inventory_revision bigint not null check (inventory_revision >= 1),
  created_at timestamptz not null default now(),
  primary key (user_id, command_id),
  unique (user_id, idempotency_key)
);
create index if not exists rpg_story_command_receipts_user_created_idx
  on rpg_story_command_receipts (user_id, created_at desc);
create table if not exists rpg_story_command_audit (
  user_id bigint not null references users (id) on delete cascade,
  story_revision bigint not null,
  command_id text not null,
  command_digest text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, story_revision)
);

-- A durable, digest-only redemption ledger. `user_id` is deliberately set
-- null (not cascaded) on account deletion: deleting an alpha account must not
-- make its invitation reusable. The users-table digest supplies a second
-- uniqueness guard while an account exists; PgStore creates both records in
-- one transaction.
create table if not exists alpha_invite_redemptions (
  code_digest text primary key,
  user_id bigint unique references users (id) on delete set null,
  redeemed_at timestamptz not null default now()
);

create table if not exists foods (
  id               bigint generated always as identity primary key,
  barcode          text unique,                 -- nullable: manual/OCR foods have none
  name             text not null,
  brand            text,
  serving_size     numeric,                     -- amount, e.g. 30
  serving_unit     text,                        -- e.g. 'g', 'ml', 'serving'
  calories         numeric,                     -- per serving
  protein_g        numeric,
  carbs_g          numeric,
  fat_g            numeric,
  fiber_g          numeric,
  sugar_g          numeric,
  sodium_mg        numeric,
  source           text not null default 'manual'
                     check (source in ('openfoodfacts', 'usda', 'manual', 'ocr')),
  raw_api_response jsonb,                        -- kept for debugging / re-parsing
  created_at       timestamptz not null default now()
);

create index if not exists foods_barcode_idx on foods (barcode);

create table if not exists log_entries (
  id                bigint generated always as identity primary key,
  user_id           bigint not null references users (id) on delete cascade,
  food_id           bigint not null references foods (id) on delete cascade,
  logged_at         timestamptz not null default now(),
  servings_consumed numeric not null default 1 check (servings_consumed > 0),
  meal              text check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  created_at        timestamptz not null default now()
);

create index if not exists log_entries_food_id_idx on log_entries (food_id);
-- Composite index for the dominant query pattern (listEntries in server/db.js,
-- backing /api/entries, /api/today, /api/insights): user_id = X AND logged_at
-- BETWEEN from AND to. Supersedes the two single-column indexes this used to
-- be split across — every other log_entries lookup filters by primary key
-- (id + user_id), so it doesn't need a user_id-only index of its own.
create index if not exists log_entries_user_id_logged_at_idx on log_entries (user_id, logged_at);

-- Versioned targets: per user, the row with the latest effective_from wins.
-- Adjust your targets over time without losing the history of what they used
-- to be.
create table if not exists daily_targets (
  id             bigint generated always as identity primary key,
  user_id        bigint not null references users (id) on delete cascade,
  calories       numeric not null default 2000 check (calories >= 0),
  protein_g      numeric not null default 150 check (protein_g >= 0),
  carbs_g        numeric not null default 200 check (carbs_g >= 0),
  fat_g          numeric not null default 65 check (fat_g >= 0),
  fiber_g        numeric check (fiber_g >= 0),
  sugar_g        numeric check (sugar_g >= 0),
  sodium_mg      numeric check (sodium_mg >= 0),
  effective_from timestamptz not null default now()
);
create index if not exists daily_targets_user_id_idx on daily_targets (user_id, effective_from desc);

-- Connected Oura accounts (OAuth), per user. Tokens are server-side only; the
-- API never returns them to the client. Multiple rows per user = multiple
-- connected Oura accounts for that one person.
create table if not exists oura_accounts (
  id            bigint generated always as identity primary key,
  user_id       bigint not null references users (id) on delete cascade,
  label         text,                          -- e.g. the account email, for display
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists oura_accounts_user_id_idx on oura_accounts (user_id);

-- Connected Garmin accounts (OAuth 2.0 PKCE), per user. Same shape as
-- oura_accounts.
create table if not exists garmin_accounts (
  id            bigint generated always as identity primary key,
  user_id       bigint not null references users (id) on delete cascade,
  label         text,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz,
  garmin_user_id text,
  created_at    timestamptz not null default now()
);
-- Existing deployments predate webhook routing by Garmin's opaque user id.
-- `if not exists` above cannot add the column on its own.
alter table garmin_accounts add column if not exists garmin_user_id text;
create index if not exists garmin_accounts_user_id_idx on garmin_accounts (user_id);
create unique index if not exists garmin_accounts_garmin_user_id_idx
  on garmin_accounts (garmin_user_id) where garmin_user_id is not null;

-- Oura workouts (auto-detected or manually logged in the Oura app), pulled
-- from GET /v2/usercollection/workout. One row per Oura workout id per
-- account — `oura_id` is Oura's own identifier for the workout, so a re-run
-- backfill (or a workout Oura itself edits) upserts in place instead of
-- duplicating. `day` is Oura's own day attribution (not derived from
-- start_datetime here) so it always agrees with which day Oura itself
-- shows the workout under.
create table if not exists oura_workouts (
  id             bigint generated always as identity primary key,
  account_id     bigint not null references oura_accounts (id) on delete cascade,
  oura_id        text not null,
  day            text not null,               -- 'YYYY-MM-DD'
  activity       text,                        -- Oura's own activity label, e.g. 'running'
  intensity      text,                        -- Oura's own intensity label, e.g. 'moderate'
  source         text,                        -- Oura's own source, e.g. 'manual' | 'autodetected' | 'confirmed'
  label          text,                        -- user-entered label in the Oura app, if any
  calories       numeric,
  distance       numeric,                     -- meters, Oura's own unit
  start_datetime timestamptz,
  end_datetime   timestamptz,
  raw            jsonb,
  created_at     timestamptz not null default now(),
  unique (account_id, oura_id)
);
create index if not exists oura_workouts_account_day_idx on oura_workouts (account_id, day);

-- Garmin daily summaries. Garmin's Health API PUSHES these to our webhook, so
-- we store them and serve today's expenditure from here. One row per account
-- per calendar day (upserted).
create table if not exists garmin_dailies (
  id              bigint generated always as identity primary key,
  account_id      bigint not null references garmin_accounts (id) on delete cascade,
  day             text not null,               -- 'YYYY-MM-DD' (Garmin calendarDate)
  total_calories  numeric,
  active_calories numeric,
  steps           numeric,
  raw             jsonb,
  created_at      timestamptz not null default now(),
  unique (account_id, day)
);

-- Provider-agnostic "fueling intelligence" entities ------------------------

-- One row per user per wearable provider: connection status + which signals
-- influence the plan (user-controlled) + demo toggle.
create table if not exists integrations (
  user_id        bigint not null references users (id) on delete cascade,
  provider       text not null,                -- 'oura' | 'garmin' | 'apple'
  enabled        boolean not null default true,
  demo           boolean not null default true, -- allow demo data when no real data
  connected_at   timestamptz,
  last_synced_at timestamptz,
  error          text,
  settings       jsonb not null default '{}'::jsonb,
  primary key (user_id, provider)
);

-- Normalized wearable signals with provenance + freshness, per user. Used for
-- Apple Health (ingested by a native companion / Health export) and any
-- provider we persist rather than fetch live. value is jsonb (a number, or an
-- object for workouts). Also holds Oura's backfilled readiness history
-- (provider='oura', metric='readiness') — the live "today" signal still comes
-- from a direct Oura API call; this table is only the retained-history path.
create table if not exists wearable_signals (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references users (id) on delete cascade,
  provider    text not null,
  metric      text not null,                   -- readiness | sleep | workout | expenditure | steps
  day         text not null,                   -- 'YYYY-MM-DD'
  recorded_at timestamptz,                      -- when the sample was recorded on-device
  fetched_at  timestamptz,                      -- when we received it
  value       jsonb,
  unit        text,
  extra       jsonb
);
create index if not exists wearable_signals_lookup on wearable_signals (user_id, provider, day, metric);

-- Biometric profile used to CALCULATE a starting baseline (server/planCalc.js)
-- from height/weight/age/sex/activity/goal. One row per user — user_id IS the
-- primary key (a profile is inherently 1:1 with its user, so there's no
-- separate identity column to add). height_cm/weight_kg are the canonical
-- stored units regardless of units_pref (display-only) — the client converts
-- for imperial.
create table if not exists profile (
  user_id       bigint primary key references users (id) on delete cascade,
  height_cm     numeric,
  weight_kg     numeric,
  sex           text check (sex in ('male', 'female')),
  age_years     numeric,
  units_pref    text not null default 'imperial' check (units_pref in ('imperial', 'metric')),
  activity_level text check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal          text check (goal in ('maintain', 'lose_fat', 'build_muscle', 'endurance')),
  updated_at    timestamptz not null default now()
);

-- Snapshot of a day's plan, per user: baseline vs. adjusted targets, the
-- rationale for each adjustment, and the signals it was based on (so "why?"
-- is reproducible).
create table if not exists daily_plans (
  user_id         bigint not null references users (id) on delete cascade,
  date            text not null,               -- 'YYYY-MM-DD'
  baseline        jsonb,
  adjusted        jsonb,
  rationale       jsonb,
  signal_snapshot jsonb,
  rules_version   integer not null default 1,
  generated_at    timestamptz not null default now(),
  primary key (user_id, date)
);

-- Adaptive Fuel Plan (server/afp/engine.js) ---------------------------------
-- Deliberately a SEPARATE set of tables from profile/daily_targets/
-- daily_plans above: the Adaptive Fuel Plan is an additive, independently-
-- versioned feature that computes its own targets from its own richer
-- profile, and never reads or writes the existing Plan tab's tables. This
-- keeps the existing baseline-calculator + wearable-adjustment feature
-- (server/planCalc.js, server/plan.js) fully working, untouched, for anyone
-- who only wants that simpler flow.

-- The Adaptive Fuel Plan's own biometric + goal profile. sex/body_fat_pct
-- are nullable by design: sex null means "prefer not to say / neutral
-- estimate" (server/afp/engine.js's estimateRMR handles this without
-- guessing); body_fat_pct null means Mifflin-St Jeor is used instead of
-- Cunningham. is_pregnant_or_postpartum/has_ed_risk_flag are self-reported
-- safety context, never inferred — see evaluateSafety in the engine.
create table if not exists afp_profile (
  user_id                     bigint primary key references users (id) on delete cascade,
  units_pref                  text not null default 'imperial' check (units_pref in ('imperial', 'metric')),
  age_years                   numeric,
  height_cm                   numeric,
  weight_kg                   numeric,
  sex                         text check (sex in ('male', 'female')),
  body_fat_pct                numeric,
  activity_level              text check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal                        text not null default 'maintain' check (goal in ('maintain', 'gradual_loss', 'gradual_gain', 'custom')),
  weekly_change_kg            numeric,             -- magnitude (kg/week), for gradual_loss/gradual_gain
  calorie_adjustment          numeric,             -- signed kcal/day, for goal = 'custom'
  is_pregnant_or_postpartum   boolean not null default false,
  has_ed_risk_flag            boolean not null default false,
  updated_at                  timestamptz not null default now()
);

-- A user's planned training sessions, one row per session (a day can carry
-- more than one — a double-session day). `sport` reuses server/index.js's
-- WORKOUT_KINDS vocabulary. distance_km is optional and most relevant to
-- runs. is_race + carb_loading_opt_in together gate the opt-in
-- carbohydrate-loading suggestion (server/afp/engine.js's
-- evaluateCarbLoading) — carb loading is never applied automatically.
create table if not exists planned_workouts (
  id                  bigint generated always as identity primary key,
  user_id             bigint not null references users (id) on delete cascade,
  date                text not null,               -- 'YYYY-MM-DD'
  sport               text not null,
  start_time          text,                        -- 'HH:MM', local, optional
  duration_min        numeric not null,
  intensity           text not null check (intensity in ('easy', 'moderate', 'hard')),
  distance_km         numeric,
  is_key_session      boolean not null default false,
  is_double_session   boolean not null default false,
  is_race             boolean not null default false,
  carb_loading_opt_in boolean not null default false,
  notes               text,
  created_at          timestamptz not null default now()
);
create index if not exists planned_workouts_user_date_idx on planned_workouts (user_id, date);

-- One computed Adaptive Fuel Plan per user per day — the historical snapshot
-- that makes a past day's plan explainable and reproducible. `input_snapshot`
-- is everything computeAdaptivePlan was given (profile + sessions actually
-- used) at compute time. TODAY is recomputed live on every read (so a
-- synced workout landing mid-morning updates the plan); a PAST day is frozen
-- after its first computation and is never silently overwritten by later
-- wearable data — see afpPlan.js's reconciliation rule. `overrides` is a
-- user's own day-specific correction, applied on top of and layered
-- separately from the engine's own computed numbers (afpDailyPlans.
-- computed_targets keeps the engine's un-overridden figures alongside it),
-- and never touches afp_profile's defaults.
create table if not exists afp_daily_plans (
  user_id         bigint not null references users (id) on delete cascade,
  date            text not null,               -- 'YYYY-MM-DD'
  engine_version  integer not null,
  input_snapshot  jsonb not null,
  plan            jsonb not null,              -- the full computeAdaptivePlan() result
  overrides       jsonb,                       -- null when no day-specific override is set
  generated_at    timestamptz not null default now(),
  primary key (user_id, date)
);
