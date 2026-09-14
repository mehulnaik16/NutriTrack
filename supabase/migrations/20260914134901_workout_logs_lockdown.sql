-- Lock down public.workout_logs.
--
-- Supabase grants ALL on new tables to anon and authenticated by default. RLS
-- already blocked anon from every row here, so nothing below was exploitable
-- through PostgREST — this is defence in depth, removing privileges no API role
-- has any reason to hold.
--
-- Scope is deliberately narrow: anon keeps SELECT/INSERT/UPDATE (RLS makes them
-- return nothing), and service_role keeps TRUNCATE for server-side tooling.

-- ── 1. Leftover default grants ───────────────────────────────────────────────
REVOKE TRUNCATE ON public.workout_logs FROM anon, authenticated;
REVOKE DELETE   ON public.workout_logs FROM anon;

-- ── 2. RLS (already on; kept so a fresh replay reaches the same state) ───────
ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;

-- ── 3. Per-user isolation across all four commands ──────────────────────────
-- Replaces the previous policy, which was TO PUBLIC and used a bare auth.uid().
-- The bare call is re-evaluated once per row (the auth_rls_initplan advisor
-- lint); the subselect form is evaluated once per statement.
DROP POLICY IF EXISTS "users manage own workout logs" ON public.workout_logs;

CREATE POLICY "users manage own workout logs"
  ON public.workout_logs
  FOR ALL
  TO authenticated
  USING      ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
