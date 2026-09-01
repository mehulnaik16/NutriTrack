/**
 * Server-only Razorpay client — subscriptions, signature verification, and the
 * plan catalogue.
 *
 * This file lives under src/server/ and is blocked from client bundles by the
 * TanStack Start importProtection in vite.config.ts. Nothing here may ever be
 * imported from a component; src/lib/billing.ts dynamic-imports it inside
 * server function handlers, the same shape src/lib/ai.ts uses for groq.
 *
 * No SDK. The two endpoints this app needs are one authenticated POST each, so
 * a dependency would be more surface area than code.
 *
 * TEST MODE. The keys this reads are Razorpay test keys — transactions are
 * simulated and nothing is captured or settled. Swapping to live keys is a
 * deliberate separate step; shipping test keys to production would show real
 * customers a success screen for a payment that never happened.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const RAZORPAY_API = "https://api.razorpay.com/v1";

// ── Plan catalogue — server-owned ────────────────────────────────────────────
//
// The client sends a tier name and nothing else: never an amount, never a plan
// id. Both are looked up here, so a tampered request can only ever ask for one
// of three known plans at their real prices.
//
// The discounted yearly plan is a *separate Razorpay plan id* rather than an
// offer applied at checkout. That keeps the discount decision entirely on the
// server — there is no flag a client could set, and no offer id to forge.

export type Tier = "monthly" | "quarterly" | "yearly";

export const TIERS: readonly Tier[] = ["monthly", "quarterly", "yearly"];

export function isTier(v: unknown): v is Tier {
  return typeof v === "string" && (TIERS as readonly string[]).includes(v);
}

interface PlanEntry {
  /** Razorpay plan id, from the dashboard. */
  planId: string | undefined;
  /** Billing cycles to charge before the subscription completes. */
  totalCount: number;
  /** Days of access one charge grants. Clamped again in SQL (1–400). */
  periodDays: number;
  /** Rupees, for display and for reconciling against the webhook amount. */
  rupees: number;
}

/**
 * Mirrors PLANS in src/lib/plans.ts on price and period. That file is the
 * authority for what the user sees; this one is the authority for what is
 * charged, and the two are checked against each other by the self-check.
 */
export const PLAN_CATALOG: Record<Tier, PlanEntry> = {
  monthly: {
    planId: process.env.RAZORPAY_PLAN_MONTHLY,
    totalCount: 120,
    periodDays: 30,
    rupees: 249,
  },
  quarterly: {
    planId: process.env.RAZORPAY_PLAN_QUARTERLY,
    totalCount: 40,
    periodDays: 91,
    rupees: 499,
  },
  yearly: {
    planId: process.env.RAZORPAY_PLAN_YEARLY,
    totalCount: 10,
    periodDays: 365,
    rupees: 999,
  },
};

/** The referral gift: a separate plan id at ₹150 off, yearly only. */
export const YEARLY_DISCOUNTED: PlanEntry = {
  planId: process.env.RAZORPAY_PLAN_YEARLY_DISCOUNTED,
  totalCount: 10,
  periodDays: 365,
  rupees: 849,
};

/**
 * The plan actually charged. `discounted` is decided by the server after
 * reading the referrals table — it is never a parameter from the browser.
 */
export function planFor(tier: Tier, discounted: boolean): PlanEntry {
  if (tier === "yearly" && discounted) return YEARLY_DISCOUNTED;
  return PLAN_CATALOG[tier];
}

// ── Credentials ──────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    // Thrown, not logged and swallowed: a missing secret must fail the request
    // loudly rather than silently degrade into an unverified payment path.
    throw new Error(`[razorpay] ${name} is not set`);
  }
  return v.trim();
}

/** Publishable. The browser needs this one to open Checkout. */
export function keyId(): string {
  return requireEnv("RAZORPAY_KEY_ID");
}

/** Secret. Signs API calls and verifies the Checkout signature. Never leaves here. */
function keySecret(): string {
  return requireEnv("RAZORPAY_KEY_SECRET");
}

/**
 * A different secret from keySecret, set separately in the Razorpay dashboard
 * when the webhook endpoint is registered. Mixing the two silently rejects
 * every webhook, so they are deliberately fetched by different functions.
 */
function webhookSecret(): string {
  return requireEnv("RAZORPAY_WEBHOOK_SECRET");
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${keyId()}:${keySecret()}`).toString("base64")}`;
}

// ── Signature verification ───────────────────────────────────────────────────

