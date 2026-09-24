-- Who staged each answer, so quorum counts distinct PEOPLE, not only answers.
--
-- Without it one user searching a food three times fills a group alone and
-- promotes it to shared, permanent ai_verified — including a private meal
-- name the personal-name check misses. The app now requires answers from at
-- least MIN_DISTINCT_USERS people (src/lib/foodCache.ts), enforced at staging
-- by capping each user at QUORUM_SIZE - MIN_DISTINCT_USERS + 1 rows per open
-- (canonical_key, food_class) group, and re-checked at promotion.
--
-- THE THRESHOLD IS SCALE-DEPENDENT. MIN_DISTINCT_USERS is 2 because the user
-- base is small (about 5 real users) and 3 would stall verification. It should
-- rise to 3 once the user base is large enough (1k–10k users) that requiring
-- three different people is no longer a bottleneck. That is a code change
-- only; this column already supports it.
--
-- user_hash is SHA-256 hex of the authenticated user id, unsalted, computed
-- server-side. Its only job is counting distinctness; this table is
-- service_role-only and anyone able to read it can already read auth.users,
-- so a pepper would add a secret and a deploy dependency for no protection.
--
-- Nullable: the table is empty, and the app never stages a row without one.
-- No index: the group read already narrows by ai_unverified_group_idx, and a
-- group holds at most a handful of rows.
alter table public.ai_unverified
  add column if not exists user_hash text;

-- The table's lockdown is unchanged: service_role only, RLS on with no
-- policies. A new column inherits the table's privileges, so there is nothing
-- to re-grant here.
