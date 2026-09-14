-- Migration B — server-side achievement eligibility, and closing both write paths.
--
-- Before this, any signed-in user could hold any badge, two ways:
--   1. POST /rest/v1/user_achievements directly — authenticated held INSERT and
--      the policy only checked user_id, never achievement_id.
--   2. award_achievement(p_id) — SECURITY DEFINER, inserted p_id verbatim.
-- Eligibility lived entirely in RankPage.tsx. Closing one path alone just moves
-- the hole, so both close here.
--
-- TIMEZONE: metrics are computed in user_profiles.timezone, read directly with
-- no coalesce. The column is NOT NULL DEFAULT 'Asia/Kolkata' and has zero nulls,
-- so there is no null case to invent a default for. This is still a behaviour
-- change from the client, which used the browser's device timezone: eligibility
-- now follows the profile rather than wherever the user is standing.
--
-- FOOD_STREAK: the LONGEST consecutive-day run ever, not the current streak.
-- The client computed the current streak and awarded while it was live; a badge
-- is permanent but a current streak decays, so a server-side recompute using the
-- current streak could never re-award a historical badge. Verified against the
-- one user holding badges: longest run 6 days, current run 1, and they hold
-- streak_3 — the current-streak reading would have refused to re-award it.
--
-- Only days whose food log was entered on the day it is for count toward the
-- streak, matching the rule the client applied.

-- ── 1. Metrics ───────────────────────────────────────────────────────────────
-- The eight primitives the 19 achievements reduce to. Internal: called only by
-- the two functions below, which run as owner, so it gets no grant at all.

create or replace function public.user_achievement_metrics(p_user uuid)
returns table (
  food_count int, food_streak int, early_logs int, workout_count int,
  weight_count int, photo_count int, hydrated_days int, saved_meals int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with zone as (
    select p.timezone as tz from public.user_profiles p where p.id = p_user
  ),
  food as (
    select f.date,
           (f.logged_at at time zone (select tz from zone))::date as logged_date,
           extract(hour from (f.logged_at at time zone (select tz from zone))) as logged_hour
      from public.food_logs f
     where f.user_id = p_user
  ),
  days as (select distinct date from food where logged_date = date),
  -- Gaps and islands: consecutive dates share (date - row_number()).
  islands as (
    select date - (row_number() over (order by date))::int as grp from days
  ),
  runs as (select count(*)::int as len from islands group by grp)
  select
    (select count(*)::int from food),
    (select coalesce(max(len), 0) from runs),
    (select count(*)::int from food where logged_hour < 8),
    (select count(*)::int from public.workout_logs  where user_id = p_user),
    (select count(*)::int from public.weight_entries where user_id = p_user),
    (select count(*)::int from public.weight_entries
      where user_id = p_user and nullif(btrim(coalesce(photo_url, '')), '') is not null),
    -- water_logs is UNIQUE (user_id, date), so one row is one day and amount_ml
    -- is that day's running total.
    (select count(*)::int from public.water_logs
      where user_id = p_user and amount_ml >= 2000),
    (select count(*)::int from public.saved_meals  where user_id = p_user);
$function$;

-- ── 2. The write path ────────────────────────────────────────────────────────
-- No argument, so there is nothing for a caller to lie about. Returns the full
-- earned set with xp so the client renders rather than computes — leaving xp on
-- the client would let the two copies drift the first time a value is tuned.

create or replace function public.sync_achievements()
returns table (achievement_id text, xp int)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  caller uuid := auth.uid();
  m      record;
begin
  if caller is null then
    raise exception 'Unauthorized';
  end if;

  select * into m from public.user_achievement_metrics(caller);

  insert into public.user_achievements (user_id, achievement_id)
  select caller, a.id
    from public.achievements a
   where case a.metric
           when 'food_count'    then m.food_count
           when 'food_streak'   then m.food_streak
           when 'early_logs'    then m.early_logs
           when 'workout_count' then m.workout_count
           when 'weight_count'  then m.weight_count
           when 'photo_count'   then m.photo_count
           when 'hydrated_days' then m.hydrated_days
           when 'saved_meals'   then m.saved_meals
         end >= a.threshold
  on conflict (user_id, achievement_id) do nothing;

  -- Aliased inside a subquery: the RETURNS TABLE output columns are named
  -- achievement_id and xp, which would otherwise be ambiguous against the very
  -- columns being selected.
  return query
    select t.a_id, t.a_xp
      from (
        select ua.achievement_id as a_id, a.xp as a_xp, a.sort_order as a_sort
          from public.user_achievements ua
          join public.achievements a on a.id = ua.achievement_id
         where ua.user_id = caller
      ) t
     order by t.a_sort;
end;
$function$;

-- ── 3. award_achievement — validated, not dropped ────────────────────────────
-- The deployed client still calls this 19 times. A migration lands instantly, a
-- client deploy does not, so rewriting it here closes the hole now rather than
-- at deploy time. Dropped in a follow-up once RankPage.tsx uses
-- sync_achievements().

create or replace function public.award_achievement(p_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  caller uuid := auth.uid();
  a      public.achievements%rowtype;
  m      record;
  actual int;
begin
  if caller is null then
    raise exception 'Unauthorized';
  end if;

  select * into a from public.achievements where id = p_id;
  if not found then
    raise exception 'Unknown achievement %', p_id;
  end if;

  select * into m from public.user_achievement_metrics(caller);
  actual := case a.metric
              when 'food_count'    then m.food_count
              when 'food_streak'   then m.food_streak
              when 'early_logs'    then m.early_logs
              when 'workout_count' then m.workout_count
              when 'weight_count'  then m.weight_count
              when 'photo_count'   then m.photo_count
              when 'hydrated_days' then m.hydrated_days
              when 'saved_meals'   then m.saved_meals
            end;

  if actual < a.threshold then
    raise exception 'Not earned: % is %, needs %', a.metric, actual, a.threshold;
  end if;

  insert into public.user_achievements (user_id, achievement_id)
  values (caller, p_id)
  on conflict (user_id, achievement_id) do nothing;
end;
$function$;

-- ── 4. Close the direct REST path ────────────────────────────────────────────
-- Without this the functions are a convenience wrapper, not a chokepoint.
-- SELECT stays so the client can still read its own badges.

revoke insert, update, delete, truncate, references, trigger
  on public.user_achievements from anon, authenticated;

drop policy if exists "own achievements insert" on public.user_achievements;

-- Recreated rather than altered so it picks up the (select auth.uid()) form and
-- TO authenticated in the same pass; both policies were TO PUBLIC.
drop policy if exists "own achievements select" on public.user_achievements;
create policy "own achievements select"
  on public.user_achievements
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- ── 5. Function grants ───────────────────────────────────────────────────────

revoke execute on function public.user_achievement_metrics(uuid) from public, anon, authenticated;
revoke execute on function public.sync_achievements()            from public, anon, authenticated;
revoke execute on function public.award_achievement(text)        from public, anon, authenticated;

grant execute on function public.sync_achievements()     to authenticated;
grant execute on function public.award_achievement(text) to authenticated;
