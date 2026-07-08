create or replace function get_leaderboard_stats(start_date text)
returns table (
  user_id uuid,
  full_name text,
  workouts_count bigint,
  avg_calories numeric,
  total_water bigint,
  total_exercise_min bigint,
  overall_score numeric
) as $$
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
$$ language plpgsql security definer;
