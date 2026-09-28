/* Run: node src/lib/seen.test.ts
   Node 24 strips the types natively — no framework, same as xpConfig.test.ts. */

import assert from "node:assert";
import { leveledUp, newIds } from "./seen.ts";

/* ── newIds ────────────────────────────────────────────────────────────── */

// First run seeds silently. This is the one that matters: get it backwards and
// a user who has had nineteen badges for a month is told about all of them the
// next time they open the app.
assert.deepEqual(
  newIds(null, ["a", "b"]),
  [],
  "a first look announces nothing",
);

// Only what is actually new.
assert.deepEqual(newIds(["a"], ["a", "b"]), ["b"], "only the unseen id");
assert.deepEqual(newIds(["a", "b"], ["a", "b"]), [], "nothing changed");

// A known-empty store is not the same as no store: someone whose set was empty
// last time really is seeing their first badge now.
assert.deepEqual(newIds([], ["a"]), ["a"], "empty seen-set still announces");

// Things that disappear (a request accepted or withdrawn) are not events.
assert.deepEqual(newIds(["a", "b"], ["a"]), [], "removals are silent");

/* ── leveledUp ─────────────────────────────────────────────────────────── */

assert.equal(leveledUp(null, 7), false, "a first look announces nothing");
assert.equal(leveledUp(6, 7), true, "crossing a level is an event");
assert.equal(leveledUp(7, 7), false, "standing still is not");

// totalXP is recomputed from scratch each load, so deleting logs can move the
// level down. That is a correction, not an event.
assert.equal(leveledUp(7, 6), false, "dropping back is silent");

// Level 1 is where everyone starts; reaching it is not an achievement.
assert.equal(leveledUp(null, 1), false, "a new account hears nothing");

console.log("seen.test.ts: all assertions passed");
