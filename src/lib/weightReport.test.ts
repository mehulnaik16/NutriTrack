/* Runnable self-check for the weight report's layout rules. Plain assert
   script, same convention as dates.test.ts. Run: npx tsx src/lib/weightReport.test.ts */
import assert from "node:assert";
import { beforeAfter, fitBox, reportDate, reportOrder } from "./weightReport";

// Newest first, as the user asked ("latest to oldest").
assert.deepEqual(
  reportOrder([
    { date: "2026-08-06" },
    { date: "2026-10-08" },
    { date: "2026-07-30" },
    { date: "2026-10-01" },
  ]).map((e) => e.date),
  ["2026-10-08", "2026-10-01", "2026-08-06", "2026-07-30"],
);
// Doesn't reorder the caller's array.
const input = [{ date: "2026-01-01" }, { date: "2026-02-01" }];
reportOrder(input);
assert.equal(input[0].date, "2026-01-01");

// Photos keep their shape and fit the box (100 × 100 mm in the report).
assert.deepEqual(fitBox(1000, 1000, 120, 120), { w: 120, h: 120 });
assert.deepEqual(fitBox(750, 1000, 120, 120), { w: 90, h: 120 }); // portrait
assert.deepEqual(fitBox(1000, 500, 120, 120), { w: 120, h: 60 }); // landscape
assert.deepEqual(fitBox(0, 500, 120, 120), { w: 0, h: 0 }); // unreadable

// Dates read the same in every timezone (no UTC shift to the day before).
assert.equal(reportDate("2026-10-08"), "8 Oct 2026");
assert.equal(reportDate("2026-01-31"), "31 Jan 2026");
assert.equal(reportDate("2025-12-01"), "1 Dec 2025");

// Before/after: oldest photo vs newest photo; entries without one are skipped.
const pair = beforeAfter([
  { date: "2026-10-08", photo_url: "a" },
  { date: "2026-10-09", photo_url: null }, // newer, but no photo
  { date: "2026-07-30", photo_url: "b" },
  { date: "2026-07-01", photo_url: null }, // older, but no photo
  { date: "2026-08-20", photo_url: "c" },
]);
assert.equal(pair?.before.date, "2026-07-30");
assert.equal(pair?.after.date, "2026-10-08");
// Needs two photos to compare.
assert.equal(beforeAfter([{ date: "2026-10-08", photo_url: "a" }]), null);
assert.equal(beforeAfter([]), null);

console.log("✓ weightReport.test.ts: all assertions passed");
