-- Lock down public.user_profiles.
--
-- Follows the same pattern as 20260914_workout_logs_lockdown.sql. The
-- column-scoped INSERT/UPDATE grants from the billing lockdown are deliberately
-- left alone — access_until, selected_plan, trial_start_date, referral_code,
-- bonus_trial_days and bonus_premium_days stay outside the granted column list.

-- ── 1. Leftover default grants ───────────────────────────────────────────────
REVOKE TRUNCATE ON public.user_profiles FROM anon, authenticated;
REVOKE DELETE   ON public.user_profiles FROM anon, authenticated;

-- authenticated loses DELETE as well, unlike workout_logs. There is no DELETE
-- policy on this table and none planned: account deletion runs through
-- serverDeleteAccount -> supabaseAdmin.auth.admin.deleteUser(), which is
-- service_role and reaches this row by FK cascade from auth.users. Until now
-- the only thing blocking a direct delete was the absence of a policy; this
-- makes that explicit rather than incidental.

-- ── 2. RLS (already on; kept so a fresh replay reaches the same state) ───────
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- ── 3. Scope the policies to authenticated ──────────────────────────────────
-- All three were TO PUBLIC with a bare auth.uid(), which is re-evaluated once
-- per row (the auth_rls_initplan advisor lint). The predicate was already
-- NULL = id for an anon caller, so narrowing the role changes no behaviour.
DROP POLICY IF EXISTS "Users can view own profile"   ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;

CREATE POLICY "Users can view own profile"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = id);

CREATE POLICY "Users can insert own profile"
  ON public.user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "Users can update own profile"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING      ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);
