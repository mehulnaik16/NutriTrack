-- Enforce per-item and daily ceiling calorie limits on public.food_logs.
-- Mirrors src/lib/calorieLimits.ts; the client check is UX, this is the guard.
-- Negative calories are already rejected by the table's CHECK constraint.

create or replace function public.check_food_log_daily_limit()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_daily_target numeric;
  v_daily_ceiling numeric;
  v_current_day_total numeric;
begin
  if NEW.calories > 4000 then
    raise exception 'Single food item cannot exceed 4,000 kcal (got %)', round(NEW.calories::numeric, 1);
  end if;

  -- Lowering an entry never blocks, so days already over the ceiling stay editable.
  if TG_OP = 'UPDATE'
     and NEW.user_id = OLD.user_id
     and NEW.date = OLD.date
     and coalesce(NEW.calories, 0) <= coalesce(OLD.calories, 0) then
    return NEW;
  end if;

  -- Serialise writes per user-day so parallel inserts cannot each pass the sum check.
  perform pg_advisory_xact_lock(hashtextextended(NEW.user_id::text || NEW.date::text, 0));

  select daily_calorie_target
  into v_daily_target
  from public.user_profiles
  where id = NEW.user_id;

  if v_daily_target is null or v_daily_target <= 0 then
    v_daily_target := 2000;
  end if;

  v_daily_ceiling := least(10000, greatest(5000, round(v_daily_target * 2.0)));

  select coalesce(sum(calories), 0)
  into v_current_day_total
  from public.food_logs
  where user_id = NEW.user_id
    and date = NEW.date
    and (TG_OP = 'INSERT' or id <> OLD.id);

  if v_current_day_total + coalesce(NEW.calories, 0) > v_daily_ceiling then
    raise exception 'Daily limit of % kcal reached (current: % kcal, attempted: +% kcal)',
      v_daily_ceiling,
      round(v_current_day_total::numeric),
      round(coalesce(NEW.calories, 0)::numeric);
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_check_food_log_daily_limit on public.food_logs;

create trigger trg_check_food_log_daily_limit
  before insert or update of calories, date, user_id
  on public.food_logs
  for each row
  execute function public.check_food_log_daily_limit();
