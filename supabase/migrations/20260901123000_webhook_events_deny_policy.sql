-- Follow-up to 20260901120000_billing_lockdown.sql.
--
-- webhook_events is service-role only: RLS is on, every table privilege is
-- revoked from anon and authenticated, and there was no policy at all. That
-- already denies everything, but the advisors flag "RLS enabled, no policy"
-- because the shape is usually an accident rather than a decision.
--
-- Stating the denial explicitly clears the finding without changing behaviour,
-- and leaves the intent readable in \d instead of implied by absence.

create policy "No client access to webhook events"
  on public.webhook_events for select
  to authenticated, anon
  using (false);
