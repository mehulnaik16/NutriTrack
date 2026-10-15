-- Whole schema of the old project in one file, for pasting into the new
-- project's SQL editor. Same content as 00..08 run in order.
BEGIN;

-- ===== 00_extensions.sql =====
-- Part 0: extensions. A new Supabase project already has pgcrypto, uuid-ossp,
-- pg_stat_statements, supabase_vault and plpgsql. pg_trgm is the one this
-- schema adds (trigram indexes on ai_verified / ai_unverified and
-- ai_verified_similar()).

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- ===== 01_tables.sql =====
-- Live schema of Supabase project xadkrjfvsjdfhjcmxwbh ("mehulnaik16's Project"),
-- read from the Postgres catalogs on 2026-10-15. Part 1: the 36 public tables.
-- Run the files in order: 00_extensions, 01_tables, 02_functions,
-- 03_constraints_indexes, 04_triggers, 05_rls_policies, 06_grants, 07_storage.

SET check_function_bodies = false;
SET search_path = public, extensions;

CREATE TABLE public.achievements (
  id text NOT NULL,
  metric text NOT NULL,
  threshold integer NOT NULL,
  xp integer NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.ai_flagged (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  canonical_key text NOT NULL,
  enerc numeric NOT NULL,
  protcnt numeric NOT NULL,
  fatce numeric NOT NULL,
  choavldf numeric NOT NULL,
  fibtg numeric NOT NULL,
  edited_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ai_plan_generations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ai_unverified (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  canonical_key text NOT NULL,
  search_key text NOT NULL,
  food_name text NOT NULL,
  food_class text NOT NULL,
  basis text NOT NULL,
  piece_g numeric,
  enerc numeric NOT NULL,
  protcnt numeric NOT NULL,
  fatce numeric NOT NULL,
  choavldf numeric NOT NULL,
  fibtg numeric NOT NULL,
  aliases text[] DEFAULT '{}'::text[] NOT NULL,
  engine text NOT NULL,
  model text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  user_hash text,
  group_key text DEFAULT ''::text NOT NULL
);

CREATE TABLE public.ai_verified (
  canonical_key text NOT NULL,
  search_key text NOT NULL,
  food_name text NOT NULL,
  food_class text NOT NULL,
  basis text NOT NULL,
  piece_g numeric,
  enerc numeric NOT NULL,
  protcnt numeric NOT NULL,
  fatce numeric NOT NULL,
  choavldf numeric NOT NULL,
  fibtg numeric NOT NULL,
  aliases text[] DEFAULT '{}'::text[] NOT NULL,
  models text[] DEFAULT '{}'::text[] NOT NULL,
  verified_at timestamp with time zone DEFAULT now() NOT NULL,
  alias_keys text[] DEFAULT '{}'::text[] NOT NULL
);

CREATE TABLE public.body_measurements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  measured_at date DEFAULT CURRENT_DATE NOT NULL,
  measurements jsonb DEFAULT '{}'::jsonb NOT NULL,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.cheers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  from_user uuid NOT NULL,
  to_user uuid NOT NULL,
  date date DEFAULT CURRENT_DATE NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.custom_reminders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  label text NOT NULL,
  note text,
  remind_at time without time zone NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.data_exports (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.food_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  food_name text NOT NULL,
  meal_type text NOT NULL,
  quantity_g double precision NOT NULL,
  calories double precision DEFAULT 0,
  protein_g double precision DEFAULT 0,
  carbs_g double precision DEFAULT 0,
  fat_g double precision DEFAULT 0,
  date date DEFAULT CURRENT_DATE,
  logged_at timestamp with time zone DEFAULT now(),
  fiber_g numeric DEFAULT 0 NOT NULL,
  unit text DEFAULT 'g'::text NOT NULL,
  unit_quantity double precision
);

CREATE TABLE public.friendships (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  requester_id uuid NOT NULL,
  addressee_id uuid NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  responded_at timestamp with time zone
);

CREATE TABLE public.gym_links (
  user_id uuid NOT NULL,
  partner_code text NOT NULL,
  gym_name text NOT NULL,
  source text NOT NULL,
  gift_spent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  partner_type text DEFAULT 'gym'::text NOT NULL
);

CREATE TABLE public.gym_memberships (
  user_id uuid NOT NULL,
  partner_code text NOT NULL,
  gym_name text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.health_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  condition text NOT NULL,
  systolic integer,
  diastolic integer,
  glucose integer,
  logged_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.manual_grants (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  days numeric NOT NULL,
  effective_at timestamp with time zone DEFAULT now() NOT NULL,
  clawback_at timestamp with time zone,
  reason text NOT NULL,
  granted_by text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.notification_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  reminder_id uuid,
  original_scheduled_at timestamp with time zone NOT NULL,
  current_scheduled_at timestamp with time zone NOT NULL,
  snooze_count integer DEFAULT 0 NOT NULL,
  max_snooze_allowed integer DEFAULT 3 NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  quiet_hours_override boolean DEFAULT false NOT NULL,
  os_notification_id integer,
  last_action_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ops_agent_threads (
  chat_id bigint NOT NULL,
  messages jsonb DEFAULT '[]'::jsonb NOT NULL,
  turn_count integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ops_audit_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  at timestamp with time zone DEFAULT now() NOT NULL,
  actor text NOT NULL,
  action text NOT NULL,
  target_user uuid,
  detail jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.ops_pending_actions (
  code text NOT NULL,
  chat_id bigint NOT NULL,
  requested_by bigint NOT NULL,
  action text NOT NULL,
  args jsonb DEFAULT '{}'::jsonb NOT NULL,
  summary text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '00:05:00'::interval) NOT NULL,
  consumed_at timestamp with time zone
);

CREATE TABLE public.photo_downloads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.power_log_uses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  day date NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.referrals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  referrer_id uuid NOT NULL,
  referee_id uuid NOT NULL,
  code_used text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  qualified_at timestamp with time zone,
  subscribed_at timestamp with time zone
);

CREATE TABLE public.refund_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  charge_id uuid NOT NULL,
  user_id uuid,
  reason text NOT NULL,
  status text DEFAULT 'open'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  resolved_at timestamp with time zone
);

CREATE TABLE public.saved_meals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  ingredients jsonb DEFAULT '[]'::jsonb,
  calories numeric NOT NULL,
  protein_g numeric NOT NULL,
  carbs_g numeric NOT NULL,
  fat_g numeric NOT NULL,
  fiber_g numeric DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.step_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  date date DEFAULT CURRENT_DATE NOT NULL,
  steps integer DEFAULT 0 NOT NULL,
  source text DEFAULT 'manual'::text NOT NULL,
  distance_m integer,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.subscription_charges (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  subscription_id uuid NOT NULL,
  user_id uuid,
  provider_payment_id text NOT NULL,
  amount_paise integer NOT NULL,
  tier text NOT NULL,
  period_days integer NOT NULL,
  charged_at timestamp with time zone DEFAULT now() NOT NULL,
  refunded_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  provider text DEFAULT 'razorpay'::text NOT NULL,
  base_paise integer NOT NULL,
  seq smallint NOT NULL
);

CREATE TABLE public.subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  provider text DEFAULT 'razorpay'::text NOT NULL,
  provider_subscription_id text NOT NULL,
  tier text NOT NULL,
  status text DEFAULT 'created'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  cancelled_at timestamp with time zone
);

CREATE TABLE public.user_achievements (
  user_id uuid NOT NULL,
  achievement_id text NOT NULL,
  awarded_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_notification_preferences (
  user_id uuid NOT NULL,
  morning_enabled boolean DEFAULT true NOT NULL,
  morning_time time without time zone DEFAULT '07:00:00'::time without time zone NOT NULL,
  custom_enabled boolean DEFAULT true NOT NULL,
  allow_snooze boolean DEFAULT true NOT NULL,
  max_snooze_cycles integer DEFAULT 3 NOT NULL,
  snooze_intervals integer[] DEFAULT ARRAY[600, 3600] NOT NULL,
  quiet_hours_on boolean DEFAULT false NOT NULL,
  quiet_from time without time zone DEFAULT '22:00:00'::time without time zone NOT NULL,
  quiet_to time without time zone DEFAULT '06:00:00'::time without time zone NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  motivation_next_index integer,
  motivation_next_at timestamp with time zone,
  motivation_scheduled integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.user_profiles (
  id uuid NOT NULL,
  full_name text,
  age integer,
  gender text,
  height_cm double precision,
  weight_kg double precision,
  activity_level text,
  goal text,
  bmi double precision,
  bmr double precision,
  tdee double precision,
  daily_calorie_target double precision,
  protein_target_g double precision,
  carbs_target_g double precision,
  fat_target_g double precision,
  selected_plan text,
  trial_start_date date,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  goal_weight_kg double precision,
  fiber_target_g numeric,
  whatsapp_no text,
  supplements_used text,
  current_streak integer DEFAULT 0,
  longest_streak integer DEFAULT 0,
  username text,
  referral_code text NOT NULL,
  bonus_trial_days smallint DEFAULT 0 NOT NULL,
  meal_frequency integer,
  has_seen_benefits_features_page boolean DEFAULT false NOT NULL,
  has_seen_refer_intro boolean DEFAULT false NOT NULL,
  meal_names jsonb DEFAULT '[]'::jsonb NOT NULL,
  water_goal_ml integer,
  water_cup_ml integer,
  bonus_premium_days smallint DEFAULT 0 NOT NULL,
  access_until timestamp with time zone,
  timezone text DEFAULT 'Asia/Kolkata'::text NOT NULL,
  motivation_seed integer DEFAULT (floor((random() * (1000000)::double precision)))::integer NOT NULL,
  gym_attribution_ended_at timestamp with time zone,
  steps_goal integer,
  stride_cm integer,
  diet_preference text,
  has_answered_tour_offer boolean DEFAULT false NOT NULL,
  theme text,
  history_version bigint DEFAULT 0 NOT NULL,
  log_version bigint DEFAULT 0 NOT NULL,
  plan_version bigint DEFAULT 0 NOT NULL,
  profile_version bigint DEFAULT 0 NOT NULL,
  notif_primer_first_log_shown boolean DEFAULT false NOT NULL,
  notif_primer_day5_shown boolean DEFAULT false NOT NULL,
  marketing_opt_in boolean DEFAULT false NOT NULL,
  phone text,
  heard_about text
);

CREATE TABLE public.water_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  date date DEFAULT CURRENT_DATE NOT NULL,
  amount_ml integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.webhook_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  provider text DEFAULT 'razorpay'::text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  received_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.weight_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  date date DEFAULT CURRENT_DATE NOT NULL,
  weight_kg double precision NOT NULL,
  photo_url text,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.workout_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  date date DEFAULT CURRENT_DATE NOT NULL,
  workout_name text NOT NULL,
  exercises_done jsonb DEFAULT '[]'::jsonb NOT NULL,
  duration_min integer DEFAULT 0 NOT NULL,
  calories_burned double precision DEFAULT 0 NOT NULL,
  logged_at timestamp with time zone DEFAULT now() NOT NULL,
  calc_method text DEFAULT 'TIER_MET'::text NOT NULL,
  confidence text DEFAULT 'estimated'::text NOT NULL
);

CREATE TABLE public.workout_plans (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  goal text NOT NULL,
  plan_json jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  custom_plan_day_idx smallint DEFAULT 0 NOT NULL,
  custom_plan_day_anchor date DEFAULT CURRENT_DATE NOT NULL
);

CREATE TABLE public.workout_profile (
  user_id uuid NOT NULL,
  fitness_level text NOT NULL,
  fitness_goal text NOT NULL,
  bench_weight_kg numeric,
  bench_reps smallint,
  squat_weight_kg numeric,
  squat_reps smallint,
  deadlift_weight_kg numeric,
  deadlift_reps smallint,
  training_days_per_week smallint NOT NULL,
  cardio_activities text[] DEFAULT '{}'::text[] NOT NULL,
  muscles_per_workout text DEFAULT 'not_sure'::text NOT NULL,
  preferred_workout_time_min smallint NOT NULL,
  preferred_training_plan text NOT NULL,
  completed_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  weight_unit text DEFAULT 'kg'::text NOT NULL,
  distance_unit text DEFAULT 'km'::text NOT NULL,
  orig_weight_unit text DEFAULT 'kg'::text NOT NULL,
  orig_distance_unit text DEFAULT 'km'::text NOT NULL
);

-- ===== 02_functions.sql =====
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

-- ===== 03_constraints_indexes.sql =====
-- Part 3: primary keys, unique and check constraints, foreign keys, indexes.
-- Runs after 02_functions.sql: measurements_are_sane calls measurements_valid().

SET search_path = public, extensions;

-- Primary keys
ALTER TABLE ONLY public.achievements ADD CONSTRAINT achievements_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_flagged ADD CONSTRAINT ai_flagged_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_plan_generations ADD CONSTRAINT ai_plan_generations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_unverified ADD CONSTRAINT ai_unverified_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_verified ADD CONSTRAINT ai_verified_pkey PRIMARY KEY (canonical_key);
ALTER TABLE ONLY public.body_measurements ADD CONSTRAINT body_measurements_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.cheers ADD CONSTRAINT cheers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.custom_reminders ADD CONSTRAINT custom_reminders_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.data_exports ADD CONSTRAINT data_exports_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.food_logs ADD CONSTRAINT food_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.friendships ADD CONSTRAINT friendships_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.gym_links ADD CONSTRAINT gym_links_pkey PRIMARY KEY (user_id);
ALTER TABLE ONLY public.gym_memberships ADD CONSTRAINT gym_memberships_pkey PRIMARY KEY (user_id);
ALTER TABLE ONLY public.health_logs ADD CONSTRAINT health_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.manual_grants ADD CONSTRAINT manual_grants_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.notification_logs ADD CONSTRAINT notification_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ops_agent_threads ADD CONSTRAINT ops_agent_threads_pkey PRIMARY KEY (chat_id);
ALTER TABLE ONLY public.ops_audit_log ADD CONSTRAINT ops_audit_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ops_pending_actions ADD CONSTRAINT ops_pending_actions_pkey PRIMARY KEY (code);
ALTER TABLE ONLY public.photo_downloads ADD CONSTRAINT photo_downloads_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.power_log_uses ADD CONSTRAINT power_log_uses_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.referrals ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.refund_requests ADD CONSTRAINT refund_requests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.saved_meals ADD CONSTRAINT saved_meals_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.step_logs ADD CONSTRAINT step_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.subscription_charges ADD CONSTRAINT subscription_charges_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_achievements ADD CONSTRAINT user_achievements_pkey PRIMARY KEY (user_id, achievement_id);
ALTER TABLE ONLY public.user_notification_preferences ADD CONSTRAINT user_notification_preferences_pkey PRIMARY KEY (user_id);
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.water_logs ADD CONSTRAINT water_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.webhook_events ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.weight_entries ADD CONSTRAINT weight_entries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.workout_logs ADD CONSTRAINT workout_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.workout_plans ADD CONSTRAINT workout_plans_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.workout_profile ADD CONSTRAINT workout_profile_pkey PRIMARY KEY (user_id);

-- Unique constraints
ALTER TABLE ONLY public.ai_flagged ADD CONSTRAINT ai_flagged_user_id_canonical_key_key UNIQUE (user_id, canonical_key);
ALTER TABLE ONLY public.body_measurements ADD CONSTRAINT body_measurements_user_id_measured_at_key UNIQUE (user_id, measured_at);
ALTER TABLE ONLY public.cheers ADD CONSTRAINT cheers_once_per_day UNIQUE (from_user, to_user, date);
ALTER TABLE ONLY public.referrals ADD CONSTRAINT referrals_referee_id_key UNIQUE (referee_id);
ALTER TABLE ONLY public.step_logs ADD CONSTRAINT step_logs_user_id_date_key UNIQUE (user_id, date);
ALTER TABLE ONLY public.subscription_charges ADD CONSTRAINT subscription_charges_provider_payment_id_key UNIQUE (provider_payment_id);
ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT subscriptions_provider_provider_subscription_id_key UNIQUE (provider, provider_subscription_id);
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT user_profiles_referral_code_key UNIQUE (referral_code);
ALTER TABLE ONLY public.water_logs ADD CONSTRAINT water_logs_user_id_date_key UNIQUE (user_id, date);
ALTER TABLE ONLY public.webhook_events ADD CONSTRAINT webhook_events_provider_event_id_key UNIQUE (provider, event_id);
ALTER TABLE ONLY public.weight_entries ADD CONSTRAINT weight_entries_user_id_date_key UNIQUE (user_id, date);

-- Check constraints
ALTER TABLE ONLY public.achievements ADD CONSTRAINT achievements_metric_check CHECK ((metric = ANY (ARRAY['food_count'::text, 'food_streak'::text, 'early_logs'::text, 'workout_count'::text, 'weight_count'::text, 'photo_count'::text, 'hydrated_days'::text, 'saved_meals'::text, 'step_days'::text, 'step_streak'::text])));
ALTER TABLE ONLY public.achievements ADD CONSTRAINT achievements_threshold_check CHECK ((threshold > 0));
ALTER TABLE ONLY public.achievements ADD CONSTRAINT achievements_xp_check CHECK ((xp >= 0));
ALTER TABLE ONLY public.ai_unverified ADD CONSTRAINT ai_unverified_basis_check CHECK ((basis = ANY (ARRAY['100g'::text, 'piece'::text])));
ALTER TABLE ONLY public.ai_verified ADD CONSTRAINT ai_verified_basis_check CHECK ((basis = ANY (ARRAY['100g'::text, 'piece'::text])));
ALTER TABLE ONLY public.body_measurements ADD CONSTRAINT measurements_are_sane CHECK (measurements_valid(measurements));
ALTER TABLE ONLY public.cheers ADD CONSTRAINT cheers_no_self CHECK ((from_user <> to_user));
ALTER TABLE ONLY public.custom_reminders ADD CONSTRAINT reminder_label_length CHECK (((char_length(label) >= 1) AND (char_length(label) <= 20)));
ALTER TABLE ONLY public.custom_reminders ADD CONSTRAINT reminder_note_length CHECK (((note IS NULL) OR (char_length(note) <= 40)));
ALTER TABLE ONLY public.data_exports ADD CONSTRAINT data_exports_kind_check CHECK ((kind = ANY (ARRAY['json'::text, 'csv'::text, 'weight_pdf'::text])));
ALTER TABLE ONLY public.food_logs ADD CONSTRAINT food_logs_macros_range CHECK ((((calories >= (0)::double precision) AND (calories <= (20000)::double precision)) AND ((protein_g >= (0)::double precision) AND (protein_g <= (2000)::double precision)) AND ((carbs_g >= (0)::double precision) AND (carbs_g <= (2000)::double precision)) AND ((fat_g >= (0)::double precision) AND (fat_g <= (2000)::double precision)) AND ((fiber_g >= (0)::numeric) AND (fiber_g <= (2000)::numeric))));
ALTER TABLE ONLY public.food_logs ADD CONSTRAINT food_logs_quantity_g_range CHECK (((quantity_g > (0)::double precision) AND (quantity_g <= (5000)::double precision)));
ALTER TABLE ONLY public.food_logs ADD CONSTRAINT food_logs_unit_quantity_positive CHECK (((unit_quantity IS NULL) OR (unit_quantity > (0)::double precision)));
ALTER TABLE ONLY public.friendships ADD CONSTRAINT friendships_no_self CHECK ((requester_id <> addressee_id));
ALTER TABLE ONLY public.friendships ADD CONSTRAINT friendships_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'blocked'::text])));
ALTER TABLE ONLY public.gym_links ADD CONSTRAINT gym_links_partner_type_check CHECK ((partner_type = ANY (ARRAY['gym'::text, 'doctor'::text, 'ugc'::text])));
ALTER TABLE ONLY public.gym_links ADD CONSTRAINT gym_links_source_check CHECK ((source = ANY (ARRAY['signup'::text, 'profile'::text])));
ALTER TABLE ONLY public.gym_memberships ADD CONSTRAINT gym_memberships_gym_name_check CHECK (((length(btrim(gym_name)) >= 1) AND (length(btrim(gym_name)) <= 80)));
ALTER TABLE ONLY public.gym_memberships ADD CONSTRAINT gym_memberships_partner_code_check CHECK ((partner_code ~ '^GYM-[A-Z]{1,12}-[0-9]{3}$'::text));
ALTER TABLE ONLY public.health_logs ADD CONSTRAINT health_logs_condition_check CHECK ((condition = ANY (ARRAY['hypertension'::text, 'diabetes'::text])));
ALTER TABLE ONLY public.health_logs ADD CONSTRAINT health_logs_diastolic_check CHECK (((diastolic IS NULL) OR ((diastolic >= 30) AND (diastolic <= 180))));
ALTER TABLE ONLY public.health_logs ADD CONSTRAINT health_logs_glucose_check CHECK (((glucose IS NULL) OR ((glucose >= 50) AND (glucose <= 1800))));
ALTER TABLE ONLY public.health_logs ADD CONSTRAINT health_logs_systolic_check CHECK (((systolic IS NULL) OR ((systolic >= 50) AND (systolic <= 280))));
ALTER TABLE ONLY public.health_logs ADD CONSTRAINT health_logs_valid_condition CHECK ((((condition = 'hypertension'::text) AND (systolic IS NOT NULL) AND (diastolic IS NOT NULL) AND (systolic > diastolic) AND (glucose IS NULL)) OR ((condition = 'diabetes'::text) AND (glucose IS NOT NULL) AND (systolic IS NULL) AND (diastolic IS NULL))));
ALTER TABLE ONLY public.manual_grants ADD CONSTRAINT manual_grant_days_sane CHECK (((days > (0)::numeric) AND (days <= (365)::numeric)));
ALTER TABLE ONLY public.manual_grants ADD CONSTRAINT manual_grant_reason_present CHECK (((char_length(reason) >= 3) AND (char_length(reason) <= 200)));
ALTER TABLE ONLY public.notification_logs ADD CONSTRAINT notification_status_known CHECK ((status = ANY (ARRAY['pending'::text, 'delivered'::text, 'snoozed'::text, 'dismissed'::text, 'opened'::text, 'archived'::text])));
ALTER TABLE ONLY public.notification_logs ADD CONSTRAINT notification_type_known CHECK ((type = ANY (ARRAY['morning_motivation'::text, 'custom_reminder'::text])));
ALTER TABLE ONLY public.notification_logs ADD CONSTRAINT snooze_count_sane CHECK ((snooze_count >= 0));
ALTER TABLE ONLY public.referrals ADD CONSTRAINT no_self_referral CHECK ((referrer_id <> referee_id));
ALTER TABLE ONLY public.referrals ADD CONSTRAINT referrals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'trial'::text, 'subscribed'::text])));
ALTER TABLE ONLY public.refund_requests ADD CONSTRAINT refund_requests_status_check CHECK ((status = ANY (ARRAY['open'::text, 'approved'::text, 'rejected'::text, 'processed'::text])));
ALTER TABLE ONLY public.step_logs ADD CONSTRAINT step_logs_distance_range CHECK (((distance_m IS NULL) OR ((distance_m >= 0) AND (distance_m <= 300000))));
ALTER TABLE ONLY public.step_logs ADD CONSTRAINT step_logs_source_valid CHECK ((source = ANY (ARRAY['manual'::text, 'sensor'::text, 'health_connect'::text])));
ALTER TABLE ONLY public.step_logs ADD CONSTRAINT step_logs_steps_range CHECK (((steps >= 0) AND (steps <= 200000)));
ALTER TABLE ONLY public.subscription_charges ADD CONSTRAINT subscription_charges_amount_paise_check CHECK ((amount_paise >= 0));
ALTER TABLE ONLY public.subscription_charges ADD CONSTRAINT subscription_charges_base_paise_check CHECK ((base_paise >= 0));
ALTER TABLE ONLY public.subscription_charges ADD CONSTRAINT subscription_charges_period_days_check CHECK (((period_days >= 1) AND (period_days <= 400)));
ALTER TABLE ONLY public.subscription_charges ADD CONSTRAINT subscription_charges_provider_check CHECK ((provider = ANY (ARRAY['razorpay'::text, 'google_play'::text, 'apple'::text])));
ALTER TABLE ONLY public.subscription_charges ADD CONSTRAINT subscription_charges_tier_check CHECK ((tier = ANY (ARRAY['monthly'::text, 'quarterly'::text, 'yearly'::text])));
ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT subscriptions_provider_check CHECK ((provider = ANY (ARRAY['razorpay'::text, 'google_play'::text, 'apple'::text])));
ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT subscriptions_status_check CHECK ((status = ANY (ARRAY['created'::text, 'authenticated'::text, 'active'::text, 'pending'::text, 'halted'::text, 'cancelled'::text, 'completed'::text, 'expired'::text])));
ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT subscriptions_tier_check CHECK ((tier = ANY (ARRAY['monthly'::text, 'quarterly'::text, 'yearly'::text])));
ALTER TABLE ONLY public.user_notification_preferences ADD CONSTRAINT motivation_next_index_nonneg CHECK ((motivation_next_index >= 0));
ALTER TABLE ONLY public.user_notification_preferences ADD CONSTRAINT motivation_scheduled_range CHECK (((motivation_scheduled >= 0) AND (motivation_scheduled <= 64)));
ALTER TABLE ONLY public.user_notification_preferences ADD CONSTRAINT snooze_cycles_in_range CHECK (((max_snooze_cycles >= 1) AND (max_snooze_cycles <= 3)));
ALTER TABLE ONLY public.user_notification_preferences ADD CONSTRAINT snooze_intervals_known CHECK ((((array_length(snooze_intervals, 1) >= 1) AND (array_length(snooze_intervals, 1) <= 3)) AND (snooze_intervals <@ ARRAY[600, 1800, 3600])));
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT user_profiles_age_range CHECK (((age IS NULL) OR ((age >= 18) AND (age <= 100)))) NOT VALID;
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT user_profiles_diet_preference_check CHECK ((diet_preference = ANY (ARRAY['veg'::text, 'veg_eggs'::text, 'non_veg'::text])));
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT user_profiles_goal_weight_kg_range CHECK (((goal_weight_kg IS NULL) OR ((goal_weight_kg >= (30)::double precision) AND (goal_weight_kg <= (200)::double precision)))) NOT VALID;
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT user_profiles_heard_about_check CHECK (((heard_about IS NULL) OR (heard_about = ANY (ARRAY['instagram'::text, 'youtube'::text, 'google'::text, 'friend'::text, 'gym'::text, 'facebook'::text, 'x'::text, 'app_store'::text, 'other'::text]))));
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT user_profiles_height_cm_range CHECK (((height_cm IS NULL) OR ((height_cm >= (100)::double precision) AND (height_cm <= (250)::double precision)))) NOT VALID;
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT user_profiles_phone_check CHECK (((phone IS NULL) OR (phone ~ '^\+[0-9]{8,15}$'::text)));
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT user_profiles_steps_goal_range CHECK (((steps_goal IS NULL) OR ((steps_goal >= 1000) AND (steps_goal <= 100000)))) NOT VALID;
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT user_profiles_stride_cm_range CHECK (((stride_cm IS NULL) OR ((stride_cm >= 30) AND (stride_cm <= 120)))) NOT VALID;
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT user_profiles_theme_check CHECK ((theme = ANY (ARRAY['dark'::text, 'light'::text, 'theme-ocean'::text, 'theme-sunset'::text, 'theme-forest'::text, 'theme-cyber'::text, 'theme-cyberdeck'::text, 'theme-isro'::text, 'theme-mono'::text])));
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT user_profiles_weight_kg_range CHECK (((weight_kg IS NULL) OR ((weight_kg >= (30)::double precision) AND (weight_kg <= (200)::double precision)))) NOT VALID;
ALTER TABLE ONLY public.weight_entries ADD CONSTRAINT weight_entries_weight_kg_range CHECK (((weight_kg >= (30)::double precision) AND (weight_kg <= (200)::double precision))) NOT VALID;
ALTER TABLE ONLY public.workout_plans ADD CONSTRAINT workout_plans_custom_plan_day_idx_check CHECK (((custom_plan_day_idx >= 0) AND (custom_plan_day_idx <= 6)));
ALTER TABLE ONLY public.workout_profile ADD CONSTRAINT workout_profile_distance_unit_check CHECK ((distance_unit = ANY (ARRAY['km'::text, 'mile'::text])));
ALTER TABLE ONLY public.workout_profile ADD CONSTRAINT workout_profile_fitness_goal_check CHECK ((fitness_goal = ANY (ARRAY['build_muscle'::text, 'general_fitness'::text, 'conditioning'::text, 'strength'::text])));
ALTER TABLE ONLY public.workout_profile ADD CONSTRAINT workout_profile_fitness_level_check CHECK ((fitness_level = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'expert'::text, 'pro'::text])));
ALTER TABLE ONLY public.workout_profile ADD CONSTRAINT workout_profile_muscles_per_workout_check CHECK ((muscles_per_workout = ANY (ARRAY['1'::text, '2'::text, '3'::text, 'not_sure'::text])));
ALTER TABLE ONLY public.workout_profile ADD CONSTRAINT workout_profile_orig_distance_unit_check CHECK ((orig_distance_unit = ANY (ARRAY['km'::text, 'mile'::text])));
ALTER TABLE ONLY public.workout_profile ADD CONSTRAINT workout_profile_orig_weight_unit_check CHECK ((orig_weight_unit = ANY (ARRAY['kg'::text, 'lbs'::text])));
ALTER TABLE ONLY public.workout_profile ADD CONSTRAINT workout_profile_preferred_training_plan_check CHECK ((preferred_training_plan = ANY (ARRAY['ai_generated'::text, 'library'::text, 'custom'::text, 'skip'::text, 'none'::text])));
ALTER TABLE ONLY public.workout_profile ADD CONSTRAINT workout_profile_preferred_workout_time_min_check CHECK (((preferred_workout_time_min >= 30) AND (preferred_workout_time_min <= 120)));
ALTER TABLE ONLY public.workout_profile ADD CONSTRAINT workout_profile_training_days_per_week_check CHECK (((training_days_per_week >= 1) AND (training_days_per_week <= 7)));
ALTER TABLE ONLY public.workout_profile ADD CONSTRAINT workout_profile_weight_unit_check CHECK ((weight_unit = ANY (ARRAY['kg'::text, 'lbs'::text])));

