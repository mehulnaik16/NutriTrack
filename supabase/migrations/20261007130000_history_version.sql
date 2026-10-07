-- The web app caches each user's log rows older than ~8 days in the browser
-- (src/lib/historyCache.ts): those rows are frozen by enforce_log_edit_window,
-- so they only change when deleted — or when service-role / manual SQL rewrites
-- them, which the edit-window trigger lets through.
--
-- history_version is the cache's "has anything old changed?" signal. Any
-- insert, update or delete touching a row dated before current_date - 6 bumps
-- it; the client compares it on every read and refetches on a mismatch. The
-- margin (6 here vs 8 on the client) errs toward bumping.
--
-- Clients can read it (own-profile RLS) but never write it: it is not in the
-- user_profiles column UPDATE grant list.

alter table public.user_profiles
  add column if not exists history_version bigint not null default 0;

create or replace function public.bump_history_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_col text := TG_ARGV[0];
  v_floor date := current_date - 6;
begin
  if (TG_OP in ('UPDATE', 'DELETE') and (to_jsonb(OLD) ->> v_col)::date < v_floor)
     or (TG_OP in ('INSERT', 'UPDATE') and (to_jsonb(NEW) ->> v_col)::date < v_floor) then
    update public.user_profiles
      set history_version = history_version + 1
      where id = coalesce(NEW.user_id, OLD.user_id);
  end if;
  return null;
end;
$$;

-- Trigger function: no caller ever needs EXECUTE.
revoke execute on function public.bump_history_version() from public, anon, authenticated;

drop trigger if exists trg_food_logs_history_version on public.food_logs;
create trigger trg_food_logs_history_version
  after insert or update or delete on public.food_logs
  for each row execute function public.bump_history_version('date');

drop trigger if exists trg_workout_logs_history_version on public.workout_logs;
create trigger trg_workout_logs_history_version
  after insert or update or delete on public.workout_logs
  for each row execute function public.bump_history_version('date');

drop trigger if exists trg_weight_entries_history_version on public.weight_entries;
create trigger trg_weight_entries_history_version
  after insert or update or delete on public.weight_entries
  for each row execute function public.bump_history_version('date');

drop trigger if exists trg_body_measurements_history_version on public.body_measurements;
create trigger trg_body_measurements_history_version
  after insert or update or delete on public.body_measurements
  for each row execute function public.bump_history_version('measured_at');
