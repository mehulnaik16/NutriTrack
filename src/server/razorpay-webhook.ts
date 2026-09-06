/**
 * Razorpay webhook endpoint.
 *
 * Mounted at POST /api/razorpay-webhook from src/server.ts, the Nitro entry,
 * rather than as a route file — @tanstack/react-start 1.168 has no `server`
 * option on route options and 1.169 dropped createServerFileRoute, and the
 * entry already wraps every request, so this is the seam that exists.
 *
 * This endpoint carries no Supabase JWT and cannot: Razorpay is not a signed-in
 * user. The HMAC *is* the authentication. Everything downstream of the
 * signature check treats the body as trusted; everything upstream treats it as
 * hostile.
 *
 * It is also the ONLY thing in the system that can grant a day of access. The
 * browser's success handler does nothing but refetch the summary.
 */

import { verifyWebhookSignature } from "./razorpay";
import { sendAlert } from "./telegram";

/** Events worth acting on. Anything else is acknowledged and dropped. */
const HANDLED = new Set([
  "subscription.activated",
  "subscription.charged",
  "subscription.pending",
  "subscription.halted",
  "subscription.cancelled",
  "subscription.completed",
  "refund.processed",
]);

/**
 * Razorpay's subscription statuses map onto ours one-for-one, but only these
 * are accepted — an unrecognised value is dropped rather than written, so a
 * malformed or future status can never land in the column the fold reads.
 */
const STATUSES = new Set([
  "created",
  "authenticated",
  "active",
  "pending",
  "halted",
  "cancelled",
  "completed",
  "expired",
]);

function pick(obj: unknown, ...path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;
const int = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;

/**
 * 200 on anything we have finished with — including duplicates and events we do
 * not act on. Razorpay retries non-2xx, so answering 500 to an event we were
 * always going to ignore buys an escalating retry storm for nothing.
 */
const ok = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

export async function handleRazorpayWebhook(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // The raw bytes, read BEFORE any parse. The HMAC is over exactly what
  // Razorpay signed — parsing and re-serialising changes key order and
  // whitespace, and the digest would never match again.
  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(raw, signature)) {
    // Nothing from the body or the headers is logged. An unverified payload is
    // attacker-controlled, and this one carries a customer email and contact
    // number when it is genuine.
    console.warn("[razorpay-webhook] rejected: bad signature");
    return new Response("Invalid signature", { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Malformed payload", { status: 400 });
  }

  const eventType = str(pick(body, "event"));
  if (!eventType) return new Response("Missing event type", { status: 400 });

  // Razorpay's own delivery id. Without it there is no dedupe key, so the
  // request is refused rather than processed under a synthetic one — a made-up
  // key would make every retry look like a new event.
  const eventId = str(request.headers.get("x-razorpay-event-id"));
  if (!eventId) return new Response("Missing event id", { status: 400 });

  if (!HANDLED.has(eventType)) {
    return ok({ result: "ignored", event: eventType });
  }

  const isRefund = eventType === "refund.processed";

  const subscriptionId = str(
    pick(body, "payload", "subscription", "entity", "id") ??
      pick(body, "payload", "payment", "entity", "subscription_id"),
  );
  const paymentId = str(
    isRefund
      ? pick(body, "payload", "refund", "entity", "payment_id")
      : pick(body, "payload", "payment", "entity", "id"),
  );
  const amountPaise = int(pick(body, "payload", "payment", "entity", "amount"));
  const rawStatus = str(
    pick(body, "payload", "subscription", "entity", "status"),
  );
  const status = rawStatus && STATUSES.has(rawStatus) ? rawStatus : null;

  if (!subscriptionId && !paymentId) {
    return ok({ result: "ignored", reason: "no subscription or payment id" });
  }

  const { supabaseAdmin } = await import("@/integrations/client.server");

  // Dedupe, apply and recompute happen inside this one call, so idempotency and
  // the state change cannot half-succeed. period_days is deliberately not sent:
  // the tier on our own subscription row decides it, so a webhook cannot ask for
  // a longer period than the plan it paid for.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts leaves Functions empty
  const { data, error } = await (supabaseAdmin.rpc as any)(
    "handle_razorpay_event",
    {
      p_event_id: eventId,
      p_event_type: eventType,
      p_subscription_id: subscriptionId,
      p_payment_id: paymentId,
      p_amount_paise: amountPaise,
      p_status: status,
      p_period_days: null,
      p_refunded: isRefund,
    },
  );

  if (error) {
    // A 500 here is correct: Razorpay retries, and a transient database error
    // should be retried. The message is logged, the payload is not.
    console.error("[razorpay-webhook] apply failed:", error.message);
    // Money did not land. Throttled on the event type rather than the event id,
    // so Razorpay's retry schedule produces one message and not one per attempt.
    await sendAlert({
      severity: "critical",
      title: "Razorpay webhook failed to apply",
      detail: {
        event: eventType,
        subscription: subscriptionId,
        payment: paymentId,
        error: error.message,
      },
      throttleKey: `webhook-apply-failed:${eventType}`,
    });
    return new Response("Processing failed", { status: 500 });
  }

  // Revenue signals. Throttled per event type, so a burst of renewals on the
  // same day summarises rather than floods.
  if (
    eventType === "subscription.activated" ||
    eventType === "subscription.charged"
  ) {
    await sendAlert({
      severity: "info",
      title:
        eventType === "subscription.activated"
          ? "New subscription activated"
          : "Subscription renewed",
      detail: {
        amount:
          amountPaise === null ? null : `₹${(amountPaise / 100).toFixed(2)}`,
        subscription: subscriptionId,
      },
      throttleKey: `revenue:${eventType}`,
    });
  } else if (isRefund) {
    await sendAlert({
      severity: "warning",
      title: "Refund processed",
      detail: {
        amount:
          amountPaise === null ? null : `₹${(amountPaise / 100).toFixed(2)}`,
        payment: paymentId,
      },
      throttleKey: "revenue:refund",
    });
  } else if (
    eventType === "subscription.halted" ||
    eventType === "subscription.cancelled"
  ) {
    await sendAlert({
      severity: "warning",
      title: `Subscription ${eventType.split(".")[1]}`,
      detail: { subscription: subscriptionId },
      throttleKey: `revenue:${eventType}`,
    });
  }

  return ok({ result: "ok", detail: data });
}
