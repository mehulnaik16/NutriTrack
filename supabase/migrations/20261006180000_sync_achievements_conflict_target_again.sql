-- sync_achievements() has raised "column reference achievement_id is ambiguous"
-- on every call since step_achievements (20260924070138, applied directly and
-- never committed). That migration re-added the step metrics on top of the
-- older body, bringing back `on conflict (user_id, achievement_id)`, which
-- 20260914150411 had removed: a conflict target cannot be table-qualified, so
-- achievement_id resolves against the RETURNS TABLE output column.
--
-- Same body as live, step metrics kept, bare `on conflict do nothing` (the
-- (user_id, achievement_id) primary key is the only unique constraint).

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
           when 'step_days'     then m.step_days
           when 'step_streak'   then m.step_streak
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
