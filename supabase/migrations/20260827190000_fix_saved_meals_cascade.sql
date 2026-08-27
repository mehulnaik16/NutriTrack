-- Fix saved_meals FK to cascade on auth.users deletion.
-- Without this, deleting the auth user would fail because saved_meals
-- uses the default NO ACTION rule.
ALTER TABLE public.saved_meals
  DROP CONSTRAINT saved_meals_user_id_fkey,
  ADD CONSTRAINT saved_meals_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
