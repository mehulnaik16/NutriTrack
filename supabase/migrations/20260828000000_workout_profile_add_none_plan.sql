-- Adds a 5th allowed value, 'none', to preferred_training_plan — for the
-- "No plan" option on /workout-setup step 8 and the /choose-plan screen,
-- which route straight to /workout without generating or choosing a plan.
-- Distinct from 'skip': 'skip' displays "Skipped for now", 'none' displays
-- "No plan".
alter table public.workout_profile
  drop constraint workout_profile_preferred_training_plan_check;

alter table public.workout_profile
  add constraint workout_profile_preferred_training_plan_check
    check (preferred_training_plan in ('ai_generated', 'library', 'custom', 'skip', 'none'));
