-- Follow-up to 20260825101500_referrals.sql.
--
-- That migration revoked its internal helpers from `anon, public`, but Supabase
-- also grants EXECUTE directly to `authenticated` via default privileges, and a
-- revoke from PUBLIC does not touch a direct role grant. The helpers were
-- therefore still callable by any signed-in user.
--
-- Neither leaks nor escalates — recompute_bonus_trial_days() recomputes the
-- true value from real referral rows so it cannot inflate anyone's days, and
-- generate_referral_code() only returns an unused string without writing — but
-- the original migration states these are locked down, so make that true.
--
-- Safe for both triggers: PostgreSQL does not check EXECUTE on a trigger
-- function when firing it, and the two SECURITY DEFINER callers
-- (set_referral_code, qualify_referral) run as the function owner.

revoke execute on function public.referral_code_prefix(text) from authenticated;
revoke execute on function public.generate_referral_code(text) from authenticated;
revoke execute on function public.set_referral_code() from authenticated;
revoke execute on function public.recompute_bonus_trial_days(uuid) from authenticated;
revoke execute on function public.qualify_referral() from authenticated;