-- Foreign keys
ALTER TABLE ONLY public.ai_flagged ADD CONSTRAINT ai_flagged_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_plan_generations ADD CONSTRAINT ai_plan_generations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.body_measurements ADD CONSTRAINT body_measurements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.cheers ADD CONSTRAINT cheers_from_user_fkey FOREIGN KEY (from_user) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.cheers ADD CONSTRAINT cheers_to_user_fkey FOREIGN KEY (to_user) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.custom_reminders ADD CONSTRAINT custom_reminders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.data_exports ADD CONSTRAINT data_exports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.food_logs ADD CONSTRAINT food_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.friendships ADD CONSTRAINT friendships_addressee_id_fkey FOREIGN KEY (addressee_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.friendships ADD CONSTRAINT friendships_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.gym_links ADD CONSTRAINT gym_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.gym_memberships ADD CONSTRAINT gym_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.health_logs ADD CONSTRAINT health_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.manual_grants ADD CONSTRAINT manual_grants_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.notification_logs ADD CONSTRAINT notification_logs_reminder_id_fkey FOREIGN KEY (reminder_id) REFERENCES public.custom_reminders(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.notification_logs ADD CONSTRAINT notification_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.photo_downloads ADD CONSTRAINT photo_downloads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.power_log_uses ADD CONSTRAINT power_log_uses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.referrals ADD CONSTRAINT referrals_referee_id_fkey FOREIGN KEY (referee_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.referrals ADD CONSTRAINT referrals_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.refund_requests ADD CONSTRAINT refund_requests_charge_id_fkey FOREIGN KEY (charge_id) REFERENCES public.subscription_charges(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.refund_requests ADD CONSTRAINT refund_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.saved_meals ADD CONSTRAINT saved_meals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.step_logs ADD CONSTRAINT step_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.subscription_charges ADD CONSTRAINT subscription_charges_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.subscription_charges ADD CONSTRAINT subscription_charges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.user_achievements ADD CONSTRAINT user_achievements_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES public.achievements(id);
ALTER TABLE ONLY public.user_achievements ADD CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_notification_preferences ADD CONSTRAINT user_notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.water_logs ADD CONSTRAINT water_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.weight_entries ADD CONSTRAINT weight_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.workout_logs ADD CONSTRAINT workout_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.workout_plans ADD CONSTRAINT workout_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.workout_profile ADD CONSTRAINT workout_profile_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Indexes (other than those created by the constraints above)
CREATE INDEX ai_flagged_key_idx ON public.ai_flagged USING btree (canonical_key);
CREATE INDEX ai_plan_generations_user_idx ON public.ai_plan_generations USING btree (user_id, created_at DESC);
CREATE INDEX ai_unverified_group_idx ON public.ai_unverified USING btree (canonical_key);
CREATE INDEX ai_unverified_group_key_idx ON public.ai_unverified USING btree (group_key, food_class);
CREATE INDEX ai_unverified_search_idx ON public.ai_unverified USING gin (search_key extensions.gin_trgm_ops);
CREATE INDEX ai_verified_alias_idx ON public.ai_verified USING gin (aliases);
CREATE INDEX ai_verified_alias_keys_idx ON public.ai_verified USING gin (alias_keys);
CREATE INDEX ai_verified_search_idx ON public.ai_verified USING gin (search_key extensions.gin_trgm_ops);
CREATE INDEX body_measurements_user_date ON public.body_measurements USING btree (user_id, measured_at DESC);
CREATE INDEX cheers_to_user_idx ON public.cheers USING btree (to_user, date);
CREATE INDEX custom_reminders_user ON public.custom_reminders USING btree (user_id, sort_order);
CREATE INDEX data_exports_user_kind_idx ON public.data_exports USING btree (user_id, kind, created_at DESC);
CREATE INDEX friendships_addressee_idx ON public.friendships USING btree (addressee_id, status);
CREATE UNIQUE INDEX friendships_pair_idx ON public.friendships USING btree (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX friendships_requester_idx ON public.friendships USING btree (requester_id, status);
CREATE INDEX gym_links_partner_code_idx ON public.gym_links USING btree (partner_code);
CREATE INDEX idx_health_logs_user_logged ON public.health_logs USING btree (user_id, logged_at DESC);
CREATE INDEX manual_grants_user ON public.manual_grants USING btree (user_id, effective_at);
CREATE INDEX notification_logs_due ON public.notification_logs USING btree (current_scheduled_at) WHERE (status = 'pending'::text);
CREATE INDEX notification_logs_user_status ON public.notification_logs USING btree (user_id, status);
CREATE INDEX ops_audit_log_at ON public.ops_audit_log USING btree (at DESC);
CREATE INDEX ops_pending_actions_expiry ON public.ops_pending_actions USING btree (expires_at);
CREATE INDEX photo_downloads_user_idx ON public.photo_downloads USING btree (user_id, created_at DESC);
CREATE INDEX power_log_uses_user_day_idx ON public.power_log_uses USING btree (user_id, day);
CREATE INDEX referrals_referrer_status_idx ON public.referrals USING btree (referrer_id, status);
CREATE INDEX refund_requests_charge_idx ON public.refund_requests USING btree (charge_id);
CREATE UNIQUE INDEX refund_requests_one_open_per_charge ON public.refund_requests USING btree (charge_id) WHERE (status = 'open'::text);
CREATE INDEX refund_requests_user_idx ON public.refund_requests USING btree (user_id);
CREATE INDEX step_logs_user_date ON public.step_logs USING btree (user_id, date DESC);
CREATE INDEX subscription_charges_sub_idx ON public.subscription_charges USING btree (subscription_id);
CREATE INDEX subscription_charges_user_idx ON public.subscription_charges USING btree (user_id, charged_at);
CREATE UNIQUE INDEX subscriptions_one_live_per_user ON public.subscriptions USING btree (user_id) WHERE (status = ANY (ARRAY['authenticated'::text, 'active'::text, 'pending'::text, 'halted'::text]));
CREATE INDEX subscriptions_user_idx ON public.subscriptions USING btree (user_id);
CREATE UNIQUE INDEX user_profiles_username_lower_idx ON public.user_profiles USING btree (lower(username)) WHERE (username IS NOT NULL);
CREATE INDEX weight_entries_user_date ON public.weight_entries USING btree (user_id, date);
CREATE INDEX workout_logs_user_date ON public.workout_logs USING btree (user_id, date);

-- ===== 04_triggers.sql =====
-- Part 4: the 22 triggers on public tables. None are on auth.users: the app
-- creates user_profiles rows itself after sign-up.

SET search_path = public, extensions;

CREATE TRIGGER trg_body_measurements_edit_window BEFORE INSERT OR UPDATE ON public.body_measurements FOR EACH ROW EXECUTE FUNCTION public.enforce_log_edit_window('measured_at');
CREATE TRIGGER trg_body_measurements_history_version AFTER INSERT OR DELETE OR UPDATE ON public.body_measurements FOR EACH ROW EXECUTE FUNCTION public.bump_history_version('measured_at');
CREATE TRIGGER custom_reminders_cap BEFORE INSERT ON public.custom_reminders FOR EACH ROW EXECUTE FUNCTION public.enforce_reminder_cap();
CREATE TRIGGER trg_check_food_log_daily_limit BEFORE INSERT OR UPDATE OF calories, date, user_id ON public.food_logs FOR EACH ROW EXECUTE FUNCTION public.check_food_log_daily_limit();
CREATE TRIGGER trg_food_logs_edit_window BEFORE INSERT OR UPDATE ON public.food_logs FOR EACH ROW EXECUTE FUNCTION public.enforce_log_edit_window('date');
CREATE TRIGGER trg_food_logs_history_version AFTER INSERT OR DELETE OR UPDATE ON public.food_logs FOR EACH ROW EXECUTE FUNCTION public.bump_history_version('date');
CREATE TRIGGER trg_food_logs_require_access BEFORE INSERT OR DELETE OR UPDATE ON public.food_logs FOR EACH ROW EXECUTE FUNCTION public.require_access_for_write();
CREATE TRIGGER trg_saved_meals_require_access BEFORE INSERT OR DELETE OR UPDATE ON public.saved_meals FOR EACH ROW EXECUTE FUNCTION public.require_access_for_write();
CREATE TRIGGER trg_step_logs_edit_window BEFORE INSERT OR UPDATE ON public.step_logs FOR EACH ROW EXECUTE FUNCTION public.enforce_log_edit_window('date');
CREATE TRIGGER trg_spend_gym_gift AFTER INSERT ON public.subscription_charges FOR EACH ROW EXECUTE FUNCTION public.spend_gym_gift();
CREATE TRIGGER trg_qualify_referral AFTER UPDATE OF trial_start_date ON public.user_profiles FOR EACH ROW WHEN (((old.trial_start_date IS NULL) AND (new.trial_start_date IS NOT NULL))) EXECUTE FUNCTION public.qualify_referral();
CREATE TRIGGER trg_set_referral_code BEFORE INSERT ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.set_referral_code();
CREATE TRIGGER trg_user_profiles_profile_version BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.bump_profile_version();
CREATE TRIGGER trg_water_logs_edit_window BEFORE INSERT OR UPDATE ON public.water_logs FOR EACH ROW EXECUTE FUNCTION public.enforce_log_edit_window('date');
CREATE TRIGGER trg_water_logs_require_access BEFORE INSERT OR DELETE OR UPDATE ON public.water_logs FOR EACH ROW EXECUTE FUNCTION public.require_access_for_write();
CREATE TRIGGER trg_weight_entries_edit_window BEFORE INSERT OR UPDATE ON public.weight_entries FOR EACH ROW EXECUTE FUNCTION public.enforce_log_edit_window('date');
CREATE TRIGGER trg_weight_entries_history_version AFTER INSERT OR DELETE OR UPDATE ON public.weight_entries FOR EACH ROW EXECUTE FUNCTION public.bump_history_version('date');
CREATE TRIGGER trg_check_workout_set_daily_limit BEFORE INSERT OR UPDATE OF exercises_done, date, user_id, workout_name ON public.workout_logs FOR EACH ROW EXECUTE FUNCTION public.check_workout_set_daily_limit();
CREATE TRIGGER trg_workout_logs_edit_window BEFORE INSERT OR UPDATE ON public.workout_logs FOR EACH ROW EXECUTE FUNCTION public.enforce_log_edit_window('date');
CREATE TRIGGER trg_workout_logs_history_version AFTER INSERT OR DELETE OR UPDATE ON public.workout_logs FOR EACH ROW EXECUTE FUNCTION public.bump_history_version('date');
CREATE TRIGGER trg_workout_plans_plan_version AFTER INSERT OR DELETE OR UPDATE ON public.workout_plans FOR EACH ROW EXECUTE FUNCTION public.bump_plan_version();
CREATE TRIGGER trg_workout_profile_plan_version AFTER INSERT OR DELETE OR UPDATE ON public.workout_profile FOR EACH ROW EXECUTE FUNCTION public.bump_plan_version();

-- ===== 07_storage.sql =====
-- Part 7: storage. One private bucket; its policies are in 05_rls_policies.sql.
-- Run this before 05 (or re-run 05's storage section after it) only if your
-- tool insists on the bucket existing first; Postgres does not.
-- The 3 objects in the old bucket (weight photos) are files, not SQL: move
-- them with the dashboard or the storage API if you migrate user data.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('weight-photos', 'weight-photos', false, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ===== 05_rls_policies.sql =====
-- Part 5: row level security (on for all 36 public tables; none forced) and
-- every policy on public.* and storage.objects, copied verbatim from the live
-- project. Unqualified table names in policy bodies resolve through this
-- search_path, as they did when the policies were created.

SET search_path = public, extensions;

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_flagged ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_plan_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_unverified ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_verified ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cheers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_agent_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_pending_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.power_log_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.step_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.water_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weight_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_profile ENABLE ROW LEVEL SECURITY;

-- Tables with RLS on and no policy are service_role only, on purpose:
-- ai_flagged, ai_unverified, ai_verified, gym_memberships, manual_grants,
-- ops_agent_threads, ops_audit_log, ops_pending_actions.

-- public
CREATE POLICY "achievements readable" ON public.achievements AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY ai_plan_generations_select_own ON public.ai_plan_generations AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "users manage own body measurements" ON public.body_measurements AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY cheers_insert ON public.cheers AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid() = from_user) AND (EXISTS ( SELECT 1
   FROM friendships f
  WHERE ((f.status = 'accepted'::text) AND (((f.requester_id = cheers.from_user) AND (f.addressee_id = cheers.to_user)) OR ((f.requester_id = cheers.to_user) AND (f.addressee_id = cheers.from_user))))))));
CREATE POLICY cheers_select ON public.cheers AS PERMISSIVE FOR SELECT TO public USING (((auth.uid() = from_user) OR (auth.uid() = to_user)));
CREATE POLICY "users manage own custom reminders" ON public.custom_reminders AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY data_exports_select_own ON public.data_exports AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Users can delete own food logs" ON public.food_logs AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own food logs" ON public.food_logs AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own food logs" ON public.food_logs AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view own food logs" ON public.food_logs AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY friendships_delete ON public.friendships AS PERMISSIVE FOR DELETE TO public USING (((auth.uid() = requester_id) OR (auth.uid() = addressee_id)));
CREATE POLICY friendships_insert ON public.friendships AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid() = requester_id) AND (status = 'pending'::text)));
CREATE POLICY friendships_select ON public.friendships AS PERMISSIVE FOR SELECT TO public USING (((auth.uid() = requester_id) OR (auth.uid() = addressee_id)));
CREATE POLICY friendships_update ON public.friendships AS PERMISSIVE FOR UPDATE TO public USING (((auth.uid() = addressee_id) AND (status = 'pending'::text))) WITH CHECK (((auth.uid() = addressee_id) AND (status = ANY (ARRAY['accepted'::text, 'blocked'::text]))));
CREATE POLICY "Users read own gym link" ON public.gym_links AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY health_logs_user_all ON public.health_logs AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "users manage own notification logs" ON public.notification_logs AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY photo_downloads_select_own ON public.photo_downloads AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY power_log_uses_select_own ON public.power_log_uses AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Users read own referrals" ON public.referrals AS PERMISSIVE FOR SELECT TO public USING (((auth.uid() = referrer_id) OR (auth.uid() = referee_id)));
CREATE POLICY "Users read own refund requests" ON public.refund_requests AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "users manage own saved meals" ON public.saved_meals AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "users manage own step logs" ON public.step_logs AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users read own charges" ON public.subscription_charges AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users read own subscriptions" ON public.subscriptions AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "own achievements select" ON public.user_achievements AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "users manage own notification preferences" ON public.user_notification_preferences AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can insert own profile" ON public.user_profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = id));
CREATE POLICY "Users can update own profile" ON public.user_profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = id)) WITH CHECK ((( SELECT auth.uid() AS uid) = id));
CREATE POLICY "Users can view own profile" ON public.user_profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = id));
CREATE POLICY "users manage own water logs" ON public.water_logs AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "No client access to webhook events" ON public.webhook_events AS PERMISSIVE FOR SELECT TO anon, authenticated USING (false);
CREATE POLICY "users manage own weight entries" ON public.weight_entries AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "users manage own workout logs" ON public.workout_logs AS PERMISSIVE FOR ALL TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "users manage own workout plans" ON public.workout_plans AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users manage own workout profile" ON public.workout_profile AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

