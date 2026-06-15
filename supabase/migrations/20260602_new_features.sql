-- ── Water logs ────────────────────────────────────────────────────────────────
create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  amount_ml int not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);
alter table public.water_logs enable row level security;
create policy "users manage own water logs" on public.water_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Weight entries ────────────────────────────────────────────────────────────
create table if not exists public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  weight_kg float not null,
  photo_url text,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);
create index if not exists weight_entries_user_date on public.weight_entries (user_id, date);
alter table public.weight_entries enable row level security;
create policy "users manage own weight entries" on public.weight_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Workout plans ─────────────────────────────────────────────────────────────
create table if not exists public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal text not null,
  plan_json jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.workout_plans enable row level security;
create policy "users manage own workout plans" on public.workout_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Workout logs ──────────────────────────────────────────────────────────────
create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  workout_name text not null,
  exercises_done jsonb not null default '[]',
  duration_min int not null default 0,
  calories_burned float not null default 0,
  logged_at timestamptz not null default now()
);
create index if not exists workout_logs_user_date on public.workout_logs (user_id, date);
alter table public.workout_logs enable row level security;
create policy "users manage own workout logs" on public.workout_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Add goal_weight_kg to user_profiles if not exists ────────────────────────
alter table public.user_profiles
  add column if not exists goal_weight_kg float,
  add column if not exists goal text;

-- ── Supabase Storage bucket for weight photos ─────────────────────────────────
-- Run this in the Supabase dashboard > Storage > New bucket
-- Name: weight-photos, Public: true
-- (Cannot be done via SQL migration, do it manually once)
