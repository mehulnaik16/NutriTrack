-- Part 8: the achievements catalog (24 rows). Reference data the app needs,
-- not user data: user_achievements has a foreign key to it, and
-- award_achievement() / sync_achievements() read it.

INSERT INTO public.achievements (id, metric, threshold, xp, sort_order) VALUES
  ('first_bite', 'food_count', 1, 50, 10),
  ('streak_3', 'food_streak', 3, 75, 20),
  ('streak_7', 'food_streak', 7, 150, 30),
  ('streak_14', 'food_streak', 14, 250, 40),
  ('streak_30', 'food_streak', 30, 500, 50),
  ('food_100', 'food_count', 100, 200, 60),
  ('food_500', 'food_count', 500, 500, 70),
  ('early_bird', 'early_logs', 5, 150, 80),
  ('first_rep', 'workout_count', 1, 50, 90),
  ('workouts_10', 'workout_count', 10, 150, 100),
  ('workouts_50', 'workout_count', 50, 300, 110),
  ('workouts_100', 'workout_count', 100, 500, 120),
  ('on_scale', 'weight_count', 1, 50, 130),
  ('weigh_20', 'weight_count', 20, 200, 140),
  ('first_photo', 'photo_count', 1, 50, 150),
  ('photos_10', 'photo_count', 10, 200, 160),
  ('hydra_7', 'hydrated_days', 7, 150, 170),
  ('hydra_30', 'hydrated_days', 30, 400, 180),
  ('chef_5', 'saved_meals', 5, 100, 190),
  ('steps_first', 'step_days', 1, 50, 200),
  ('steps_10', 'step_days', 10, 150, 210),
  ('steps_50', 'step_days', 50, 300, 220),
  ('steps_streak_7', 'step_streak', 7, 200, 230),
  ('steps_streak_30', 'step_streak', 30, 500, 240)
ON CONFLICT (id) DO NOTHING;
