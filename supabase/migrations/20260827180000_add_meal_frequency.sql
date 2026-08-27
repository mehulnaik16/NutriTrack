-- Persist meal frequency so it survives browser/device changes.
-- NULL = user has never set preference (triggers the setup dialog).
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS meal_frequency int DEFAULT NULL;
