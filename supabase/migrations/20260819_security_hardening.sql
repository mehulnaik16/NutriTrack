-- Security hardening — see SECURITY_AUDIT_2026-08-19.md
--
-- H-1: get_leaderboard_stats was executable by `anon`, returning every user's
--      name, streak, and health metrics to unauthenticated callers.
-- H-2: it was also the only SECURITY DEFINER function in `public` without a
--      pinned search_path.
-- M-2: user_profiles UPDATE had no WITH CHECK, leaving the post-update row
--      unconstrained.
-- M-4: award_achievement did not need anon EXECUTE.

-- Signature is unchanged from the previous definition, so `create or replace`
-- swaps the body in place — no drop, no window where the function is missing.
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
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

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
$$;

revoke execute on function get_leaderboard_stats(text) from anon, public;
grant execute on function get_leaderboard_stats(text) to authenticated;

revoke execute on function award_achievement(text) from anon, public;
grant execute on function award_achievement(text) to authenticated;

drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile"
on public.user_profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- H-3: progress photos were world-readable via the public-object route,
-- which bypasses the owner-scoped RLS policies on storage.objects entirely.
update storage.buckets set public = false where id = 'weight-photos';
