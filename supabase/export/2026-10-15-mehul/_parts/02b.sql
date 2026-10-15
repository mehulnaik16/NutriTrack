CREATE OR REPLACE FUNCTION public.get_billing_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_friend_requests()
 RETURNS TABLE(friendship_id uuid, user_id uuid, full_name text, username text, current_streak integer, direction text, mutual_count integer, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() as uid),
  my_friends as (
    select case when f.requester_id = m.uid then f.addressee_id else f.requester_id end as fid
    from public.friendships f cross join me m
    where f.status = 'accepted' and m.uid in (f.requester_id, f.addressee_id)
  ),
  pending as (
    select f.id,
      case when f.addressee_id = m.uid then f.requester_id else f.addressee_id end as other,
      case when f.addressee_id = m.uid then 'incoming' else 'outgoing' end as dir,
      f.created_at
    from public.friendships f cross join me m
    where f.status = 'pending'
      and m.uid is not null
      and m.uid in (f.requester_id, f.addressee_id)
  )
  select
    pd.id, p.id, p.full_name, p.username, coalesce(p.current_streak, 0), pd.dir,
    (select count(*)::int
       from my_friends mf
      where mf.fid in (
        select case when f2.requester_id = p.id then f2.addressee_id else f2.requester_id end
        from public.friendships f2
        where f2.status = 'accepted' and p.id in (f2.requester_id, f2.addressee_id)
      )),
    pd.created_at
  from pending pd
  join public.user_profiles p on p.id = pd.other
  order by pd.created_at desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_friends()
 RETURNS TABLE(id uuid, full_name text, username text, current_streak integer, workouts_this_week integer, last_activity text, last_activity_at date, active_today boolean, cheered_today boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() as uid),
  friends as (
    select case when f.requester_id = m.uid then f.addressee_id else f.requester_id end as fid
    from public.friendships f cross join me m
    where f.status = 'accepted'
      and m.uid is not null
      and m.uid in (f.requester_id, f.addressee_id)
  )
  select
    p.id,
    p.full_name,
    p.username,
    coalesce(p.current_streak, 0),
    (select count(*)::int from public.workout_logs w
      where w.user_id = p.id and w.date >= current_date - 6),
    (select w.workout_name from public.workout_logs w
      where w.user_id = p.id order by w.date desc, w.logged_at desc limit 1),
    (select w.date from public.workout_logs w
      where w.user_id = p.id order by w.date desc, w.logged_at desc limit 1),
    -- "active today" = ANY activity in any of the four logs
    (   exists (select 1 from public.workout_logs  x where x.user_id = p.id and x.date = current_date)
     or exists (select 1 from public.food_logs     x where x.user_id = p.id and x.date = current_date)
     or exists (select 1 from public.water_logs    x where x.user_id = p.id and x.date = current_date)
     or exists (select 1 from public.weight_entries x where x.user_id = p.id and x.date = current_date)),
    exists (select 1 from public.cheers c cross join me m2
            where c.from_user = m2.uid and c.to_user = p.id and c.date = current_date)
  from public.user_profiles p
  join friends on friends.fid = p.id
  order by coalesce(p.current_streak, 0) desc, p.full_name;
$function$
;

