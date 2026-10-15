-- Part 2: all 66 public functions, verbatim from pg_get_functiondef().
-- check_function_bodies is off so they load before the tables' constraints
-- and in any order relative to each other.

SET check_function_bodies = false;
SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION public.ai_plan_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  uid uuid := auth.uid();
  paid boolean;
  week_n int;
  month_n int;
  next_at timestamptz;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select coalesce(p.access_until > now(), false)
         and exists (
           select 1 from public.subscription_charges c
            where c.user_id = uid and c.refunded_at is null
         )
    into paid
    from public.user_profiles p
   where p.id = uid;
  paid := coalesce(paid, false);
  if not paid then
    select count(*) into week_n from public.ai_plan_generations where user_id = uid;
    return jsonb_build_object('paid', false, 'allowed', week_n < 2, 'next', null);
  end if;
  select count(*) into week_n from public.ai_plan_generations
   where user_id = uid and created_at > now() - interval '7 days';
  select count(*) into month_n from public.ai_plan_generations
   where user_id = uid and created_at > now() - interval '30 days';
  if week_n >= 2 then
    select created_at + interval '7 days' into next_at
      from public.ai_plan_generations
     where user_id = uid and created_at > now() - interval '7 days'
     order by created_at desc offset 1 limit 1;
  end if;
  if month_n >= 4 then
    select greatest(next_at, created_at + interval '30 days') into next_at
      from public.ai_plan_generations
     where user_id = uid and created_at > now() - interval '30 days'
     order by created_at desc offset 3 limit 1;
  end if;
  return jsonb_build_object('paid', true, 'allowed', next_at is null, 'next', next_at);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ai_verified_similar(q text, min_sim real)
 RETURNS TABLE(canonical_key text, search_key text, food_name text, food_class text, basis text, piece_g numeric, enerc numeric, protcnt numeric, fatce numeric, choavldf numeric, fibtg numeric, sim real)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  perform set_config('pg_trgm.similarity_threshold', min_sim::text, true);

  -- Every column is qualified and the ordering repeats the expression rather
  -- than naming `sim`: RETURNS TABLE makes each output column a plpgsql
  -- variable, so an unqualified reference would resolve to the variable.
  return query
    select v.canonical_key, v.search_key, v.food_name, v.food_class, v.basis,
           v.piece_g, v.enerc, v.protcnt, v.fatce, v.choavldf, v.fibtg,
           similarity(v.search_key, q) as sim
    from public.ai_verified v
    where v.search_key % q
      and similarity(v.search_key, q) >= min_sim
    order by similarity(v.search_key, q) desc
    limit 1;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.award_achievement(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  caller uuid := auth.uid();
  a      public.achievements%rowtype;
  m      record;
  actual int;
begin
  if caller is null then
    raise exception 'Unauthorized';
  end if;

  select * into a from public.achievements where id = p_id;
  if not found then
    raise exception 'Unknown achievement %', p_id;
  end if;

  select * into m from public.user_achievement_metrics(caller);
  actual := case a.metric
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
            end;

  if actual < a.threshold then
    raise exception 'Not earned: % is %, needs %', a.metric, actual, a.threshold;
  end if;

  insert into public.user_achievements (user_id, achievement_id)
  values (caller, p_id)
  on conflict (user_id, achievement_id) do nothing;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bump_history_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_col text := TG_ARGV[0];
  v_floor date := current_date - 6;
  v_old boolean :=
    (TG_OP in ('UPDATE', 'DELETE') and (to_jsonb(OLD) ->> v_col)::date < v_floor)
    or (TG_OP in ('INSERT', 'UPDATE') and (to_jsonb(NEW) ->> v_col)::date < v_floor);
begin
  update public.user_profiles
    set log_version = log_version + 1,
        history_version = history_version + case when v_old then 1 else 0 end
    where id = coalesce(NEW.user_id, OLD.user_id);
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bump_plan_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  update public.user_profiles
    set plan_version = plan_version + 1
    where id = coalesce(NEW.user_id, OLD.user_id);
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bump_profile_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_counters text[] :=
    array['history_version', 'log_version', 'plan_version', 'profile_version'];
begin
  if (to_jsonb(NEW) - v_counters) is distinct from (to_jsonb(OLD) - v_counters) then
    NEW.profile_version := OLD.profile_version + 1;
  end if;
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_food_log_daily_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_daily_target numeric;
  v_daily_ceiling numeric;
  v_current_day_total numeric;
begin
  if NEW.calories > 4000 then
    raise exception 'Single food item cannot exceed 4,000 kcal (got %)', round(NEW.calories::numeric, 1);
  end if;

  -- Lowering an entry never blocks, so days already over the ceiling stay editable.
  if TG_OP = 'UPDATE'
     and NEW.user_id = OLD.user_id
     and NEW.date = OLD.date
     and coalesce(NEW.calories, 0) <= coalesce(OLD.calories, 0) then
    return NEW;
  end if;

  -- Serialise writes per user-day so parallel inserts cannot each pass the sum check.
  perform pg_advisory_xact_lock(hashtextextended(NEW.user_id::text || NEW.date::text, 0));

  select daily_calorie_target
  into v_daily_target
  from public.user_profiles
  where id = NEW.user_id;

  if v_daily_target is null or v_daily_target <= 0 then
    v_daily_target := 2000;
  end if;

  v_daily_ceiling := least(10000, greatest(5000, round(v_daily_target * 2.0)));

  select coalesce(sum(calories), 0)
  into v_current_day_total
  from public.food_logs
  where user_id = NEW.user_id
    and date = NEW.date
    and (TG_OP = 'INSERT' or id <> OLD.id);

  if v_current_day_total + coalesce(NEW.calories, 0) > v_daily_ceiling then
    raise exception 'Daily limit of % kcal reached (current: % kcal, attempted: +% kcal)',
      v_daily_ceiling,
      round(v_current_day_total::numeric),
      round(coalesce(NEW.calories, 0)::numeric);
  end if;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_workout_set_daily_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_new_sets int;
  v_logged int;
  v_cap int;
begin
  if jsonb_typeof(NEW.exercises_done) is distinct from 'array' then
    return NEW;
  end if;

  v_new_sets := jsonb_array_length(NEW.exercises_done);

  if TG_OP = 'UPDATE'
     and NEW.user_id = OLD.user_id
     and NEW.date = OLD.date
     and NEW.workout_name = OLD.workout_name
     and jsonb_typeof(OLD.exercises_done) = 'array'
     and v_new_sets <= jsonb_array_length(OLD.exercises_done) then
    return NEW;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(NEW.user_id::text || NEW.date::text || NEW.workout_name, 0)
  );

  select case when access_until > now() then 10 else 6 end
  into v_cap
  from public.user_profiles
  where id = NEW.user_id;

  v_cap := coalesce(v_cap, 6);

  select coalesce(sum(jsonb_array_length(exercises_done)), 0)
  into v_logged
  from public.workout_logs
  where user_id = NEW.user_id
    and date = NEW.date
    and workout_name = NEW.workout_name
    and jsonb_typeof(exercises_done) = 'array'
    and (TG_OP = 'INSERT' or id <> OLD.id);

  if v_logged + v_new_sets > v_cap then
    raise exception 'Daily limit of % sets for this exercise reached.', v_cap;
  end if;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_ai_plan()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  uid uuid := auth.uid();
  new_id uuid;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('ai_plan:' || uid::text));
  if not (public.ai_plan_status() ->> 'allowed')::boolean then
    return null;
  end if;
  insert into public.ai_plan_generations (user_id) values (uid) returning id into new_id;
  return new_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_photo_download()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  uid uuid := auth.uid();
  month_start timestamptz :=
    date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  used int;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('photo_download:' || uid::text));
  select count(*) into used from public.photo_downloads
   where user_id = uid and created_at >= month_start;
  if used >= 31 then
    return false;
  end if;
  insert into public.photo_downloads (user_id) values (uid);
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_power_log(p_day date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  uid uuid := auth.uid();
  new_id uuid;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('power_log:' || uid::text));
  if public.power_logs_left(p_day) <= 0 then
    return null;
  end if;
  insert into public.power_log_uses (user_id, day) values (uid, p_day)
    returning id into new_id;
  return new_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_referral(code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller     uuid := auth.uid();
  owner      uuid;
  normalized text := upper(btrim(coalesce(code, '')));
begin
  if caller is null then
    raise exception 'Unauthorized';
  end if;

  if normalized !~ '^[A-Z]{3}[0-9]{5}$' then
    return false;
  end if;

  -- First claim wins; an existing attribution is never re-pointed.
  if exists (select 1 from public.referrals where referee_id = caller) then
    return false;
  end if;

  select id into owner from public.user_profiles where referral_code = normalized;
  if owner is null or owner = caller then
    return false;
  end if;

  insert into public.referrals (referrer_id, referee_id, code_used)
    values (owner, caller, normalized)
    on conflict (referee_id) do nothing;

  return found;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.data_export_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  uid uuid := auth.uid();
  paid boolean;
  out jsonb := '{}'::jsonb;
  k text;
  win interval;
  last_at timestamptz;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select coalesce(p.access_until > now(), false)
         and exists (
           select 1 from public.subscription_charges c
            where c.user_id = uid and c.refunded_at is null
         )
    into paid
    from public.user_profiles p
   where p.id = uid;
  paid := coalesce(paid, false);
  foreach k in array array['json', 'csv', 'weight_pdf'] loop
    win := case when k = 'json' or (k = 'csv' and paid) then interval '7 days'
                else interval '30 days' end;
    select max(e.created_at) into last_at
      from public.data_exports e
     where e.user_id = uid and e.kind = k;
    out := out || jsonb_build_object(
      k,
      case when last_at is null or last_at + win <= now() then null
           else last_at + win end
    );
  end loop;
  return jsonb_build_object('paid', paid, 'next', out);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_log_edit_window()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_col text := TG_ARGV[0];
  v_tz text;
  v_floor date;
begin
  if v_uid is null then
    return coalesce(NEW, OLD);
  end if;

  select timezone into v_tz from public.user_profiles where id = v_uid;
  begin
    v_floor := (now() at time zone coalesce(v_tz, 'Asia/Kolkata'))::date - 7;
  exception when others then
    v_floor := (now() at time zone 'Asia/Kolkata')::date - 7;
  end;

  if (TG_OP in ('UPDATE', 'DELETE') and (to_jsonb(OLD) ->> v_col)::date < v_floor)
     or (TG_OP in ('INSERT', 'UPDATE') and (to_jsonb(NEW) ->> v_col)::date < v_floor) then
    raise exception 'Entries older than 7 days are view-only.';
  end if;

  return coalesce(NEW, OLD);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_reminder_cap()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if (select count(*) from public.custom_reminders where user_id = new.user_id) >= 10 then
    raise exception 'Reminder limit reached (10 per user).'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_referral_code(full_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  prefix    text := public.referral_code_prefix(full_name);
  candidate text;
  attempts  int := 0;
begin
  loop
    candidate := prefix || lpad(floor(random() * 100000)::int::text, 5, '0');
    exit when not exists (
      select 1 from public.user_profiles where referral_code = candidate
    );
    attempts := attempts + 1;
    -- 100k slots per prefix; 50 collisions means something is badly wrong, and
    -- failing loudly beats spinning forever inside a signup transaction.
    if attempts > 50 then
      raise exception 'Could not allocate a referral code for prefix %', prefix;
    end if;
  end loop;
  return candidate;
end;
$function$
;

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

CREATE OR REPLACE FUNCTION public.ops_diagnose_access(user_ref text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.ops_engagement(period_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with active as (
    select count(distinct user_id) n from food_logs where logged_at >= now() - make_interval(days => period_days)
  )
  select jsonb_build_object(
    'period_days',  period_days,
    'active_users', (select n from active),
    'food_logs',    (select count(*) from food_logs where logged_at >= now() - make_interval(days => period_days)),
    'workout_logs', (select count(*) from workout_logs where logged_at >= now() - make_interval(days => period_days)),
    'weigh_ins',    (select count(*) from weight_entries where created_at >= now() - make_interval(days => period_days)),
    'water_logs',   (select count(*) from water_logs where updated_at >= now() - make_interval(days => period_days)),
    'saved_meals',  (select count(*) from saved_meals where created_at >= now() - make_interval(days => period_days)),
    'food_logs_per_active', case when (select n from active) = 0 then 0
      else round((select count(*) from food_logs where logged_at >= now() - make_interval(days => period_days))::numeric / (select n from active), 1) end,
    'median_days_logged', (
      select coalesce(percentile_cont(0.5) within group (order by c), 0)
      from (select count(distinct date) c from food_logs where logged_at >= now() - make_interval(days => period_days) group by user_id) x)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.ops_funnel()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'signed_up',       (select count(*) from user_profiles),
    'completed_quiz',  (select count(*) from user_profiles where daily_calorie_target is not null),
    'started_trial',   (select count(*) from user_profiles where trial_start_date is not null),
    'logged_once',     (select count(distinct user_id) from food_logs),
    'logged_3_days',   (select count(*) from (select user_id from food_logs group by user_id having count(distinct date) >= 3) x),
    'eligible_for_d7', (select count(*) from user_profiles where created_at <= now() - interval '7 days'),
    'active_at_d7',    (select count(distinct f.user_id) from food_logs f join user_profiles p on p.id = f.user_id
                         where p.created_at <= now() - interval '7 days' and f.logged_at >= p.created_at + interval '7 days'),
    'subscribed',      (select count(distinct user_id) from subscriptions)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.ops_grant_access(user_ref text, grant_days numeric, reason text, actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.ops_growth_daily(days integer DEFAULT 14)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(row order by row->>'date'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'date',      d::date,
      'signups',   (select count(*) from user_profiles p where p.created_at::date = d::date),
      'active',    (select count(distinct f.user_id) from food_logs f where f.logged_at::date = d::date),
      'food_logs', (select count(*) from food_logs f where f.logged_at::date = d::date)
    ) as row
    from generate_series((current_date - make_interval(days => days - 1))::date, current_date, interval '1 day') d
  ) s;
$function$
;

CREATE OR REPLACE FUNCTION public.ops_list_users(limit_n integer DEFAULT 15, sort_by text DEFAULT 'recent'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb)
  from (
    select
      left(p.id::text, 8)                                                    as id_short,
      p.created_at,
      p.daily_calorie_target is not null                                     as quiz_done,
      p.trial_start_date is not null                                         as trial_started,
      coalesce(p.access_until > now(), false)                                as has_access,
      (select count(*) from food_logs f where f.user_id = p.id)              as food_logs,
      (select count(distinct f.date) from food_logs f where f.user_id = p.id) as days_logged,
      (select max(f.logged_at) from food_logs f where f.user_id = p.id)      as last_log
    from user_profiles p
    order by
      -- 'active' surfaces who is still using it, 'inactive' surfaces who
      -- stalled, anything else is newest first.
      case when sort_by = 'active'   then (select max(f.logged_at) from food_logs f where f.user_id = p.id) end desc nulls last,
      case when sort_by = 'inactive' then (select count(*) from food_logs f where f.user_id = p.id) end asc,
      p.created_at desc
    limit least(greatest(limit_n, 1), 50)
  ) b;
$function$
;

CREATE OR REPLACE FUNCTION public.ops_notifications(period_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'period_days',    period_days,
    'by_status',      (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from notification_logs where updated_at >= now() - make_interval(days => period_days) group by status) s),
    'by_type',        (select coalesce(jsonb_object_agg(type, n), '{}'::jsonb) from (select type, count(*) n from notification_logs where updated_at >= now() - make_interval(days => period_days) group by type) t),
    'snoozed_any',    (select count(*) from notification_logs where snooze_count > 0 and updated_at >= now() - make_interval(days => period_days)),
    'hit_snooze_cap', (select count(*) from notification_logs where snooze_count >= max_snooze_allowed and updated_at >= now() - make_interval(days => period_days)),
    'quiet_overrides',(select count(*) from notification_logs where quiet_hours_override and updated_at >= now() - make_interval(days => period_days)),
    'reminders_enabled',(select count(*) from custom_reminders where enabled),
    'morning_enabled',  (select count(*) from user_notification_preferences where morning_enabled)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.ops_recent_activity(hours integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.ops_reset_notifications(user_ref text, actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.ops_resolve_user(user_ref text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id from public.user_profiles p
   where p.id::text = trim(user_ref)
      or left(p.id::text, 8) = trim(user_ref)
   limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.ops_revenue(period_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'period_days',         period_days,
    'charges',             (select count(*) from subscription_charges where charged_at >= now() - make_interval(days => period_days)),
    'gross_rupees',        (select coalesce(sum(amount_paise), 0) / 100.0 from subscription_charges where charged_at >= now() - make_interval(days => period_days) and refunded_at is null),
    'refunds',             (select count(*) from subscription_charges where refunded_at >= now() - make_interval(days => period_days)),
    'refund_requests_open',(select count(*) from refund_requests where status = 'pending'),
    'subs_total',          (select count(*) from subscriptions),
    'subs_active',         (select count(*) from subscriptions where status = 'active'),
    'zero_amount_charges', (select count(*) from subscription_charges where amount_paise = 0),
    'trial_to_paid',       jsonb_build_object(
                             'trials',    (select count(*) from user_profiles where trial_start_date is not null),
                             'converted', (select count(distinct user_id) from subscriptions)),
    'by_tier',             (select coalesce(jsonb_object_agg(tier, n), '{}'::jsonb)
                              from (select tier, count(*) n from subscription_charges
                                     where charged_at >= now() - make_interval(days => period_days) group by tier) t)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.ops_revoke_grant(grant_id uuid, actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.ops_search_users(q text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with needle as (
    -- Escape LIKE metacharacters, or a query of "%" matches every user at once.
    select '%' || replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id_short',   left(p.id::text, 8),
    'signed_up',  p.created_at,
    'has_access', coalesce(p.access_until > now(), false),
    'user_supplied', jsonb_build_object(
      'full_name', p.full_name,
      'username',  p.username,
      'email',     u.email
    )
  )), '[]'::jsonb)
  from user_profiles p
  left join auth.users u on u.id = p.id
  cross join needle n
  -- Two characters minimum: a single letter would return most of the table.
  where char_length(trim(q)) >= 2
    and (p.full_name ilike n.pat escape '\'
      or p.username  ilike n.pat escape '\'
      or u.email     ilike n.pat escape '\'
      or p.id::text  ilike n.pat escape '\')
  limit 10;
$function$
;

CREATE OR REPLACE FUNCTION public.ops_system_health()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'webhook_events_24h',   (select count(*) from webhook_events where received_at >= now() - interval '24 hours'),
    'webhook_events_total', (select count(*) from webhook_events),
    'hours_since_charge',   (select round(extract(epoch from (now() - max(charged_at))) / 3600.0, 1) from subscription_charges),
    'zero_amount_charges',  (select count(*) from subscription_charges where amount_paise = 0),
    'open_refund_requests', (select count(*) from refund_requests where status = 'pending'),
    'notifications_pending',(select count(*) from notification_logs where status = 'pending'),
    'notifications_overdue',(select count(*) from notification_logs where status = 'pending' and current_scheduled_at < now() - interval '1 hour'),
    'custom_reminders',     (select count(*) from custom_reminders),
    'users_with_prefs',     (select count(*) from user_notification_preferences),
    'profiles_missing_targets',(select count(*) from user_profiles where daily_calorie_target is null),
    'distinct_timezones',   (select count(distinct timezone) from user_profiles)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.ops_user_detail(user_ref text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select jsonb_build_object(
      'found', true,
      'id_short',  left(p.id::text, 8),
      'signed_up', p.created_at,
      'timezone',  p.timezone,
      'user_supplied', jsonb_build_object(
        'full_name', p.full_name,
        'username',  p.username,
        'email',     (select u.email from auth.users u where u.id = p.id)
      ),
      'entitlement', jsonb_build_object(
        'has_access_now',     coalesce(p.access_until > now(), false),
        'access_until',       p.access_until,
        'trial_start_date',   p.trial_start_date,
        'selected_plan',      p.selected_plan,
        'bonus_trial_days',   p.bonus_trial_days,
        'bonus_premium_days', p.bonus_premium_days
      ),
      'billing', jsonb_build_object(
        'subscriptions',  (select coalesce(jsonb_agg(jsonb_build_object(
                             'status', s.status, 'tier', s.tier,
                             'created_at', s.created_at, 'cancelled_at', s.cancelled_at)), '[]'::jsonb)
                           from subscriptions s where s.user_id = p.id),
        'charges',        (select count(*) from subscription_charges c where c.user_id = p.id),
        'paid_rupees',    (select coalesce(sum(c.amount_paise), 0) / 100.0
                            from subscription_charges c
                           where c.user_id = p.id and c.refunded_at is null),
        'last_charge_at', (select max(c.charged_at) from subscription_charges c where c.user_id = p.id),
        'refund_requests',(select count(*) from refund_requests r where r.user_id = p.id)
      ),
      'activity', jsonb_build_object(
        'food_logs',     (select count(*) from food_logs f where f.user_id = p.id),
        'days_logged',   (select count(distinct f.date) from food_logs f where f.user_id = p.id),
        'last_food_log', (select max(f.logged_at) from food_logs f where f.user_id = p.id),
        'workout_logs',  (select count(*) from workout_logs w where w.user_id = p.id),
        'weigh_ins',     (select count(*) from weight_entries e where e.user_id = p.id),
        'quiz_done',     p.daily_calorie_target is not null
      ),
      'referrals', jsonb_build_object(
        'made',                (select count(*) from referrals r where r.referrer_id = p.id),
        'referred_by_someone', exists (select 1 from referrals r where r.referee_id = p.id)
      )
    )
    from user_profiles p
    where p.id::text = trim(user_ref)
       or left(p.id::text, 8) = trim(user_ref)
    limit 1),
    -- A miss is an answer, not an error: the agent should say "no such user"
    -- rather than surface a null it has to interpret.
    jsonb_build_object('found', false, 'looked_for', trim(user_ref))
  );
$function$
;

CREATE OR REPLACE FUNCTION public.ops_users_overview(period_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'period_days',      period_days,
    'users_total',      (select count(*) from user_profiles),
    'users_new',        (select count(*) from user_profiles where created_at >= now() - make_interval(days => period_days)),
    'users_prev_period',(select count(*) from user_profiles where created_at >= now() - make_interval(days => period_days * 2) and created_at < now() - make_interval(days => period_days)),
    'active_users',     (select count(distinct user_id) from food_logs where logged_at >= now() - make_interval(days => period_days)),
    'trials_started',   (select count(*) from user_profiles where trial_start_date is not null),
    'holding_access',   (select count(*) from user_profiles where access_until > now()),
    'quiz_completed',   (select count(*) from user_profiles where daily_calorie_target is not null)
  );
$function$
;

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
