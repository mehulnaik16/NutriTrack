-- Migration C — leftover default-grant sweep across public.
--
-- Supabase grants ALL on new tables to anon and authenticated. RLS has been
-- doing the blocking, and for REFERENCES and TRIGGER the blocking is really
-- coming from neither role holding CREATE on public — a different layer
-- entirely. A grant that is inert because of some other restriction is not
-- closed; it is closed when the grant itself is gone. That is what this does.
--
-- Covers every table in public, including workout_logs and user_profiles: the
-- two earlier lockdowns took only DELETE and TRUNCATE and left REFERENCES and
-- TRIGGER behind.
--
-- authenticated DELETE is NOT swept. Six tables have a real user-facing delete
-- (food_logs, friendships, saved_meals, workout_plans, weight_entries,
-- workout_logs) and six more carry a FOR ALL policy that covers DELETE. Only
-- the four with neither a delete-capable policy nor any client code are revoked,
-- named explicitly below.

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' order by tablename loop
    execute format('revoke delete, truncate, references, trigger on public.%I from anon', t);
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t);
  end loop;
end $$;

-- No delete-capable RLS policy and no client code deletes from these, so the
-- grant has nothing behind it. Revoking turns a silent zero-row RLS denial into
-- an explicit 42501, and keeps it closed if a policy is later added for an
-- unrelated reason.
revoke delete on public.cheers            from authenticated;
revoke delete on public.gym_links         from authenticated;
revoke delete on public.ops_agent_threads from authenticated;
revoke delete on public.referrals         from authenticated;

-- ops_agent_threads is backend-only: the sole consumer is src/server/ops-agent.ts
-- through supabaseAdmin (service_role). It has RLS on and zero policies, so
-- access was being denied by the absence of a policy rather than by the grants.
-- Make it explicit.
revoke all on public.ops_agent_threads from anon, authenticated;
