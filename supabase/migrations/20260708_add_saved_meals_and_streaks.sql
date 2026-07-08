create table if not exists public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  ingredients jsonb default '[]'::jsonb,
  calories numeric not null,
  protein_g numeric not null,
  carbs_g numeric not null,
  fat_g numeric not null,
  fiber_g numeric not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- For the leaderboard gamification
alter table public.user_profiles add column if not exists current_streak integer default 0;
alter table public.user_profiles add column if not exists longest_streak integer default 0;
