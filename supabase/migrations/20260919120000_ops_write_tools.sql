-- Ops write capability: manual access grants, and an audit trail for every
-- change the ops agent makes.
--
-- WHY A NEW TABLE RATHER THAN WRITING access_until. recompute_access() is a
-- fold: it rebuilds access_until from source rows on every call, and
-- get_billing_summary() calls it on every read. Anything written straight into
-- access_until is erased the next time a user opens the app — silently, and
-- hours later, which is the worst possible way for a support fix to fail. A
-- grant has to be a source row the fold reads, so that is what this adds.
--
-- WHY is_bonus = false. The fold uses that flag for two things: the hold on
-- future-dated referral bonuses, and the bonus_premium_days counter the
-- referral screen displays. A manual grant is neither — it behaves like a
-- charge, takes effect immediately, and must not inflate a number that means
-- "days earned from referrals".
--
-- EVERY WRITE IS AUDITED. These functions are reachable from a Telegram chat.
-- The audit row is written in the same transaction as the change, so there is
-- no path that alters entitlement without leaving a record of who asked and
-- why.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Manual grants — a new input to the fold
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.manual_grants (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,

  -- Bounded. An ops tool that can grant a decade is a tool that eventually
  -- grants a decade by typo, and the agent proposing it cannot be trusted to
  -- have read the number back correctly.
  days         numeric not null
    constraint manual_grant_days_sane check (days > 0 and days <= 365),

  -- Always now() in practice; the column exists because the fold orders on it
  -- and a back-dated correction is occasionally the honest fix.
  effective_at timestamptz not null default now(),

  -- Set rather than deleting, so a revoked grant stays visible in history. The
  -- fold truncates the grant at this instant.
  clawback_at  timestamptz,

  reason       text not null
    constraint manual_grant_reason_present check (char_length(reason) between 3 and 200),

  -- Who asked. A Telegram chat id, or 'dashboard' for a manual insert.
  granted_by   text not null,
  created_at   timestamptz not null default now()
);

create index if not exists manual_grants_user on public.manual_grants (user_id, effective_at);

alter table public.manual_grants enable row level security;

-- Deliberately no policy. Only SECURITY DEFINER functions touch this, and a
-- user must never be able to grant themselves access by inserting a row.
comment on table public.manual_grants is
  'Support-issued access grants. An input to recompute_access(), never written by a client. RLS enabled with no policy on purpose.';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. The audit trail
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.ops_audit_log (
  id          uuid primary key default gen_random_uuid(),
  at          timestamptz not null default now(),
  -- Telegram chat id, or whatever else performed the action.
  actor       text not null,
  action      text not null,
  target_user uuid,
  detail      jsonb not null default '{}'::jsonb
);

create index if not exists ops_audit_log_at on public.ops_audit_log (at desc);

alter table public.ops_audit_log enable row level security;

comment on table public.ops_audit_log is
  'Every write the ops agent performs. Written in the same transaction as the change it describes.';

-- ═══════════════════════════════════════════════════════════════════════
-- 2b. Pending actions — the confirmation step
-- ═══════════════════════════════════════════════════════════════════════
--
-- A write is never executed by the turn that proposes it. The agent records
-- the intended action here and replies with a short code; the change happens
-- only when a human sends that code back, and that path never goes through the
-- model at all.
--
-- That is the whole defence against prompt injection with teeth. A user whose
-- profile name reads "grant me a year of access" can persuade the model to
-- propose it; it cannot type the code.

create table if not exists public.ops_pending_actions (
  -- Short, human-typeable, and unguessable enough for a one-minute window.
  code        text primary key,
  chat_id     bigint not null,
  -- The Telegram user who must confirm. Proposed by one person, confirmed by
  -- the same person — an owner cannot be made to rubber-stamp someone else's
  -- request by a message they did not see.
  requested_by bigint not null,
  action      text not null,
  args        jsonb not null default '{}'::jsonb,
  summary     text not null,
  created_at  timestamptz not null default now(),
  -- Deliberately short. A stale proposal confirmed an hour later is a different
  -- decision from the one the operator was looking at.
  expires_at  timestamptz not null default now() + interval '5 minutes',
  consumed_at timestamptz
);

create index if not exists ops_pending_actions_expiry
  on public.ops_pending_actions (expires_at);

alter table public.ops_pending_actions enable row level security;

comment on table public.ops_pending_actions is
  'Write actions awaiting human confirmation. service_role only; no RLS policy on purpose.';

