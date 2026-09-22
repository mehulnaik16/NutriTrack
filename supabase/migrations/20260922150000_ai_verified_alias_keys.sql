-- Normalised alias forms, so cross-script lookup is an exact match.
--
-- `aliases` holds display spellings ("ತಟ್ಟೆ ಇಡ್ಲಿ", "Thatte Idli"). Matching
-- never runs on those: searchKey() romanises and strips, and both of those
-- collapse to "tatte idli". Storing the romanised forms beside the display
-- ones makes a Kannada query an indexed array-containment hit instead of a
-- similarity guess.
--
-- This is what replaces trigram similarity as the cross-script mechanism.
-- Measured pg_trgm scores on this database put true cross-script pairs
-- (idhli/idli 0.375) BELOW genuinely different foods (naan/paneer naan 0.417),
-- so no threshold separates them and similarity cannot do this job at all.
--
-- No backfill: ai_verified is empty, verified before writing this.
alter table public.ai_verified
  add column if not exists alias_keys text[] not null default '{}';

create index if not exists ai_verified_alias_keys_idx
  on public.ai_verified using gin (alias_keys);

-- The table's grants are unchanged: service_role only, RLS on with no
-- policies. A new column inherits the table's privileges, so there is nothing
-- to re-grant here.
