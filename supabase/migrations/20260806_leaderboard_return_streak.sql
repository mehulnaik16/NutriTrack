-- Leaderboard: also return each user's current_streak so the "Daily Streak"
-- category shows real values for everyone (user_profiles is RLS-protected,
-- so the client can only read its own row — this SECURITY DEFINER function
-- is the only safe window into other users' leaderboard fields).
--
-- Changing a function's return signature requires dropping it first.

drop function if exists get_leaderboard_stats(text);

create or replace function get_leaderboard_stats(start_date text)
returns table (
  user_id uuid,
  full_name text,
  current_streak integer,
  workouts_count bigint,
  avg_calories numeric,
  total_water bigint,
  total_exercise_min bigint,
  overall_score numeric
) as $$
begin
  return query
  with u as (
    select
      id as uid,
      user_profiles.full_name as fname,
      coalesce(user_profiles.current_streak, 0) as streak
    from public.user_profiles
  ),
  wl as (
    select workout_logs.user_id, count(id) as w_count, sum(duration_min) as e_min
    from public.workout_logs
    where date >= start_date::date
    group by workout_logs.user_id
  ),
  fl as (
    select
      food_logs.user_id,
      sum(calories) / nullif(count(distinct date), 0) as a_cal,
      count(distinct date) as f_days
    from public.food_logs
    where date >= start_date::date
    group by food_logs.user_id
  ),
  wat as (
    select water_logs.user_id, sum(amount_ml) as t_wat
    from public.water_logs
    where date >= start_date::date
    group by water_logs.user_id
  )
  select
    u.uid,
    u.fname,
    u.streak,
    coalesce(wl.w_count, 0) as workouts_count,
    round(coalesce(fl.a_cal, 0)::numeric, 1) as avg_calories,
    coalesce(wat.t_wat, 0) as total_water,
    coalesce(wl.e_min, 0) as total_exercise_min,
    -- Scoring: workouts (50 pts each) + exercise minutes + water (1 pt / 100ml)
    -- + food-logging consistency (20 pts per day logged)
    round(
      (
        (coalesce(wl.w_count, 0) * 50)
        + (coalesce(wat.t_wat, 0) / 100.0)
        + coalesce(wl.e_min, 0)
        + (coalesce(fl.f_days, 0) * 20)
      )::numeric,
    1) as overall_score
  from u
  left join wl on u.uid = wl.user_id
  left join fl on u.uid = fl.user_id
  left join wat on u.uid = wat.user_id;
end;
$$ language plpgsql security definer;
