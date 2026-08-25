-- Refer & Earn — permanent referral codes, attribution, and free-trial crediting.
--
-- Two tracks:
--   Free — a qualified referral (the friend signs up AND starts a trial) gives
--          the referrer +5 trial days. Accrual stops at 60 days, i.e. at the
--          12th qualified referral; referring itself is never capped.
--   Paid — a referred friend buying the 12-month plan gives the referrer 60
--          premium days. Nothing sets status 'subscribed' yet because no
--          payment flow exists; when one ships, a single UPDATE in its webhook
--          lights up the whole paid track with no other change.
--
-- Everything here is plain Postgres called through supabase.rpc() — no edge
-- functions. Each SECURITY DEFINER function pins search_path and is revoked
-- from anon, following SECURITY_AUDIT_2026-08-19.md (H-1, H-2).

-- ═══════════════════════════════════════════════════════════════════════
-- 1. The permanent invite code
-- ═══════════════════════════════════════════════════════════════════════

alter table public.user_profiles
  add column referral_code text unique,
  add column bonus_trial_days smallint not null default 0;

comment on column public.user_profiles.referral_code is
  'Permanent invite ID, e.g. RAH38291. Assigned once on insert and never rotated — a later name change must not invalidate a code the user has already shared.';
comment on column public.user_profiles.bonus_trial_days is
  'Trial days earned from qualified referrals. Derived by recompute_bonus_trial_days(); never written by the client.';

