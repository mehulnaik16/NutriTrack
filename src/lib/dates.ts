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
