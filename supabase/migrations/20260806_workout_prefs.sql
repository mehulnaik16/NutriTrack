-- SUPERSEDED: this column was never applied to production (confirmed via
-- information_schema.columns on 2026-08-21). The /workout-setup
-- questionnaire is now stored in the dedicated `workout_profile` table —
-- see 20260821100955_create_workout_profile.sql. This file is kept only so
-- migration history stays linear; it intentionally does nothing.
select 1;
