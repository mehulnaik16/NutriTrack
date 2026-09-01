-- Razorpay event handling, subscription registration, refunds, and the billing read.
--
-- The division of authority in this file is the whole security model:
--
--   register_subscription  — the client may create a *row*, and that grants nothing.
--   handle_razorpay_event  — only the service role may apply a *charge*, and a
--                            charge is the only thing that ever grants a day.
--   request_refund         — the client may ask, scoped to its own charge, and
--                            asking immediately freezes any pending referral credit.
--   get_billing_summary    — read-only, own rows, and it is where the 3-day hold
--                            "fires" because it recomputes before returning.
--
-- Every function gets an explicit revoke from public, anon and authenticated
-- followed by a grant to exactly one role. Postgres grants EXECUTE to PUBLIC by
-- default, so a new SECURITY DEFINER function in `public` is a public REST
-- endpoint the moment it is created.

-- ═══════════════════════════════════════════════════════════════════════
-- 0. recompute_access gains a no-op guard
-- ═══════════════════════════════════════════════════════════════════════
--
-- get_billing_summary() recomputes on every read, which is what makes the
-- cron-free 3-day hold work. Without a guard that would mean a row write on
-- every page load. The added WHERE turns an unchanged recompute into zero rows
-- touched. Same fold, same result — only the write is skipped.
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
      order by effective_at
  loop
    win_start := case when cursor_ts is null
                      then g.effective_at
                      else greatest(cursor_ts, g.effective_at) end;

    d := g.days;
    if g.clawback_at is not null then
      d := least(d, greatest(0, extract(epoch from (g.clawback_at - win_start)) / 86400));
    end if;

    cursor_ts := win_start + make_interval(secs => d * 86400);
    -- The display scalar counts only grants that have actually taken effect.
    -- A bonus still inside its 3-day hold contributes to neither access_until
    -- nor this number, which is what makes the referrer see "processing"
    -- rather than a credit that a refund could still take away.
    if g.is_bonus and g.effective_at <= now() then
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

