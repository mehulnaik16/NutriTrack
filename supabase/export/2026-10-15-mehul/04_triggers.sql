-- Part 4: the 22 triggers on public tables. None are on auth.users: the app
-- creates user_profiles rows itself after sign-up.

SET search_path = public, extensions;

CREATE TRIGGER trg_body_measurements_edit_window BEFORE INSERT OR UPDATE ON public.body_measurements FOR EACH ROW EXECUTE FUNCTION public.enforce_log_edit_window('measured_at');
CREATE TRIGGER trg_body_measurements_history_version AFTER INSERT OR DELETE OR UPDATE ON public.body_measurements FOR EACH ROW EXECUTE FUNCTION public.bump_history_version('measured_at');
CREATE TRIGGER custom_reminders_cap BEFORE INSERT ON public.custom_reminders FOR EACH ROW EXECUTE FUNCTION public.enforce_reminder_cap();
CREATE TRIGGER trg_check_food_log_daily_limit BEFORE INSERT OR UPDATE OF calories, date, user_id ON public.food_logs FOR EACH ROW EXECUTE FUNCTION public.check_food_log_daily_limit();
CREATE TRIGGER trg_food_logs_edit_window BEFORE INSERT OR UPDATE ON public.food_logs FOR EACH ROW EXECUTE FUNCTION public.enforce_log_edit_window('date');
CREATE TRIGGER trg_food_logs_history_version AFTER INSERT OR DELETE OR UPDATE ON public.food_logs FOR EACH ROW EXECUTE FUNCTION public.bump_history_version('date');
CREATE TRIGGER trg_food_logs_require_access BEFORE INSERT OR DELETE OR UPDATE ON public.food_logs FOR EACH ROW EXECUTE FUNCTION public.require_access_for_write();
CREATE TRIGGER trg_saved_meals_require_access BEFORE INSERT OR DELETE OR UPDATE ON public.saved_meals FOR EACH ROW EXECUTE FUNCTION public.require_access_for_write();
CREATE TRIGGER trg_step_logs_edit_window BEFORE INSERT OR UPDATE ON public.step_logs FOR EACH ROW EXECUTE FUNCTION public.enforce_log_edit_window('date');
CREATE TRIGGER trg_spend_gym_gift AFTER INSERT ON public.subscription_charges FOR EACH ROW EXECUTE FUNCTION public.spend_gym_gift();
CREATE TRIGGER trg_qualify_referral AFTER UPDATE OF trial_start_date ON public.user_profiles FOR EACH ROW WHEN (((old.trial_start_date IS NULL) AND (new.trial_start_date IS NOT NULL))) EXECUTE FUNCTION public.qualify_referral();
CREATE TRIGGER trg_set_referral_code BEFORE INSERT ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.set_referral_code();
CREATE TRIGGER trg_user_profiles_profile_version BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.bump_profile_version();
CREATE TRIGGER trg_water_logs_edit_window BEFORE INSERT OR UPDATE ON public.water_logs FOR EACH ROW EXECUTE FUNCTION public.enforce_log_edit_window('date');
CREATE TRIGGER trg_water_logs_require_access BEFORE INSERT OR DELETE OR UPDATE ON public.water_logs FOR EACH ROW EXECUTE FUNCTION public.require_access_for_write();
CREATE TRIGGER trg_weight_entries_edit_window BEFORE INSERT OR UPDATE ON public.weight_entries FOR EACH ROW EXECUTE FUNCTION public.enforce_log_edit_window('date');
CREATE TRIGGER trg_weight_entries_history_version AFTER INSERT OR DELETE OR UPDATE ON public.weight_entries FOR EACH ROW EXECUTE FUNCTION public.bump_history_version('date');
CREATE TRIGGER trg_check_workout_set_daily_limit BEFORE INSERT OR UPDATE OF exercises_done, date, user_id, workout_name ON public.workout_logs FOR EACH ROW EXECUTE FUNCTION public.check_workout_set_daily_limit();
CREATE TRIGGER trg_workout_logs_edit_window BEFORE INSERT OR UPDATE ON public.workout_logs FOR EACH ROW EXECUTE FUNCTION public.enforce_log_edit_window('date');
CREATE TRIGGER trg_workout_logs_history_version AFTER INSERT OR DELETE OR UPDATE ON public.workout_logs FOR EACH ROW EXECUTE FUNCTION public.bump_history_version('date');
CREATE TRIGGER trg_workout_plans_plan_version AFTER INSERT OR DELETE OR UPDATE ON public.workout_plans FOR EACH ROW EXECUTE FUNCTION public.bump_plan_version();
CREATE TRIGGER trg_workout_profile_plan_version AFTER INSERT OR DELETE OR UPDATE ON public.workout_profile FOR EACH ROW EXECUTE FUNCTION public.bump_plan_version();
