-- Fix for sync_achievements() from 20260914150100.
--
-- The RETURNS TABLE output columns are named achievement_id and xp, which made
-- `select ua.achievement_id, a.xp` ambiguous at runtime — the function raised
-- "column reference \"achievement_id\" is ambiguous" on every call. Caught by
-- the acceptance probe from a signed-in browser session, not by the migration
-- applying cleanly: create or replace only checks syntax, and plpgsql resolves
-- output-name conflicts when the statement executes.
--
-- The rows are now aliased inside a subquery so no output name collides. The
-- definition in 20260914150100 carries the same corrected body for a fresh
-- replay; this file is what corrects an already-migrated database.

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
  on conflict (user_id, achievement_id) do nothing;

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
