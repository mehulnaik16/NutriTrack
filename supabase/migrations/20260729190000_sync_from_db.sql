-- ============================================================
-- Sync migration: bring local schema in line with live DB
-- Generated: 2026-07-29
-- ============================================================

-- ── 1. Dropped items (already removed from DB in previous session) ────────
-- The following were manually dropped via SQL editor and are recorded here
-- so the migration history is complete:
--
--   TRIGGER  public.on_weight_entry_photo_change  ON weight_entries  (DROPPED)
--   FUNCTION public.delete_weight_photo_on_change()                  (DROPPED)
--
-- No DDL needed — they are already gone.


-- ── 2. get_leaderboard_stats(date) — SECURITY DEFINER overload ───────────
-- This overload exists in the DB but was not captured in any prior migration.
-- The text overload in 20260708_add_leaderboard_rpc.sql is the old version.
-- The date overload below is the current production version.

CREATE OR REPLACE FUNCTION public.get_leaderboard_stats(start_date date)
RETURNS TABLE(
  user_id           uuid,
  full_name         text,
  workouts_count    bigint,
  avg_calories      numeric,
  total_water       bigint,
  total_exercise_min bigint,
  overall_score     numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
begin
  return query
  with u as (
    select id as uid, user_profiles.full_name as fname from public.user_profiles
  ),
  wl as (
    select workout_logs.user_id, count(id) as w_count, sum(duration_min) as e_min
    from public.workout_logs
    where date >= start_date
    group by workout_logs.user_id
  ),
  fl as (
    select food_logs.user_id, sum(calories) / nullif(count(distinct date), 0) as a_cal
    from public.food_logs
    where date >= start_date
    group by food_logs.user_id
  ),
  wat as (
    select water_logs.user_id, sum(amount_ml) as t_wat
    from public.water_logs
    where date >= start_date
    group by water_logs.user_id
  )
  select
    u.uid,
    u.fname,
    coalesce(wl.w_count, 0) as workouts_count,
    round(coalesce(fl.a_cal, 0), 1) as avg_calories,
    coalesce(wat.t_wat, 0) as total_water,
    coalesce(wl.e_min, 0) as total_exercise_min,
    -- Simple scoring formula for gamification
    round((coalesce(wl.w_count, 0) * 50) + (coalesce(wat.t_wat, 0) / 100.0) + coalesce(wl.e_min, 0), 1) as overall_score
  from u
  left join wl on u.uid = wl.user_id
  left join fl on u.uid = fl.user_id
  left join wat on u.uid = wat.user_id;
end;
$$;