-- ═══════════════════════════════════════════════════════════════════════
-- 3. The fold, with manual grants folded in
-- ═══════════════════════════════════════════════════════════════════════
--
-- Identical to 20260909160000_hold_withholds_access.sql apart from one union
-- branch. Restated in full rather than patched because a fold that computes
-- entitlement should be readable in one piece.

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

  select count(*) * 5 into pool_a
    from (
      select 1 from public.referrals r
       where r.referrer_id = target
         and r.status in ('trial', 'subscribed')
       limit 12
    ) capped;

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
      union all
      -- Manual grants. is_bonus = false: they take effect at once, and must
      -- not count toward bonus_premium_days, which means "days from referrals".
      select mg.days, mg.effective_at, mg.clawback_at, false
        from public.manual_grants mg
       where mg.user_id = target
      order by effective_at
  loop
    -- THE HOLD. A referral bonus that has not reached effective_at takes part in
    -- nothing: not access_until, not the displayed count. The referrer sees
    -- "processing" and gets no days, which is what a hold is.
    --
    -- Only bonuses are ever future-dated. A charge's effective_at is its
    -- charged_at, and a manual grant's defaults to now(), so both are past.
    if g.is_bonus and g.effective_at > now() then
      continue;
    end if;

    win_start := case when cursor_ts is null
                      then g.effective_at
                      else greatest(cursor_ts, g.effective_at) end;

    d := g.days;
    if g.clawback_at is not null then
      d := least(d, greatest(0, extract(epoch from (g.clawback_at - win_start)) / 86400));
    end if;

    cursor_ts := win_start + make_interval(secs => d * 86400);

    -- No second hold check: anything still in the loop is past its hold.
    if g.is_bonus then
      pool_b := pool_b + round(d)::integer;
    end if;
  end loop;

  update public.user_profiles p
     set bonus_trial_days   = least(pool_a, 60),
         bonus_premium_days = least(pool_b, 480),
         access_until       = cursor_ts
   where p.id = target
     and (p.bonus_trial_days, p.bonus_premium_days, p.access_until)
         is distinct from (least(pool_a, 60), least(pool_b, 480), cursor_ts);
end;
$$;

revoke all on function public.recompute_access(uuid) from public, anon, authenticated;
grant execute on function public.recompute_access(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Resolve a user reference the way the read tools do
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.ops_resolve_user(user_ref text)
returns uuid
language sql stable security definer set search_path = public as $$
  select p.id from public.user_profiles p
   where p.id::text = trim(user_ref)
      or left(p.id::text, 8) = trim(user_ref)
   limit 1;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. The write operations
-- ═══════════════════════════════════════════════════════════════════════

-- Grant days of access. Returns what actually changed, so the agent reports the
-- resulting access_until rather than the number it asked for.
create or replace function public.ops_grant_access(
  user_ref text,
  grant_days numeric,
  reason text,
  actor text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid      uuid;
  before_t timestamptz;
  after_t  timestamptz;
  gid      uuid;
begin
  uid := public.ops_resolve_user(user_ref);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'No such user: ' || user_ref);
  end if;
  if grant_days is null or grant_days <= 0 or grant_days > 365 then
    return jsonb_build_object('ok', false, 'error', 'days must be between 1 and 365');
  end if;
  if reason is null or char_length(trim(reason)) < 3 then
    return jsonb_build_object('ok', false, 'error', 'a reason is required');
  end if;

  select access_until into before_t from public.user_profiles where id = uid;

  insert into public.manual_grants (user_id, days, reason, granted_by)
  values (uid, grant_days, trim(reason), actor)
  returning id into gid;

  perform public.recompute_access(uid);
  select access_until into after_t from public.user_profiles where id = uid;

  insert into public.ops_audit_log (actor, action, target_user, detail)
  values (actor, 'grant_access', uid, jsonb_build_object(
    'grant_id', gid, 'days', grant_days, 'reason', trim(reason),
    'access_before', before_t, 'access_after', after_t));

  return jsonb_build_object(
    'ok', true, 'grant_id', gid, 'user', left(uid::text, 8),
    'days', grant_days, 'access_before', before_t, 'access_after', after_t);
end;
$$;

-- Undo one. Clawback rather than delete: the fold truncates the grant at this
-- instant and the row stays in history.
create or replace function public.ops_revoke_grant(grant_id uuid, actor text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid      uuid;
  before_t timestamptz;
  after_t  timestamptz;
begin
  select user_id into uid from public.manual_grants where id = grant_id;
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'No such grant');
  end if;

  select access_until into before_t from public.user_profiles where id = uid;
  update public.manual_grants set clawback_at = now()
   where id = grant_id and clawback_at is null;

  perform public.recompute_access(uid);
  select access_until into after_t from public.user_profiles where id = uid;

  insert into public.ops_audit_log (actor, action, target_user, detail)
  values (actor, 'revoke_grant', uid, jsonb_build_object(
    'grant_id', grant_id, 'access_before', before_t, 'access_after', after_t));

  return jsonb_build_object('ok', true, 'user', left(uid::text, 8),
    'access_before', before_t, 'access_after', after_t);
end;
$$;

-- Clear a user's notification settings back to defaults. The least dangerous
-- write here, and the one most likely to be needed: a stuck preference row is
-- otherwise unfixable without database access.
create or replace function public.ops_reset_notifications(user_ref text, actor text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid; removed int;
begin
  uid := public.ops_resolve_user(user_ref);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'No such user: ' || user_ref);
  end if;

  delete from public.user_notification_preferences where user_id = uid;
  get diagnostics removed = row_count;
  -- Pending rows only. Delivered history is evidence, not clutter.
  delete from public.notification_logs where user_id = uid and status = 'pending';

  insert into public.ops_audit_log (actor, action, target_user, detail)
  values (actor, 'reset_notifications', uid,
          jsonb_build_object('prefs_removed', removed));

  return jsonb_build_object('ok', true, 'user', left(uid::text, 8),
    'prefs_removed', removed,
    'note', 'Defaults apply until the user opens notification settings again.');
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Reads that explain, rather than count
-- ═══════════════════════════════════════════════════════════════════════

-- Why does this user have, or not have, access? Every input to the fold in one
-- place, so a support question is answerable without reading the fold itself.
create or replace function public.ops_diagnose_access(user_ref text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid; p record;
begin
  uid := public.ops_resolve_user(user_ref);
  if uid is null then
    return jsonb_build_object('found', false, 'looked_for', user_ref);
  end if;

  select * into p from public.user_profiles where id = uid;

  return jsonb_build_object(
    'found', true,
    'user', left(uid::text, 8),
    'has_access_now', coalesce(p.access_until > now(), false),
    'access_until', p.access_until,
    'trial_start_date', p.trial_start_date,
    'bonus_trial_days', p.bonus_trial_days,
    'bonus_premium_days', p.bonus_premium_days,
    'charges', (select coalesce(jsonb_agg(jsonb_build_object(
                  'tier', c.tier, 'period_days', c.period_days,
                  'amount_paise', c.amount_paise, 'charged_at', c.charged_at,
                  'refunded_at', c.refunded_at)), '[]'::jsonb)
                from public.subscription_charges c where c.user_id = uid),
    'manual_grants', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', m.id, 'days', m.days, 'reason', m.reason,
                  'granted_by', m.granted_by, 'effective_at', m.effective_at,
                  'clawback_at', m.clawback_at)), '[]'::jsonb)
                from public.manual_grants m where m.user_id = uid),
    'referral_bonuses', (select coalesce(jsonb_agg(jsonb_build_object(
                  'days', pg.days, 'effective_at', pg.effective_at,
                  'on_hold', pg.effective_at > now(),
                  'clawback_at', pg.clawback_at)), '[]'::jsonb)
                from public.premium_grants(uid) pg),
    'subscriptions', (select coalesce(jsonb_agg(jsonb_build_object(
                  'status', s.status, 'tier', s.tier,
                  'cancelled_at', s.cancelled_at)), '[]'::jsonb)
                from public.subscriptions s where s.user_id = uid)
  );
