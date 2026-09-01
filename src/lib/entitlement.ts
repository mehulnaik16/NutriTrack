/**
 * Entitlement — the TypeScript mirror of public.recompute_access().
 *
 * The database is the authority: user_profiles.access_until is written only by
 * that function, and every gate in the app reads that one column. This module
 * exists for the same reason codePrefix() exists next to
 * public.referral_code_prefix() — so the UI can explain and preview the answer,
 * and so the maths is testable without a database.
 *
 * See src/lib/entitlement.test.ts for the runnable check. If the fold below and
 * the SQL ever disagree, the SQL wins and this file is the bug.
 *
 * The shape of the fold:
 *
 *   cursor := trial_start + BASE_TRIAL_DAYS + poolA
 *   for each grant ordered by effectiveAt:
 *       windowStart := max(cursor, grant.effectiveAt)
 *       cursor      := windowStart + grant.days
 *   accessUntil := cursor
 *
 * `max(cursor, effectiveAt)` is the whole queueing rule. Paying while a trial is
 * still running starts the paid period at trial end rather than burning both in
 * parallel; paying after a lapse starts at the charge and honours the full
 * period; a premium bonus earned during a live subscription is appended after it
 * ends. Nothing is consumed twice and nothing is lost.
 */

import { BASE_TRIAL_DAYS } from "./trial";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * One entry in the timeline: a paid period, or a referral premium bonus.
 *
 * `effectiveAt` is when the grant becomes spendable, which is not always when it
 * was earned — a referral bonus sits behind a three-day hold, and a grant whose
 * effectiveAt is still in the future contributes nothing at all. That is what
 * makes the hold need no scheduled job.
 *
 * `clawbackAt` is the instant the grant stopped being valid: a refund, a
 * cancellation, or an open refund request. Days already lived through are kept;
 * only the unused remainder is revoked.
 */
export interface Grant {
  days: number;
  effectiveAt: Date;
  clawbackAt?: Date | null;
}

/** Midnight in Asia/Kolkata, matching the timezone recompute_access() pins. */
function istMidnight(isoDate: string): Date | null {
  const d = new Date(`${isoDate}T00:00:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The absolute instant a user's access ends, or null when they have none —
 * no trial ever started and no grant has taken effect.
 *
 * `bonusTrialDays` is pool A (referral signup days). It extends the trial window
 * rather than queueing behind it, which is why it is added to the base rather
 * than passed as a grant.
 */
export function computeAccessUntil(opts: {
  trialStartDate: string | null | undefined;
  bonusTrialDays?: number;
  grants?: readonly Grant[];
}): Date | null {
  const bonus = Math.max(opts.bonusTrialDays ?? 0, 0);

  let cursor: Date | null = null;
  if (opts.trialStartDate) {
    const start = istMidnight(opts.trialStartDate);
    if (start) {
      cursor = new Date(start.getTime() + (BASE_TRIAL_DAYS + bonus) * MS_PER_DAY);
    }
  }

  const ordered = [...(opts.grants ?? [])].sort(
    (a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime(),
  );

  for (const g of ordered) {
    const windowStart =
      cursor === null || g.effectiveAt.getTime() > cursor.getTime()
        ? g.effectiveAt
        : cursor;

    let days = Math.max(g.days, 0);
    if (g.clawbackAt) {
      // Only the remainder is revoked. Clamping at 0 means a clawback that
      // lands before the window even opens — a refund filed during the hold —
      // makes the grant worth nothing, and can never push access backwards.
      const consumed =
        (g.clawbackAt.getTime() - windowStart.getTime()) / MS_PER_DAY;
      days = Math.min(days, Math.max(0, consumed));
    }

    cursor = new Date(windowStart.getTime() + days * MS_PER_DAY);
  }

  return cursor;
}

/**
 * The gate. Reads the date and nothing else — never a subscription status and
 * never a JWT claim.
 *
 * Status is the wrong thing to read: a `halted` subscription whose paid period
 * has not run out should keep working, and an `active` one whose period ended
 * should not. Reading the date also fails closed — a row that was never
 * recomputed, or a fetch that came back empty, is `null` and therefore locked,
 * rather than accidentally open.
 */
export function hasAccess(
  accessUntil: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!accessUntil) return false;
  const end = accessUntil instanceof Date ? accessUntil : new Date(accessUntil);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() > now.getTime();
}

/**
 * Whole days of access left, never negative. `null` means no access was ever
 * granted, which is distinct from 0 meaning "granted and now expired".
 */
export function accessDaysLeft(
  accessUntil: string | Date | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!accessUntil) return null;
  const end = accessUntil instanceof Date ? accessUntil : new Date(accessUntil);
  if (Number.isNaN(end.getTime())) return null;
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / MS_PER_DAY));
}
