-- Persist the user's meal-category NAMES, not just the count.
--
-- Until now only `meal_frequency` (an integer count) was stored server-side; the
-- actual names (Breakfast, Lunch, custom ones like "Pre-workout") lived only in
-- localStorage. Clearing the browser cache / session dropped them back to
-- generic defaults. This column stores the names as a JSON array of strings so
-- they survive cache clears and follow the user across devices.

alter table public.user_profiles
  add column if not exists meal_names jsonb not null default '[]'::jsonb;
