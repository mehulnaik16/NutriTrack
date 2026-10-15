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
