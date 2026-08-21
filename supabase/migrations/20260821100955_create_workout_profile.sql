-- One row per user, replacing the never-applied user_profiles.workout_prefs
-- jsonb column with real, queryable columns for the /workout-setup
-- questionnaire (fitness level, goal, strongest lifts, training days,
-- cardio preferences, muscles/session, session length, plan choice).
create table public.workout_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  fitness_level text not null
    check (fitness_level in ('beginner','intermediate','expert','pro')),
  fitness_goal text not null
    check (fitness_goal in ('build_muscle','general_fitness','conditioning','strength')),
  bench_weight_kg numeric,
  bench_reps smallint,
  squat_weight_kg numeric,
  squat_reps smallint,
  deadlift_weight_kg numeric,
  deadlift_reps smallint,
  training_days_per_week smallint not null
    check (training_days_per_week between 1 and 7),
  cardio_activities text[] not null default '{}',
  muscles_per_workout text not null default 'not_sure'
    check (muscles_per_workout in ('1','2','3','not_sure')),
  preferred_workout_time_min smallint not null
    check (preferred_workout_time_min between 30 and 120),
  preferred_training_plan text not null
    check (preferred_training_plan in ('ai_generated','library','custom')),
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workout_profile enable row level security;

create policy "Users manage own workout profile"
  on public.workout_profile
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
