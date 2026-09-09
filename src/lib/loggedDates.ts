import { supabase } from "@/integrations/client";

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
  const { data } = await supabase
    .from("food_logs")
    .select("date")
    .eq("user_id", userId)
    // PostgREST caps a request at 1000 rows by default, which several years of
    // logging would exceed — and a silent truncation would look exactly like
    // the bug this replaces.
    .limit(50000);

  const seen = new Set<string>((data ?? []).map((r: { date: string }) => r.date));
  return [...seen].map((iso) => {
    // Local midnight, not `new Date(iso)` — that parses as UTC and lands on the
    // previous day for anyone west of Greenwich.
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  });
}
