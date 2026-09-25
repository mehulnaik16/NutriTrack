-- Logs are editable for today and the 7 days before it; anything older is
-- view-only, for every user, paid or not. Stops back-filling and rewriting old
-- history. Mirrors isEditableDate() in src/lib/dates.ts; the UI check is UX,
-- this is the guard.
--
-- One function, attached to every dated user log. TG_ARGV[0] names the date
-- column (body_measurements calls it measured_at). Insert, update and delete
-- are all checked; an update is checked against both the old and new date, so
-- a row can neither be edited in place nor moved into or out of the window.
--
-- "Today" is the user's own local day (user_profiles.timezone), falling back to
-- Asia/Kolkata. Service-role and server jobs carry no uid and pass through.

create or replace function public.enforce_log_edit_window()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_col text := TG_ARGV[0];
  v_tz text;
  v_floor date;
begin
  if v_uid is null then
    return coalesce(NEW, OLD);
  end if;

  select timezone into v_tz from public.user_profiles where id = v_uid;
  begin
    v_floor := (now() at time zone coalesce(v_tz, 'Asia/Kolkata'))::date - 7;
  exception when others then
    v_floor := (now() at time zone 'Asia/Kolkata')::date - 7;
  end;

  if (TG_OP in ('UPDATE', 'DELETE') and (to_jsonb(OLD) ->> v_col)::date < v_floor)
     or (TG_OP in ('INSERT', 'UPDATE') and (to_jsonb(NEW) ->> v_col)::date < v_floor) then
    raise exception 'Entries older than 7 days are view-only.';
  end if;

  return coalesce(NEW, OLD);
end;
$$;

revoke execute on function public.enforce_log_edit_window() from public, anon, authenticated;

drop trigger if exists trg_food_logs_edit_window on public.food_logs;
create trigger trg_food_logs_edit_window
  before insert or update or delete on public.food_logs
  for each row execute function public.enforce_log_edit_window('date');

drop trigger if exists trg_workout_logs_edit_window on public.workout_logs;
create trigger trg_workout_logs_edit_window
  before insert or update or delete on public.workout_logs
  for each row execute function public.enforce_log_edit_window('date');

drop trigger if exists trg_weight_entries_edit_window on public.weight_entries;
create trigger trg_weight_entries_edit_window
  before insert or update or delete on public.weight_entries
  for each row execute function public.enforce_log_edit_window('date');

drop trigger if exists trg_water_logs_edit_window on public.water_logs;
create trigger trg_water_logs_edit_window
  before insert or update or delete on public.water_logs
  for each row execute function public.enforce_log_edit_window('date');

drop trigger if exists trg_step_logs_edit_window on public.step_logs;
create trigger trg_step_logs_edit_window
  before insert or update or delete on public.step_logs
  for each row execute function public.enforce_log_edit_window('date');

drop trigger if exists trg_body_measurements_edit_window on public.body_measurements;
create trigger trg_body_measurements_edit_window
  before insert or update or delete on public.body_measurements
  for each row execute function public.enforce_log_edit_window('measured_at');