-- storage.objects (bucket weight-photos; the bucket itself is in 07_storage.sql)
CREATE POLICY "Users delete own photos" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'weight-photos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY "Users read own weight photos" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'weight-photos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY "Users update own photos" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'weight-photos'::text) AND ((( SELECT auth.uid() AS uid))::text = (storage.foldername(name))[1]))) WITH CHECK (((bucket_id = 'weight-photos'::text) AND ((( SELECT auth.uid() AS uid))::text = (storage.foldername(name))[1]) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = ( SELECT auth.uid() AS uid)) AND (user_profiles.access_until > now()))))));
CREATE POLICY "Users upload own photos" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'weight-photos'::text) AND ((( SELECT auth.uid() AS uid))::text = (storage.foldername(name))[1]) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = ( SELECT auth.uid() AS uid)) AND (user_profiles.access_until > now()))))));

-- ===== 06_grants.sql =====
-- Part 6: grants, rebuilt to match the old project exactly. Generated by
-- _parts/make_grants.py from the live grants read on 2026-10-15.
-- A new project's default privileges hand anon/authenticated ALL on new
-- tables and EXECUTE on new functions, so everything is revoked first.

-- Tables
REVOKE ALL ON TABLE public.achievements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ai_flagged FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ai_plan_generations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ai_unverified FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ai_verified FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.body_measurements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.cheers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.custom_reminders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.data_exports FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.food_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.friendships FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.gym_links FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.gym_memberships FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.health_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.manual_grants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.notification_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ops_agent_threads FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ops_audit_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ops_pending_actions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.photo_downloads FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.power_log_uses FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.referrals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.refund_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.saved_meals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.step_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.subscription_charges FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.subscriptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.user_achievements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.user_notification_preferences FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.user_profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.water_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.webhook_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.weight_entries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.workout_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.workout_plans FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.workout_profile FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.achievements TO authenticated;
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.ai_plan_generations TO anon;
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.ai_plan_generations TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.body_measurements TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.body_measurements TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.cheers TO anon;
GRANT INSERT, SELECT, UPDATE ON TABLE public.cheers TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.custom_reminders TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.custom_reminders TO authenticated;
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.data_exports TO anon;
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.data_exports TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.food_logs TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.food_logs TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.friendships TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.friendships TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.gym_links TO anon;
GRANT INSERT, SELECT, UPDATE ON TABLE public.gym_links TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.health_logs TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.health_logs TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.manual_grants TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.manual_grants TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.notification_logs TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.notification_logs TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ops_audit_log TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ops_audit_log TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ops_pending_actions TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ops_pending_actions TO authenticated;
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.photo_downloads TO anon;
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.photo_downloads TO authenticated;
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.power_log_uses TO anon;
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.power_log_uses TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.referrals TO anon;
GRANT INSERT, SELECT, UPDATE ON TABLE public.referrals TO authenticated;
GRANT SELECT ON TABLE public.refund_requests TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.saved_meals TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.saved_meals TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.step_logs TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.step_logs TO authenticated;
GRANT SELECT ON TABLE public.subscription_charges TO authenticated;
GRANT SELECT ON TABLE public.subscriptions TO authenticated;
GRANT SELECT ON TABLE public.user_achievements TO anon;
GRANT SELECT ON TABLE public.user_achievements TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.user_notification_preferences TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.user_notification_preferences TO authenticated;
GRANT SELECT ON TABLE public.user_profiles TO anon;
GRANT SELECT ON TABLE public.user_profiles TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.water_logs TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.water_logs TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.weight_entries TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.weight_entries TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.workout_logs TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.workout_logs TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.workout_plans TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.workout_plans TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.workout_profile TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.workout_profile TO authenticated;

