/**
 * Free-trial length, in one place.
 *
 * This used to be a bare `2 * 24 * 60 * 60 * 1000` inline in profile.tsx's
 * billing page. Referral rewards extend the trial, so the length is no longer a
 * constant and both the billing page and the Refer & Earn page need the same
 * answer.
 *
 * Note: nothing in the app currently gates features on the trial being active —
 * it only changes a badge's text. Extending the trial makes the displayed
 * number correct; feature-gating is separate work.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Trial length before any referral bonus. */
export const BASE_TRIAL_DAYS = 2;

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