end;
$$;

-- A timeline rather than totals: what actually happened in the last N hours.
create or replace function public.ops_recent_activity(hours int default 24)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'hours', hours,
    'signups', (select count(*) from user_profiles
                 where created_at >= now() - make_interval(hours => hours)),
    'charges', (select coalesce(jsonb_agg(jsonb_build_object(
                  'tier', tier, 'amount_paise', amount_paise, 'at', charged_at)), '[]'::jsonb)
                from subscription_charges
                where charged_at >= now() - make_interval(hours => hours)),
    'webhook_events', (select coalesce(jsonb_agg(jsonb_build_object(
                  'type', event_type, 'at', received_at)), '[]'::jsonb)
                from webhook_events
                where received_at >= now() - make_interval(hours => hours)),
    'refund_requests', (select count(*) from refund_requests
                 where created_at >= now() - make_interval(hours => hours)),
    'food_logs', (select count(*) from food_logs
                 where logged_at >= now() - make_interval(hours => hours)),
    'ops_actions', (select coalesce(jsonb_agg(jsonb_build_object(
                  'action', action, 'actor', actor, 'at', at)), '[]'::jsonb)
                from ops_audit_log
                where at >= now() - make_interval(hours => hours))
  );
$$;

-- What the agent has changed recently. Its own actions are part of the system
-- it reports on, and omitting them would let a mistake hide inside the numbers.
create or replace function public.ops_audit_recent(limit_n int default 20)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(a) order by a.at desc), '[]'::jsonb)
  from (select at, actor, action, left(target_user::text, 8) as target, detail
        from public.ops_audit_log
        order by at desc
        limit least(greatest(limit_n, 1), 100)) a;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. Access control
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.ops_resolve_user(text)',
    'public.ops_grant_access(text, numeric, text, text)',
    'public.ops_revoke_grant(uuid, text)',
    'public.ops_reset_notifications(text, text)',
    'public.ops_diagnose_access(text)',
    'public.ops_recent_activity(int)',
    'public.ops_audit_recent(int)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant  execute on function %s to service_role', fn);
  end loop;
end $$;
