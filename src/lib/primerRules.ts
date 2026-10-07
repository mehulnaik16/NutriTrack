/**
 * The two notification-primer rules, kept free of imports so
 * primerRules.test.ts can run them in plain Node. Used by notificationPrimer.ts.
 */

const DAY_MS = 86_400_000;

/** First-log prompt: only if no log existed before this logging session. */
export const isFirstEverLog = (logsBeforeSession: number): boolean =>
  logsBeforeSession === 0;

/** Day-5 prompt: 5+ days since joining, and 48h+ since a "Not now" here. */
export function day5Due(
  createdAt: string | Date,
  now: number,
  lastDismissedAt: string | null,
): boolean {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created) || Math.floor((now - created) / DAY_MS) < 5)
    return false;
  if (lastDismissedAt) {
    const dismissed = new Date(lastDismissedAt).getTime();
    if (now - dismissed < 48 * 3_600_000) return false;
  }
  return true;
}
