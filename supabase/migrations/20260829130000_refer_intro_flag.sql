-- Compulsory-once Refer & Earn intro card (the "/refer-intro" screen shown right
-- after the /welcome intro).
--
-- The card is forced on every login until the user dismisses it (via "Skip for
-- now" or the bottom "Continue to Dashboard" button), which sets this flag true.
-- Once true, the dashboard stops redirecting to it and the route self-redirects
-- away, so it never shows again.

alter table public.user_profiles
  add column if not exists has_seen_refer_intro boolean not null default false;
