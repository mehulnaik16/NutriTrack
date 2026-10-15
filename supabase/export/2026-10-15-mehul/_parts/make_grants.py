"""Builds 06_grants.sql from the live grants read on 2026-10-15.

A new Supabase project's default privileges give anon and authenticated ALL on
every new public table and EXECUTE on every new function, so the file first
revokes those and then grants back exactly what the old project had.
service_role is left at its defaults (it held every privilege everywhere).
"""
import re, pathlib

TABLE_GRANTS = """
achievements.authenticated: SELECT
ai_plan_generations.anon: REFERENCES,SELECT,TRIGGER,TRUNCATE
ai_plan_generations.authenticated: REFERENCES,SELECT,TRIGGER,TRUNCATE
body_measurements.anon: INSERT,SELECT,UPDATE
body_measurements.authenticated: DELETE,INSERT,SELECT,UPDATE
cheers.anon: INSERT,SELECT,UPDATE
cheers.authenticated: INSERT,SELECT,UPDATE
custom_reminders.anon: INSERT,SELECT,UPDATE
custom_reminders.authenticated: DELETE,INSERT,SELECT,UPDATE
data_exports.anon: REFERENCES,SELECT,TRIGGER,TRUNCATE
data_exports.authenticated: REFERENCES,SELECT,TRIGGER,TRUNCATE
food_logs.anon: INSERT,SELECT,UPDATE
food_logs.authenticated: DELETE,INSERT,SELECT,UPDATE
friendships.anon: INSERT,SELECT,UPDATE
friendships.authenticated: DELETE,INSERT,SELECT,UPDATE
gym_links.anon: INSERT,SELECT,UPDATE
gym_links.authenticated: INSERT,SELECT,UPDATE
health_logs.anon: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
health_logs.authenticated: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
manual_grants.anon: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
manual_grants.authenticated: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
notification_logs.anon: INSERT,SELECT,UPDATE
notification_logs.authenticated: DELETE,INSERT,SELECT,UPDATE
ops_audit_log.anon: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
ops_audit_log.authenticated: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
ops_pending_actions.anon: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
ops_pending_actions.authenticated: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
photo_downloads.anon: REFERENCES,SELECT,TRIGGER,TRUNCATE
photo_downloads.authenticated: REFERENCES,SELECT,TRIGGER,TRUNCATE
power_log_uses.anon: REFERENCES,SELECT,TRIGGER,TRUNCATE
power_log_uses.authenticated: REFERENCES,SELECT,TRIGGER,TRUNCATE
referrals.anon: INSERT,SELECT,UPDATE
referrals.authenticated: INSERT,SELECT,UPDATE
refund_requests.authenticated: SELECT
saved_meals.anon: INSERT,SELECT,UPDATE
saved_meals.authenticated: DELETE,INSERT,SELECT,UPDATE
step_logs.anon: INSERT,SELECT,UPDATE
step_logs.authenticated: DELETE,INSERT,SELECT,UPDATE
subscription_charges.authenticated: SELECT
subscriptions.authenticated: SELECT
user_achievements.anon: SELECT
user_achievements.authenticated: SELECT
user_notification_preferences.anon: INSERT,SELECT,UPDATE
user_notification_preferences.authenticated: DELETE,INSERT,SELECT,UPDATE
user_profiles.anon: SELECT
user_profiles.authenticated: SELECT
water_logs.anon: INSERT,SELECT,UPDATE
water_logs.authenticated: DELETE,INSERT,SELECT,UPDATE
weight_entries.anon: INSERT,SELECT,UPDATE
weight_entries.authenticated: DELETE,INSERT,SELECT,UPDATE
workout_logs.anon: INSERT,SELECT,UPDATE
workout_logs.authenticated: DELETE,INSERT,SELECT,UPDATE
workout_plans.anon: INSERT,SELECT,UPDATE
workout_plans.authenticated: DELETE,INSERT,SELECT,UPDATE
workout_profile.anon: INSERT,SELECT,UPDATE
workout_profile.authenticated: DELETE,INSERT,SELECT,UPDATE
"""

COLUMN_GRANTS = """
activity_level: INSERT,UPDATE
age: INSERT,UPDATE
bmi: INSERT,UPDATE
bmr: INSERT,UPDATE
carbs_target_g: INSERT,UPDATE
current_streak: UPDATE
daily_calorie_target: INSERT,UPDATE
diet_preference: UPDATE
fat_target_g: INSERT,UPDATE
fiber_target_g: INSERT,UPDATE
full_name: INSERT,UPDATE
gender: INSERT,UPDATE
goal: INSERT,UPDATE
goal_weight_kg: UPDATE
has_answered_tour_offer: UPDATE
has_seen_benefits_features_page: UPDATE
has_seen_refer_intro: UPDATE
heard_about: UPDATE
height_cm: INSERT,UPDATE
id: INSERT,UPDATE
marketing_opt_in: INSERT,UPDATE
meal_frequency: UPDATE
meal_names: UPDATE
notif_primer_day5_shown: UPDATE
notif_primer_first_log_shown: UPDATE
phone: UPDATE
protein_target_g: INSERT,UPDATE
steps_goal: UPDATE
stride_cm: UPDATE
tdee: INSERT,UPDATE
theme: UPDATE
timezone: UPDATE
username: UPDATE
water_cup_ml: UPDATE
water_goal_ml: UPDATE
weight_kg: INSERT,UPDATE
"""

