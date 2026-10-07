-- The "turn on notifications" card may show at most twice per account:
-- once after the user's very first log, once on day 5 after joining.
-- It was tracked in each browser's localStorage, so every new device, browser
-- or cleared storage started over and the card looked random. These flags
-- move that memory to the account. Set to true the moment a card is decided
-- (shown, or skipped because the user already had logs), never back.

alter table public.user_profiles
  add column if not exists notif_primer_first_log_shown boolean not null default false,
  add column if not exists notif_primer_day5_shown boolean not null default false;

-- Users set their own flags (RLS already limits them to their own row).
grant update (notif_primer_first_log_shown, notif_primer_day5_shown)
  on table public.user_profiles to authenticated;
