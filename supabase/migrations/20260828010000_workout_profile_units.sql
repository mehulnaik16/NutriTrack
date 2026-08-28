-- Per-user measurement-unit preference. Two units per dimension:
--   weight_unit / distance_unit    → the CURRENT display unit (editable)
--   orig_weight_unit / orig_distance_unit → the ORIGINAL unit chosen at first
--     setup — what exercise logs / cardio distance are stored in and what graphs
--     plot in (immutable after first setup).
-- Defaults backfill existing rows to kg/km (their historical data is metric).
alter table public.workout_profile
  add column if not exists weight_unit text not null default 'kg'
    check (weight_unit in ('kg','lbs')),
  add column if not exists distance_unit text not null default 'km'
    check (distance_unit in ('km','mile')),
  add column if not exists orig_weight_unit text not null default 'kg'
    check (orig_weight_unit in ('kg','lbs')),
  add column if not exists orig_distance_unit text not null default 'km'
    check (orig_distance_unit in ('km','mile'));
