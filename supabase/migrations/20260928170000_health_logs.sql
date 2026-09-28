-- Health Logs: Blood Pressure (Hypertension) and Blood Glucose (Diabetes) tracking.
-- Supports multiple logs per day, with full user CRUD (insert, select, update, delete).

create table if not exists public.health_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  condition    text not null check (condition in ('hypertension', 'diabetes')),
  systolic     integer check (systolic is null or (systolic >= 50 and systolic <= 280)),
  diastolic    integer check (diastolic is null or (diastolic >= 30 and diastolic <= 180)),
  glucose      integer check (glucose is null or (glucose >= 50 and glucose <= 1800)),
  logged_at    timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  constraint health_logs_valid_condition check (
    (condition = 'hypertension' and systolic is not null and diastolic is not null and systolic > diastolic and glucose is null) or
    (condition = 'diabetes' and glucose is not null and systolic is null and diastolic is null)
  )
);

comment on table public.health_logs is
  'Individual blood pressure and glucose readings with InSH 2023 / diabetes constraints.';

-- Enable RLS
alter table public.health_logs enable row level security;

-- Owner CRUD policy (allows SELECT, INSERT, UPDATE, DELETE for own rows)
drop policy if exists "health_logs_user_all" on public.health_logs;
create policy "health_logs_user_all" on public.health_logs
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for fetching history ordered by date
create index if not exists idx_health_logs_user_logged
  on public.health_logs (user_id, logged_at desc);
