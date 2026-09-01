/**
 * Free-trial length, in one place.
 *
 * This used to be a bare `2 * 24 * 60 * 60 * 1000` inline in profile.tsx's
 * billing page. Referral rewards extend the trial, so the length is no longer a
 * constant and both the billing page and the Refer & Earn page need the same
 * answer.
 *
 * Gating reads user_profiles.access_until, not these functions. This module is
 * for display: the badge, the plans page, the billing panel. The two can only
 * agree if BASE_TRIAL_DAYS matches the base interval inside recompute_access()
 * (20260901120000_billing_lockdown.sql) — the SQL is the authority, and a
 * mismatch shows the user one number while gating on another.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Trial length before any referral bonus. Mirrors recompute_access()'s base. */
export const BASE_TRIAL_DAYS = 7;

/** Total trial length for a user holding `bonusDays` earned from referrals. */
export function trialLengthDays(bonusDays = 0): number {
  return BASE_TRIAL_DAYS + Math.max(bonusDays, 0);
}

/** Date the trial ends, or null when the user never started one. */
export function trialEndDate(
  trialStartDate: string | null | undefined,
  bonusDays = 0,
): Date | null {
  if (!trialStartDate) return null;
  const start = new Date(trialStartDate + "T00:00:00");
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + trialLengthDays(bonusDays) * MS_PER_DAY);
}

/**
 * Whole days remaining, never negative. `null` means "no trial started" — which
 * is distinct from 0, meaning "started and now expired".
 */
export function trialDaysLeft(
  trialStartDate: string | null | undefined,
  bonusDays = 0,
  now: Date = new Date(),
): number | null {
  const end = trialEndDate(trialStartDate, bonusDays);
  if (!end) return null;
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / MS_PER_DAY));
}

export function isTrialActive(
  trialStartDate: string | null | undefined,
  bonusDays = 0,
  now: Date = new Date(),
): boolean {
  const left = trialDaysLeft(trialStartDate, bonusDays, now);
  return left !== null && left > 0;
}
