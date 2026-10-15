CREATE OR REPLACE FUNCTION public.power_logs_left(p_day date)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.premium_grants(target uuid)
 RETURNS TABLE(days integer, effective_at timestamp with time zone, clawback_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.qualify_referral()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_access(target uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- THE HOLD. A grant that has not reached effective_at takes part in nothing.
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
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_bonus_trial_days(target uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.record_data_export(p_kind text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  uid uuid := auth.uid();
  next_at timestamptz;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_kind not in ('json', 'csv', 'weight_pdf') then
    raise exception 'unknown export kind' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('data_export:' || uid::text));

  next_at := (public.data_export_status() -> 'next' ->> p_kind)::timestamptz;
  if next_at is not null then
    return false;
  end if;

  insert into public.data_exports (user_id, kind) values (uid, p_kind);
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.referral_code_prefix(full_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case when p = 'XXX' then 'DBZ' else p end
  from (
    select rpad(
      left(upper(regexp_replace(coalesce(full_name, ''), '[^A-Za-z]', '', 'g')), 3),
      3, 'X'
    ) as p
  ) t;
$function$
;

CREATE OR REPLACE FUNCTION public.register_subscription(p_provider_subscription_id text, p_tier text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.release_ai_plan(p_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  delete from public.ai_plan_generations
   where id = p_id and created_at > now() - interval '5 minutes';
$function$
;

CREATE OR REPLACE FUNCTION public.release_power_log(p_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  delete from public.power_log_uses
   where id = p_id and created_at > now() - interval '5 minutes';
$function$
;
