import { getHistory } from "@/lib/historyCache";

/**
 * Every date the user has ever logged food on, as local-midnight `Date`s for
 * the calendar's `logged` modifier.
 *
 * Home and Food both fetch a 30-day window of full log rows to draw their
 * charts, and the calendar used to reuse that window — so anything older than
 * a month simply wasn't in the array and rendered unhighlighted, however far
 * back the user paged. This asks a separate, deliberately tiny question: one
 * column, no window, so the highlight is complete without dragging a year of
 * log rows into the chart state.
 *
 * Dedupe happens on the ISO string. Doing it on `Date` objects (as the old
 * inline `new Set(...)` did) never dedupes anything — every object is a
 * distinct reference.
 */
export async function fetchLoggedDates(userId: string): Promise<Date[]> {
  // getHistory pages past PostgREST's 1000-row cap and serves old days from
  // the browser cache.
  const rows = await getHistory(userId, "food_logs").catch(() => []);

  // food_logs.date is nullable (it defaults to today, but nothing forbids
  // NULL); an undated row cannot mark a day as logged.
  const seen = new Set<string>(
    rows.map((r) => r.date).filter((d): d is string => d !== null),
  );
  return [...seen].map((iso) => {
    // Local midnight, not `new Date(iso)` — that parses as UTC and lands on the
    // previous day for anyone west of Greenwich.
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  });
}
