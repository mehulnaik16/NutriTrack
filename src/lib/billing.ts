/**
 * Client-side entry points for trials, subscriptions and entitlement.
 *
 * Nothing here decides anything. Every write is a call into a SECURITY DEFINER
 * Postgres function that derives its subject from auth.uid() and takes no user
 * id, because the columns behind them — trial_start_date, selected_plan,
 * bonus_trial_days, bonus_premium_days, access_until — are no longer writable
 * by the client at all. See 20260901120000_billing_lockdown.sql.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/client";
import { requireSupabaseAuth } from "@/integrations/auth-middleware";
import { checkRateLimit } from "@/lib/ai";
import { activeGift } from "@/lib/plans";

/** The three plan durations. Mirrors PLANS in src/lib/plans.ts. */
export type Tier = "monthly" | "quarterly" | "yearly";

const tierSchema = z.object({
  tier: z.enum(["monthly", "quarterly", "yearly"]),
});

/**
 * Client-safe narrowing for a plan id. The server has its own copy in
 * src/server/razorpay.ts, which the browser cannot import — and which is the
 * one that actually decides what gets charged.
 */
export function isTier(id: string): id is Tier {
  return id === "monthly" || id === "quarterly" || id === "yearly";
}

// ── Server functions ────────────────────────────────────────────────────────
//
// Same shape as src/lib/ai.ts and delete-account.ts: createServerFn +
// requireSupabaseAuth + checkRateLimit, with the server-only module dynamically
// imported inside the handler so TanStack Start's import protection keeps the
// Razorpay secret out of the client bundle. They live here rather than in a
// *.server.ts file because that suffix is blocked from the client entirely, and
// a createServerFn export is meant to be imported by components.
//
// Neither of them grants a day of access. Creating a subscription creates a
// row; entitlement moves when the webhook records a charge, and nowhere else.

/**
 * Create a Razorpay subscription and hand the browser what Checkout needs.
 *
 * The input is a tier and nothing else. Amount, plan id, and whether the ₹150
 * referral gift applies are all decided here — the discount is looked up from
 * the referrals table, so it is not a flag a client could set, and the
 * discounted plan is a separate Razorpay plan id rather than an offer applied
 * at checkout.
 *
 * The gift stays yearly-only by construction: planFor() ignores `discounted`
 * for every other tier, so a monthly checkout cannot be talked into it.
 */
