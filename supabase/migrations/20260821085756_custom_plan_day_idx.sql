-- Lets users pick which day of their custom workout split is "current",
-- independent of the calendar weekday. Persists across missed days so the
-- plan resumes where the user left it instead of snapping back to Mon-Sun.
--
-- Lives on workout_plans, not user_profiles: it's progress through a
-- specific plan, not a general user attribute. A rebuilt plan is a new row,
-- so it naturally restarts at the default (Day 1) with no extra reset write.
alter table public.workout_plans
  add column custom_plan_day_idx smallint not null default 0
    check (custom_plan_day_idx between 0 and 6);