# name(args) -> roles beyond postgres/service_role holding EXECUTE ("PUBLIC" = "=X").
FUNCS = """
ai_plan_status() | authenticated
ai_verified_similar(q text, min_sim real) |
award_achievement(p_id text) | authenticated
bump_history_version() |
bump_plan_version() |
bump_profile_version() |
check_food_log_daily_limit() | PUBLIC anon authenticated
check_workout_set_daily_limit() |
claim_ai_plan() | authenticated
claim_photo_download() | authenticated
claim_power_log(p_day date) | authenticated
claim_referral(code text) | authenticated
data_export_status() | authenticated
enforce_log_edit_window() |
enforce_reminder_cap() | PUBLIC anon authenticated
generate_referral_code(full_name text) |
get_billing_summary() | authenticated
get_friend_requests() | authenticated
get_friends() | authenticated
get_leaderboard_stats(start_date text) | PUBLIC anon authenticated
get_referral_summary() | authenticated
get_referrer_name(code text) | authenticated anon
gift_grants(target uuid) |
handle_razorpay_event(p_event_id text, p_event_type text, p_subscription_id text, p_payment_id text, p_amount_paise integer, p_status text, p_period_days integer, p_refunded boolean, p_base_paise integer, p_provider text) |
join_gym(p_user_id uuid, p_code text, p_gym_name text) |
leave_gym(p_user_id uuid) |
link_gym(p_user_id uuid, p_code text, p_gym_name text, p_partner_type text) |
log_body_measurements(entries jsonb, on_date date, entry_note text) | authenticated
measurements_valid(m jsonb) | PUBLIC anon authenticated
ops_audit_recent(limit_n integer) |
ops_diagnose_access(user_ref text) |
ops_engagement(period_days integer) |
ops_funnel() |
ops_grant_access(user_ref text, grant_days numeric, reason text, actor text) |
ops_growth_daily(days integer) |
ops_list_users(limit_n integer, sort_by text) |
ops_notifications(period_days integer) |
ops_recent_activity(hours integer) |
ops_reset_notifications(user_ref text, actor text) |
ops_resolve_user(user_ref text) |
ops_revenue(period_days integer) |
ops_revoke_grant(grant_id uuid, actor text) |
ops_search_users(q text) |
ops_system_health() |
ops_user_detail(user_ref text) |
ops_users_overview(period_days integer) |
power_logs_left(p_day date) | authenticated
premium_grants(target uuid) |
qualify_referral() |
recompute_access(target uuid) |
recompute_bonus_trial_days(target uuid) |
record_data_export(p_kind text) | authenticated
referral_code_prefix(full_name text) |
register_subscription(p_provider_subscription_id text, p_tier text) | authenticated
release_ai_plan(p_id uuid) |
release_power_log(p_id uuid) |
request_refund(p_charge_id uuid, p_reason text) | authenticated
require_access_for_write() |
resolve_friend_code(code text) | authenticated
search_users(q text) | authenticated
set_referral_code() |
spend_gym_gift() |
start_trial(plan text) | authenticated
sync_achievements() | authenticated
unlink_gym(p_user_id uuid) |
user_achievement_metrics(p_user uuid) |
"""

TABLES = """achievements ai_flagged ai_plan_generations ai_unverified ai_verified
body_measurements cheers custom_reminders data_exports food_logs friendships
gym_links gym_memberships health_logs manual_grants notification_logs
ops_agent_threads ops_audit_log ops_pending_actions photo_downloads
power_log_uses referrals refund_requests saved_meals step_logs
subscription_charges subscriptions user_achievements
user_notification_preferences user_profiles water_logs webhook_events
weight_entries workout_logs workout_plans workout_profile""".split()

out = [
    "-- Part 6: grants, rebuilt to match the old project exactly. Generated by",
    "-- _parts/make_grants.py from the live grants read on 2026-10-15.",
    "-- A new project's default privileges hand anon/authenticated ALL on new",
    "-- tables and EXECUTE on new functions, so everything is revoked first.",
    "",
    "-- Tables",
]
assert len(TABLES) == 36
for t in TABLES:
    out.append(f"REVOKE ALL ON TABLE public.{t} FROM PUBLIC, anon, authenticated;")
for line in TABLE_GRANTS.strip().splitlines():
    m = re.fullmatch(r"(\w+)\.(\w+): ([A-Z,]+)", line.strip())
    t, role, privs = m.groups()
    assert t in TABLES, t
    out.append(f"GRANT {', '.join(privs.split(','))} ON TABLE public.{t} TO {role};")

out += ["", "-- Column-level grants (user_profiles lockdown)"]
for line in COLUMN_GRANTS.strip().splitlines():
    col, privs = [s.strip() for s in line.split(":")]
    for p in privs.split(","):
        out.append(f"GRANT {p} ({col}) ON TABLE public.user_profiles TO authenticated;")

out += ["", "-- Functions"]
n = 0
for line in FUNCS.strip().splitlines():
    sig, roles = [s.strip() for s in line.split("|")]
    n += 1
    out.append(f"REVOKE ALL ON FUNCTION public.{sig} FROM PUBLIC, anon, authenticated;")
    for r in roles.split():
        out.append(f"GRANT EXECUTE ON FUNCTION public.{sig} TO {r};")
assert n == 66, n

pathlib.Path(__file__).resolve().parent.parent.joinpath("06_grants.sql").write_text(
    "\n".join(out) + "\n", encoding="utf-8", newline="\n"
)
print("tables", len(TABLES), "functions", n)