CREATE OR REPLACE FUNCTION public.get_leaderboard_stats(start_date text)
 RETURNS TABLE(user_id uuid, full_name text, current_streak integer, workouts_count bigint, avg_calories numeric, total_water bigint, total_exercise_min bigint, total_steps bigint, overall_score numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  return query
  with u as (
    select
      id as uid,
      user_profiles.full_name as fname,
      coalesce(user_profiles.current_streak, 0) as streak
    from public.user_profiles
  ),
  wl as (
    select workout_logs.user_id, count(id) as w_count, sum(duration_min) as e_min
    from public.workout_logs
    where date >= start_date::date
    group by workout_logs.user_id
  ),
  fl as (
    select
      food_logs.user_id,
      sum(calories) / nullif(count(distinct date), 0) as a_cal,
      count(distinct date) as f_days
    from public.food_logs
    where date >= start_date::date
    group by food_logs.user_id
  ),
  wat as (
    select water_logs.user_id, sum(amount_ml) as t_wat
    from public.water_logs
    where date >= start_date::date
    group by water_logs.user_id
  ),
  st as (
    -- step_logs is UNIQUE (user_id, date) and holds the day's absolute total,
    -- so a plain SUM over the window is the period total with no risk of
    -- double-counting a day that was written several times.
    select step_logs.user_id, sum(steps) as t_steps
    from public.step_logs
    where date >= start_date::date
    group by step_logs.user_id
  )
  select
    u.uid,
    u.fname,
    u.streak,
    coalesce(wl.w_count, 0) as workouts_count,
    round(coalesce(fl.a_cal, 0)::numeric, 1) as avg_calories,
    coalesce(wat.t_wat, 0) as total_water,
    coalesce(wl.e_min, 0) as total_exercise_min,
    coalesce(st.t_steps, 0) as total_steps,
    -- Scoring: workouts (50 pts each) + exercise minutes + water (1 pt / 100ml)
    -- + food-logging consistency (20 pts per day logged). Steps are not in here
    -- on purpose; see the header.
    round(
      (
        (coalesce(wl.w_count, 0) * 50)
        + (coalesce(wat.t_wat, 0) / 100.0)
        + coalesce(wl.e_min, 0)
        + (coalesce(fl.f_days, 0) * 20)
      )::numeric,
    1) as overall_score
  from u
  left join wl on u.uid = wl.user_id
  left join fl on u.uid = fl.user_id
  left join wat on u.uid = wat.user_id
  left join st on u.uid = st.user_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_referral_summary()
 RETURNS TABLE(referee_name text, status text, qualified_at timestamp with time zone, subscribed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_referrer_name(code text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.gift_grants(target uuid)
 RETURNS TABLE(days integer, effective_at timestamp with time zone, clawback_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_razorpay_event(p_event_id text, p_event_type text, p_subscription_id text, p_payment_id text DEFAULT NULL::text, p_amount_paise integer DEFAULT NULL::integer, p_status text DEFAULT NULL::text, p_period_days integer DEFAULT NULL::integer, p_refunded boolean DEFAULT false, p_base_paise integer DEFAULT NULL::integer, p_provider text DEFAULT 'razorpay'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  insert into public.webhook_events (provider, event_id, event_type)
  values ('razorpay', p_event_id, p_event_type)
  on conflict (provider, event_id) do nothing;
  if not found then
    return jsonb_build_object('result', 'duplicate');
  end if;

  if p_subscription_id is null and p_payment_id is not null then
    select s.* into sub
      from public.subscription_charges c
      join public.subscriptions s on s.id = c.subscription_id
     where c.provider_payment_id = p_payment_id;
  else
    select * into sub from public.subscriptions
     where provider = v_provider and provider_subscription_id = p_subscription_id;
  end if;
  if not found then
    return jsonb_build_object('result', 'unknown_subscription');
  end if;

  if p_status is not null
     and p_status in ('created','authenticated','active','pending','halted',
                      'cancelled','completed','expired') then

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

  if p_payment_id is not null and not p_refunded then
    select count(*) + 1 into v_seq
      from public.subscription_charges where user_id = sub.user_id;

    insert into public.subscription_charges
      (subscription_id, user_id, provider_payment_id, amount_paise, tier,
       period_days, charged_at, provider, base_paise, seq)
    values
      (sub.id, sub.user_id, p_payment_id, coalesce(p_amount_paise, 0), sub.tier,
       least(greatest(coalesce(p_period_days,
                               case sub.tier when 'monthly' then 30
                                             when 'quarterly' then 91
                                             else 365 end), 1), 400),
       now(),
       sub.provider,
       greatest(least(coalesce(p_base_paise, coalesce(p_amount_paise, 0)),
                      coalesce(p_amount_paise, 0)), 0),
       v_seq)
    on conflict (provider_payment_id) do nothing;
    charged := found;
  end if;

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
    update public.refund_requests rr
       set status = 'processed', resolved_at = now()
      from public.subscription_charges c
     where c.provider_payment_id = p_payment_id
       and rr.charge_id = c.id and rr.status = 'open';
  end if;

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
$function$
;

CREATE OR REPLACE FUNCTION public.join_gym(p_user_id uuid, p_code text, p_gym_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  normalized text := upper(btrim(coalesce(p_code, '')));
begin
  if p_user_id is null then raise exception 'Unauthorized'; end if;

  if normalized !~ '^GYM-[A-Z]{1,12}-[0-9]{3}$' then
    raise exception 'Not a gym code: %', p_code using errcode = 'P0002';
  end if;

  if coalesce(btrim(p_gym_name), '') = '' then
    raise exception 'A verified gym name is required' using errcode = 'P0001';
  end if;

  insert into public.gym_memberships (user_id, partner_code, gym_name)
  values (p_user_id, normalized, btrim(p_gym_name))
  on conflict (user_id) do update
    set partner_code = excluded.partner_code,
        gym_name     = excluded.gym_name,
        created_at   = now();

  return jsonb_build_object(
    'joined', true, 'partner_code', normalized, 'gym_name', btrim(p_gym_name));
end; $function$
;

CREATE OR REPLACE FUNCTION public.leave_gym(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_user_id is null then raise exception 'Unauthorized'; end if;
  delete from public.gym_memberships where user_id = p_user_id;
  return jsonb_build_object('left', true);
end; $function$
;

CREATE OR REPLACE FUNCTION public.link_gym(p_user_id uuid, p_code text, p_gym_name text, p_partner_type text DEFAULT 'gym'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  normalized text := upper(btrim(coalesce(p_code, '')));
  existing   public.gym_links%rowtype;
  v_source   text; v_created timestamptz; v_trial date; v_burned timestamptz;
begin
  if p_user_id is null then raise exception 'Unauthorized'; end if;

  if normalized !~ '^(GYM-[A-Z]{1,12}-[0-9]{3}|DR-[A-Z]{1,6}[0-9]{3}|[A-Z]{1,20}(60|[0-9]{3}))$' then
    raise exception 'Not a partner code: %', p_code using errcode = 'P0002';
  end if;

  if p_partner_type is null or p_partner_type not in ('gym', 'doctor', 'ugc') then
    raise exception 'Unknown partner type: %', p_partner_type using errcode = 'P0001';
  end if;

  if coalesce(btrim(p_gym_name), '') = '' then
    raise exception 'A verified partner name is required' using errcode = 'P0001';
  end if;

  select * into existing from public.gym_links where user_id = p_user_id;
  if found then
    return jsonb_build_object('linked', false, 'source', existing.source,
      'partner_code', existing.partner_code, 'gym_name', existing.gym_name,
      'partner_type', existing.partner_type);
  end if;

  select u.created_at into v_created from auth.users u where u.id = p_user_id;
  select p.trial_start_date, p.gym_attribution_ended_at into v_trial, v_burned
    from public.user_profiles p where p.id = p_user_id;

  if      v_burned is null
      and not exists (select 1 from public.referrals where referee_id = p_user_id)
      and v_trial is null
      and v_created is not null
      and v_created > now() - interval '15 minutes'
  then v_source := 'signup';
  else v_source := 'profile';
  end if;

  insert into public.gym_links (user_id, partner_code, gym_name, source, partner_type)
  values (p_user_id, normalized, btrim(p_gym_name), v_source, p_partner_type);

  return jsonb_build_object('linked', true, 'source', v_source,
    'partner_code', normalized, 'gym_name', btrim(p_gym_name),
    'partner_type', p_partner_type);
end; $function$
;

CREATE OR REPLACE FUNCTION public.log_body_measurements(entries jsonb, on_date date DEFAULT NULL::date, entry_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  insert into public.body_measurements (user_id, measured_at, measurements, note)
  values (auth.uid(), coalesce(on_date, current_date), entries, entry_note)
  on conflict (user_id, measured_at) do update
    set measurements = body_measurements.measurements || excluded.measurements,
        note         = coalesce(excluded.note, body_measurements.note);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.measurements_valid(m jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_typeof(m) = 'object' and not exists (
    select 1 from jsonb_each(m) e
    where jsonb_typeof(e.value) <> 'number'
       or (e.value)::numeric <= 0
       or (e.value)::numeric > 400
  );
$function$
;

CREATE OR REPLACE FUNCTION public.ops_audit_recent(limit_n integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(to_jsonb(a) order by a.at desc), '[]'::jsonb)
  from (select at, actor, action, left(target_user::text, 8) as target, detail
        from public.ops_audit_log
        order by at desc
        limit least(greatest(limit_n, 1), 100)) a;
$function$
;
