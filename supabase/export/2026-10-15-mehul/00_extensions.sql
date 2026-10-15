-- Part 0: extensions. A new Supabase project already has pgcrypto, uuid-ossp,
-- pg_stat_statements, supabase_vault and plpgsql. pg_trgm is the one this
-- schema adds (trigram indexes on ai_verified / ai_unverified and
-- ai_verified_similar()).

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
