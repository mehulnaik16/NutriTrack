-- Which rail the money came in on, which time the customer has paid, and how
-- much of the amount was ours before tax.
--
-- Affiliate commission depends on all three: the rate is 25%/15% on Razorpay
-- against 20%/10% on Google Play and Apple, the higher figure of each pair
-- applies only to a customer's first payment, and it is always calculated on
-- the GST-excluded base rather than on what was charged. None of the three was
-- recorded, so the commission owed to a gym could not be derived from the data.
--
-- Three columns, and none of them is load-bearing for entitlement.
-- recompute_access() reads only {user_id, period_days, charged_at, refunded_at}
-- and rebuilds the whole timeline on every call; premium_grants() additionally
-- reads {id, subscription_id, tier}. Adding to this table cannot move anybody's
-- access_until.
--
--   provider   — denormalised on purpose. It is reachable through
--                subscription_id -> subscriptions.provider, which already
--                carries the same three-value check, but every commission
--                query wants it on the row, and the row is what gets
--                snapshotted into the partner project's ledger.
--
--   base_paise — the plan price before GST. Dombelz collects no GST today
--                (turnover exemption), so this equals amount_paise for every
--                existing row. When 18% is added it goes *on top of* ₹249 /
--                ₹499 / ₹999 / ₹849, so the base stays those numbers and only
--                amount_paise grows. There is deliberately no gst_paise column:
--                GST is amount_paise - base_paise, and a third stored number is
--                a third number that can disagree with the other two.
--
--   seq        — the ordinal of this charge for this user. 1 is a first
--                payment, anything above it is a renewal. Stored rather than
--                counted at read time so that history is stable: a refund does
--                not renumber later charges, because having paid before is a
--                fact about what happened, not about what was kept.

alter table public.subscription_charges
  add column if not exists provider text not null default 'razorpay'
    check (provider in ('razorpay', 'google_play', 'apple')),
  add column if not exists base_paise integer,
  add column if not exists seq        smallint;

update public.subscription_charges
   set base_paise = amount_paise
 where base_paise is null;

-- Ordered by charged_at, tie-broken by id so the numbering is deterministic if
-- two charges ever share a timestamp.
with ranked as (
  select id,
         row_number() over (partition by user_id order by charged_at, id) as n
    from public.subscription_charges
)
update public.subscription_charges c
   set seq = ranked.n
  from ranked
 where ranked.id = c.id
   and c.seq is null;

alter table public.subscription_charges
  alter column base_paise set not null,
  alter column seq        set not null;

do $$
begin
  alter table public.subscription_charges
    add constraint subscription_charges_base_paise_check check (base_paise >= 0);
exception when duplicate_object then null;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- handle_razorpay_event: carried over from 20260909140000_subscription_switching
-- byte-for-byte except for the three writes above and the two new parameters
-- that feed them. Both guards, the demote-other-live-rows block, the
-- selected_plan write, the yearly-only referral flip, the period clamp and both
-- recompute_access() calls are unchanged.
--
-- The new parameters are trailing and defaulted, so a caller that has not been
-- redeployed yet still resolves and still behaves exactly as it did.

create or replace function public.handle_razorpay_event(
  p_event_id        text,
  p_event_type      text,
  p_subscription_id text,
  p_payment_id      text    default null,
  p_amount_paise    integer default null,
  p_status          text    default null,
  p_period_days     integer default null,
  p_refunded        boolean default false,
  p_base_paise      integer default null,
  p_provider        text    default 'razorpay'
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
  v_provider text := coalesce(nullif(btrim(p_provider), ''), 'razorpay');
  v_seq      integer;
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
    -- Was hardcoded 'razorpay'. Now the caller says which rail, so a Play or
    -- Apple subscription id cannot be mistaken for a Razorpay one that happens
    -- to share its text.
    select * into sub from public.subscriptions
     where provider = v_provider and provider_subscription_id = p_subscription_id;
  end if;
  if not found then
    return jsonb_build_object('result', 'unknown_subscription');
  end if;

  if p_status is not null
     and p_status in ('created','authenticated','active','pending','halted',
                      'cancelled','completed','expired') then

    -- One live subscription per user, enforced by yielding rather than by
    -- raising. Only when *this* row is about to become live — a cancellation
    -- must never reach across and touch somebody's other subscription.
    if p_status in ('authenticated','active','pending','halted') then
      update public.subscriptions
         set status       = 'cancelled',
             cancelled_at = coalesce(cancelled_at, now()),
             updated_at   = now()
       where user_id = sub.user_id
         and id <> sub.id
         and status in ('authenticated','active','pending','halted');
    end if;

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
    -- Read immediately before the insert, inside the same transaction as the
    -- guard that makes the insert single. Two concurrent first charges for one
    -- user would both read 1, but subscriptions_one_live_per_user means a user
    -- cannot have two subscriptions billing at once for that to happen.
    select count(*) + 1 into v_seq
      from public.subscription_charges where user_id = sub.user_id;

    insert into public.subscription_charges
      (subscription_id, user_id, provider_payment_id, amount_paise, tier,
       period_days, charged_at, provider, base_paise, seq)
    values
      (sub.id, sub.user_id, p_payment_id, coalesce(p_amount_paise, 0), sub.tier,
       -- Clamped at the trust boundary. An unclamped value from a webhook body
       -- is an unbounded grant.
       least(greatest(coalesce(p_period_days,
                               case sub.tier when 'monthly' then 30
                                             when 'quarterly' then 91
                                             else 365 end), 1), 400),
       now(),
       -- The subscription knows its own rail; p_provider only chose which row
       -- to resolve. Taking it from sub means the charge can never disagree
       -- with the subscription it belongs to.
       sub.provider,
       -- No GST is collected today, so a caller that sends nothing is right.
       -- Once it is, the caller sends the plan's list price and this stops
       -- being the same number as amount_paise.
       greatest(least(coalesce(p_base_paise, coalesce(p_amount_paise, 0)),
                      coalesce(p_amount_paise, 0)), 0),
       v_seq)
    on conflict (provider_payment_id) do nothing;
    charged := found;
  end if;

  -- The plan they actually bought is the plan the billing page should name.
  -- Only on a charge — an activated-but-unpaid subscription has not bought
  -- anything yet, and a refund does not un-choose a plan.
  if charged then
    update public.user_profiles
       set selected_plan = sub.tier
     where id = sub.user_id
       and selected_plan is distinct from sub.tier;
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
  --
  -- Still yearly-only, deliberately: the 60-day bonus and the ₹150 gift belong
  -- to the 12-month plan alone. Monthly and quarterly earn a referrer nothing.
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

-- The signature changed, so the old ACL does not carry: restate it. A SECURITY
-- DEFINER function in `public` is EXECUTE-to-PUBLIC by default, and this one is
-- the only thing in the system that can grant a day of access.
revoke all on function public.handle_razorpay_event(
  text, text, text, text, integer, text, integer, boolean, integer, text)
  from public, anon, authenticated;
grant execute on function public.handle_razorpay_event(
  text, text, text, text, integer, text, integer, boolean, integer, text)
  to service_role;

-- The 8-argument version would otherwise linger as an overload, which makes a
-- call by named arguments ambiguous.
drop function if exists public.handle_razorpay_event(
  text, text, text, text, integer, text, integer, boolean);
