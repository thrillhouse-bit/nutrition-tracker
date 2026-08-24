-- Nutrition Tracker — Postgres schema (Neon).
-- Apply with:  npm run db:init      (reads DATABASE_URL, runs this file)
-- or paste into the Neon SQL editor.

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
  food_id           bigint not null references foods (id) on delete cascade,
  logged_at         timestamptz not null default now(),
  servings_consumed numeric not null default 1,
  meal              text check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  created_at        timestamptz not null default now()
);

create index if not exists log_entries_logged_at_idx on log_entries (logged_at);
create index if not exists log_entries_food_id_idx on log_entries (food_id);

-- Versioned targets: the row with the latest effective_from wins. Adjust your
-- targets over time without losing the history of what they used to be.
create table if not exists daily_targets (
  id             bigint generated always as identity primary key,
  calories       numeric not null default 2000,
  protein_g      numeric not null default 150,
  carbs_g        numeric not null default 200,
  fat_g          numeric not null default 65,
  fiber_g        numeric,
  sugar_g        numeric,
  sodium_mg      numeric,
  effective_from timestamptz not null default now()
);