/**
 * Constant-time compare of two hex digests.
 *
 * timingSafeEqual throws on a length mismatch rather than returning false, and
 * an uncaught throw here would become a 500 whose timing leaks exactly what the
 * comparison was meant to hide. The length is checked first, and both sides are
 * lowercased because Razorpay's digest casing is not something to depend on.
 */
function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a.trim().toLowerCase(), "utf8");
  const y = Buffer.from(b.trim().toLowerCase(), "utf8");
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/**
 * Verify the signature Checkout hands back after a subscription payment.
 *
 *   hmac_sha256(razorpay_payment_id + "|" + subscription_id, key_secret)
 *
 * Payment id FIRST. This is reversed from the one-time orders flow, which signs
 * `order_id + "|" + payment_id`. Getting the order wrong does not throw — it
 * quietly rejects every real payment, or, worse, would accept nothing and be
 * "fixed" by removing the check.
 *
 * `subscriptionId` must be read from our own subscriptions row for this user.
 * The Checkout response also returns a subscription id, but trusting it would
 * put an attacker-supplied value on both sides of the comparison, which
 * verifies nothing at all.
 */
export function verifyCheckoutSignature(args: {
  paymentId: string;
  /** From our database, keyed by the signed-in user — never from the client. */
  subscriptionId: string;
  signature: string;
}): boolean {
  if (!args.paymentId || !args.subscriptionId || !args.signature) return false;
  const expected = createHmac("sha256", keySecret())
    .update(`${args.paymentId}|${args.subscriptionId}`)
    .digest("hex");
  return safeEqualHex(expected, args.signature);
}

/**
 * Verify a webhook delivery.
 *
 * The HMAC is over the raw request body exactly as received. The caller must
 * read `await request.text()` and hash that string BEFORE any JSON.parse —
 * parsing and re-serialising changes key order and whitespace, so the digest
 * would never match and the endpoint would reject every genuine event.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", webhookSecret())
    .update(rawBody)
    .digest("hex");
  return safeEqualHex(expected, signature);
}

// ── API calls ────────────────────────────────────────────────────────────────

async function razorpayFetch(
  path: string,
  init: { method: string; body?: unknown },
): Promise<Record<string, unknown>> {
  const res = await fetch(`${RAZORPAY_API}${path}`, {
    method: init.method,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    // Fall through to the status check; a non-JSON body from Razorpay is
    // already an error condition.
  }

  if (!res.ok) {
    // Razorpay's error description is safe to surface — it is about the request,
    // not about the customer. The raw body is not logged: on other endpoints it
    // carries the customer's email and contact number.
    const desc =
      (json?.error as { description?: string } | undefined)?.description ??
      `Razorpay request failed (${res.status})`;
    throw new Error(desc);
  }

  return json;
}

/**
 * Create a subscription. Returns the id the browser hands to Checkout.
 *
 * Creating one grants nothing. Entitlement moves only when a charge arrives on
 * the webhook, which is why this can be called freely without any risk of
 * minting access.
 */
export async function createSubscription(args: {
  tier: Tier;
  discounted: boolean;
  /** Stored on the Razorpay side so a support query can be traced back. */
  userId: string;
}): Promise<{ subscriptionId: string; planId: string; rupees: number }> {
  const plan = planFor(args.tier, args.discounted);
  if (!plan.planId) {
    throw new Error(
      `[razorpay] no plan id configured for ${args.tier}${args.discounted ? " (discounted)" : ""}`,
    );
  }

  const json = await razorpayFetch("/subscriptions", {
    method: "POST",
    body: {
      plan_id: plan.planId,
      total_count: plan.totalCount,
      customer_notify: 1,
      notes: { user_id: args.userId, tier: args.tier },
    },
  });

  const id = json.id;
  if (typeof id !== "string") {
    throw new Error("[razorpay] subscription created without an id");
  }
  return { subscriptionId: id, planId: plan.planId, rupees: plan.rupees };
}

/**
 * Cancel a subscription at the end of the paid period.
 *
 * `cancel_at_cycle_end: 1` deliberately: the user paid for the period, so they
 * keep it. The fold honours that anyway — access_until already covers the
 * charged days — but cancelling immediately would also stop Razorpay from
 * sending the events that keep our rows in step.
 */
export async function cancelSubscription(
  subscriptionId: string,
): Promise<{ status: string }> {
  const json = await razorpayFetch(`/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    body: { cancel_at_cycle_end: 1 },
  });
  return { status: typeof json.status === "string" ? json.status : "cancelled" };
}