-- Column-level grants (user_profiles lockdown)
GRANT INSERT (activity_level) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (activity_level) ON TABLE public.user_profiles TO authenticated;
GRANT INSERT (age) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (age) ON TABLE public.user_profiles TO authenticated;
GRANT INSERT (bmi) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (bmi) ON TABLE public.user_profiles TO authenticated;
GRANT INSERT (bmr) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (bmr) ON TABLE public.user_profiles TO authenticated;
GRANT INSERT (carbs_target_g) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (carbs_target_g) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (current_streak) ON TABLE public.user_profiles TO authenticated;
GRANT INSERT (daily_calorie_target) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (daily_calorie_target) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (diet_preference) ON TABLE public.user_profiles TO authenticated;
GRANT INSERT (fat_target_g) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (fat_target_g) ON TABLE public.user_profiles TO authenticated;
GRANT INSERT (fiber_target_g) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (fiber_target_g) ON TABLE public.user_profiles TO authenticated;
GRANT INSERT (full_name) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (full_name) ON TABLE public.user_profiles TO authenticated;
GRANT INSERT (gender) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (gender) ON TABLE public.user_profiles TO authenticated;
GRANT INSERT (goal) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (goal) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (goal_weight_kg) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (has_answered_tour_offer) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (has_seen_benefits_features_page) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (has_seen_refer_intro) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (heard_about) ON TABLE public.user_profiles TO authenticated;
GRANT INSERT (height_cm) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (height_cm) ON TABLE public.user_profiles TO authenticated;
GRANT INSERT (id) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (id) ON TABLE public.user_profiles TO authenticated;
GRANT INSERT (marketing_opt_in) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (marketing_opt_in) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (meal_frequency) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (meal_names) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (notif_primer_day5_shown) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (notif_primer_first_log_shown) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (phone) ON TABLE public.user_profiles TO authenticated;
GRANT INSERT (protein_target_g) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (protein_target_g) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (steps_goal) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (stride_cm) ON TABLE public.user_profiles TO authenticated;
GRANT INSERT (tdee) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (tdee) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (theme) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (timezone) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (username) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (water_cup_ml) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (water_goal_ml) ON TABLE public.user_profiles TO authenticated;
GRANT INSERT (weight_kg) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (weight_kg) ON TABLE public.user_profiles TO authenticated;

