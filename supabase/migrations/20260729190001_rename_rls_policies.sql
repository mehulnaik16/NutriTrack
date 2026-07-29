-- ============================================================
-- Policy rename sync: align local names with live DB names
-- Generated: 2026-07-29
--
-- The initial migration (20260517071940) created policies with
-- lowercase names. They were renamed in the Supabase dashboard.
-- This migration renames them locally to match.
-- ============================================================

-- ── user_profiles ────────────────────────────────────────────

ALTER POLICY "users view own profile"   ON public.user_profiles RENAME TO "Users can view own profile";
ALTER POLICY "users insert own profile" ON public.user_profiles RENAME TO "Users can insert own profile";
ALTER POLICY "users update own profile" ON public.user_profiles RENAME TO "Users can update own profile";

-- ── food_logs ────────────────────────────────────────────────

ALTER POLICY "users view own logs"   ON public.food_logs RENAME TO "Users can view own food logs";
ALTER POLICY "users insert own logs" ON public.food_logs RENAME TO "Users can insert own food logs";
ALTER POLICY "users update own logs" ON public.food_logs RENAME TO "Users can update own food logs";
ALTER POLICY "users delete own logs" ON public.food_logs RENAME TO "Users can delete own food logs";