-- ═══════════════════════════════════════════════════════════════════════
-- 1. register_subscription — the client's only write into the paid track
-- ═══════════════════════════════════════════════════════════════════════
--
-- Takes no user id: the subject is auth.uid(), so there is no parameter to
-- attack. Rows are born 'created', which the partial unique index deliberately
-- does not cover — an abandoned checkout must not block the next attempt. The
-- index bites once a subscription actually goes live.
--
-- Even called directly in a loop this cannot grant a single day, because only a
-- charge row does, and only the service role can write one.
create or replace function public.register_subscription(
  p_provider_subscription_id text,
  p_tier text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  new_id uuid;
begin
  if caller is null then
    raise exception 'Unauthorized';
  end if;
  if p_tier is null or p_tier not in ('monthly', 'quarterly', 'yearly') then
    raise exception 'Unknown tier %', p_tier;
  end if;
  if p_provider_subscription_id is null or btrim(p_provider_subscription_id) = '' then
    raise exception 'Missing subscription id';
  end if;

  insert into public.subscriptions
    (user_id, provider, provider_subscription_id, tier, status)
  values
    (caller, 'razorpay', btrim(p_provider_subscription_id), p_tier, 'created')
  on conflict (provider, provider_subscription_id) do update
    set updated_at = now()
  returning id into new_id;

  return new_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. handle_razorpay_event — the only path that grants a day
-- ═══════════════════════════════════════════════════════════════════════
--
-- Dedupe, apply and recompute happen in one transaction, so idempotency and the
-- state change cannot half-succeed.
--
-- Takes extracted, typed fields — never the raw payload. A Razorpay body
-- carries the customer's email and contact number, and that must not land in a
-- table or a log.
--
-- Two independent idempotency guards:
--   webhook_events(provider, event_id)          — stops a replayed delivery
--   subscription_charges(provider_payment_id)   — stops the same payment
--                                                 arriving under a fresh event id
-- The second is the one that matters: without it, replaying a charge with a new
-- event id would stack another period.
--
-- An unknown subscription is recorded and acknowledged but creates nothing. A
-- webhook must never mint a subscription row, or anyone who can guess a payload
-- shape could conjure one.
create or replace function public.handle_razorpay_event(
  p_event_id        text,
  p_event_type      text,
  p_subscription_id text,
  p_payment_id      text    default null,
  p_amount_paise    integer default null,
  p_status          text    default null,
  p_period_days     integer default null,
  p_refunded        boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sub        public.subscriptions%rowtype;
  referrer   uuid;
  charged    boolean := false;
begin
  if p_event_id is null or p_event_type is null then
    raise exception 'Missing event id or type';
  end if;

  -- Guard 1: this exact delivery, already seen.
  insert into public.webhook_events (provider, event_id, event_type)
  values ('razorpay', p_event_id, p_event_type)
  on conflict (provider, event_id) do nothing;
  if not found then
    return jsonb_build_object('result', 'duplicate');
  end if;

  -- A refund.processed event names only the payment, not the subscription, so
  -- resolve it from the charge we already recorded. Doing it here rather than in
  -- the route keeps dedupe, apply and recompute inside one transaction.
  if p_subscription_id is null and p_payment_id is not null then
    select s.* into sub
      from public.subscription_charges c
      join public.subscriptions s on s.id = c.subscription_id
     where c.provider_payment_id = p_payment_id;
  else
    select * into sub from public.subscriptions
     where provider = 'razorpay' and provider_subscription_id = p_subscription_id;
  end if;
  if not found then
    return jsonb_build_object('result', 'unknown_subscription');
  end if;

  if p_status is not null
     and p_status in ('created','authenticated','active','pending','halted',
                      'cancelled','completed','expired') then
    update public.subscriptions
       set status       = p_status,
           updated_at   = now(),
           cancelled_at = case when p_status in ('cancelled','expired')
                               then coalesce(cancelled_at, now())
                               else cancelled_at end
     where id = sub.id;
    sub.status := p_status;
  end if;

  -- Guard 2: this payment, already applied — under any event id.
  if p_payment_id is not null and not p_refunded then
    insert into public.subscription_charges
      (subscription_id, user_id, provider_payment_id, amount_paise, tier,
       period_days, charged_at)
    values
      (sub.id, sub.user_id, p_payment_id, coalesce(p_amount_paise, 0), sub.tier,
       -- Clamped at the trust boundary. An unclamped value from a webhook body
       -- is an unbounded grant.
       least(greatest(coalesce(p_period_days,
                               case sub.tier when 'monthly' then 30
                                             when 'quarterly' then 91
                                             else 365 end), 1), 400),
       now())
    on conflict (provider_payment_id) do nothing;
    charged := found;
  end if;

  if p_refunded and p_payment_id is not null then
    update public.subscription_charges
       set refunded_at = coalesce(refunded_at, now())
     where provider_payment_id = p_payment_id;
    -- An outstanding in-app request is settled by the refund actually landing.
    update public.refund_requests rr
       set status = 'processed', resolved_at = now()
      from public.subscription_charges c
     where c.provider_payment_id = p_payment_id
       and rr.charge_id = c.id and rr.status = 'open';
  end if;

  -- The single UPDATE the referrals migration anticipated. qualified_at is
  -- backfilled so a friend who pays without ever starting a trial still earns
  -- the referrer their pool A days.
  if charged and sub.tier = 'yearly' then
    update public.referrals
       set status       = 'subscribed',
           subscribed_at = coalesce(subscribed_at, now()),
           qualified_at  = coalesce(qualified_at, now())
     where referee_id = sub.user_id
     returning referrer_id into referrer;
  else
    select r.referrer_id into referrer
      from public.referrals r where r.referee_id = sub.user_id;
  end if;

  perform public.recompute_access(sub.user_id);
  if referrer is not null then
    perform public.recompute_access(referrer);
  end if;

  return jsonb_build_object('result', 'applied', 'charged', charged);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. request_refund — asking freezes a pending referral credit immediately
-- ═══════════════════════════════════════════════════════════════════════
--
-- Ownership is derived from auth.uid() and re-checked against the charge row;
-- the charge id alone is not authority. The 2-day window is enforced here
-- rather than in the UI, because the UI is not a boundary.
--
-- The recompute at the end is the anti-abuse part: premium_grants() treats an
-- open request as a clawback instant, so a request filed during the 3-day hold
-- lands before the grant's window opens and the referrer's 60 days never
-- appear. Waiting for the refund to actually process would leave a gap in which
-- the credit exists and the money is on its way back.
create or replace function public.request_refund(p_charge_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller   uuid := auth.uid();
  ch       public.subscription_charges%rowtype;
  referrer uuid;
  req_id   uuid;
begin
  if caller is null then
    raise exception 'Unauthorized';
  end if;

  select * into ch from public.subscription_charges
   where id = p_charge_id and user_id = caller;
  if not found then
    raise exception 'Charge not found';
  end if;
  if ch.refunded_at is not null then
    raise exception 'This payment has already been refunded';
  end if;
  if ch.charged_at < now() - interval '2 day' then
    raise exception 'The 2-day refund window for this payment has closed';
  end if;

  insert into public.refund_requests (charge_id, user_id, reason, status)
  values (p_charge_id, caller, coalesce(nullif(btrim(p_reason), ''), 'No reason given'), 'open')
  on conflict (charge_id) where status = 'open' do nothing
  returning id into req_id;

  if req_id is null then
    raise exception 'A refund request for this payment is already open';
  end if;

  perform public.recompute_access(caller);
  select r.referrer_id into referrer
    from public.referrals r where r.referee_id = caller;
  if referrer is not null then
    perform public.recompute_access(referrer);
  end if;

  return req_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. get_billing_summary — the read, and where the 3-day hold fires
-- ═══════════════════════════════════════════════════════════════════════
--
-- Recomputing here is what removes the need for a scheduled job: a grant whose
-- effective_at has quietly passed simply shows up on the next read. The no-op
-- guard added to recompute_access above means an unchanged read writes nothing.
--
-- provider_subscription_id is deliberately absent from the payload. The client
-- never needs it and never sends it — cancellation derives the id server-side
-- from auth.uid(), which makes an IDOR unrepresentable rather than merely
-- guarded.
create or replace function public.get_billing_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  prof   record;
begin
  if caller is null then
    raise exception 'Unauthorized';
  end if;

  perform public.recompute_access(caller);

  select p.trial_start_date, p.selected_plan, p.bonus_trial_days,
         p.bonus_premium_days, p.access_until
    into prof
    from public.user_profiles p where p.id = caller;

  return jsonb_build_object(
    'trial_start_date',   prof.trial_start_date,
    'selected_plan',      prof.selected_plan,
    'bonus_trial_days',   prof.bonus_trial_days,
    'bonus_premium_days', prof.bonus_premium_days,
    'access_until',       prof.access_until,
    'has_access',         prof.access_until is not null and prof.access_until > now(),
    'subscription', (
      select jsonb_build_object(
               'id', s.id, 'tier', s.tier, 'status', s.status,
               'provider', s.provider, 'created_at', s.created_at,
               'cancelled_at', s.cancelled_at)
        from public.subscriptions s
       where s.user_id = caller
       order by s.created_at desc
       limit 1
    ),
    'charges', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'tier', c.tier, 'amount_paise', c.amount_paise,
               'period_days', c.period_days, 'charged_at', c.charged_at,
               'refunded_at', c.refunded_at,
               -- Computed here so the button's enabled state and the function's
               -- own check can never disagree.
               'refundable', c.refunded_at is null
                             and c.charged_at >= now() - interval '2 day'
                             and not exists (
                               select 1 from public.refund_requests rr
                                where rr.charge_id = c.id and rr.status = 'open'))
               order by c.charged_at desc)
        from public.subscription_charges c
       where c.user_id = caller
    ), '[]'::jsonb),
    'refund_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', rr.id, 'charge_id', rr.charge_id, 'status', rr.status,
               'created_at', rr.created_at, 'resolved_at', rr.resolved_at)
               order by rr.created_at desc)
        from public.refund_requests rr
       where rr.user_id = caller
    ), '[]'::jsonb)
  );
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Grants — explicit revoke, then exactly one role
-- ═══════════════════════════════════════════════════════════════════════

revoke execute on function public.recompute_access(uuid) from public, anon, authenticated;
grant  execute on function public.recompute_access(uuid) to service_role;

revoke execute on function
  public.handle_razorpay_event(text, text, text, text, integer, text, integer, boolean)
from public, anon, authenticated;
grant execute on function
  public.handle_razorpay_event(text, text, text, text, integer, text, integer, boolean)
to service_role;

revoke execute on function public.register_subscription(text, text)
  from public, anon, authenticated;
grant  execute on function public.register_subscription(text, text) to authenticated;

revoke execute on function public.request_refund(uuid, text)
  from public, anon, authenticated;
grant  execute on function public.request_refund(uuid, text) to authenticated;

revoke execute on function public.get_billing_summary()
  from public, anon, authenticated;
grant  execute on function public.get_billing_summary() to authenticated;
