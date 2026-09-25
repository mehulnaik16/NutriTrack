-- Cap strength sets per exercise per day on public.workout_logs: 10 with access
-- (trial, paid or premium days — access_until in the future), 6 without.
-- Mirrors the GymLogModal check in src/routes/workout.tsx; the client check is
-- UX, this is the guard. Cardio rows store exercises_done as an object, not an
-- array, and are never capped.

create or replace function public.check_workout_set_daily_limit()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_new_sets int;
  v_logged int;
  v_cap int;
begin
  if jsonb_typeof(NEW.exercises_done) is distinct from 'array' then
    return NEW;
  end if;

  v_new_sets := jsonb_array_length(NEW.exercises_done);

  -- Edits that do not add sets never block, so days already over stay editable.
  if TG_OP = 'UPDATE'
     and NEW.user_id = OLD.user_id
     and NEW.date = OLD.date
     and NEW.workout_name = OLD.workout_name
     and jsonb_typeof(OLD.exercises_done) = 'array'
     and v_new_sets <= jsonb_array_length(OLD.exercises_done) then
    return NEW;
  end if;

  -- Serialise writes per user-day-exercise so parallel inserts cannot each pass.
  perform pg_advisory_xact_lock(
    hashtextextended(NEW.user_id::text || NEW.date::text || NEW.workout_name, 0)
  );

  select case when access_until > now() then 10 else 6 end
  into v_cap
  from public.user_profiles
  where id = NEW.user_id;

  v_cap := coalesce(v_cap, 6);

  select coalesce(sum(jsonb_array_length(exercises_done)), 0)
  into v_logged
  from public.workout_logs
  where user_id = NEW.user_id
    and date = NEW.date
    and workout_name = NEW.workout_name
    and jsonb_typeof(exercises_done) = 'array'
    and (TG_OP = 'INSERT' or id <> OLD.id);

  if v_logged + v_new_sets > v_cap then
    raise exception 'Daily limit of % sets for this exercise reached.', v_cap;
  end if;

  return NEW;
end;
$$;

revoke execute on function public.check_workout_set_daily_limit() from public, anon, authenticated;

drop trigger if exists trg_check_workout_set_daily_limit on public.workout_logs;

create trigger trg_check_workout_set_daily_limit
  before insert or update of exercises_done, date, user_id, workout_name
  on public.workout_logs
  for each row
  execute function public.check_workout_set_daily_limit();
