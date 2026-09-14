-- Second and working fix for sync_achievements().
--
-- 20260914150400 aliased the RETURN QUERY, which was necessary but not
-- sufficient: the remaining ambiguity was the ON CONFLICT target. A conflict
-- target cannot be table-qualified, so `on conflict (user_id, achievement_id)`
-- resolved achievement_id against the RETURNS TABLE output parameter of the
-- same name and raised at runtime on every call.
--
-- Dropping the explicit target is enough — a bare `on conflict do nothing`
-- covers any unique violation, which here can only be the (user_id,
-- achievement_id) primary key, and it contains no column reference to be
-- ambiguous about. The output column names stay as they were so the client API
-- is unchanged.
--
-- Both attempts applied cleanly: create or replace validates syntax, while
-- plpgsql resolves name conflicts when the statement actually runs. Only the
-- signed-in browser probe caught it.

create or replace function public.sync_achievements()
returns table (achievement_id text, xp int)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  caller uuid := auth.uid();
  m      record;
begin
  if caller is null then
    raise exception 'Unauthorized';
  end if;

  select * into m from public.user_achievement_metrics(caller);

  insert into public.user_achievements (user_id, achievement_id)
  select caller, a.id
    from public.achievements a
   where case a.metric
           when 'food_count'    then m.food_count
           when 'food_streak'   then m.food_streak
           when 'early_logs'    then m.early_logs
           when 'workout_count' then m.workout_count
           when 'weight_count'  then m.weight_count
           when 'photo_count'   then m.photo_count
           when 'hydrated_days' then m.hydrated_days
           when 'saved_meals'   then m.saved_meals
         end >= a.threshold
  on conflict do nothing;

  return query
    select t.a_id, t.a_xp
      from (
        select ua.achievement_id as a_id, a.xp as a_xp, a.sort_order as a_sort
          from public.user_achievements ua
          join public.achievements a on a.id = ua.achievement_id
         where ua.user_id = caller
      ) t
     order by t.a_sort;
end;
$function$;

revoke execute on function public.sync_achievements() from public, anon, authenticated;
grant  execute on function public.sync_achievements() to authenticated;
