-- Migration D — take TEMPORARY on the database away from PUBLIC.
--
-- Database-scoped rather than table-scoped, which is why it is its own file.
--
-- All 33 SECURITY DEFINER functions in public set search_path=public but none
-- lists pg_temp. When pg_temp is absent from the path, Postgres searches the
-- temporary schema implicitly FIRST for relations and types — functions and
-- operators are excluded from temp resolution by design — so any unqualified
-- table reference inside those functions resolves against a caller's temp
-- objects before public.
--
-- Not reachable through PostgREST today: landing it needs DDL and the function
-- call in the same session, and PostgREST offers neither. This is defence in
-- depth, and one statement closes it for all 33 plus every future function,
-- which beats editing 33 definitions.
--
-- TEMPORARY and CONNECT are granted to PUBLIC by default, never to anon or
-- authenticated by name — datacl reads `=Tc/postgres` — so revoking from those
-- roles individually would be a no-op. It has to name PUBLIC.
--
-- A revoke from PUBLIC also takes the privilege from every role that lacks it
-- explicitly. Only postgres and dashboard_user hold T directly; service_role
-- and authenticator inherit it, so they are granted it back by name. CONNECT is
-- untouched.

revoke temporary on database postgres from public;
grant  temporary on database postgres to service_role, authenticator;

-- Append `, pg_temp` (LAST in the path — first would recreate the very problem)
-- to SECURITY DEFINER definitions as they are touched for other reasons. The
-- functions added in migration B already have it.
