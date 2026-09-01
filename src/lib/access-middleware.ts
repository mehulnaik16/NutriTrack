/**
 * Server-side entitlement gate.
 *
 * The blur in the UI is presentation. This is the boundary: a lapsed user can
 * call a server function directly with a valid JWT, so every metered call is
 * re-checked here against the database rather than against anything the client
 * sent.
 *
 * It reads through get_billing_summary() rather than selecting access_until,
 * because that function recomputes first — which is what makes the 3-day
 * referral hold need no scheduled job. A grant whose hold quietly elapsed is
 * honoured on the very next gated call.
 *
 * Composed after requireSupabaseAuth, so handlers still get `userId`,
 * `supabase` and `claims` exactly as before.
 */
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/auth-middleware";

export const ACCESS_DENIED_MESSAGE =
  "Your Dombelz access has ended. Start a plan to keep using AI features.";

export const requireAccess = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts leaves Functions empty
    const { data, error } = await (context.supabase.rpc as any)(
      "get_billing_summary",
    );

    // Fails closed. A database error is not a reason to hand out a paid call.
    if (error) throw new Error(ACCESS_DENIED_MESSAGE);
    if (!data?.has_access) throw new Error(ACCESS_DENIED_MESSAGE);

    return next({ context: { accessUntil: data.access_until as string } });
  });
