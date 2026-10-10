// Run: node src/lib/tabHistory.test.ts
import assert from "node:assert";
import { tabStep } from "./tabHistory.ts";

// Home at index 3. Home -> Food adds one entry, so back returns Home.
assert.deepEqual(tabStep("/dashboard", "/food", 3, 3), { kind: "push" });
// Food -> Workout swaps the entry: still [Home, Workout].
assert.deepEqual(tabStep("/food", "/workout", 4, 3), { kind: "replace" });
// Workout -> Home pops back to the existing Home entry, no new one.
assert.deepEqual(tabStep("/workout", "/dashboard", 4, 3), { kind: "back", steps: 1, then: false });
// Profile sub-page two deep from Food, tap Weight: back to the tab level, then swap.
assert.deepEqual(tabStep("/profile", "/weight", 6, 3), { kind: "back", steps: 2, then: true });
// From a page opened from a tab, tap Home: all the way back to Home.
assert.deepEqual(tabStep("/profile", "/dashboard", 6, 3), { kind: "back", steps: 3, then: false });
// Same tab: nothing.
assert.deepEqual(tabStep("/food", "/food", 4, 3), { kind: "none" });
// Home unknown (app opened on a tab): never guess, just swap.
assert.deepEqual(tabStep("/food", "/workout", 0, null), { kind: "replace" });
assert.deepEqual(tabStep("/food", "/dashboard", 0, null), { kind: "replace" });
// A stale Home index ahead of us is ignored.
assert.deepEqual(tabStep("/food", "/dashboard", 1, 5), { kind: "replace" });

console.log("✓ tabHistory: tabs never pile up history");
