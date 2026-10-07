-- Validators for the browser's cached plan, workout prefs and profile row
-- (src/lib/historyCache.ts getCachedRow), the same way log_version /
-- history_version validate the cached logs:
--  - plan_version: any change to the user's workout_plans or workout_profile.
--  - profile_version: any real change to their user_profiles row. Updates that
--    only move the counters themselves (the log / plan triggers) don't count,
--    or every food log would invalidate the cached profile.
--
-- Clients can read both (own-profile RLS) but never write them: they are not in
-- the user_profiles column UPDATE grant list.

alter table public.user_profiles
  add column if not exists plan_version bigint not null default 0,
  add column if not exists profile_version bigint not null default 0;

create or replace function public.bump_plan_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.user_profiles
    set plan_version = plan_version + 1
    where id = coalesce(NEW.user_id, OLD.user_id);
  return null;
end;
$$;

revoke execute on function public.bump_plan_version() from public, anon, authenticated;

drop trigger if exists trg_workout_plans_plan_version on public.workout_plans;
create trigger trg_workout_plans_plan_version
  after insert or update or delete on public.workout_plans
  for each row execute function public.bump_plan_version();

drop trigger if exists trg_workout_profile_plan_version on public.workout_profile;
create trigger trg_workout_profile_plan_version
  after insert or update or delete on public.workout_profile
  for each row execute function public.bump_plan_version();

create or replace function public.bump_profile_version()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_counters text[] :=
    array['history_version', 'log_version', 'plan_version', 'profile_version'];
begin
  if (to_jsonb(NEW) - v_counters) is distinct from (to_jsonb(OLD) - v_counters) then
    NEW.profile_version := OLD.profile_version + 1;
  end if;
  return NEW;
end;
$$;

revoke execute on function public.bump_profile_version() from public, anon, authenticated;

drop trigger if exists trg_user_profiles_profile_version on public.user_profiles;
create trigger trg_user_profiles_profile_version
  before update on public.user_profiles
  for each row execute function public.bump_profile_version();
