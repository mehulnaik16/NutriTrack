-- The ₹150 off Yearly becomes 60 free days.
--
-- A discount cost us twice over: ₹150 of margin on every referred yearly, and
-- a separate Razorpay plan (RAZORPAY_PLAN_YEARLY_DISCOUNTED) to charge it
-- through. Every referred buyer — sent by a friend, or by a gym, doctor or
-- creator code entered at signup — now pays the full Yearly price and gets 60
-- days of access added on top instead.
--
-- The rule mirrors the referrer's own 60 days in premium_grants(), so both
-- sides of a referral earn under one definition:
--
--   * yearly only, and once: the buyer's FIRST yearly charge, whatever they
--     paid for before it
--   * effective_at = charged_at + 3 days. The refund window is 2 days, so a
--     buyer who pays and refunds straight away never sees the days
--   * clawback_at = the refund, or an open refund request. NOT a cancellation:
--     the buyer paid for the year, and turning off auto-renew must not cost
--     them the gift they bought it with
--
-- Eligibility is the same two facts activeGift() in src/lib/plans.ts reads for
-- the label on the pricing card: a referrals row naming this user as referee,
-- or a gym_links row with source = 'signup'. The signup step accepts exactly
-- one code, so an account holds at most one of the two.
--
-- No backfill question: when this was written no referral or gym link had a
-- yearly charge behind it, so nobody already holds a ₹150 discount and 60 days.

create or replace function public.gift_grants(target uuid)
returns table (days integer, effective_at timestamptz, clawback_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select 60,
         first_yearly.charged_at + interval '3 day',
         least(first_yearly.refunded_at, open_req.created_at)
  from (
    select c.id, c.charged_at, c.refunded_at
      from public.subscription_charges c
     where c.user_id = target and c.tier = 'yearly'
     order by c.charged_at, c.id
     limit 1
  ) first_yearly
  left join lateral (
    select min(x.created_at) as created_at
      from public.refund_requests x
     where x.charge_id = first_yearly.id and x.status = 'open'
  ) open_req on true
  where exists (select 1 from public.referrals r where r.referee_id = target)
     or exists (select 1 from public.gym_links g
                 where g.user_id = target and g.source = 'signup');
$$;

revoke all on function public.gift_grants(uuid) from public, anon, authenticated;
grant execute on function public.gift_grants(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- The fold, with the buyer's gift folded in
-- ═══════════════════════════════════════════════════════════════════════
--
-- Identical to 20260919120000_ops_write_tools.sql apart from two things:
--
--   1. One more union branch, gift_grants(). is_bonus = false, because
--      bonus_premium_days means "days earned by referring people" and the
--      buyer's gift is not that.
--   2. The hold check no longer asks is_bonus. It used to, because only a
--      referral bonus was ever future-dated; the buyer's gift is now future-
--      dated too. Skipping ANY grant whose effective_at is still ahead is the
--      same rule stated once — a charge's effective_at is its charged_at and a
--      manual grant's defaults to now(), so neither is affected.

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
      select mg.days, mg.effective_at, mg.clawback_at, false
        from public.manual_grants mg
       where mg.user_id = target
      union all
      -- The buyer's own 60 days for being referred. Not a referral bonus, so
      -- it stays out of bonus_premium_days.
      select gg.days::numeric, gg.effective_at, gg.clawback_at, false
        from public.gift_grants(target) gg
      order by effective_at
  loop
    -- THE HOLD. A grant that has not reached effective_at takes part in
    -- nothing: not access_until, not the displayed count. The next recompute
    -- after it elapses folds it in — get_billing_summary() recomputes on every
    -- read, so no cron is needed.
    if g.effective_at > now() then
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

comment on column public.gym_links.gift_spent_at is
  'When this member''s first yearly charge landed. Informational since the gift '
  'became 60 days: gift_grants() reads the charge itself, not this column.';
