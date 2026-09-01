-- Billing lockdown — closes two live abuse holes and lays the entitlement schema.
--
-- Hole 1: plans.tsx and profile.tsx both UPDATE {selected_plan, trial_start_date}
--         directly, with no check whether a trial already ran. Clicking "start
--         trial" after expiry granted a fresh trial, forever, through normal UI.
--         Fixed by start_trial(), which writes trial_start_date once and never
--         again, and by removing the client's grant on the column.
-- Hole 2: the UPDATE policy on user_profiles is row-scoped but column-blind, and
--         a *table-level* UPDATE grant to anon and authenticated cascaded to all
--         33 columns. update({bonus_trial_days: 30000}) succeeded. Fixed by the
--         column allowlist below.
--
-- Entitlement is one absolute timestamp, user_profiles.access_until, produced by
-- an ordered fold over grant events (recompute_access). The two bonus_* columns
-- are display scalars only; nothing gates on them, so a bug in either cannot
-- grant access. Every recompute rebuilds the whole timeline from source rows —
-- never `x = x + n` — which is the same anti-drift rule recompute_bonus_trial_days
-- already follows.
--
-- Every function here follows "explicit revoke from public, anon, authenticated,
-- then grant to exactly one role". Postgres grants EXECUTE to PUBLIC by default,
-- so a new SECURITY DEFINER function in `public` is a public REST endpoint the
-- moment it is created.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Column allowlist on user_profiles  (hole 2)
-- ═══════════════════════════════════════════════════════════════════════

-- REVOKE UPDATE (col) is a no-op while a table-level UPDATE grant exists, so the
-- table privilege has to go first and an explicit column list be granted back.
-- anon gets nothing at all: RLS already blocked it, but a role that can never
-- write should not hold the privilege.
revoke insert, update on table public.user_profiles from anon, authenticated;

-- The verified union of every client write site in src/: FriendsPanel.tsx:142,
-- lib/meals.ts:77, lib/water.ts:77, dashboard.tsx:202/346/384, profile.tsx:432,
-- weight.tsx:226/330, refer-intro.tsx:128, welcome.tsx:131.
grant update (
  full_name, username, age, gender, height_cm, weight_kg, goal, goal_weight_kg,
  activity_level, bmi, bmr, tdee, daily_calorie_target, protein_target_g,
  carbs_target_g, fat_target_g, fiber_target_g, current_streak, meal_frequency,
  meal_names, water_goal_ml, water_cup_ml, has_seen_benefits_features_page,
  has_seen_refer_intro
) on table public.user_profiles to authenticated;

-- Exactly the quiz.tsx:209 upsert payload. Because upsert falls back to UPDATE,
-- every non-id column here also appears in the UPDATE list above, or signup
-- breaks for a returning user. referral_code is not null with no default but is
-- filled by trg_set_referral_code BEFORE INSERT, so the client needs no grant on
-- it; created_at defaults to now(). Both stay off both lists.
grant insert (
  id, full_name, age, gender, height_cm, weight_kg, activity_level, goal,
  bmi, bmr, tdee, daily_calorie_target, protein_target_g, carbs_target_g,
  fat_target_g, fiber_target_g
) on table public.user_profiles to authenticated;

