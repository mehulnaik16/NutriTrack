// Run: node src/lib/tabHistory.test.ts
import assert from "node:assert";
import { tabStep, unwindSteps } from "./tabHistory.ts";

// Home at index 3. Home -> Food adds one entry, so back returns Home.
assert.deepEqual(tabStep("/dashboard", "/food", 3, 3), { kind: "push" });
// Food -> Workout swaps the entry: still [Home, Workout].
assert.deepEqual(tabStep("/food", "/workout", 4, 3), { kind: "replace" });
// Workout -> Home pops back to the existing Home entry, no new one.
assert.deepEqual(tabStep("/workout", "/dashboard", 4, 3), {
  kind: "back",
  steps: 1,
  then: false,
});
// Profile sub-page two deep from Food, tap Weight: back to the tab level, then swap.
assert.deepEqual(tabStep("/profile", "/weight", 6, 3), {
  kind: "back",
  steps: 2,
  then: true,
});
// From a page opened from a tab, tap Home: all the way back to Home.
assert.deepEqual(tabStep("/profile", "/dashboard", 6, 3), {
  kind: "back",
  steps: 3,
  then: false,
});
// Same tab: nothing.
assert.deepEqual(tabStep("/food", "/food", 4, 3), { kind: "none" });
// Home unknown (app opened on a tab): never guess, just swap.
assert.deepEqual(tabStep("/food", "/workout", 0, null), { kind: "replace" });
assert.deepEqual(tabStep("/food", "/dashboard", 0, null), { kind: "replace" });
// A stale Home index ahead of us is ignored.
assert.deepEqual(tabStep("/food", "/dashboard", 1, 5), { kind: "replace" });

// Leaving a multi-step page: workout setup opened at index 4 from /workout (3),
// finished on step 9 (index 12) -> 9 setup entries back, landing on /workout.
assert.strictEqual(unwindSteps(12, 4), 9);
// Calculator opened at 5, no drill-down yet: one back, to the page before it.
assert.strictEqual(unwindSteps(5, 5), 1);
// Opened as the first entry (link or reload) at step 3: back to that entry only.
assert.strictEqual(unwindSteps(2, 0), 2);
assert.strictEqual(unwindSteps(0, 0), 0);

console.log("✓ tabHistory: tabs never pile up history");
