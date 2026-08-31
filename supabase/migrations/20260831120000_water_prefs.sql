-- Persist water daily-goal and cup-size preferences server-side.
--
-- Until now these lived only in localStorage ("waterDailyGoal", "waterStep"),
-- duplicated independently in WaterStreak.tsx and profile.tsx with no DB sync,
-- so they were lost on a new device or cleared cache. NULL = user has never
-- set a preference; the client falls back to localStorage, then hardcoded
-- defaults (2500 ml goal / 250 ml cup).
alter table public.user_profiles
  add column if not exists water_goal_ml int default null,
  add column if not exists water_cup_ml int default null;
