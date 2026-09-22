-- Trigram nearest-match over the verified cache. SECURITY INVOKER so it holds
-- no privilege of its own: only service_role can read the table it queries.
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
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select v.canonical_key, v.search_key, v.food_name, v.food_class, v.basis,
         v.piece_g, v.enerc, v.protcnt, v.fatce, v.choavldf, v.fibtg,
         similarity(v.search_key, q) as sim
  from public.ai_verified v
  where similarity(v.search_key, q) >= min_sim
  order by sim desc
  limit 1;
$$;

revoke all on function public.ai_verified_similar(text, real) from public, anon, authenticated;
grant execute on function public.ai_verified_similar(text, real) to service_role;