export const serverCreateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(tierSchema)
  .handler(async ({ context, data }) => {
    const { userId, supabase: userClient } = context;
    checkRateLimit(userId);

    const { supabaseAdmin } = await import("@/integrations/client.server");
    const {
      createSubscription,
      keyId,
      planFor,
      cancelSubscription,
      fetchSubscription,
    } = await import("@/server/razorpay");

    // Switching plans replaces the old subscription rather than running beside
    // it. Two reasons, and the second is the one that used to eat payments:
    //
    //   * Money. Leaving the monthly live while a yearly starts bills the user
    //     for both, every cycle, until they notice.
    //   * subscriptions_one_live_per_user is a unique index over live rows. A
    //     second live subscription made handle_razorpay_event raise, so the
    //     charge insert that comes after it was never reached — the upgrade was
    //     paid for and granted nothing, permanently.
    //
    // Cancelling costs the user no days. access_until is folded from
    // subscription_charges, which this does not touch, so everything already
    // paid for keeps counting and the new plan queues on after it.
    const { data: live } = await supabaseAdmin
      .from("subscriptions")
      .select("id, provider_subscription_id")
      .eq("user_id", userId)
      .eq("provider", "razorpay")
      .in("status", ["authenticated", "active", "pending", "halted"])
      .maybeSingle();

    if (live) {
      try {
        // Not at cycle end: it has to stop being live before the next one can
        // become live.
        await cancelSubscription(live.provider_subscription_id, false);
      } catch (e) {
        // Razorpay refuses to cancel something already finished, and our row
        // can say "live" for a subscription that ended without us hearing about
        // it. Ask what it really is: if it is already over, there is nothing to
        // stop and the purchase may go ahead.
        let settled = false;
        try {
          const { status } = await fetchSubscription(
            live.provider_subscription_id,
          );
          settled = ["cancelled", "completed", "expired"].includes(status);
        } catch {
          /* couldn't ask — treat as still live and refuse below */
        }
        if (!settled) {
          // Fail the purchase rather than proceed. Charging someone for a
          // second subscription while the first keeps recurring is worse than
          // making them try again.
          const msg = e instanceof Error ? e.message : String(e);
          throw new Error(
            `Could not switch off your current plan, so nothing was charged. Please try again. (${msg})`,
          );
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts omits this service-role-only table
      await (supabaseAdmin.from("subscriptions") as any)
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", live.id);
    }

    // The gift is spent once, whichever code earned it. A referral row that
    // already reached 'subscribed', or a gym link with gift_spent_at set, means
    // this user has bought before and the discount is gone. activeGift() is the
    // same function the pricing cards render with, so what is shown and what is
    // charged cannot drift apart.
    //
    // Read through supabaseAdmin rather than the user client on purpose: these
    // are two RLS-scoped tables and this must not depend on a policy staying
    // permissive. The rows are still selected by this caller's own id.
    let discounted = false;
    if (data.tier === "yearly") {
      const [ref, gym] = await Promise.all([
        supabaseAdmin
          .from("referrals")
          .select("status")
          .eq("referee_id", userId)
          .maybeSingle(),
        supabaseAdmin
          .from("gym_links")
          .select("source, gift_spent_at")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      discounted =
        activeGift({
          referralStatus: (ref.data as any)?.status,
          gymLink: gym.data as any,
          planId: data.tier,
        }) !== null;
    }

    const { subscriptionId } = await createSubscription({
      tier: data.tier,
      discounted,
      userId,
    });

    // Recorded through the same SECURITY DEFINER function the client would use,
    // so the row is created under one set of rules whichever path reaches it.
    //
    // Through the USER-scoped client from requireSupabaseAuth, never
    // supabaseAdmin: register_subscription takes no user id on purpose and
    // derives its subject from auth.uid(). The service-role key carries no user
    // JWT, so auth.uid() is null there and the function raises 'Unauthorized' —
    // which is exactly what every Buy click used to surface as a toast.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts leaves Functions empty
    const { error } = await (userClient.rpc as any)(
      "register_subscription",
      {
        p_provider_subscription_id: subscriptionId,
        p_tier: data.tier,
      },
    );
    // A bare rethrow of error.message is what made this read as a one-word
    // mystery in the UI. Name the step that failed.
    if (error) {
      throw new Error(`Could not record the subscription: ${error.message}`);
    }

    const plan = planFor(data.tier, discounted);
    return {
      keyId: keyId(),
      subscriptionId,
      name: "Dombelz",
      description: `${data.tier} plan — ₹${plan.rupees}`,
    };
  });

/**
 * Cancel the caller's subscription at the end of the paid period.
 *
 * Takes no input at all. The subscription id is derived from the session, which
 * makes cancelling somebody else's unrepresentable rather than merely
 * rejected — there is no parameter to tamper with.
 *
 * Cancelling does not shorten access. The fold already covers the days that
 * were paid for and keeps honouring them.
 */
export const serverCancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    checkRateLimit(userId);

    const { supabaseAdmin } = await import("@/integrations/client.server");

    const { data: sub, error } = await supabaseAdmin
      .from("subscriptions")
      .select("provider_subscription_id, status")
      .eq("user_id", userId)
      .eq("provider", "razorpay")
      .in("status", ["authenticated", "active", "pending", "halted"])
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sub) throw new Error("No active subscription to cancel");

    const { cancelSubscription: cancelAtRazorpay } = await import(
      "@/server/razorpay"
    );
    await cancelAtRazorpay(sub.provider_subscription_id);

    // The status is not written here. Razorpay sends subscription.cancelled and
    // the webhook applies it — one writer for subscription state means our row
    // cannot drift into claiming something Razorpay never confirmed.
    return { success: true };
  });

/**
 * Confirm the payment Checkout hands back, and grant the days it bought.
 *
 * This used to verify the signature and stop there, leaving entitlement
 * entirely to the webhook. That made one missed delivery indistinguishable from
 * a working system: subscriptions piled up at status 'created', not one charge
 * was ever recorded, and every user who paid was shown "your access updates
 * within a minute" and then nothing, forever.
 *
 * So there are now two independent paths to the same result, and neither is
 * required for the other to work:
 *
 *   this one   — fast, runs while the user is still looking at the screen
 *   the webhook — authoritative, and the only path for renewals, refunds and
 *                 cancellations, which no browser is present for
 *
 * They cannot stack. subscription_charges.provider_payment_id is unique, so
 * whichever arrives second inserts nothing and grants nothing. Whichever
 * arrives first wins; the other is free.
 *
 * Two things are checked before anything is granted, and the order matters:
 *
 *   1. The HMAC, over a subscription id read from OUR row for this user — never
 *      from the Checkout response, because a client-supplied id on both sides
 *      of a comparison verifies nothing. `razorpay_subscription_id` in the
 *      callback stays ignored.
 *   2. Razorpay's own record of the payment. A signature proves the browser was
 *      handed a real payment id; only `status: 'captured'` proves the money
 *      actually moved. The amount is read from there too, never from the client.
 */
export const serverConfirmCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ paymentId: z.string().min(1), signature: z.string().min(1) }),
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;

    const { supabaseAdmin } = await import("@/integrations/client.server");
    const { data: sub, error } = await supabaseAdmin
      .from("subscriptions")
      .select("provider_subscription_id")
      .eq("user_id", userId)
      .eq("provider", "razorpay")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sub) return { verified: false, applied: false };

    const { verifyCheckoutSignature, fetchPayment, fetchSubscription } =
      await import("@/server/razorpay");

    const verified = verifyCheckoutSignature({
      paymentId: data.paymentId,
      subscriptionId: sub.provider_subscription_id,
      signature: data.signature,
    });
    if (!verified) return { verified: false, applied: false };

    // Ask Razorpay what this payment is. 'captured' is the only status that
    // means settled money; 'authorized' is a hold that can still fail, and
    // granting on it would hand out days for a payment that never completes.
    const payment = await fetchPayment(data.paymentId);
    if (payment.status !== "captured") {
      return { verified: true, applied: false };
    }
    // And that it belongs to this user's subscription. fetchPayment reads
    // Razorpay's own linkage, so a payment id lifted from elsewhere cannot be
    // spent here even if it were somehow signed.
    if (
      payment.subscriptionId &&
      payment.subscriptionId !== sub.provider_subscription_id
    ) {
      return { verified: true, applied: false };
    }

    const rzpSub = await fetchSubscription(sub.provider_subscription_id);

    // The same function the webhook route calls, with the same arguments it
    // would send. p_period_days stays null so the period is derived in SQL from
    // our own tier rather than from anything that crossed the wire.
    //
    // The event id is ours, not Razorpay's — Razorpay's real event id arrives
    // later on the webhook and is deliberately different, so both are recorded
    // and only the first one to arrive grants anything.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts leaves Functions empty
    const { error: rpcError } = await (supabaseAdmin.rpc as any)(
      "handle_razorpay_event",
      {
        p_event_id: `checkout:${data.paymentId}`,
        p_event_type: "subscription.charged",
        p_subscription_id: sub.provider_subscription_id,
        p_payment_id: data.paymentId,
        p_amount_paise: payment.amount,
        p_status: rzpSub.status || null,
        p_period_days: null,
        p_refunded: false,
      },
    );
    if (rpcError) {
      // Not fatal to the user: the webhook is still coming and will apply the
      // same payment. Surfaced so the caller can keep the cautious copy.
      console.error("[razorpay] checkout fulfil failed:", rpcError.message);
      return { verified: true, applied: false };
    }

    return { verified: true, applied: true };
  });

