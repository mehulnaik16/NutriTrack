-- This file was a duplicate of 20260729152300_add_storage_rls.sql
-- which already created the "Users read own weight photos" SELECT policy.
-- Replaced with a no-op to prevent "policy already exists" errors on re-run.
--
-- The SELECT policy is correctly defined in 20260729152300_add_storage_rls.sql.

SELECT 1; -- no-op
