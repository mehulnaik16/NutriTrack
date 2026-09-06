-- Rollback for 20260905120000_notification_foundations.sql
--
-- NOT a migration. Lives outside supabase/migrations/ on purpose so the CLI
-- never picks it up — running this by accident would drop the notification
-- feature's entire schema.
--
-- Apply by pasting into the Supabase SQL editor. It undoes exactly what the
-- forward migration created and touches nothing that predates it: no
-- pre-existing table loses a row, and the only columns dropped are the two the
-- forward migration added.
--
-- What is actually lost on rollback:
--   - every custom reminder and notification log (the feature's own data)
--   - user_profiles.motivation_seed, so re-applying gives everyone a fresh
--     seed and therefore a different quote order. Harmless.
--   - user_profiles.timezone, which the client rewrites on next launch.

begin;

-- notification_logs holds an FK to custom_reminders, so it goes first.
drop table if exists public.notification_logs;

-- Takes trg custom_reminders_cap with it.
drop table if exists public.custom_reminders;
drop function if exists public.enforce_reminder_cap();

drop table if exists public.user_notification_preferences;

-- The grant on this column disappears with the column itself.
alter table public.user_profiles drop column if exists timezone;
alter table public.user_profiles drop column if exists motivation_seed;

commit;
