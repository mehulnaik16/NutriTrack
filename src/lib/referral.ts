/**
 * Refer & Earn — every tunable number and every pure function in one place, so
 * nothing is hardcoded in JSX and the maths is testable without a browser.
 * See src/lib/referral.test.ts for the runnable check.
 *
 * Two tracks:
 *   Free  — a qualified referral (friend signs up AND starts a trial) gives the
 *           referrer +5 trial days. Accrual stops at 60 days, i.e. at the 12th
 *           qualified referral. Referring itself is never capped; further
 *           referrals simply add no more days.
 *   Paid  — a referred friend buying the 12-month plan gives the referrer 60
 *           premium days (uncapped) and the friend ₹150 off.
 */

import { REFERRAL_DISCOUNT_PLAN_ID } from "./plans";

export const DAYS_PER_REFERRAL = 5;
/** Accrual ceiling. Reached at the 12th qualified referral (12 × 5). */
export const MAX_FREE_DAYS = 60;
export const PREMIUM_DAYS_PER_SUBSCRIPTION = 60;
export const REFEREE_DISCOUNT_RUPEES = 150;

/**
 * Stepper nodes on the progress bar. Referring is uncapped, and free days stop
 * accruing at the 12th referral — so 15 and 20 are achievement badges, not
 * reward tiers.
 */
export const MILESTONES = [1, 5, 10, 15, 20] as const;

/** The generic prefix for a name we cannot derive three Latin letters from. */
export const FALLBACK_PREFIX = "DBZ";

/** Statuses a referral row moves through. `subscribed` awaits a payment flow. */
export type ReferralStatus = "pending" | "trial" | "subscribed";

export interface ReferralRow {
  referee_name: string | null;
  status: ReferralStatus;
  qualified_at: string | null;
  subscribed_at: string | null;
}

/**
 * First three letters of a name, uppercased and padded — "Rahul Sharma" → "RAH",
 * "Jo" → "JOX", "" → "DBZ".
 *
 * This mirrors public.set_referral_code() in the referrals migration, which is
 * the authority on assignment; this copy only lets the UI preview and validate.
 * Keep the two in step — the test pins both to the same cases.
 *
 * Known ceiling: only A–Z is read, so a name written entirely in a non-Latin
 * script strips to nothing and lands on FALLBACK_PREFIX, which reads as generic
 * rather than personal. Transliteration is the upgrade path if that turns out
 * to be common.
 */
export function codePrefix(fullName: string | null | undefined): string {
  const letters = (fullName ?? "").replace(/[^A-Za-z]/g, "").toUpperCase();
  const prefix = letters.slice(0, 3).padEnd(3, "X");
  return prefix === "XXX" ? FALLBACK_PREFIX : prefix;
}

/** Three letters then five digits, e.g. RAH38291. */
export const CODE_PATTERN = /^[A-Z]{3}\d{5}$/;

export function isValidCode(code: string | null | undefined): boolean {
  return !!code && CODE_PATTERN.test(code);
}

/** Trial days earned from qualified referrals, capped at MAX_FREE_DAYS. */
export function freeDaysEarned(qualifiedCount: number): number {
  return Math.min(
    Math.max(qualifiedCount, 0) * DAYS_PER_REFERRAL,
    MAX_FREE_DAYS,
  );
}

/** Premium days earned from friends who subscribed. No cap. */
export function premiumDaysEarned(subscribedCount: number): number {
  return Math.max(subscribedCount, 0) * PREMIUM_DAYS_PER_SUBSCRIPTION;
}

/** The share link a friend opens — the quiz reads `ref` and applies the gift. */
export function referralUrl(code: string, origin?: string): string {
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/quiz?ref=${code}`;
}

/**
 * The default text in the Gift Composer. Warm and personal — an invitation, not
 * a promotion. The user can edit it before sending.
 */
export function giftMessage(opts: {
  senderName?: string | null;
  code: string;
  url: string;
}): string {
  const from = opts.senderName?.trim().split(/\s+/)[0];
  return [
    "Hey! 👋",
    "",
    `I've been loving Dombelz and thought of you. I'm sending you a personal gift — use my code when you sign up and you'll get ₹${REFEREE_DISCOUNT_RUPEES} off the Yearly plan, plus a free trial to explore everything. 🎁`,
    "",
    `Your gift code: ${opts.code}`,
    `Join me: ${opts.url}`,
    from ? `\n— ${from}` : "",
  ]
    .join("\n")
    .trimEnd();
}

/** Re-exported so the referral UI never hardcodes which plan the gift applies to. */
export { REFERRAL_DISCOUNT_PLAN_ID };
