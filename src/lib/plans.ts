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

/** Effective monthly rate, rounded, for the "works out to ₹83/mo" sub-line. */
export function monthlyRate(plan: Plan): number {
  return Math.round(plan.price / plan.months);
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
