-- Switching plans, and naming the plan that was actually bought.
--
-- Two defects, both in handle_razorpay_event(), both invisible until the
-- Razorpay webhook was registered for the first time:
--
-- 1. A user upgrading was charged and given nothing, permanently.
--    subscriptions_one_live_per_user (20260901120000_billing_lockdown.sql:138)
--    is a unique index over (user_id) where status is one of the live values.
--    A monthly subscriber who buys Yearly gets a second subscription row; when
--    its subscription.activated arrives, the status UPDATE below tried to make
--    a second row live for the same user, raised unique_violation, and took the
--    whole function down with it. The route answers 500, Razorpay retries into
--    the identical violation forever, and the charge insert — which comes after
--    the status update — is never reached. The money moved; the days never did.
--
--    The client now cancels the old subscription at Razorpay before opening
--    checkout (src/lib/billing.ts), so in the normal path only one is ever
--    live. This is the backstop for every other path: a cancel that failed, a
--    checkout completed in a stale tab, a webhook arriving out of order. Demote
--    first, then update, and the violation becomes unreachable at the only
--    place it could fire.
--
-- 2. user_profiles.selected_plan was written only by start_trial(). Buying
--    never touched it, so the CURRENT PLAN card on Plan & billing kept naming
--    whichever plan was picked at trial time — a user on a paid Yearly could
--    read "Monthly", and one who bought without ever starting a trial got the
--    "No plan selected yet" empty state while fully paid up.
--
-- Everything else in this function is carried over byte-for-byte from
-- 20260901140000_razorpay_events.sql: both idempotency guards, the yearly-only
-- referral flip, the period clamp, and the two recompute_access() calls.
-- Nothing about who may call it changes either, so the grants at the foot of
-- that migration still stand.

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

    -- NEW: one live subscription per user, enforced by yielding rather than by
    -- raising. Only when *this* row is about to become live — a cancellation
    -- must never reach across and touch somebody's other subscription.
    --
    -- cancelled_at is set here because it is what the UI reads to say a
    -- subscription is over, and what serverCancelSubscription's filter skips.
    -- The days those cancelled subscriptions paid for are untouched:
    -- recompute_access() folds subscription_charges, not subscriptions.
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

  -- NEW: the plan they actually bought is the plan the billing page should
  -- name. Only on a charge — an activated-but-unpaid subscription has not
  -- bought anything yet, and a refund does not un-choose a plan.
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

-- create or replace keeps the existing ACL, but restate it: a SECURITY DEFINER
-- function in `public` is EXECUTE-to-PUBLIC by default, and this one is the
-- only thing in the system that can grant a day of access.
revoke all on function public.handle_razorpay_event(
  text, text, text, text, integer, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.handle_razorpay_event(
  text, text, text, text, integer, text, integer, boolean) to service_role;
