-- Make ai_verified_similar use ai_verified_search_idx.
--
-- The first version filtered on `similarity(v.search_key, q) >= min_sim`. That
-- is a function call, not an indexable operator, so the GIN trigram index was
-- never consulted: every cache miss sequentially scanned ai_verified and
-- computed a trigram similarity per row, on the user-facing search path.
--
-- `%` is the operator gin_trgm_ops actually indexes, but it compares against
-- the pg_trgm.similarity_threshold GUC (default 0.3), not against min_sim. So
-- both appear here and they do different jobs:
--
--   * `v.search_key % q` is the index-scan predicate, and
--   * `similarity(v.search_key, q) >= min_sim` re-checks every row it returns.
--
-- set_config binds the GUC to min_sim for the duration of the transaction
-- (is_local => true), so the index prefilter and the recheck gate on the same
-- number instead of the index silently widening the net to 0.3. Transaction
-- local rather than set_limit(), which would leave the threshold changed on a
-- pooled connection for whatever query ran next.
--
-- plpgsql rather than sql because the GUC has to be set before the query runs,
-- and a sql body gives no ordering guarantee between the two. Still SECURITY
-- INVOKER, so it holds no privilege of its own: only service_role can read the
-- table it queries.
create or replace function public.ai_verified_similar(q text, min_sim real)
returns table (
  canonical_key text,
  search_key text,
  food_name text,
  food_class text,
  basis text,
  piece_g numeric,
  enerc numeric,
  protcnt numeric,
  fatce numeric,
  choavldf numeric,
  fibtg numeric,
  sim real
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
begin
  perform set_config('pg_trgm.similarity_threshold', min_sim::text, true);

  -- Every column is qualified and the ordering repeats the expression rather
  -- than naming `sim`: RETURNS TABLE makes each output column a plpgsql
  -- variable, so an unqualified reference would resolve to the variable.
  return query
    select v.canonical_key, v.search_key, v.food_name, v.food_class, v.basis,
           v.piece_g, v.enerc, v.protcnt, v.fatce, v.choavldf, v.fibtg,
           similarity(v.search_key, q) as sim
    from public.ai_verified v
    where v.search_key % q
      and similarity(v.search_key, q) >= min_sim
    order by similarity(v.search_key, q) desc
    limit 1;
end;
$$;

revoke all on function public.ai_verified_similar(text, real) from public, anon, authenticated;
grant execute on function public.ai_verified_similar(text, real) to service_role;