-- Functions
REVOKE ALL ON FUNCTION public.ai_plan_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_plan_status() TO authenticated;
REVOKE ALL ON FUNCTION public.ai_verified_similar(q text, min_sim real) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_achievement(p_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_achievement(p_id text) TO authenticated;
REVOKE ALL ON FUNCTION public.bump_history_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_plan_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_profile_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_food_log_daily_limit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_food_log_daily_limit() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_food_log_daily_limit() TO anon;
GRANT EXECUTE ON FUNCTION public.check_food_log_daily_limit() TO authenticated;
REVOKE ALL ON FUNCTION public.check_workout_set_daily_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_ai_plan() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_plan() TO authenticated;
REVOKE ALL ON FUNCTION public.claim_photo_download() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_photo_download() TO authenticated;
REVOKE ALL ON FUNCTION public.claim_power_log(p_day date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_power_log(p_day date) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_referral(code text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_referral(code text) TO authenticated;
REVOKE ALL ON FUNCTION public.data_export_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.data_export_status() TO authenticated;
REVOKE ALL ON FUNCTION public.enforce_log_edit_window() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_reminder_cap() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_reminder_cap() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_reminder_cap() TO anon;
GRANT EXECUTE ON FUNCTION public.enforce_reminder_cap() TO authenticated;
REVOKE ALL ON FUNCTION public.generate_referral_code(full_name text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_billing_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_billing_summary() TO authenticated;
REVOKE ALL ON FUNCTION public.get_friend_requests() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_friend_requests() TO authenticated;
REVOKE ALL ON FUNCTION public.get_friends() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_friends() TO authenticated;
REVOKE ALL ON FUNCTION public.get_leaderboard_stats(start_date text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_stats(start_date text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_stats(start_date text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_stats(start_date text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_referral_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_referral_summary() TO authenticated;
REVOKE ALL ON FUNCTION public.get_referrer_name(code text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_referrer_name(code text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_referrer_name(code text) TO anon;
REVOKE ALL ON FUNCTION public.gift_grants(target uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_razorpay_event(p_event_id text, p_event_type text, p_subscription_id text, p_payment_id text, p_amount_paise integer, p_status text, p_period_days integer, p_refunded boolean, p_base_paise integer, p_provider text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.join_gym(p_user_id uuid, p_code text, p_gym_name text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.leave_gym(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_gym(p_user_id uuid, p_code text, p_gym_name text, p_partner_type text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_body_measurements(entries jsonb, on_date date, entry_note text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_body_measurements(entries jsonb, on_date date, entry_note text) TO authenticated;
REVOKE ALL ON FUNCTION public.measurements_valid(m jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.measurements_valid(m jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.measurements_valid(m jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.measurements_valid(m jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.ops_audit_recent(limit_n integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_diagnose_access(user_ref text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_engagement(period_days integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_funnel() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_grant_access(user_ref text, grant_days numeric, reason text, actor text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_growth_daily(days integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_list_users(limit_n integer, sort_by text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_notifications(period_days integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_recent_activity(hours integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_reset_notifications(user_ref text, actor text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_resolve_user(user_ref text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_revenue(period_days integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_revoke_grant(grant_id uuid, actor text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_search_users(q text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_system_health() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_user_detail(user_ref text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_users_overview(period_days integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.power_logs_left(p_day date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.power_logs_left(p_day date) TO authenticated;
REVOKE ALL ON FUNCTION public.premium_grants(target uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.qualify_referral() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_access(target uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_bonus_trial_days(target uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_data_export(p_kind text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_data_export(p_kind text) TO authenticated;
REVOKE ALL ON FUNCTION public.referral_code_prefix(full_name text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_subscription(p_provider_subscription_id text, p_tier text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_subscription(p_provider_subscription_id text, p_tier text) TO authenticated;
REVOKE ALL ON FUNCTION public.release_ai_plan(p_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_power_log(p_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_refund(p_charge_id uuid, p_reason text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_refund(p_charge_id uuid, p_reason text) TO authenticated;
REVOKE ALL ON FUNCTION public.require_access_for_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_friend_code(code text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_friend_code(code text) TO authenticated;
REVOKE ALL ON FUNCTION public.search_users(q text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_users(q text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_referral_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spend_gym_gift() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_trial(plan text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_trial(plan text) TO authenticated;
REVOKE ALL ON FUNCTION public.sync_achievements() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_achievements() TO authenticated;
REVOKE ALL ON FUNCTION public.unlink_gym(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.user_achievement_metrics(p_user uuid) FROM PUBLIC, anon, authenticated;

-- ===== 08_seed_achievements.sql =====
-- Part 8: the achievements catalog (24 rows). Reference data the app needs,
-- not user data: user_achievements has a foreign key to it, and
-- award_achievement() / sync_achievements() read it.

INSERT INTO public.achievements (id, metric, threshold, xp, sort_order) VALUES
  ('first_bite', 'food_count', 1, 50, 10),
  ('streak_3', 'food_streak', 3, 75, 20),
  ('streak_7', 'food_streak', 7, 150, 30),
  ('streak_14', 'food_streak', 14, 250, 40),
  ('streak_30', 'food_streak', 30, 500, 50),
  ('food_100', 'food_count', 100, 200, 60),
  ('food_500', 'food_count', 500, 500, 70),
  ('early_bird', 'early_logs', 5, 150, 80),
  ('first_rep', 'workout_count', 1, 50, 90),
  ('workouts_10', 'workout_count', 10, 150, 100),
  ('workouts_50', 'workout_count', 50, 300, 110),
  ('workouts_100', 'workout_count', 100, 500, 120),
  ('on_scale', 'weight_count', 1, 50, 130),
  ('weigh_20', 'weight_count', 20, 200, 140),
  ('first_photo', 'photo_count', 1, 50, 150),
  ('photos_10', 'photo_count', 10, 200, 160),
  ('hydra_7', 'hydrated_days', 7, 150, 170),
  ('hydra_30', 'hydrated_days', 30, 400, 180),
  ('chef_5', 'saved_meals', 5, 100, 190),
  ('steps_first', 'step_days', 1, 50, 200),
  ('steps_10', 'step_days', 10, 150, 210),
  ('steps_50', 'step_days', 50, 300, 220),
  ('steps_streak_7', 'step_streak', 7, 200, 230),
  ('steps_streak_30', 'step_streak', 30, 500, 240)
ON CONFLICT (id) DO NOTHING;

COMMIT;
