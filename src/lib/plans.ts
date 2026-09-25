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
  { id: "monthly", name: "Monthly", months: 1, price: 299 },
  { id: "quarterly", name: "Quarterly", months: 3, price: 599 },
  { id: "yearly", name: "Yearly", months: 12, price: 1199, popular: true },
];

/**
 * Shown beside every price. The prices carry 18% GST inside them (GST_BPS in
 * src/server/razorpay.ts), so what is quoted is exactly what is charged.
 */
export const PRICE_TAX_NOTE = "Inclusive of all taxes";

/** The referral gift (+60 days) comes with this plan only — never the others. */
export const GIFT_PLAN_ID = "yearly";

/**
 * The referral gift, in days of access. It used to be ₹150 off Yearly; a
 * discount cost margin on every referred sale and needed a second Razorpay plan
 * to charge it, so the referred buyer now pays full price and gets these days
 * added on top instead.
 *
 * Defined here rather than in referral.ts because pricing must not import the
 * referral module — referral.ts already imports this one and re-exports it.
 *
 * Mirrors the 60 in public.gift_grants()
 * (20260925160000_gift_is_days.sql), which is the authority: the SQL grants the
 * days, this only lets the cards say how many.
 */
export const REFEREE_GIFT_DAYS = 60;

/**
 * Is the friend gift still unspent, for this plan?
 *
 * `referralStatus` is the user's own row in `referrals` — null when they were
 * never referred. The gift is spent by their first Yearly purchase, which is
 * when handle_razorpay_event() flips that row to 'subscribed'.
 */
export function giftApplies(
  referralStatus: string | null | undefined,
  planId: string,
): boolean {
  return (
    planId === GIFT_PLAN_ID &&
    !!referralStatus &&
    referralStatus !== "subscribed"
  );
}

/** Where a user's gift came from. The days are the same for all four; only
 *  the wording differs, because being sent by a friend is not the same thing as
 *  walking into a gym, and neither is being sent by a doctor. */
export type GiftKind = "friend" | "gym" | "doctor" | "ugc";

/** The caller's own row in `gym_links`, as the RLS-scoped select returns it. */
export interface GymLinkGift {
  /** 'signup' or 'profile'. Only a code entered during signup earns anything —
   *  link_gym() decides this in SQL and nothing here can override it. */
  source: string;
  gift_spent_at: string | null;
  /** 'gym' | 'doctor' | 'ugc'. Absent on rows written before partner types
   *  existed, every one of which was a gym. */
  partner_type?: string | null;
}

/**
 * Which gift this user still holds on this plan, if any.
 *
 * At most one, and not by luck: the signup step accepts exactly one code, so an
 * account is attributed to a friend or to a gym, never both. A friend code
 * claimed at signup also makes `link_gym()` refuse to attribute any gym added
 * later, which is what stops a gym being paid for a customer it did not bring.
 *
 * Decides only what the pricing card says. Nobody's price depends on it any
 * more: the days themselves are granted by public.gift_grants() from the same
 * two facts, so a stale label here can never cost or gift anyone money.
 */
export function activeGift(opts: {
  referralStatus?: string | null;
  gymLink?: GymLinkGift | null;
  planId: string;
}): GiftKind | null {
  // Yearly-only, checked first so neither branch below can leak the gift onto
  // the 1-month or 3-month plans.
  if (opts.planId !== GIFT_PLAN_ID) return null;
  if (giftApplies(opts.referralStatus, opts.planId)) return "friend";
  const link = opts.gymLink;
  if (link && link.source === "signup" && !link.gift_spent_at) {
    // The rule is unchanged and type-blind: a code entered at signup earns the
    // gift, whoever issued it. The partner type only picks the wording.
    const kind = link.partner_type ?? "gym";
    return kind === "doctor" || kind === "ugc" ? kind : "gym";
  }
  return null;
}

/**
 * The one place the gift's copy is written, shared by PricingPlans.tsx and
 * profile.tsx so the two cannot drift.
 */
export function giftLabel(kind: GiftKind): string {
  const days = `+${REFEREE_GIFT_DAYS} days free`;
  if (kind === "gym") return `Gym offer · ${days}`;
  if (kind === "doctor") return `Referral · ${days}`;
  if (kind === "ugc") return `Creator offer · ${days}`;
  return `Friend's gift · ${days}`;
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
 * "Buy · ₹299" must not also promise a free trial the account can no longer
 * get.
 */
export function showsTrialBanner(trialUsed: boolean): boolean {
  return !trialUsed;
}
