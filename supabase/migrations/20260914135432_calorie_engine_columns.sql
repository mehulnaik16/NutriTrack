-- Add calorie calculation metadata columns to workout_logs.
--
-- calc_method records WHICH formula produced calories_burned (HEART_RATE,
-- ACSM_TREADMILL, ACSM_RUN, ACSM_WALK, SPEED_MET, VERTICAL, TIER_MET, GENERIC,
-- MANUAL) and confidence records whether it came from a measurement, an
-- estimate, or the user typing over the number.
--
-- Both are NOT NULL with a default so the generated Row types can stay
-- non-nullable: the DEFAULT backfills every pre-existing log, which is honest
-- since those were all written by the old flat-MET estimator.

ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS calc_method text DEFAULT 'TIER_MET',
  ADD COLUMN IF NOT EXISTS confidence text DEFAULT 'estimated';

UPDATE public.workout_logs SET calc_method = 'TIER_MET' WHERE calc_method IS NULL;
UPDATE public.workout_logs SET confidence = 'estimated' WHERE confidence IS NULL;

ALTER TABLE public.workout_logs
  ALTER COLUMN calc_method SET NOT NULL,
  ALTER COLUMN confidence SET NOT NULL;
