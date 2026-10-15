# Export of the old Supabase project (2026-10-15)

This is the full database schema of **"mehulnaik16's Project"** (ref
`xadkrjfvsjdfhjcmxwbh`, region ap-south-1, Postgres 17), read straight from
the live database on 2026-10-15. Use it to rebuild the same database in the
official Dombelz Supabase project.

The export was taken from the live catalogs, not rebuilt from
`supabase/migrations/`. The repo has 90 migration files, but only 81
migrations are recorded as applied on the server, so the live database is
the more reliable source.

## Checked against the live database

| What | Count | Check |
|---|---|---|
| Tables (`public`) | 36 | md5 of the DDL matches the server |
| Functions | 66 | md5 of every `pg_get_functiondef` matches, one by one (`_parts/check_functions.py`) |
| Constraints and indexes | 152 + 36 | md5 matches (after the two intentional edits below) |
| RLS policies (`public` + `storage`) | 37 + 4 | md5 matches |
| Triggers | 22 | copied from `pg_get_triggerdef` |
| Grants | table, column and function | rebuilt by `_parts/make_grants.py` |
| Storage buckets | 1 (`weight-photos`, private, 8 MB, jpeg/png/webp) | |
| Edge functions | 0 | |
| Cron jobs / pg_net | none installed | |
| Realtime publications | none with tables | |
| Vault secrets | none | |
| Custom types / enums / views | none | |

Intentional edits, made so the file runs on its own:
- Foreign keys to `custom_reminders`, `subscription_charges`, `subscriptions`
  and `achievements` are schema-qualified with `public.`.
- `gin_trgm_ops` is written as `extensions.gin_trgm_ops`.

## How to restore into the new project

1. Create the project in the Dombelz account. Choose region **ap-south-1
   (Mumbai)** to match the old one.
2. Open the SQL editor, paste **`ALL_IN_ONE.sql`** and run it. It is wrapped
   in one transaction, so it either applies completely or not at all.
   Alternatively, run the parts in this order: `00` → `01` → `02` → `03` →
   `04` → `07` → `05` → `06` → `08`.
3. Then run these checks in the new project:
   ```sql
   select count(*) from pg_tables where schemaname = 'public';           -- 36
   select count(*) from pg_policies where schemaname in ('public','storage'); -- 41
   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public';                                          -- 66
   select count(*) from public.achievements;                             -- 24
   ```
4. Run the Security Advisor (Dashboard → Advisors) and compare its output
   with the old project's.

## Not included: things you set up by hand

These live outside the database's SQL, so copy them from the old dashboard:

- **Auth → Providers:** Email, plus Google. The old project has 11 Google
  identities and 23 email identities. Re-enter the Google OAuth client ID and
  secret, and add the new project's callback URL to the Google Cloud OAuth
  client.
- **Auth → URL configuration:** Site URL and redirect URLs (web domain, the
  Android deep-link scheme, localhost).
- **Auth → Email templates and SMTP** if you customised them. Also the rate
  limits, email confirmation, and password rules.
- **Data API settings:** exposed schemas (`public`), max rows.
- **App environment variables (local `.env` and Vercel):** `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **`supabase/config.toml`:** set `project_id` to the new ref.
- **Razorpay webhook URL**, if it points at anything project-specific. The
  webhook is handled by the app on Vercel, so usually nothing changes.

## Not included: data

This export is schema only, apart from the achievements catalog
(`08_seed_achievements.sql`), which the app needs in order to work. On
2026-10-15 the old project held about 31 auth users, 29 profiles, 399 food
logs, 102 workout logs, 21 weigh-ins, 3 storage objects (weight photos), and
small numbers of everything else.

Moving users is a separate step. `auth.users` holds password hashes and has
to be copied with `pg_dump` / `supabase db dump --data-only` using the
database password, before any public table, because every user table has a
foreign key to `auth.users`. It cannot be copied through the dashboard
connector.

## Things worth knowing (copied as-is, not changed)

- Tables `health_logs`, `manual_grants`, `ops_audit_log` and
  `ops_pending_actions` grant **all** privileges, including TRUNCATE, to
  `anon` and `authenticated`. RLS blocks row access through the API, but
  TRUNCATE ignores RLS. `ai_plan_generations`, `data_exports`,
  `photo_downloads` and `power_log_uses` also grant TRUNCATE to both roles.
  These are faithful copies; consider revoking them after the move.
- `get_leaderboard_stats()` is `SECURITY DEFINER` with no fixed
  `search_path` and is executable by `anon`.
- `user_profiles` uses column-level INSERT/UPDATE grants for
  `authenticated`. They are in `06_grants.sql`, and any new profile column
  needs its own grant.

## Files

- `00_extensions.sql`: pg_trgm (the others ship with every project)
- `01_tables.sql`: 36 tables
- `02_functions.sql`: 66 functions
- `03_constraints_indexes.sql`: primary keys, unique, check, foreign keys, indexes
- `04_triggers.sql`: 22 triggers
- `05_rls_policies.sql`: RLS on, 41 policies
- `06_grants.sql`: exact table, column and function grants
- `07_storage.sql`: `weight-photos` bucket
- `08_seed_achievements.sql`: achievements catalog
- `ALL_IN_ONE.sql`: all of the above in one transaction
- `_parts/`: the generator and checker scripts, and the function chunks