/** What the profile row actually holds after a trial call. */
export interface TrialState {
  selected_plan: string | null;
  trial_start_date: string | null;
  access_until: string | null;
}

/**
 * Start the free trial, or re-point the selected plan if one already ran.
 *
 * This replaces the direct `update({selected_plan, trial_start_date})` that
 * plans.tsx and profile.tsx both used to do. That path granted a fresh trial
 * every time it was clicked, so a lapsed user could restart forever through
 * normal UI. `start_trial()` writes trial_start_date with a coalesce, making it
 * write-once: one trial per account, ever.
 *
 * Returns the row as it truly is afterwards rather than what was requested — a
 * second call leaves trial_start_date untouched, so the caller must render this
 * instead of optimistically assuming today's date.
 */
export async function startTrial(
  planId: string,
  userId: string,
): Promise<TrialState> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts leaves Functions empty
  const { error } = await (supabase.rpc as any)("start_trial", {
    plan: planId,
  });
  if (error) throw new Error(error.message);

  const { data, error: readErr } = await supabase
    .from("user_profiles")
    .select("selected_plan, trial_start_date, access_until")
    .eq("id", userId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);

  return (data ?? {
    selected_plan: planId,
    trial_start_date: null,
    access_until: null,
  }) as TrialState;
}

// ── Billing summary ─────────────────────────────────────────────────────────

export interface BillingCharge {
  id: string;
  tier: string;
  amount_paise: number;
  period_days: number;
  charged_at: string;
  refunded_at: string | null;
  /** Computed in SQL, so the button's enabled state and the guard can't drift. */
  refundable: boolean;
}

