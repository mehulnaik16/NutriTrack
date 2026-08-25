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
