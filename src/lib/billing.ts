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
    const { userId } = context;
    checkRateLimit(userId);

    const { supabaseAdmin } = await import("@/integrations/client.server");
    const { createSubscription, keyId, planFor } = await import(
      "@/server/razorpay"
    );

    // The gift is spent once. A referral row that already reached 'subscribed'
    // means this user has bought before, so the discount is gone.
    let discounted = false;
    if (data.tier === "yearly") {
      const { data: ref } = await supabaseAdmin
        .from("referrals")
        .select("status")
        .eq("referee_id", userId)
        .maybeSingle();
      discounted = !!ref && ref.status !== "subscribed";
    }

    const { subscriptionId } = await createSubscription({
      tier: data.tier,
      discounted,
      userId,
    });

    // Recorded through the same SECURITY DEFINER function the client would use,
    // so the row is created under one set of rules whichever path reaches it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts leaves Functions empty
    const { error } = await (supabaseAdmin.rpc as any)(
      "register_subscription",
      {
        p_provider_subscription_id: subscriptionId,
        p_tier: data.tier,
      },
    );
    if (error) throw new Error(error.message);

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
 * Confirm the signature Checkout hands back after a subscription payment.
 *
 * This grants nothing — entitlement moves only when the webhook records a
 * charge. It exists so the browser can tell "Razorpay says you paid" from a
 * forged success callback before it shows a success screen and starts polling.
 *
 * The subscription id is taken from our own row for this user, never from the
 * Checkout response: a client-supplied id on both sides of the HMAC would
 * verify nothing. `razorpay_subscription_id` in the callback is ignored.
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
    if (!sub) return { verified: false as const };

    const { verifyCheckoutSignature } = await import("@/server/razorpay");
    return {
      verified: verifyCheckoutSignature({
        paymentId: data.paymentId,
        subscriptionId: sub.provider_subscription_id,
        signature: data.signature,
      }),
    };
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
 * The success handler does not grant anything. It verifies the returned
 * signature for authenticity and refetches the summary; entitlement moves only
 * when the webhook records a charge.
 */
export async function subscribe(tier: Tier): Promise<void> {
  const { keyId, subscriptionId, name, description } =
    await serverCreateSubscription({ data: { tier } });

  const Razorpay = await loadCheckout();

  await new Promise<void>((resolve, reject) => {
    const rzp = new Razorpay({
      key: keyId,
      subscription_id: subscriptionId,
      name,
      description,
      handler: (r: {
        razorpay_payment_id?: string;
        razorpay_signature?: string;
      }) => {
        // Fire-and-forget: a bad signature is logged but does not block the
        // user, because the webhook is the real authority and will either
        // confirm the charge or never arrive.
        if (r?.razorpay_payment_id && r?.razorpay_signature) {
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
            })
            .catch(() => {});
        }
        resolve();
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
