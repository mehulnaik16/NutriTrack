/**
 * The single definition of Dombelz subscription plans.
 *
 * Previously duplicated as a `plans` array in both /routes/plans.tsx and
 * /routes/profile.tsx, with tiers (Starter/Pro/Elite) that no longer match the
 * product. Pricing is duration-based now: the same app at every tier, priced by
 * commitment length.
 */

export interface Plan {
  id: string;
  name: string;
  /** Billing period length. Drives the "/month", "/3 months", "/year" label. */
  months: number;
  /** Total charged up front, in rupees, for the whole period. */
  price: number;
  popular?: boolean;
}

export const PLANS: readonly Plan[] = [
  { id: "monthly", name: "Monthly", months: 1, price: 249 },
  { id: "quarterly", name: "Quarterly", months: 3, price: 499 },
  { id: "yearly", name: "Yearly", months: 12, price: 999, popular: true },
];

/** The referral gift (₹150 off) is valid on this plan only — never the others. */
export const REFERRAL_DISCOUNT_PLAN_ID = "yearly";

/**
 * The referral gift, in rupees. Defined here rather than in referral.ts because
 * pricing must not import the referral module — referral.ts already imports this
 * one, and it re-exports this constant so no call site had to change.
 *
 * Pinned against YEARLY_DISCOUNTED.rupees in src/server/razorpay.ts by
 * src/lib/plans.test.ts: what the card shows and what Razorpay charges are the
 * same number or the test fails.
 */
export const REFEREE_DISCOUNT_RUPEES = 150;

/**
 * Is the gift still available to a user, for this plan?
 *
 * `referralStatus` is the user's own row in `referrals` — null when they were
 * never referred. The gift is spent by their first Yearly purchase, which is
 * when handle_razorpay_event() flips that row to 'subscribed'.
 *
 * Shared deliberately: serverCreateSubscription() decides what to charge with
 * this, and the pricing cards decide what to show with it. A money rule written
 * twice is a money rule that will disagree with itself.
 */
export function giftApplies(
  referralStatus: string | null | undefined,
  planId: string,
): boolean {
  return (
    planId === REFERRAL_DISCOUNT_PLAN_ID &&
    !!referralStatus &&
    referralStatus !== "subscribed"
  );
}

/**
 * What the user actually pays. A no-op for every plan but the yearly one, so
 * callers can apply it unconditionally and the gift can never leak to a tier
 * that does not carry it.
 */
export function effectivePrice(plan: Plan, gift: boolean): number {
  return gift && plan.id === REFERRAL_DISCOUNT_PLAN_ID
    ? plan.price - REFEREE_DISCOUNT_RUPEES
    : plan.price;
}

/** Where a user's ₹150 came from. The amount is the same either way; only the
 *  wording differs, because being sent by a friend is not the same thing as
 *  walking into a gym. */
export type GiftKind = "friend" | "gym";

/** The caller's own row in `gym_links`, as the RLS-scoped select returns it. */
export interface GymLinkGift {
  /** 'signup' or 'profile'. Only a code entered during signup earns anything —
   *  link_gym() decides this in SQL and nothing here can override it. */
  source: string;
  gift_spent_at: string | null;
}

/**
 * Which gift this user still holds on this plan, if any.
 *
 * At most one, and not by luck: the signup step accepts exactly one code, so an
 * account is attributed to a friend or to a gym, never both. A friend code
 * claimed at signup also makes `link_gym()` refuse to attribute any gym added
 * later, which is what stops a gym being paid for a customer it did not bring.
 *
 * Shared by the pricing cards and by serverCreateSubscription(), for the same
 * reason giftApplies() is: a money rule written twice is a money rule that will
 * disagree with itself.
 */
export function activeGift(opts: {
  referralStatus?: string | null;
  gymLink?: GymLinkGift | null;
  planId: string;
}): GiftKind | null {
  // Yearly-only, checked first so neither branch below can leak the gift onto
  // the 1-month or 3-month plans.
  if (opts.planId !== REFERRAL_DISCOUNT_PLAN_ID) return null;
  if (giftApplies(opts.referralStatus, opts.planId)) return "friend";
  const link = opts.gymLink;
  if (link && link.source === "signup" && !link.gift_spent_at) return "gym";
  return null;
}

/**
 * The one place either gift's copy is written.
 *
 * Previously this string was duplicated verbatim in PricingPlans.tsx and
 * profile.tsx, which is how the second wording would have drifted from the
 * first the moment a gym gift existed.
 */
export function giftLabel(kind: GiftKind): string {
  return kind === "gym"
    ? `Gym offer applied · ₹${REFEREE_DISCOUNT_RUPEES} off`
    : `Gift applied · ₹${REFEREE_DISCOUNT_RUPEES} off`;
}

/**
 * Every plan unlocks the whole app — they differ only in billing period, so the
 * feature list is shared rather than tiered.
 *
 * What differs is paid versus lapsed, not plan versus plan. Once access_until
 * is in the past the dashboard and the food page (history included) are locked,
 * progress photos and the workout Analytics tabs are locked, and every AI call
 * is refused server-side; logging a weight and logging a workout stay open.
 * src/components/PremiumGate.tsx and src/lib/access-middleware.ts are where
 * that line is actually drawn — keep this paragraph in step with them.
 */
export const PLAN_FEATURES: readonly string[] = [
  "Unlimited food logging with AI photo scan",
  "Full macro tracking (protein, carbs, fats, fiber)",
  "Workout plans, logging and progress graphs",
  "Streaks, achievements and the leaderboard",
  "Export your data any time",
];

export function findPlan(id: string | null | undefined): Plan | undefined {
  return id ? PLANS.find((p) => p.id === id) : undefined;
}

/** "/month" · "/3 months" · "/year" — the suffix shown next to the price. */
export function periodLabel(months: number): string {
  if (months === 1) return "/month";
  if (months === 12) return "/year";
  return `/${months} months`;
}

/**
 * Effective monthly rate, rounded, for the "works out to ₹83/mo" sub-line.
 *
 * `price` overrides the list price so a discounted card recomputes rather than
 * showing the full-price monthly figure beside a reduced total.
 */
export function monthlyRate(plan: Plan, price: number = plan.price): number {
  return Math.round(price / plan.months);
}

/** What the button on a plan card offers. See planCta(). */
export type PlanCta = "trial" | "current" | "buy" | "native";

/**
 * Which call to action a plan card shows.
 *
 * A trial is offered once per account, ever (start_trial() writes
 * trial_start_date write-once), so the moment a trial exists — running or
 * lapsed — every card must offer the paid plan instead. That includes the plan
 * the user is already on: after the trial ends, buying that same plan is
 * exactly what they came to do, so it is not disabled as "current".
 *
 * The native shell has no third-party checkout, so there it points at the
 * website rather than opening Razorpay.
 */
export function planCta(opts: {
  planId: string;
  trialUsed: boolean;
  selectedPlan?: string | null;
  native?: boolean;
}): PlanCta {
  if (!opts.trialUsed) {
    return opts.selectedPlan === opts.planId ? "current" : "trial";
  }
  return opts.native ? "native" : "buy";
}

/**
 * Whether to show the "try any plan free for N days" banner.
 *
 * Same input as planCta, and deliberately the same condition: a page offering
 * "Buy · ₹249" must not also promise a free trial the account can no longer
 * get.
 */
export function showsTrialBanner(trialUsed: boolean): boolean {
  return !trialUsed;
}
