-- AI food cache: three staging tiers between the bundled catalog and a paid
-- AI call. Server-only by construction -- see the revoke/grant block at the
-- end. The bundled catalog is not represented here and is never written to.

create extension if not exists pg_trgm with schema extensions;

-- Every individual AI answer, one row each, grouped by the canonical key the
-- model itself returned. Three agreeing rows become one ai_verified row.
create table public.ai_unverified (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null,
  search_key text not null,
  food_name text not null,
  food_class text not null,
  basis text not null check (basis in ('100g', 'piece')),
  piece_g numeric,
  enerc numeric not null,
  protcnt numeric not null,
  fatce numeric not null,
  choavldf numeric not null,
  fibtg numeric not null,
  aliases text[] not null default '{}',
  engine text not null,
  model text not null,
  created_at timestamptz not null default now()
);

create index ai_unverified_group_idx on public.ai_unverified (canonical_key);
create index ai_unverified_search_idx
  on public.ai_unverified using gin (search_key extensions.gin_trgm_ops);

-- The trusted tier. Read only when the bundled catalog has no answer and a
-- search reaches the server — never on a catalog hit.
create table public.ai_verified (
  canonical_key text primary key,
  search_key text not null,
  food_name text not null,
  food_class text not null,
  basis text not null check (basis in ('100g', 'piece')),
  piece_g numeric,
  enerc numeric not null,
  protcnt numeric not null,
  fatce numeric not null,
  choavldf numeric not null,
  fibtg numeric not null,
  aliases text[] not null default '{}',
  models text[] not null default '{}',
  verified_at timestamptz not null default now()
);

create index ai_verified_search_idx
  on public.ai_verified using gin (search_key extensions.gin_trgm_ops);
create index ai_verified_alias_idx on public.ai_verified using gin (aliases);

-- One user's correction of a verified food. A personal override, never a
-- deletion: the shared ai_verified row keeps serving everybody else.
create table public.ai_flagged (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  canonical_key text not null,
  enerc numeric not null,
  protcnt numeric not null,
  fatce numeric not null,
  choavldf numeric not null,
  fibtg numeric not null,
  edited_at timestamptz not null default now(),
  unique (user_id, canonical_key)
);

create index ai_flagged_key_idx on public.ai_flagged (canonical_key);

-- RLS on with no policies: with the grants below, nothing outside
-- service_role can reach these tables at all.
alter table public.ai_unverified enable row level security;
alter table public.ai_verified enable row level security;
alter table public.ai_flagged enable row level security;

revoke all on public.ai_unverified from anon, authenticated, public;
revoke all on public.ai_verified from anon, authenticated, public;
revoke all on public.ai_flagged from anon, authenticated, public;

grant select, insert, update, delete on public.ai_unverified to service_role;
grant select, insert, update, delete on public.ai_verified to service_role;
grant select, insert, update, delete on public.ai_flagged to service_role;
