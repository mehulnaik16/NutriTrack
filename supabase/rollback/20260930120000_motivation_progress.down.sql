-- Rollback for 20260930120000_motivation_progress.sql
--
-- NOT a migration. Lives outside supabase/migrations/ so the CLI never picks
-- it up. Apply by pasting into the Supabase SQL editor.
--
-- Deploy the client that no longer reads these columns first: the current
-- client selects them, and with them gone every reconcile fails and nothing
-- is scheduled. Losing the data only means users fall back to the calendar
-- position.

begin;

alter table public.user_notification_preferences
  drop column if exists motivation_next_index,
  drop column if exists motivation_next_at,
  drop column if exists motivation_scheduled;

commit;
