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
