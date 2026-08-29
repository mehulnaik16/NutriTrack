-- One-time onboarding intro (Benefits + Features / "/welcome" page).
--
-- The page is shown once, right after plan selection, before the dashboard.
-- This flag marks that a user has seen and dismissed it (by tapping "Go to
-- Dashboard", which is only reachable after scrolling through the whole page).
-- Once true, the /welcome route redirects straight to the dashboard, so the
-- intro never shows again — even on a manually typed URL.

alter table public.user_profiles
  add column if not exists has_seen_benefits_features_page boolean not null default false;
