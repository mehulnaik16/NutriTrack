-- Fixes signup, broken by 20260901120000_billing_lockdown.sql.
--
-- quiz.tsx creates the profile row with .upsert(). PostgREST turns that into
--   insert into user_profiles (...) values (...)
--   on conflict (id) do update set id = excluded.id, full_name = excluded.full_name, ...
-- and it puts `id` in the SET list. That needs UPDATE privilege on the id
-- column, which the allowlist deliberately withheld — so every signup failed
-- with 42501. Postgres reports it as "permission denied for table
-- user_profiles" rather than naming the column, which is what made it read like
-- a blanket revoke rather than one missing column.
--
-- Granting update (id) is safe here and reopens nothing: the UPDATE policy on
-- this table carries both using (auth.uid() = id) and with_check (auth.uid() = id),
-- so the only value a client can write into id is the one already there.
-- Verified — an attempt to move a row onto another id fails with "new row
-- violates row-level security policy", and bonus_trial_days and
-- trial_start_date still fail with 42501.

grant update (id) on table public.user_profiles to authenticated;
