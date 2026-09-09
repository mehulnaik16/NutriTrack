-- A referral bonus inside its 3-day hold now counts for nothing at all.
--
-- The loop in recompute_access() asked "has the hold elapsed?" in one place and
-- not the other:
--
--   cursor_ts := win_start + …          -- ran for every grant, hold or no hold
--   if g.is_bonus and g.effective_at <= now() then pool_b := …   -- guarded
--
-- So access_until already carried a bonus that bonus_premium_days deliberately
-- would not show. The visible number obeyed the hold; the invisible clock that
-- actually decides who gets into the app ignored it.
--
-- The symptom is small — a referrer whose own access has lapsed gets in up to 3
-- days early, because hasAccess() only asks `access_until > now()` and cannot
-- see that the window was meant to start on effective_at. Refunds were never
-- affected: a clawback during the hold lands before win_start, `d` collapses to
-- 0, and request_refund() recomputes the referrer on the spot.
--
-- The reason to fix it is the mismatch itself. Two lines that are supposed to
-- encode one rule encoded two, which is how a later edit to either one turns a
-- 3-day rounding error into a real one.
--
-- The fix is a single skip at the top of the loop, before either line. With it,
-- the check exists once instead of twice, and the second guard collapses to
-- `if g.is_bonus`.
--
-- Safe because the fold is a rebuild, never an increment: recompute_access()
-- re-reads every charge and every grant from source rows on each call, and
-- get_billing_summary() calls it on every read. Skipping a grant today loses
-- nothing — the next recompute after the hold elapses folds it in. That is the
-- same property that already makes the hold need no cron job.

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
    -- THE HOLD. A referral bonus that has not reached effective_at takes part in
    -- nothing: not access_until, not the displayed count. The referrer sees
    -- "processing" and gets no days, which is what a hold is.
    --
    -- Only bonuses are ever future-dated. A charge's effective_at is its
    -- charged_at, which is always in the past.
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

-- Restated rather than assumed: a SECURITY DEFINER function in `public` is
-- EXECUTE-to-PUBLIC by default, and this one writes access_until.
revoke all on function public.recompute_access(uuid) from public, anon, authenticated;
grant execute on function public.recompute_access(uuid) to service_role;
