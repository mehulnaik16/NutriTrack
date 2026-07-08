alter table public.food_logs add column fiber_g numeric not null default 0;
alter table public.user_profiles add column fiber_target_g numeric;
