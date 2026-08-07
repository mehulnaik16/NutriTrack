-- Workout onboarding preferences (fitness level, goal, strongest lifts,
-- training frequency, cardio preferences, session duration, plan choice).
-- Stored as a single jsonb blob; the app reads/writes the whole object.
alter table public.user_profiles
  add column if not exists workout_prefs jsonb;
