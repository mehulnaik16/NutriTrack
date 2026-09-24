-- The key staged answers are GROUPED on, which canonical_key could not be.
--
-- Quorum needs three answers about one food. It grouped them on exact
-- canonical_key equality, and the model does not return a stable key: one photo
-- session produced "protein blueberry shake" and "blueberry protein shake" for
-- the same drink, agreeing on macros to within 1%, filed as two foods that
-- could never be compared. After two days live, ai_verified was still empty.
--
-- group_key is searchKey with its words sorted (see groupKey in
-- src/server/foodCacheKeys.ts), and an answer joins an open group whose key is
-- within GROUP_SIM of its own rather than byte-identical. It is computed in
-- JavaScript, not here: the normalisation transliterates Indic scripts through
-- Sanscript, which Postgres has no equivalent for.
--
-- canonical_key stays on the table. It remains what a promoted row is stored
-- under and what ai_flagged references; only the grouping moved off it.
alter table public.ai_unverified
  add column if not exists group_key text not null default '';

-- Every read in recordAnswer filters on both columns together: the per-user cap
-- count and the group read.
create index if not exists ai_unverified_group_key_idx
  on public.ai_unverified (group_key, food_class);

-- The rows staged before this are keyed the old way and would sit in groups
-- nothing can ever join, so they are cleared rather than backfilled. They cost
-- at most a few AI calls to re-earn, and ai_verified is empty — confirmed
-- before writing this — so no verified food loses its history.
delete from public.ai_unverified;

-- Grants are unchanged: service_role only, RLS on with no policies. A new
-- column inherits the table's privileges, so there is nothing to re-grant.
