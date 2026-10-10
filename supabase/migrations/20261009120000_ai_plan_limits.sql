-- Limits for "Let AI Pick for You" workout plans.
--
--   paid  (access now AND a non-refunded charge): 2 per rolling 7 days and
--         4 per rolling 30 days
--   trial (access without a charge, incl. referral days): 2 in total, ever
--   lapsed: none (requireAccess already refuses the server call)
--
-- serverWorkoutPlan calls claim_ai_plan() before asking the model and, if the
-- model fails, release_ai_plan() (service role only) so a failed attempt never
-- uses up a turn.

create table if not exists public.ai_plan_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists ai_plan_generations_user_idx
  on public.ai_plan_generations (user_id, created_at desc);

alter table public.ai_plan_generations enable row level security;

drop policy if exists "ai_plan_generations_select_own" on public.ai_plan_generations;
create policy "ai_plan_generations_select_own" on public.ai_plan_generations
  for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.ai_plan_generations from anon, authenticated;

-- { paid, allowed, next }: next is when a turn frees up (null = not until
-- they pay, when a trial user has used both).
create or replace function public.ai_plan_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  paid boolean;
  week_n int;
  month_n int;
  next_at timestamptz;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select coalesce(p.access_until > now(), false)
         and exists (
           select 1 from public.subscription_charges c
            where c.user_id = uid and c.refunded_at is null
         )
    into paid
    from public.user_profiles p
   where p.id = uid;
  paid := coalesce(paid, false);

  if not paid then
    select count(*) into week_n from public.ai_plan_generations where user_id = uid;
    return jsonb_build_object('paid', false, 'allowed', week_n < 2, 'next', null);
  end if;

  select count(*) into week_n from public.ai_plan_generations
   where user_id = uid and created_at > now() - interval '7 days';
  select count(*) into month_n from public.ai_plan_generations
   where user_id = uid and created_at > now() - interval '30 days';

  -- When the window's oldest counted turn ages out.
  if week_n >= 2 then
    select created_at + interval '7 days' into next_at
      from public.ai_plan_generations
     where user_id = uid and created_at > now() - interval '7 days'
     order by created_at desc offset 1 limit 1;
  end if;
  if month_n >= 4 then
    select greatest(next_at, created_at + interval '30 days') into next_at
      from public.ai_plan_generations
     where user_id = uid and created_at > now() - interval '30 days'
     order by created_at desc offset 3 limit 1;
  end if;

  return jsonb_build_object('paid', true, 'allowed', next_at is null, 'next', next_at);
end;
$$;

-- Take one turn. Returns its id, or null when none is left.
create or replace function public.claim_ai_plan()
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
  perform pg_advisory_xact_lock(hashtext('ai_plan:' || uid::text));
  if not (public.ai_plan_status() ->> 'allowed')::boolean then
    return null;
  end if;
  insert into public.ai_plan_generations (user_id) values (uid) returning id into new_id;
  return new_id;
end;
$$;

-- Give a turn back after the model failed. Service role only, recent rows only.
create or replace function public.release_ai_plan(p_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.ai_plan_generations
   where id = p_id and created_at > now() - interval '5 minutes';
$$;

revoke execute on function public.ai_plan_status() from public, anon;
revoke execute on function public.claim_ai_plan() from public, anon;
revoke execute on function public.release_ai_plan(uuid) from public, anon, authenticated;
grant execute on function public.ai_plan_status() to authenticated;
grant execute on function public.claim_ai_plan() to authenticated;
grant execute on function public.release_ai_plan(uuid) to service_role;
