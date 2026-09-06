-- Ops metric catalog — the only things the Telegram agent can ever ask.
--
-- Each function is one question, hand-written and parameterised. The agent
-- chooses which to call and with what period; it never assembles SQL and never
-- sees the schema. A misunderstood question therefore produces a wrong-but-safe
-- answer rather than an arbitrary read.
--
-- TWO RULES, both structural rather than conventional:
--
--   1. AGGREGATES ONLY. No function here returns a user id, an email, a name,
--      or any row that resolves to a person. The agent speaks into a group
--      chat whose membership can change, so "show me user X" must be
--      impossible rather than merely undocumented. Adding a function that
--      returns identifiers breaks the security model of the whole feature.
--
--   2. READ ONLY. Nothing here writes. SECURITY DEFINER is needed to read past
--      RLS across all users, which makes the grant the entire access control —
--      hence the revoke/grant pair on every one. service_role only: the app's
--      authenticated client must never be able to call these.
--
-- Style follows 20260826140000_body_measurements.sql: explicit revoke from
-- public/anon/authenticated, then grant to exactly one role.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Users and growth
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.ops_users_overview(period_days int default 7)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'period_days',      period_days,
    'users_total',      (select count(*) from user_profiles),
    'users_new',        (select count(*) from user_profiles
                          where created_at >= now() - make_interval(days => period_days)),
    'users_prev_period',(select count(*) from user_profiles
                          where created_at >= now() - make_interval(days => period_days * 2)
                            and created_at <  now() - make_interval(days => period_days)),
    'active_users',     (select count(distinct user_id) from food_logs
                          where logged_at >= now() - make_interval(days => period_days)),
    'trials_started',   (select count(*) from user_profiles where trial_start_date is not null),
    'holding_access',   (select count(*) from user_profiles where access_until > now()),
    'quiz_completed',   (select count(*) from user_profiles where daily_calorie_target is not null)
  );
$$;

comment on function public.ops_users_overview(int) is
  'Aggregate user counts over a period. Never returns identifiers.';

-- Daily series, for trend and anomaly detection rather than a single number.
create or replace function public.ops_growth_daily(days int default 14)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row order by row->>'date'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'date',      d::date,
      'signups',   (select count(*) from user_profiles p where p.created_at::date = d::date),
      'active',    (select count(distinct f.user_id) from food_logs f where f.logged_at::date = d::date),
      'food_logs', (select count(*) from food_logs f where f.logged_at::date = d::date)
    ) as row
    from generate_series(
      (current_date - make_interval(days => days - 1))::date,
      current_date,
      interval '1 day'
    ) d
  ) s;
$$;

comment on function public.ops_growth_daily(int) is
  'Per-day signups, active users and food logs. Feeds trend comparisons in the daily digest.';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Revenue
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.ops_revenue(period_days int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'period_days',        period_days,
    'charges',            (select count(*) from subscription_charges
                            where charged_at >= now() - make_interval(days => period_days)),
    'gross_rupees',       (select coalesce(sum(amount_paise), 0) / 100.0 from subscription_charges
                            where charged_at >= now() - make_interval(days => period_days)
                              and refunded_at is null),
    'refunds',            (select count(*) from subscription_charges
                            where refunded_at >= now() - make_interval(days => period_days)),
    'refund_requests_open',(select count(*) from refund_requests where status = 'pending'),
    'subs_total',         (select count(*) from subscriptions),
    'subs_active',        (select count(*) from subscriptions where status = 'active'),
    -- The live bug this catalog exists to surface: subscription.activated
    -- payloads carry no payment entity, so amount arrives null and is stored 0.
    'zero_amount_charges',(select count(*) from subscription_charges where amount_paise = 0),
    'trial_to_paid',      jsonb_build_object(
                            'trials',    (select count(*) from user_profiles where trial_start_date is not null),
                            'converted', (select count(distinct user_id) from subscriptions)
                          ),
    'by_tier',            (select coalesce(jsonb_object_agg(tier, n), '{}'::jsonb)
                             from (select tier, count(*) n from subscription_charges
                                    where charged_at >= now() - make_interval(days => period_days)
                                    group by tier) t)
  );
$$;

comment on function public.ops_revenue(int) is
  'Charges, gross, refunds and conversion over a period. Amounts only, never who paid.';

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Engagement
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.ops_engagement(period_days int default 7)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with active as (
    select count(distinct user_id) n from food_logs
     where logged_at >= now() - make_interval(days => period_days)
  )
  select jsonb_build_object(
    'period_days',    period_days,
    'active_users',   (select n from active),
    'food_logs',      (select count(*) from food_logs
                        where logged_at >= now() - make_interval(days => period_days)),
    'workout_logs',   (select count(*) from workout_logs
                        where logged_at >= now() - make_interval(days => period_days)),
    'weigh_ins',      (select count(*) from weight_entries
                        where created_at >= now() - make_interval(days => period_days)),
    'water_logs',     (select count(*) from water_logs
                        where updated_at >= now() - make_interval(days => period_days)),
    'saved_meals',    (select count(*) from saved_meals
                        where created_at >= now() - make_interval(days => period_days)),
    -- The number that says whether the people who show up are really using it.
    'food_logs_per_active', case when (select n from active) = 0 then 0
                            else round(
                              (select count(*) from food_logs
                                where logged_at >= now() - make_interval(days => period_days))::numeric
                              / (select n from active), 1)
                            end,
    -- How many distinct days each active user logged on. A user logging 4 meals
    -- one day is a different story from one logging once on 4 days.
    'median_days_logged', (
      select coalesce(percentile_cont(0.5) within group (order by c), 0)
      from (select count(distinct date) c from food_logs
             where logged_at >= now() - make_interval(days => period_days)
             group by user_id) x
    )
  );
