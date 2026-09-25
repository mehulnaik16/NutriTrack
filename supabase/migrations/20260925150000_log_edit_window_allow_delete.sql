-- Deleting a log is allowed at any age; only adding or changing entries older
-- than 7 days stays blocked. A delete cannot fake a streak or rewrite a number,
-- and users must be able to remove mistakes or data they no longer want.
-- Recreates the 20260925140000_log_edit_window triggers without DELETE; the
-- function's DELETE branch is simply no longer reached.

drop trigger if exists trg_food_logs_edit_window on public.food_logs;
create trigger trg_food_logs_edit_window
  before insert or update on public.food_logs
  for each row execute function public.enforce_log_edit_window('date');

drop trigger if exists trg_workout_logs_edit_window on public.workout_logs;
create trigger trg_workout_logs_edit_window
  before insert or update on public.workout_logs
  for each row execute function public.enforce_log_edit_window('date');

drop trigger if exists trg_weight_entries_edit_window on public.weight_entries;
create trigger trg_weight_entries_edit_window
  before insert or update on public.weight_entries
  for each row execute function public.enforce_log_edit_window('date');

drop trigger if exists trg_water_logs_edit_window on public.water_logs;
create trigger trg_water_logs_edit_window
  before insert or update on public.water_logs
  for each row execute function public.enforce_log_edit_window('date');

drop trigger if exists trg_step_logs_edit_window on public.step_logs;
create trigger trg_step_logs_edit_window
  before insert or update on public.step_logs
  for each row execute function public.enforce_log_edit_window('date');

drop trigger if exists trg_body_measurements_edit_window on public.body_measurements;
create trigger trg_body_measurements_edit_window
  before insert or update on public.body_measurements
  for each row execute function public.enforce_log_edit_window('measured_at');
