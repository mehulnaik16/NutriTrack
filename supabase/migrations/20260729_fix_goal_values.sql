-- ── Fix macro formula: remap old goal strings and backfill corrected values ────
-- Run this once in Supabase SQL editor or via: supabase db push

-- Step 1: Add fiber_target_g column if missing (idempotent)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS fiber_target_g float;

-- Step 2: Remap old free-text goal values to new DB enum keys
UPDATE user_profiles
SET goal = CASE
  WHEN goal = 'Lose Weight'     THEN 'lose_0_5kg'    -- same 500 cal deficit as before
  WHEN goal = 'Maintain Weight' THEN 'maintain'
  WHEN goal = 'Gain Muscle'     THEN 'gain_muscle'
  ELSE COALESCE(goal, 'maintain')
END
WHERE goal IN ('Lose Weight', 'Maintain Weight', 'Gain Muscle') OR goal IS NULL;

-- Step 3: Backfill corrected bmr, tdee, daily_calorie_target, and fiber
-- for all users who have the required fields filled in.
-- protein/carbs/fat macros will be recalculated automatically on next profile save.
UPDATE user_profiles
SET
  bmr = ROUND(
    CASE
      WHEN gender = 'Female' THEN 10 * weight_kg + 6.25 * height_cm - 5 * age - 161
      ELSE                        10 * weight_kg + 6.25 * height_cm - 5 * age + 5
    END
  ),

  tdee = ROUND(
    (CASE
      WHEN gender = 'Female' THEN 10 * weight_kg + 6.25 * height_cm - 5 * age - 161
      ELSE                        10 * weight_kg + 6.25 * height_cm - 5 * age + 5
    END) * (CASE activity_level
      WHEN 'Sedentary'         THEN 1.2
      WHEN 'Lightly Active'    THEN 1.375
      WHEN 'Moderately Active' THEN 1.55
      WHEN 'Very Active'       THEN 1.725
      WHEN 'Super Active'      THEN 1.9
      ELSE 1.2
    END)
  ),

  daily_calorie_target = GREATEST(
    ROUND(
      (CASE
        WHEN gender = 'Female' THEN 10 * weight_kg + 6.25 * height_cm - 5 * age - 161
        ELSE                        10 * weight_kg + 6.25 * height_cm - 5 * age + 5
      END) * (CASE activity_level
        WHEN 'Sedentary'         THEN 1.2
        WHEN 'Lightly Active'    THEN 1.375
        WHEN 'Moderately Active' THEN 1.55
        WHEN 'Very Active'       THEN 1.725
        WHEN 'Super Active'      THEN 1.9
        ELSE 1.2
      END) + (CASE goal
        WHEN 'lose_0_25kg' THEN -250
        WHEN 'lose_0_5kg'  THEN -500
        WHEN 'gain_muscle' THEN  300
        ELSE 0
      END)
    ),
    CASE WHEN gender = 'Female' THEN 1200 ELSE 1500 END
  ),

  protein_target_g = ROUND(
    GREATEST(
      ROUND(
        (CASE
          WHEN gender = 'Female' THEN 10 * weight_kg + 6.25 * height_cm - 5 * age - 161
          ELSE                        10 * weight_kg + 6.25 * height_cm - 5 * age + 5
        END) * (CASE activity_level
          WHEN 'Sedentary'         THEN 1.2
          WHEN 'Lightly Active'    THEN 1.375
          WHEN 'Moderately Active' THEN 1.55
          WHEN 'Very Active'       THEN 1.725
          WHEN 'Super Active'      THEN 1.9
          ELSE 1.2
        END) + (CASE goal
          WHEN 'lose_0_25kg' THEN -250
          WHEN 'lose_0_5kg'  THEN -500
          WHEN 'gain_muscle' THEN  300
          ELSE 0
        END)
      ),
      CASE WHEN gender = 'Female' THEN 1200 ELSE 1500 END
    ) * (CASE WHEN goal LIKE 'lose%' THEN 0.35 ELSE 0.30 END) / 4
  ),

  fat_target_g = ROUND(
    GREATEST(
      ROUND(
        (CASE
          WHEN gender = 'Female' THEN 10 * weight_kg + 6.25 * height_cm - 5 * age - 161
          ELSE                        10 * weight_kg + 6.25 * height_cm - 5 * age + 5
        END) * (CASE activity_level
          WHEN 'Sedentary'         THEN 1.2
          WHEN 'Lightly Active'    THEN 1.375
          WHEN 'Moderately Active' THEN 1.55
          WHEN 'Very Active'       THEN 1.725
          WHEN 'Super Active'      THEN 1.9
          ELSE 1.2
        END) + (CASE goal
          WHEN 'lose_0_25kg' THEN -250
          WHEN 'lose_0_5kg'  THEN -500
          WHEN 'gain_muscle' THEN  300
          ELSE 0
        END)
      ),
      CASE WHEN gender = 'Female' THEN 1200 ELSE 1500 END
    ) * (CASE WHEN goal LIKE 'lose%' THEN 0.25 ELSE 0.30 END) / 9
  ),

  carbs_target_g = ROUND(
    GREATEST(
      ROUND(
        (CASE
          WHEN gender = 'Female' THEN 10 * weight_kg + 6.25 * height_cm - 5 * age - 161
          ELSE                        10 * weight_kg + 6.25 * height_cm - 5 * age + 5
        END) * (CASE activity_level
          WHEN 'Sedentary'         THEN 1.2
          WHEN 'Lightly Active'    THEN 1.375
          WHEN 'Moderately Active' THEN 1.55
          WHEN 'Very Active'       THEN 1.725
          WHEN 'Super Active'      THEN 1.9
          ELSE 1.2
        END) + (CASE goal
          WHEN 'lose_0_25kg' THEN -250
          WHEN 'lose_0_5kg'  THEN -500
          WHEN 'gain_muscle' THEN  300
          ELSE 0
        END)
      ),
      CASE WHEN gender = 'Female' THEN 1200 ELSE 1500 END
    ) * 0.40 / 4
  ),

  fiber_target_g = 30

WHERE weight_kg IS NOT NULL
  AND height_cm IS NOT NULL
  AND age IS NOT NULL
  AND gender IS NOT NULL;
