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
