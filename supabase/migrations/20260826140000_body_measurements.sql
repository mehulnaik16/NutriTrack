-- Body measurements — circumference tracking (biceps, chest, thigh, abdomen).
--
-- One row per user per date, holding a jsonb map of metric -> centimetres:
--   { "biceps": 35.5, "chest": 101 }
--
-- Why jsonb rather than a column per metric or a long/EAV table: a logging
-- session covers several body parts at once, so one row per session keeps
-- "show me that day" a single read, and adding a metric later is a client
-- constant, not a migration. The vocabulary is small, fixed, and app-owned —
-- see METRICS in src/lib/measurements.ts.
--
-- Shape mirrors public.weight_entries (20260602_new_features.sql): uuid PK,
-- cascade FK to auth.users, a date uniquely keyed per user, and RLS scoped to
-- the owner.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Validation predicate
-- ═══════════════════════════════════════════════════════════════════════

-- RLS lets the client write its own rows directly, so the trust boundary is the
-- table, not the component. One CHECK here beats validating in every future
-- write path. CHECK cannot contain a subquery, hence the IMMUTABLE wrapper.
--
-- DO NOT revoke EXECUTE on this. It is a pure predicate over its own argument —
-- no table access, not SECURITY DEFINER, nothing to leak — and every INSERT has
-- to evaluate it. Revoking it in a hardening pass would break all writes.
create or replace function public.measurements_valid(m jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(m) = 'object' and not exists (
    select 1 from jsonb_each(m) e
    where jsonb_typeof(e.value) <> 'number'
       or (e.value)::numeric <= 0
       or (e.value)::numeric > 400
  );
$$;

comment on function public.measurements_valid(jsonb) is
  'CHECK predicate for body_measurements.measurements: a flat object of positive numbers under 400 cm. Referenced by a table constraint — do not revoke EXECUTE.';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. The table
-- ═══════════════════════════════════════════════════════════════════════

create table public.body_measurements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- The day the measurement describes, which is not the row's insert time —
  -- the user can back-date an entry. Unique per user so a second log on the
  -- same day merges into this row instead of creating a rival one.
  measured_at  date not null default current_date,
  measurements jsonb not null default '{}'::jsonb,
  note         text,
  created_at   timestamptz not null default now(),
  unique (user_id, measured_at),
  constraint measurements_are_sane check (public.measurements_valid(measurements))
);

comment on column public.body_measurements.measurements is
  'Metric -> centimetres, e.g. {"biceps": 35.5}. Keys come from METRICS in src/lib/measurements.ts. Never a name the client invented on the fly.';

create index body_measurements_user_date
  on public.body_measurements (user_id, measured_at desc);

alter table public.body_measurements enable row level security;

create policy "users manage own body measurements"
  on public.body_measurements
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. The write
-- ═══════════════════════════════════════════════════════════════════════

-- A plain upsert REPLACES the whole jsonb, so logging chest in the evening
-- would wipe the morning's biceps. Merging client-side means a read-modify-write
-- with a cross-device race; the `||` operator does it correctly here instead.
--
-- Deliberately SECURITY INVOKER (the default), unlike the referral functions:
-- it only ever writes the caller's own row, so the RLS policy above is already
-- the guard. Nothing to harden, no search_path escalation surface.
create or replace function public.log_body_measurements(
  entries    jsonb,
  on_date    date default null,
  entry_note text default null
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  insert into public.body_measurements (user_id, measured_at, measurements, note)
  values (auth.uid(), coalesce(on_date, current_date), entries, entry_note)
  on conflict (user_id, measured_at) do update
    set measurements = body_measurements.measurements || excluded.measurements,
        -- A blank note must not erase the one already on the row.
        note         = coalesce(excluded.note, body_measurements.note);
end;
$$;

revoke execute on function public.log_body_measurements(jsonb, date, text) from anon, public;
grant  execute on function public.log_body_measurements(jsonb, date, text) to authenticated;
