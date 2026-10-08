/* Runnable self-check for sevenDayRuns. Plain assert script, same convention
   as snooze.test.ts. Run: npx tsx src/lib/dates.test.ts */
import assert from "node:assert";
import { sevenDayRuns } from "./dates";

const days = (start: string, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(`${start}T12:00:00`);
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

assert.equal(sevenDayRuns([]), 0);
assert.equal(sevenDayRuns(days("2026-09-01", 6)), 0);
assert.equal(sevenDayRuns(days("2026-09-01", 7)), 1);
assert.equal(sevenDayRuns(days("2026-09-01", 8)), 1);
assert.equal(sevenDayRuns(days("2026-09-20", 14)), 2); // crosses a month end
// two 7-day runs split by a one-day gap
assert.equal(
  sevenDayRuns([...days("2026-08-01", 7), ...days("2026-08-09", 7)]),
  2,
);
// 14 scattered days (every other day) earn nothing
assert.equal(
  sevenDayRuns(
    Array.from({ length: 14 }, (_, i) => days("2026-08-01", 28)[i * 2]),
  ),
  0,
);
// duplicates and unsorted input are fine
assert.equal(
  sevenDayRuns([...days("2026-09-01", 7).reverse(), "2026-09-03"]),
  1,
);
// a US DST change day (2026-03-08) still counts as one day
assert.equal(sevenDayRuns(days("2026-03-05", 7)), 1);
console.log("dates.test: ok");
