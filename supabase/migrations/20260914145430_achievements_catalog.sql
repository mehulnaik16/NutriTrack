-- Migration A — achievement catalog.
--
-- achievement_id on user_achievements had no FK and no CHECK, so any string was
-- accepted. This turns the 19 ids into real rows, which is the prerequisite for
-- server-side eligibility in migration B.
--
-- xp moves here too. Eligibility and the XP numbers were BOTH client-owned (in
-- xpConfig.ts); moving only eligibility to the server would relocate the problem
-- rather than fix it.
--
-- metric names the primitive the threshold is compared against. The 19
-- achievements reduce to 8 primitives, computed in migration B.

create table if not exists public.achievements (
  id         text primary key,
  metric     text not null check (metric in (
               'food_count', 'food_streak', 'early_logs', 'workout_count',
               'weight_count', 'photo_count', 'hydrated_days', 'saved_meals')),
  threshold  int  not null check (threshold > 0),
  xp         int  not null check (xp >= 0),
  sort_order int  not null default 0
);

alter table public.achievements enable row level security;

-- The catalog is shared reference data, not per-user rows.
drop policy if exists "achievements readable" on public.achievements;
create policy "achievements readable"
  on public.achievements
  for select
  to authenticated
  using (true);

-- Supabase's default privileges would hand anon and authenticated full CRUD on
-- a new public table. Seeded by migration only, so take it all back and return
-- just SELECT.
revoke all on public.achievements from anon, authenticated;
grant select on public.achievements to authenticated;

insert into public.achievements (id, metric, threshold, xp, sort_order) values
  ('first_bite',   'food_count',    1,   50,  10),
  ('streak_3',     'food_streak',   3,   75,  20),
  ('streak_7',     'food_streak',   7,   150, 30),
  ('streak_14',    'food_streak',   14,  250, 40),
  ('streak_30',    'food_streak',   30,  500, 50),
  ('food_100',     'food_count',    100, 200, 60),
  ('food_500',     'food_count',    500, 500, 70),
  ('early_bird',   'early_logs',    5,   150, 80),
  ('first_rep',    'workout_count', 1,   50,  90),
  ('workouts_10',  'workout_count', 10,  150, 100),
  ('workouts_50',  'workout_count', 50,  300, 110),
  ('workouts_100', 'workout_count', 100, 500, 120),
  ('on_scale',     'weight_count',  1,   50,  130),
  ('weigh_20',     'weight_count',  20,  200, 140),
  ('first_photo',  'photo_count',   1,   50,  150),
  ('photos_10',    'photo_count',   10,  200, 160),
  ('hydra_7',      'hydrated_days', 7,   150, 170),
  ('hydra_30',     'hydrated_days', 30,  400, 180),
  ('chef_5',       'saved_meals',   5,   100, 190)
on conflict (id) do update
  set metric     = excluded.metric,
      threshold  = excluded.threshold,
      xp         = excluded.xp,
      sort_order = excluded.sort_order;

-- Fail loudly and name the ids rather than letting the FK below report a
-- constraint violation with no indication of which value drifted.
do $$
declare orphans text;
begin
  select string_agg(distinct ua.achievement_id, ', ')
    into orphans
    from public.user_achievements ua
    left join public.achievements a on a.id = ua.achievement_id
   where a.id is null;

  if orphans is not null then
    raise exception 'orphaned achievement_ids, seed is incomplete: %', orphans;
  end if;
end $$;

alter table public.user_achievements
  drop constraint if exists user_achievements_achievement_id_fkey;
alter table public.user_achievements
  add constraint user_achievements_achievement_id_fkey
  foreign key (achievement_id) references public.achievements(id);
