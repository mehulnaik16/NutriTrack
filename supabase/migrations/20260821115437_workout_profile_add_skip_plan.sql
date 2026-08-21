-- Adds a 4th allowed value, 'skip', to preferred_training_plan — for the
-- "Skip & Save" option on /workout-setup step 8, which saves the
-- questionnaire without generating/choosing a plan.
alter table public.workout_profile
  drop constraint workout_profile_preferred_training_plan_check;

alter table public.workout_profile
  add constraint workout_profile_preferred_training_plan_check
    check (preferred_training_plan in ('ai_generated', 'library', 'custom', 'skip'));
