-- Unit-aware food quantities, plus the food_logs repairs that have to land with
-- them.
--
-- Quantities were grams-only: the UI labelled the field "Quantity (g)" and the
-- number it held was always grams, so logging two idlis or a tablespoon of oil
-- meant converting by hand first. src/lib/foodUnits.ts now converts on the way
-- in; grams remain the calculation basis and the unit is recorded alongside so
-- an entry reads back as the user typed it.
--
-- Three pre-existing defects are fixed here because this change touches all of
-- them:
--
-- 1. fiber_g drift. It is written by src/components/FoodSearch.tsx, read on the
--    Food page, and declared in src/integrations/types.ts -- and no migration
--    ever created it. It exists in the live database only because it was added
--    by hand, so `supabase db reset` today produces a schema the app cannot
--    write to. `if not exists` makes this idempotent against the live database.
-- 2. No bounds of any kind on this table, so quantity_g could be zero or
--    negative and calories unbounded -- and the leaderboard sums calories.
-- 3. The UPDATE policy has USING but no WITH CHECK, so a user can update their
--    own row and reassign user_id to somebody else. Same defect that
--    20260819_security_hardening.sql fixed for user_profiles.

-- unit is free text, not an enum: the voice-logging path writes whatever the
-- model said the portion was -- "rotis", "bowls" -- and that is the honest
-- record of what the user asked for. Grams stay the basis either way, so a unit
-- nobody recognises degrades to a label, never to a wrong number.
-- fiber_g is numeric, not float, to match the column that was added to the live
-- database by hand -- `if not exists` skips it there, so this line only matters
-- on a fresh reset, and it should rebuild what production actually has.
alter table public.food_logs
  add column if not exists fiber_g       numeric not null default 0,
  add column if not exists unit          text    not null default 'g',
  add column if not exists unit_quantity float;

-- Every historical row was grams, so the entered quantity is the gram quantity.
-- Left nullable rather than NOT NULL: Capacitor builds already in users' hands
-- keep inserting without it, and readers fall back to quantity_g.
update public.food_logs
   set unit_quantity = quantity_g
 where unit_quantity is null;

-- NOT VALID for the same reason as 20260826155047_body_measurement_bounds.sql:
-- rows already outside these bounds are bad data, but failing the migration on
-- them would be worse. See the verification query at the foot of this file.
alter table public.food_logs
  add constraint food_logs_quantity_g_range
    check (quantity_g > 0 and quantity_g <= 5000)
    not valid;

alter table public.food_logs
  add constraint food_logs_unit_quantity_positive
    check (unit_quantity is null or unit_quantity > 0)
    not valid;

alter table public.food_logs
  add constraint food_logs_macros_range
    check (
      calories  between 0 and 20000
      and protein_g between 0 and 2000
      and carbs_g   between 0 and 2000
      and fat_g     between 0 and 2000
      and fiber_g   between 0 and 2000
    )
    not valid;

comment on constraint food_logs_quantity_g_range on public.food_logs is
  'Mirrors QUANTITY_G in src/lib/foodUnits.ts. Change both together.';

drop policy if exists "Users can update own food logs" on public.food_logs;
create policy "Users can update own food logs"
on public.food_logs
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Run BEFORE applying. Copy-previous-day and re-log re-INSERT historical rows
-- verbatim, and NOT VALID exempts old rows from validation but not from
-- re-insertion -- so any legacy offender turns those buttons into a raw
-- Postgres error in a toast. Correct or delete what this returns, then promote
-- the constraints with
--   alter table public.food_logs validate constraint <name>;
-- If it returns many rows, loosen the caps rather than ship broken buttons.
--
--   select id, food_name, quantity_g, calories, protein_g, carbs_g, fat_g, fiber_g
--     from public.food_logs
--    where quantity_g not between 0.001 and 5000
--       or calories   not between 0 and 20000
--       or protein_g  not between 0 and 2000
--       or carbs_g    not between 0 and 2000
--       or fat_g      not between 0 and 2000
--       or coalesce(fiber_g, 0) not between 0 and 2000;