-- "Rahul Sharma" -> RAH, "Jo" -> JOX, "" or a non-Latin name -> DBZ.
-- Mirrored in TypeScript by codePrefix() in src/lib/referral.ts; this is the
-- authority, that copy only lets the UI preview and validate.
create or replace function public.referral_code_prefix(full_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select case when p = 'XXX' then 'DBZ' else p end
  from (
    select rpad(
      left(upper(regexp_replace(coalesce(full_name, ''), '[^A-Za-z]', '', 'g')), 3),
      3, 'X'
    ) as p
  ) t;
$$;

create or replace function public.generate_referral_code(full_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  prefix    text := public.referral_code_prefix(full_name);
  candidate text;
  attempts  int := 0;
begin
  loop
    candidate := prefix || lpad(floor(random() * 100000)::int::text, 5, '0');
    exit when not exists (
      select 1 from public.user_profiles where referral_code = candidate
    );
    attempts := attempts + 1;
    -- 100k slots per prefix; 50 collisions means something is badly wrong, and
    -- failing loudly beats spinning forever inside a signup transaction.
    if attempts > 50 then
      raise exception 'Could not allocate a referral code for prefix %', prefix;
    end if;
  end loop;
  return candidate;
end;
$$;

-- BEFORE INSERT only, and only when null: that is what makes the code permanent.
create or replace function public.set_referral_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.referral_code is null then
    new.referral_code := public.generate_referral_code(new.full_name);
  end if;
  return new;
end;
$$;

create trigger trg_set_referral_code
  before insert on public.user_profiles
  for each row execute function public.set_referral_code();

-- Backfill everyone who signed up before this migration.
do $$
declare r record;
begin
  for r in select id, full_name from public.user_profiles where referral_code is null
  loop
    update public.user_profiles
      set referral_code = public.generate_referral_code(r.full_name)
      where id = r.id;
  end loop;
end;
$$;

-- Safe now that the trigger fills it on every insert and the backfill is done.
alter table public.user_profiles alter column referral_code set not null;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. The referrals table
-- ═══════════════════════════════════════════════════════════════════════

create table public.referrals (
  id            uuid primary key default gen_random_uuid(),
  referrer_id   uuid not null references auth.users(id) on delete cascade,
  -- One referral per referred user, enforced by the database. This is what
  -- makes double-crediting impossible and why no reward ledger table is needed.
  referee_id    uuid not null unique references auth.users(id) on delete cascade,
  code_used     text not null,
  status        text not null default 'pending'
                check (status in ('pending', 'trial', 'subscribed')),
  created_at    timestamptz not null default now(),
  qualified_at  timestamptz,
  subscribed_at timestamptz,
  constraint no_self_referral check (referrer_id <> referee_id)
);

create index referrals_referrer_status_idx
  on public.referrals (referrer_id, status);

alter table public.referrals enable row level security;

-- Read-only for both sides. There is deliberately no INSERT/UPDATE/DELETE
-- policy: every write goes through the SECURITY DEFINER functions below, which
-- is where the self-referral and re-claim guards live.
create policy "Users read own referrals"
  on public.referrals
  for select
  using (auth.uid() = referrer_id or auth.uid() = referee_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Attribution — called once, at the end of signup
-- ═══════════════════════════════════════════════════════════════════════

-- Returns true only when a new referral row was created. A false is not an
-- error: an unknown code, a self-referral, or a second attempt all return
-- false, and the caller must never let that block account creation.
create or replace function public.claim_referral(code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller     uuid := auth.uid();
  owner      uuid;
  normalized text := upper(btrim(coalesce(code, '')));
begin
  if caller is null then
    raise exception 'Unauthorized';
  end if;

  if normalized !~ '^[A-Z]{3}[0-9]{5}$' then
    return false;
  end if;

  -- First claim wins; an existing attribution is never re-pointed.
  if exists (select 1 from public.referrals where referee_id = caller) then
    return false;
  end if;

  select id into owner from public.user_profiles where referral_code = normalized;
  if owner is null or owner = caller then
    return false;
  end if;

  insert into public.referrals (referrer_id, referee_id, code_used)
    values (owner, caller, normalized)
    on conflict (referee_id) do nothing;

  return found;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Crediting — derived, never accumulated
-- ═══════════════════════════════════════════════════════════════════════

-- The 5 and the 60 mirror DAYS_PER_REFERRAL and MAX_FREE_DAYS in
-- src/lib/referral.ts. Recomputing from scratch rather than incrementing means
-- the total can never drift, however the rows got there.
create or replace function public.recompute_bonus_trial_days(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_profiles p
    set bonus_trial_days = least(
      (
        select count(*)
        from public.referrals r
        where r.referrer_id = target
          and r.status in ('trial', 'subscribed')
      ) * 5,
      60
    )
    where p.id = target;
end;
$$;

-- A referral qualifies when the friend has finished onboarding (the profile row
-- exists) and actually started a trial. Living in a trigger rather than in the
-- two call sites that start trials (plans.tsx and profile.tsx) means both
-- paths — and any future one — credit correctly from a single guard.
create or replace function public.qualify_referral()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare referrer uuid;
begin
  update public.referrals
    set status = 'trial', qualified_at = now()
    where referee_id = new.id and status = 'pending'
    returning referrer_id into referrer;

  if referrer is not null then
    perform public.recompute_bonus_trial_days(referrer);
  end if;

  return null;
end;
$$;

create trigger trg_qualify_referral
  after update of trial_start_date on public.user_profiles
  for each row
  when (old.trial_start_date is null and new.trial_start_date is not null)
  execute function public.qualify_referral();

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Reads
-- ═══════════════════════════════════════════════════════════════════════

-- RLS on user_profiles is self-only, so a referrer cannot read a friend's name
-- directly. This is the narrow, audited hole that lets them see just their own
-- referrals.
create or replace function public.get_referral_summary()
returns table (
  referee_name  text,
  status        text,
  qualified_at  timestamptz,
  subscribed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  return query
    select p.full_name, r.status, r.qualified_at, r.subscribed_at
    from public.referrals r
    left join public.user_profiles p on p.id = r.referee_id
    where r.referrer_id = auth.uid()
    order by r.created_at desc;
end;
$$;

-- Powers the gift banner on the quiz. Must be callable by anon — the friend is
-- not signed in yet. Returns the first name and nothing else: a deliberate,
-- bounded disclosure, keyed on a code the referrer chose to hand out.
create or replace function public.get_referrer_name(code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text := upper(btrim(coalesce(code, '')));
  first_name text;
begin
  if normalized !~ '^[A-Z]{3}[0-9]{5}$' then
    return null;
  end if;

  select split_part(btrim(p.full_name), ' ', 1) into first_name
    from public.user_profiles p
    where p.referral_code = normalized;

  return nullif(first_name, '');
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Grants
-- ═══════════════════════════════════════════════════════════════════════

revoke execute on function public.referral_code_prefix(text) from anon, public;
revoke execute on function public.generate_referral_code(text) from anon, public;
revoke execute on function public.set_referral_code() from anon, public;
revoke execute on function public.recompute_bonus_trial_days(uuid) from anon, public;
revoke execute on function public.qualify_referral() from anon, public;

revoke execute on function public.claim_referral(text) from anon, public;
grant  execute on function public.claim_referral(text) to authenticated;

revoke execute on function public.get_referral_summary() from anon, public;
grant  execute on function public.get_referral_summary() to authenticated;

-- The only function anon may call, for the reason given above.
revoke execute on function public.get_referrer_name(text) from anon, public;
grant  execute on function public.get_referrer_name(text) to anon, authenticated;