export interface BillingSummary {
  trial_start_date: string | null;
  selected_plan: string | null;
  bonus_trial_days: number;
  bonus_premium_days: number;
  access_until: string | null;
  has_access: boolean;
  subscription: {
    id: string;
    tier: string;
    status: string;
    provider: string;
    created_at: string;
    cancelled_at: string | null;
  } | null;
  charges: BillingCharge[];
  refund_requests: {
    id: string;
    charge_id: string;
    status: string;
    created_at: string;
    resolved_at: string | null;
  }[];
}

/**
 * The one read for everything billing-related.
 *
 * It recomputes before returning, which is what makes the 3-day referral hold
 * need no scheduled job: a grant whose hold quietly elapsed simply shows up on
 * the next read. The recompute is a no-op write when nothing changed.
 *
 * The subscription's provider-side id is deliberately absent from the payload.
 * The client never needs it, and never sends it back — cancellation derives it
 * server-side from the session.
 */
export async function getBillingSummary(): Promise<BillingSummary> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts leaves Functions empty
  const { data, error } = await (supabase.rpc as any)("get_billing_summary");
  if (error) throw new Error(error.message);
  return data as BillingSummary;
}

// ── Subscriptions ───────────────────────────────────────────────────────────

/**
 * Open Razorpay Checkout for a tier.
 *
 * The browser sends a tier name and nothing else — never an amount and never a
 * plan id. Both are looked up server-side, and whether the ₹150 referral gift
 * applies is decided there too by reading the referrals table, so there is no
 * discount flag a client could set.
 *
 * Resolves with whether access was actually granted before the user let go of
 * the screen. `false` is not a failure — it means the webhook has to finish the
 * job, which it will; it only decides which of two true sentences the toast
 * says.
 */
export async function subscribe(tier: Tier): Promise<{ applied: boolean }> {
  const { keyId, subscriptionId, name, description } =
    await serverCreateSubscription({ data: { tier } });

  const Razorpay = await loadCheckout();

  return await new Promise<{ applied: boolean }>((resolve, reject) => {
    const rzp = new Razorpay({
      key: keyId,
      subscription_id: subscriptionId,
      name,
      description,
      handler: (r: {
        razorpay_payment_id?: string;
        razorpay_signature?: string;
      }) => {
        if (!r?.razorpay_payment_id || !r?.razorpay_signature) {
          resolve({ applied: false });
          return;
        }
        // Awaited, not fired and forgotten: this is what grants the days, and
        // resolving before it lands would send the user to a dashboard that is
        // still locked. It is still not allowed to fail the purchase — the
        // money moved, and the webhook applies the same payment either way.
        serverConfirmCheckout({
          data: {
            paymentId: r.razorpay_payment_id,
            signature: r.razorpay_signature,
          },
        })
          .then((res) => {
            if (!res.verified) {
              console.warn("[razorpay] checkout signature did not verify");
            }
            resolve({ applied: res.applied });
          })
          .catch(() => resolve({ applied: false }));
      },
      modal: { ondismiss: () => reject(new Error("Checkout closed")) },
      theme: { color: "#4d7c0f" },
    });
    rzp.on("payment.failed", (r: { error?: { description?: string } }) =>
      reject(new Error(r?.error?.description ?? "Payment failed")),
    );
    rzp.open();
  });
}

/** Cancel at period end. Takes no argument — see serverCancelSubscription. */
export async function cancelSubscription(): Promise<void> {
  await serverCancelSubscription();
}

/** Ask for a refund. Ownership and the 2-day window are re-checked in SQL. */
export async function requestRefund(
  chargeId: string,
  reason: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts leaves Functions empty
  const { error } = await (supabase.rpc as any)("request_refund", {
    p_charge_id: chargeId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

// ── Checkout script ─────────────────────────────────────────────────────────

interface RazorpayInstance {
  open(): void;
  on(event: string, cb: (payload: never) => void): void;
}
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;

/**
 * Razorpay's checkout.js, loaded on demand rather than in index.html.
 *
 * A third-party script on every page load is a third party on every page load.
 * This one is only fetched when somebody actually opens checkout, which also
 * means it never loads at all in the native shell, where it must not appear.
 */
function loadCheckout(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);

  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () =>
      w.Razorpay
        ? resolve(w.Razorpay)
        : reject(new Error("Razorpay checkout failed to load"));
    s.onerror = () => reject(new Error("Razorpay checkout failed to load"));
    document.head.appendChild(s);
  });
}
