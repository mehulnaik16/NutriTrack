
-- user_profiles
create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  age int,
  gender text,
  height_cm float,
  weight_kg float,
  activity_level text,
  goal text,
  bmi float,
  bmr float,
  tdee float,
  daily_calorie_target float,
  protein_target_g float,
  carbs_target_g float,
  fat_target_g float,
  selected_plan text,
  trial_start_date date,
  created_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "users view own profile" on public.user_profiles
  for select using (auth.uid() = id);
create policy "users insert own profile" on public.user_profiles
  for insert with check (auth.uid() = id);
create policy "users update own profile" on public.user_profiles
  for update using (auth.uid() = id);

-- food_logs
create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  meal_type text not null,
  food_name text not null,
  quantity_g float not null,
  calories float not null default 0,
  protein_g float not null default 0,
  carbs_g float not null default 0,
  fat_g float not null default 0,
  logged_at timestamptz not null default now()
);

create index food_logs_user_date_idx on public.food_logs (user_id, date);

alter table public.food_logs enable row level security;

create policy "users view own logs" on public.food_logs
  for select using (auth.uid() = user_id);
create policy "users insert own logs" on public.food_logs
  for insert with check (auth.uid() = user_id);
create policy "users update own logs" on public.food_logs
  for update using (auth.uid() = user_id);
create policy "users delete own logs" on public.food_logs
  for delete using (auth.uid() = user_id);
