CREATE OR REPLACE FUNCTION public.request_refund(p_charge_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.require_access_for_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_until timestamptz;
begin
  if v_uid is null then
    return coalesce(NEW, OLD);
  end if;

  select access_until into v_until from public.user_profiles where id = v_uid;

  if v_until is null or v_until <= now() then
    perform public.recompute_access(v_uid);
    select access_until into v_until from public.user_profiles where id = v_uid;
  end if;

  if v_until is null or v_until <= now() then
    raise exception 'Your free trial has ended. Pick a plan to keep logging meals.';
  end if;

  return coalesce(NEW, OLD);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_friend_code(code text)
 RETURNS TABLE(result text, full_name text, username text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me       uuid := auth.uid();
  target   public.user_profiles%rowtype;
  existing public.friendships%rowtype;
begin
  if me is null then
    return query select 'unauthenticated'::text, null::text, null::text; return;
  end if;

  select up.* into target
    from public.user_profiles up
   where lower(up.username) = lower(trim(code))
   limit 1;

  if not found then
    return query select 'not_found'::text, null::text, null::text; return;
  end if;

  if target.id = me then
    return query select 'self'::text, target.full_name, target.username; return;
  end if;

  select f.* into existing
    from public.friendships f
   where (f.requester_id = me and f.addressee_id = target.id)
      or (f.requester_id = target.id and f.addressee_id = me)
   limit 1;

  if found then
    if existing.status = 'accepted' then
      return query select 'already_friends'::text, target.full_name, target.username; return;
    elsif existing.status = 'blocked' then
      -- reveal nothing about a blocked pair
      return query select 'not_found'::text, null::text, null::text; return;
    elsif existing.requester_id = target.id then
      -- they already asked me: scanning their code accepts it
      update public.friendships f set status = 'accepted', responded_at = now()
       where f.id = existing.id;
      return query select 'accepted'::text, target.full_name, target.username; return;
    else
      return query select 'pending'::text, target.full_name, target.username; return;
    end if;
  end if;

  insert into public.friendships (requester_id, addressee_id) values (me, target.id);
  return query select 'sent'::text, target.full_name, target.username;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.search_users(q text DEFAULT ''::text)
 RETURNS TABLE(id uuid, full_name text, username text, current_streak integer, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() as uid),
  -- my accepted friends
  myf as (
    select case when f.requester_id = (select uid from me) then f.addressee_id else f.requester_id end as fid
    from public.friendships f
    where f.status = 'accepted'
      and (select uid from me) in (f.requester_id, f.addressee_id)
  ),
  -- friends of my friends (either edge direction)
  fof as (
    select f.addressee_id as sid from public.friendships f
      where f.status = 'accepted' and f.requester_id in (select fid from myf)
    union
    select f.requester_id as sid from public.friendships f
      where f.status = 'accepted' and f.addressee_id in (select fid from myf)
  ),
  -- search term with any leading @ stripped; null when empty
  qq as (select nullif(ltrim(trim(coalesce(q, '')), '@'), '') as term)
  select
    p.id, p.full_name, p.username, coalesce(p.current_streak, 0),
    coalesce((
      select case
        when f.status = 'accepted'                     then 'friends'
        when f.requester_id = (select uid from me)     then 'sent'
        else 'incoming'
      end
      from public.friendships f
      where f.status in ('pending', 'accepted')
        and ((f.requester_id = (select uid from me) and f.addressee_id = p.id)
          or (f.requester_id = p.id                  and f.addressee_id = (select uid from me)))
      limit 1
    ), 'none')
  from public.user_profiles p
  where (select uid from me) is not null
    and p.id <> (select uid from me)
    and p.username is not null
    -- never surface anyone on either side of a block
    and not exists (
      select 1 from public.friendships f
      where f.status = 'blocked'
        and ((f.requester_id = (select uid from me) and f.addressee_id = p.id)
          or (f.requester_id = p.id                  and f.addressee_id = (select uid from me)))
    )
    and case
      -- search: match name or username (case-insensitive), reachable to anyone
      when (select term from qq) is not null then
        (p.username  ilike '%' || (select term from qq) || '%'
      or p.full_name ilike '%' || (select term from qq) || '%')
      -- suggested (empty query): friends-of-friends only, not already connected/pending
      else
        p.id in (select sid from fof)
        and not exists (
          select 1 from public.friendships f
          where f.status in ('pending', 'accepted')
            and ((f.requester_id = (select uid from me) and f.addressee_id = p.id)
              or (f.requester_id = p.id                  and f.addressee_id = (select uid from me)))
        )
    end
  order by coalesce(p.current_streak, 0) desc, p.full_name
  limit 20;
$function$
;

CREATE OR REPLACE FUNCTION public.set_referral_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.referral_code is null then
    new.referral_code := public.generate_referral_code(new.full_name);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.spend_gym_gift()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.tier = 'yearly' then
    update public.gym_links
       set gift_spent_at = now()
     where user_id = new.user_id and gift_spent_at is null;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.start_trial(plan text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.sync_achievements()
 RETURNS TABLE(achievement_id text, xp integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  caller uuid := auth.uid();
  m      record;
begin
  if caller is null then
    raise exception 'Unauthorized';
  end if;

  select * into m from public.user_achievement_metrics(caller);

  insert into public.user_achievements (user_id, achievement_id)
  select caller, a.id
    from public.achievements a
   where case a.metric
           when 'food_count'    then m.food_count
           when 'food_streak'   then m.food_streak
           when 'early_logs'    then m.early_logs
           when 'workout_count' then m.workout_count
           when 'weight_count'  then m.weight_count
           when 'photo_count'   then m.photo_count
           when 'hydrated_days' then m.hydrated_days
           when 'saved_meals'   then m.saved_meals
           when 'step_days'     then m.step_days
           when 'step_streak'   then m.step_streak
         end >= a.threshold
  on conflict do nothing;

  return query
    select t.a_id, t.a_xp
      from (
        select ua.achievement_id as a_id, a.xp as a_xp, a.sort_order as a_sort
          from public.user_achievements ua
          join public.achievements a on a.id = ua.achievement_id
         where ua.user_id = caller
      ) t
     order by t.a_sort;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.unlink_gym(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n int;
begin
  if p_user_id is null then raise exception 'Unauthorized'; end if;
  delete from public.gym_links where user_id = p_user_id;
  get diagnostics v_n = row_count;
  update public.user_profiles
     set gym_attribution_ended_at = coalesce(gym_attribution_ended_at, now())
   where id = p_user_id;
  return jsonb_build_object('removed', v_n > 0);
end; $function$
;

CREATE OR REPLACE FUNCTION public.user_achievement_metrics(p_user uuid)
 RETURNS TABLE(food_count integer, food_streak integer, early_logs integer, workout_count integer, weight_count integer, photo_count integer, hydrated_days integer, saved_meals integer, step_days integer, step_streak integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with zone as (
    select p.timezone as tz from public.user_profiles p where p.id = p_user
  ),
  goal as (
    -- Mirrors DEFAULT_STEPS_GOAL in src/lib/stepMath.ts. NULL means the user
    -- has never set one, and the client shows 10,000 in that case.
    select coalesce(p.steps_goal, 10000) as target
      from public.user_profiles p where p.id = p_user
  ),
  food as (
    select f.date,
           (f.logged_at at time zone (select tz from zone))::date as logged_date,
           extract(hour from (f.logged_at at time zone (select tz from zone))) as logged_hour
      from public.food_logs f
     where f.user_id = p_user
  ),
  days as (select distinct date from food where logged_date = date),
  -- Gaps and islands: consecutive dates share (date - row_number()).
  islands as (
    select date - (row_number() over (order by date))::int as grp from days
  ),
  runs as (select count(*)::int as len from islands group by grp),
  step_days_met as (
    select s.date
      from public.step_logs s
     where s.user_id = p_user
       and s.steps >= (select target from goal)
  ),
  step_islands as (
    select date - (row_number() over (order by date))::int as grp
      from step_days_met
  ),
  step_runs as (select count(*)::int as len from step_islands group by grp)
  select
    (select count(*)::int from food),
    (select coalesce(max(len), 0) from runs),
    (select count(*)::int from food where logged_hour < 8),
    (select count(*)::int from public.workout_logs  where user_id = p_user),
    (select count(*)::int from public.weight_entries where user_id = p_user),
    (select count(*)::int from public.weight_entries
      where user_id = p_user and nullif(btrim(coalesce(photo_url, '')), '') is not null),
    -- water_logs is UNIQUE (user_id, date), so one row is one day and amount_ml
    -- is that day's running total.
    (select count(*)::int from public.water_logs
      where user_id = p_user and amount_ml >= 2000),
    (select count(*)::int from public.saved_meals  where user_id = p_user),
    (select count(*)::int from step_days_met),
    (select coalesce(max(len), 0) from step_runs);
$function$
;
