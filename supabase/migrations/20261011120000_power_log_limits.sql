-- Limit for the voice "Whole Day (Power Log)": 2 per user per local day.
--
-- serverVoiceGeminiParse calls claim_power_log(day) before asking the model
-- and, if the model fails, release_power_log() (service role only) so a failed
-- attempt never uses up a turn. Same shape as ai_plan_limits.

create table if not exists public.power_log_uses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now()
);

create index if not exists power_log_uses_user_day_idx
  on public.power_log_uses (user_id, day);

alter table public.power_log_uses enable row level security;

drop policy if exists "power_log_uses_select_own" on public.power_log_uses;
create policy "power_log_uses_select_own" on public.power_log_uses
  for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.power_log_uses from anon, authenticated;

-- Turns left today (0-2). The client sends its local date; one more than a
-- day from the server's is refused, so the limit cannot be dodged by naming
-- another day.
create or replace function public.power_logs_left(p_day date)
returns int
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if abs(p_day - (now() at time zone 'utc')::date) > 1 then
    raise exception 'bad day' using errcode = '22023';
  end if;
  return greatest(0, 2 - (select count(*) from public.power_log_uses
                           where user_id = uid and day = p_day)::int);
end;
$$;

-- Take one turn. Returns its id, or null when none is left.
create or replace function public.claim_power_log(p_day date)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  -- One at a time per user, so two tabs cannot both pass the check.
  perform pg_advisory_xact_lock(hashtext('power_log:' || uid::text));
  if public.power_logs_left(p_day) <= 0 then
    return null;
  end if;
  insert into public.power_log_uses (user_id, day) values (uid, p_day)
    returning id into new_id;
  return new_id;
end;
$$;

-- Give a turn back after the model failed. Service role only, recent rows only.
create or replace function public.release_power_log(p_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.power_log_uses
   where id = p_id and created_at > now() - interval '5 minutes';
$$;

revoke execute on function public.power_logs_left(date) from public, anon;
revoke execute on function public.claim_power_log(date) from public, anon;
revoke execute on function public.release_power_log(uuid) from public, anon, authenticated;
grant execute on function public.power_logs_left(date) to authenticated;
grant execute on function public.claim_power_log(date) to authenticated;
grant execute on function public.release_power_log(uuid) to service_role;
