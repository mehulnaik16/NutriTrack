-- Range checks for the body measurements users type.
--
-- These columns had no constraint at all, and only the quiz constrained the
-- values on the way in (its sliders are 30-200 kg and 100-250 cm, and it
-- refuses to continue under 16). The Weight page and the Profile page wrote
-- bare `<Input type="number">` values straight through, so a goal weight of
-- 1 kg saved happily and then drove the progress ring, the chart's target
-- line and the AI motivation prompt.
--
-- src/lib/measurements.ts now blocks this in the UI; these constraints are the
-- backstop, because anyone holding the anon key can PATCH the table directly.
-- The bounds mirror that file exactly — change both together.
--
-- NOT VALID on the existing-rows check: any row already outside these bounds
-- is bad data we do not want to silently keep, but failing the migration on it
-- would be worse. New and updated rows are checked from here on; see the
-- verification query at the foot of this file for finding legacy offenders.

alter table public.user_profiles
  add constraint user_profiles_weight_kg_range
    check (weight_kg is null or (weight_kg >= 30 and weight_kg <= 200))
    not valid;

alter table public.user_profiles
  add constraint user_profiles_goal_weight_kg_range
    check (goal_weight_kg is null or (goal_weight_kg >= 30 and goal_weight_kg <= 200))
    not valid;

alter table public.user_profiles
  add constraint user_profiles_height_cm_range
    check (height_cm is null or (height_cm >= 100 and height_cm <= 250))
    not valid;

alter table public.user_profiles
  add constraint user_profiles_age_range
    check (age is null or (age >= 16 and age <= 100))
    not valid;

-- weight_entries is the logging table behind the chart; the same bound applies.
alter table public.weight_entries
  add constraint weight_entries_weight_kg_range
    check (weight_kg >= 30 and weight_kg <= 200)
    not valid;

comment on constraint user_profiles_goal_weight_kg_range on public.user_profiles is
  'Mirrors GOAL_WEIGHT_KG in src/lib/measurements.ts. A goal weight outside human range silently corrupts the progress ring and the AI motivation prompt.';

-- Find rows that predate these constraints:
--
--   select id, weight_kg, goal_weight_kg, height_cm, age
--     from public.user_profiles
--    where weight_kg      not between 30 and 200
--       or goal_weight_kg not between 30 and 200
--       or height_cm      not between 100 and 250
--       or age            not between 16 and 100;
--
-- Once those are corrected, promote the constraints with
--   alter table public.user_profiles validate constraint <name>;
