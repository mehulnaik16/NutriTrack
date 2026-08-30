-- Heal legacy out-of-range goal_weight_kg values.
--
-- The goal_weight_kg range CHECK (30–200) was added NOT VALID, so pre-existing
-- rows with bad values were grandfathered in. Postgres re-checks the whole row
-- on any UPDATE, so the compulsory onboarding flag-updates (/welcome, /refer-
-- intro) now fail for such a row and trap the user. One row is affected today
-- (goal_weight_kg = 1). Null it out — the value is meaningless and the column is
-- optional (it only drives the goal line on weight charts).

update public.user_profiles
set goal_weight_kg = null
where goal_weight_kg is not null
  and (goal_weight_kg < 30 or goal_weight_kg > 200);