$$;

comment on function public.ops_engagement(int) is
  'Logging volume and per-active-user intensity. Aggregates only.';

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Funnel and retention
-- ═══════════════════════════════════════════════════════════════════════

-- Where people stop. With a small user base this matters more than totals.
create or replace function public.ops_funnel()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'signed_up',      (select count(*) from user_profiles),
    'completed_quiz', (select count(*) from user_profiles where daily_calorie_target is not null),
    'started_trial',  (select count(*) from user_profiles where trial_start_date is not null),
    'logged_once',    (select count(distinct user_id) from food_logs),
    'logged_3_days',  (select count(*) from (
                        select user_id from food_logs group by user_id
                         having count(distinct date) >= 3) x),
    -- Only counts accounts old enough to have had the chance.
    'eligible_for_d7',(select count(*) from user_profiles
                        where created_at <= now() - interval '7 days'),
    'active_at_d7',   (select count(distinct f.user_id)
                         from food_logs f join user_profiles p on p.id = f.user_id
                        where p.created_at <= now() - interval '7 days'
                          and f.logged_at >= p.created_at + interval '7 days'),
    'subscribed',     (select count(distinct user_id) from subscriptions)
  );
$$;

comment on function public.ops_funnel() is
  'Signup to retention funnel. Counts per stage, no identifiers.';

-- ═══════════════════════════════════════════════════════════════════════
-- 5. System health
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.ops_system_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'webhook_events_24h',  (select count(*) from webhook_events
                             where received_at >= now() - interval '24 hours'),
    'webhook_events_total',(select count(*) from webhook_events),
    'hours_since_charge',  (select round(extract(epoch from (now() - max(charged_at))) / 3600.0, 1)
                              from subscription_charges),
    'zero_amount_charges', (select count(*) from subscription_charges where amount_paise = 0),
    'open_refund_requests',(select count(*) from refund_requests where status = 'pending'),
    -- Notification feature: empty until it ships, then the delivery picture.
    'notifications_pending',  (select count(*) from notification_logs where status = 'pending'),
    'notifications_overdue',  (select count(*) from notification_logs
                                where status = 'pending' and current_scheduled_at < now() - interval '1 hour'),
    'custom_reminders',       (select count(*) from custom_reminders),
    'users_with_prefs',       (select count(*) from user_notification_preferences),
    -- Data-quality checks that would otherwise go unnoticed.
    'profiles_missing_targets',(select count(*) from user_profiles where daily_calorie_target is null),
    'distinct_timezones',      (select count(distinct timezone) from user_profiles)
  );
$$;

comment on function public.ops_system_health() is
  'Operational and data-quality signals: webhook flow, payment recency, notification backlog.';

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Notifications
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.ops_notifications(period_days int default 7)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'period_days',   period_days,
    'by_status',     (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                        from (select status, count(*) n from notification_logs
                               where updated_at >= now() - make_interval(days => period_days)
                               group by status) s),
    'by_type',       (select coalesce(jsonb_object_agg(type, n), '{}'::jsonb)
                        from (select type, count(*) n from notification_logs
                               where updated_at >= now() - make_interval(days => period_days)
                               group by type) t),
    'snoozed_any',   (select count(*) from notification_logs
                        where snooze_count > 0
                          and updated_at >= now() - make_interval(days => period_days)),
    'hit_snooze_cap',(select count(*) from notification_logs
                        where snooze_count >= max_snooze_allowed
                          and updated_at >= now() - make_interval(days => period_days)),
    'quiet_overrides',(select count(*) from notification_logs
                        where quiet_hours_override
                          and updated_at >= now() - make_interval(days => period_days)),
    'reminders_enabled',(select count(*) from custom_reminders where enabled),
    'morning_enabled',  (select count(*) from user_notification_preferences where morning_enabled)
  );
$$;

comment on function public.ops_notifications(int) is
  'Notification delivery and snooze behaviour. Empty until the feature ships.';

-- ═══════════════════════════════════════════════════════════════════════
-- 7. Access control
-- ═══════════════════════════════════════════════════════════════════════

-- Postgres grants EXECUTE to PUBLIC by default, so the revoke is what actually
-- secures these. Without it any authenticated user could call them from the
-- browser and read whole-database aggregates.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.ops_users_overview(int)',
    'public.ops_growth_daily(int)',
    'public.ops_revenue(int)',
    'public.ops_engagement(int)',
    'public.ops_funnel()',
    'public.ops_system_health()',
    'public.ops_notifications(int)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant  execute on function %s to service_role', fn);
  end loop;
end $$;
