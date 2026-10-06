-- The dashboard's one-time "New here? Take a tour" offer.
--
-- Its answer used to live only in localStorage, so a new browser, phone or a
-- cleared cache asked again. Once the user taps "Show me" or "No thanks" this
-- flag is set and the offer never shows on any device. The tour itself stays
-- available from Settings → App tour.

alter table public.user_profiles
  add column if not exists has_answered_tour_offer boolean not null default false;

-- user_profiles uses a column allowlist for client UPDATEs (billing lockdown).
grant update (has_answered_tour_offer) on table public.user_profiles to authenticated;
