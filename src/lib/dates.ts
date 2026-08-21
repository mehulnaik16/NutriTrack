/**
 * Local-date helpers.
 *
 * `new Date().toISOString()` returns the UTC date — for users east of UTC
 * (e.g. India, UTC+5:30) that's *yesterday* between midnight and 5:30 AM,
 * which corrupts log dates and streaks. Always use these instead.
 */

/** YYYY-MM-DD in the user's local timezone. */
export function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today as YYYY-MM-DD, local timezone. */
export function todayLocal(): string {
  return toLocalISO(new Date());
}

/** N days ago as YYYY-MM-DD, local timezone. */
export function daysAgoLocal(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toLocalISO(d);
}

/**
 * Whole days from ISO date `from` to ISO date `to` (positive when `to` is
 * later). Parses at local midnight and rounds, so a DST day (23h or 25h)
 * still counts as exactly one day.
 */
export function daysBetweenLocal(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
