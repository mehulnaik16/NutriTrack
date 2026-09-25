-- Food logging is a paid feature. The UI locks it; this is the guard, so a
-- lapsed user calling the REST API directly is rejected too. Reading stays
-- open, so lapsed users can still browse their own history.
--
-- Covers every table only the locked Food / Dashboard / Meal builder pages
-- write: food_logs, saved_meals, water_logs. Insert, update and delete alike
-- ("view only, no edit").
--
-- Keyed on auth.uid(), the caller, not the row: RLS already pins rows to their
-- owner. Service-role and server jobs carry no uid and pass through, which is
-- what account deletion and the ops tools rely on.
--
-- access_until can lag a referral bonus whose hold just elapsed, so a failing
-- check recomputes once before rejecting. The happy path costs one indexed read.

create or replace function public.require_access_for_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_until timestamptz;
begin
  if v_uid is null then
    return coalesce(NEW, OLD);
  end if;

  select access_until into v_until from public.user_profiles where id = v_uid;

  if v_until is null or v_until <= now() then
    perform public.recompute_access(v_uid);
    select access_until into v_until from public.user_profiles where id = v_uid;
  end if;

  if v_until is null or v_until <= now() then
    raise exception 'Your free trial has ended. Pick a plan to keep logging meals.';
  end if;

  return coalesce(NEW, OLD);
end;
$$;

-- Trigger function: no caller ever needs EXECUTE.
revoke execute on function public.require_access_for_write() from public, anon, authenticated;

drop trigger if exists trg_food_logs_require_access on public.food_logs;
create trigger trg_food_logs_require_access
  before insert or update or delete on public.food_logs
  for each row execute function public.require_access_for_write();

drop trigger if exists trg_saved_meals_require_access on public.saved_meals;
create trigger trg_saved_meals_require_access
  before insert or update or delete on public.saved_meals
  for each row execute function public.require_access_for_write();

drop trigger if exists trg_water_logs_require_access on public.water_logs;
create trigger trg_water_logs_require_access
  before insert or update or delete on public.water_logs
  for each row execute function public.require_access_for_write();
