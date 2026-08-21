alter table public.workout_plans
  add column custom_plan_day_anchor date not null default current_date;

comment on column public.workout_plans.custom_plan_day_anchor is
  'The date on which custom_plan_day_idx was last set. Together they define a
   self-advancing cycle: today''s day = (custom_plan_day_idx + days since this
   date) mod days_in_plan. Deliberately NOT tied to weekday — the user picks
   which day of their split is "today", and it rolls forward from there.';