-- Now unwritable by any client: trial_start_date, selected_plan,
-- bonus_trial_days, bonus_premium_days, access_until, referral_code, created_at,
-- and the three dead columns whatsapp_no, supplements_used and longest_streak,
-- which no line of src/ references.
--
-- Caveat found in testing: `id` is deliberately absent from the UPDATE list
-- above, but PostgREST's .upsert() emits `on conflict (id) do update set
-- id = excluded.id, ...` and therefore needs it. 20260901133000 grants it back;
-- the UPDATE policy's with_check (auth.uid() = id) means the only value a
-- client can write there is the one already present.

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Entitlement columns
-- ═══════════════════════════════════════════════════════════════════════

alter table public.user_profiles
  add column bonus_premium_days smallint not null default 0,
  add column access_until timestamptz;

comment on column public.user_profiles.bonus_premium_days is
  'Premium days earned from friends who bought the 12-month plan, capped at 480 lifetime. Display only — derived by recompute_access(); nothing gates on it.';
comment on column public.user_profiles.access_until is
  'The single value every entitlement check reads. Absolute, so a stale, missing or null row fails closed. Derived by recompute_access(); never written by the client.';

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Close the previously-unapplied revokes, and lock the internal helpers
-- ═══════════════════════════════════════════════════════════════════════

-- 20260826120000_referrals_revoke_internal.sql exists on disk but was never
-- applied to this project — the live ACLs still carry authenticated=X on all
-- five helpers, and the advisors flag them. Its statements are folded in here so
-- the lockdown is true rather than merely documented. Safe for both triggers:
-- Postgres does not check EXECUTE when firing a trigger function.
revoke execute on function
  public.referral_code_prefix(text),
  public.generate_referral_code(text),
  public.set_referral_code(),
  public.qualify_referral()
from public, anon, authenticated;

-- recompute_bonus_trial_days(uuid) is SECURITY DEFINER and takes the target as a
-- parameter, so before this it was an arbitrary-row write primitive callable by
-- any signed-in user against any other user's id. It recomputes from source rows
-- so it could not inflate a total, but there is no reason for a client to reach
-- it — including against their own id, which would otherwise be a self-service
-- path to re-run crediting on demand.
revoke execute on function public.recompute_bonus_trial_days(uuid)
  from public, anon, authenticated;
grant  execute on function public.recompute_bonus_trial_days(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Subscription and charge tables
-- ═══════════════════════════════════════════════════════════════════════
--
-- All four follow the pattern public.referrals already uses: RLS on, a
-- SELECT-only owner policy, and deliberately no INSERT/UPDATE/DELETE policy at
-- all. Every write goes through a SECURITY DEFINER function. Policies use
-- (select auth.uid()) rather than a bare auth.uid() so they do not add to the
-- auth_rls_initplan advisor findings the older tables already carry.

create table public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  -- The seam for Play Billing and Apple IAP: a teammate's integration slots into
  -- the same timeline by writing rows with a different provider, no schema change.
  provider                 text not null default 'razorpay'
                           check (provider in ('razorpay', 'google_play', 'apple')),
  provider_subscription_id text not null,
  tier                     text not null check (tier in ('monthly', 'quarterly', 'yearly')),
  status                   text not null default 'created'
                           check (status in ('created', 'authenticated', 'active', 'pending',
                                             'halted', 'cancelled', 'completed', 'expired')),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  cancelled_at             timestamptz,
  unique (provider, provider_subscription_id)
);

create index subscriptions_user_idx on public.subscriptions (user_id);

-- A user cannot hold five overlapping paid periods from five checkouts.
create unique index subscriptions_one_live_per_user
  on public.subscriptions (user_id)
  where status in ('authenticated', 'active', 'pending', 'halted');

create table public.subscription_charges (
  id                  uuid primary key default gen_random_uuid(),
  subscription_id     uuid not null references public.subscriptions(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  -- The second, independent idempotency guard. Webhook dedupe by event id stops
  -- a replay of the same delivery; this stops the same payment arriving under a
  -- fresh event id from granting a second period.
  provider_payment_id text not null unique,
  amount_paise        integer not null check (amount_paise >= 0),
  tier                text not null check (tier in ('monthly', 'quarterly', 'yearly')),
  -- Clamped at the trust boundary. An unclamped value from a webhook body is an
  -- unbounded grant.
  period_days         integer not null check (period_days between 1 and 400),
  charged_at          timestamptz not null default now(),
  refunded_at         timestamptz,
  created_at          timestamptz not null default now()
);

create index subscription_charges_sub_idx on public.subscription_charges (subscription_id);
create index subscription_charges_user_idx on public.subscription_charges (user_id, charged_at);

-- RLS on with zero policies: unreachable by anon and authenticated in every
-- direction. Only the service role touches it. Stores no payload — the Razorpay
-- body carries the customer's email and contact and must not land in a table.
create table public.webhook_events (
  id          uuid primary key default gen_random_uuid(),
  provider    text not null default 'razorpay',
  event_id    text not null,
  event_type  text not null,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);

create table public.refund_requests (
  id          uuid primary key default gen_random_uuid(),
  charge_id   uuid not null references public.subscription_charges(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  reason      text not null,
  status      text not null default 'open'
              check (status in ('open', 'approved', 'rejected', 'processed')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index refund_requests_user_idx on public.refund_requests (user_id);
create index refund_requests_charge_idx on public.refund_requests (charge_id);

-- One open request per charge; resolved ones may accumulate.
create unique index refund_requests_one_open_per_charge
  on public.refund_requests (charge_id)
  where status = 'open';

alter table public.subscriptions        enable row level security;
alter table public.subscription_charges enable row level security;
alter table public.webhook_events       enable row level security;
alter table public.refund_requests      enable row level security;

create policy "Users read own subscriptions"
  on public.subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read own charges"
  on public.subscription_charges for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read own refund requests"
  on public.refund_requests for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- webhook_events gets no policy at all.

revoke all on table public.subscriptions        from anon, authenticated;
revoke all on table public.subscription_charges from anon, authenticated;
revoke all on table public.webhook_events       from anon, authenticated;
revoke all on table public.refund_requests      from anon, authenticated;

grant select on table public.subscriptions        to authenticated;
grant select on table public.subscription_charges to authenticated;
grant select on table public.refund_requests      to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Premium grants — the paid referral reward
-- ═══════════════════════════════════════════════════════════════════════
--
-- One definition consumed by both the fold and the UI, so the progress bar and
-- access_until can never disagree.
--
--   distinct on (r.id)  — 60 days per *friend who buys yearly*, once. A renewal
--                         charge from the same friend must not mint a second grant.
--   effective_at        — charged_at + 3 days. The refund window is 2 days, so a
--                         grant with a future effective_at contributes zero to the
--                         fold and the credit simply has not landed yet. No cron
--                         and no state to flip: the hold "fires" on the referrer's
--                         next entitlement read.
--   clawback_at         — one instant covering refund, cancellation, and an open
--                         in-app refund request. Filed during the hold it precedes
--                         the window start, so the grant is worth zero days and
--                         the credit never lands; filed later, only the unused
--                         remainder goes.
--   limit 8             — the 480-day lifetime cap, expressed as rows.
create or replace function public.premium_grants(target uuid)
returns table (days integer, effective_at timestamptz, clawback_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select 60,
         first_charge.charged_at + interval '3 day',
         least(first_charge.refunded_at, s.cancelled_at, open_req.created_at)
  from (
    select distinct on (r.id) r.id as referral_id, c.*
    from public.referrals r
    join public.subscription_charges c
      on c.user_id = r.referee_id and c.tier = 'yearly'
    where r.referrer_id = target
    order by r.id, c.charged_at
  ) first_charge
  join public.subscriptions s on s.id = first_charge.subscription_id
  left join lateral (
    select min(x.created_at) as created_at
    from public.refund_requests x
    where x.charge_id = first_charge.id and x.status = 'open'
  ) open_req on true
  order by 2
  limit 8;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. recompute_access — the ordered fold
-- ═══════════════════════════════════════════════════════════════════════
--
--   cursor := trial_start + BASE_TRIAL_DAYS + pool A
--   for each grant ordered by effective_at:
--       window_start := greatest(cursor, grant.effective_at)
--       cursor       := window_start + grant.days
--   access_until := cursor
--
-- greatest(cursor, effective_at) *is* the queueing rule: paying with trial days
-- left starts the paid period at trial end rather than burning both in parallel;
-- paying after a lapse starts at charged_at and honours the full period; a
-- premium bonus during a live subscription is appended after it ends.
--
-- BASE_TRIAL_DAYS is mirrored by src/lib/trial.ts. This is the authority — the
-- TypeScript copy only lets the UI show a number. A mismatch shows the user one
-- figure and gates on another.
create or replace function public.recompute_access(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  base_trial_days constant integer := 7;
  trial_start     date;
  cursor_ts       timestamptz;
  win_start       timestamptz;
  g               record;
  d               numeric;
  pool_a          integer;
  pool_b          integer := 0;
begin
  select p.trial_start_date into trial_start
    from public.user_profiles p where p.id = target;
  if not found then
    return;
  end if;

  -- Pool A: 5 trial days per qualified referral. Capped by row count (12 x 5 =
  -- 60) rather than by capping a sum, so the timeline stays honest.
  select count(*) * 5 into pool_a
    from (
      select 1 from public.referrals r
       where r.referrer_id = target
         and r.status in ('trial', 'subscribed')
       limit 12
    ) capped;

  -- Null until a trial starts. A user who pays without ever starting one folds
  -- from their first grant's effective_at instead.
  if trial_start is null then
    cursor_ts := null;
  else
    cursor_ts := (trial_start::timestamp at time zone 'Asia/Kolkata')
                 + make_interval(days => base_trial_days + pool_a);
  end if;

  for g in
      select c.period_days::numeric as days,
             c.charged_at           as effective_at,
             c.refunded_at          as clawback_at,
             false                  as is_bonus
        from public.subscription_charges c
       where c.user_id = target
      union all
      select pg.days::numeric, pg.effective_at, pg.clawback_at, true
        from public.premium_grants(target) pg
      order by effective_at
  loop
    win_start := case when cursor_ts is null
                      then g.effective_at
                      else greatest(cursor_ts, g.effective_at) end;

    d := g.days;
    if g.clawback_at is not null then
      -- Keep the portion already lived through, revoke only the unused
      -- remainder. A clawback can never push access_until behind consumed days.
      d := least(d, greatest(0, extract(epoch from (g.clawback_at - win_start)) / 86400));
    end if;

    cursor_ts := win_start + make_interval(secs => d * 86400);
    if g.is_bonus then
      pool_b := pool_b + round(d)::integer;
    end if;
  end loop;

  update public.user_profiles p
     set bonus_trial_days   = least(pool_a, 60),
         bonus_premium_days = least(pool_b, 480),
         access_until       = cursor_ts
   where p.id = target;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. start_trial  (hole 1)
-- ═══════════════════════════════════════════════════════════════════════
--
-- coalesce(p.trial_start_date, ...) is the whole fix: write-once. A later plan
-- change still re-points selected_plan but can never re-arm the trial. Living in
-- one function guards both existing call sites and any future one — the same
-- reasoning qualify_referral() used.
--
-- The date is pinned to Asia/Kolkata because Supabase's current_date is UTC,
-- which silently costs an IST user a day before 05:30.
create or replace function public.start_trial(plan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Unauthorized';
  end if;

  if plan is null or plan not in ('monthly', 'quarterly', 'yearly') then
    raise exception 'Unknown plan %', plan;
  end if;

  update public.user_profiles p
     set selected_plan    = plan,
         trial_start_date = coalesce(p.trial_start_date,
                                     (now() at time zone 'Asia/Kolkata')::date)
   where p.id = caller;

  perform public.recompute_access(caller);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 8. qualify_referral now also refreshes the referrer's entitlement
-- ═══════════════════════════════════════════════════════════════════════
--
-- Replaced with create or replace rather than drop/create: same signature, and
-- no window in which the trigger function is missing.
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
    perform public.recompute_access(referrer);
  end if;

  return null;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 9. Grants — explicit revoke, then exactly one role
-- ═══════════════════════════════════════════════════════════════════════

revoke execute on function public.premium_grants(uuid) from public, anon, authenticated;
grant  execute on function public.premium_grants(uuid) to service_role;

revoke execute on function public.recompute_access(uuid) from public, anon, authenticated;
grant  execute on function public.recompute_access(uuid) to service_role;

-- start_trial takes no user id: its subject is auth.uid(), so there is nothing
-- to attack by parameter.
revoke execute on function public.start_trial(text) from public, anon, authenticated;
grant  execute on function public.start_trial(text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 10. Backfill
-- ═══════════════════════════════════════════════════════════════════════
--
-- No charges and no referrals exist yet, so this only lights up access_until for
-- the trials already running. Cheap at 22 rows and it means nothing is left with
-- a null access_until that would read as lapsed on the next load.
do $$
declare r record;
begin
  for r in select id from public.user_profiles loop
    perform public.recompute_access(r.id);
  end loop;
end;
$$;
