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
  created_at    timestamptz not null default now()
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
  servings_consumed numeric not null default 1,
  meal              text check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  created_at        timestamptz not null default now()
);

create index if not exists log_entries_logged_at_idx on log_entries (logged_at);
create index if not exists log_entries_food_id_idx on log_entries (food_id);
create index if not exists log_entries_user_id_idx on log_entries (user_id);

-- Versioned targets: per user, the row with the latest effective_from wins.
-- Adjust your targets over time without losing the history of what they used
-- to be.
create table if not exists daily_targets (
  id             bigint generated always as identity primary key,
  user_id        bigint not null references users (id) on delete cascade,
  calories       numeric not null default 2000,
  protein_g      numeric not null default 150,
  carbs_g        numeric not null default 200,
  fat_g          numeric not null default 65,
  fiber_g        numeric,
  sugar_g        numeric,
  sodium_mg      numeric,
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
  created_at    timestamptz not null default now()
);
create index if not exists garmin_accounts_user_id_idx on garmin_accounts (user_id);

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
