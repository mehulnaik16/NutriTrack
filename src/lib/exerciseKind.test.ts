/* Runnable self-check for exercise classification. No test framework in this
   repo, so this is a plain assert script — same convention as foodUnits.test.ts.

   Run:
     node src/lib/exerciseKind.test.ts

   Node 22 strips TypeScript natively, so this imports the real module rather
   than restating its lists. Exits non-zero on the first failure. */
import assert from "node:assert";
import { EXERCISES_DB } from "./exercises.ts";
import {
  ASSISTED_NAMES,
  BODYWEIGHT_NAMES,
  ISOMETRIC_NAMES,
  exerciseKind,
} from "./exerciseKind.ts";

const all = new Set(Object.values(EXERCISES_DB).flat());

// Every classified name must be a real library name. A typo here would not
// throw — the exercise would silently fall back to "weighted" and render the
// wrong table, which is exactly the bug this assertion exists to catch.
for (const n of [...BODYWEIGHT_NAMES, ...ISOMETRIC_NAMES, ...ASSISTED_NAMES]) {
  assert.ok(all.has(n), `not in EXERCISES_DB: ${JSON.stringify(n)}`);
}

// A name may not belong to two kinds — the lookup map would silently keep
// whichever was inserted last.
const seen = new Set<string>();
for (const n of [...BODYWEIGHT_NAMES, ...ISOMETRIC_NAMES, ...ASSISTED_NAMES]) {
  assert.ok(!seen.has(n), `classified twice: ${n}`);
  seen.add(n);
}

assert.equal(exerciseKind("Barbell Curl"), "weighted");
assert.equal(exerciseKind("Push Up"), "bodyweight");
assert.equal(exerciseKind("Plank"), "isometric");
assert.equal(exerciseKind("Assisted Pull up"), "assisted");

// Unknown names must not throw — they fall back to the pre-existing UI.
assert.equal(exerciseKind("Nonexistent Lift"), "weighted");
assert.equal(exerciseKind(""), "weighted");
assert.equal(exerciseKind(null), "weighted");
assert.equal(exerciseKind(undefined), "weighted");

// Case-insensitive: logs store whatever case the library had at write time.
assert.equal(exerciseKind("push up"), "bodyweight");
assert.equal(exerciseKind("WALL SIT"), "isometric");

// Regressions the name lists are easy to get wrong:
// "Sled Push" is a loaded push, not a push-up.
assert.equal(exerciseKind("Sled Push"), "weighted");
// Loop Band work has no weight to log even though the name says "Curl".
assert.equal(exerciseKind("Loop Band Bicep Curl"), "bodyweight");
assert.equal(exerciseKind("Barbell Row"), "weighted");
// Cable ab work is loaded; bare bodyweight ab work is not.
assert.equal(exerciseKind("Cable Torso Rotation"), "weighted");
assert.equal(exerciseKind("Torso Rotation"), "bodyweight");
// A static hold that lives in the abs group must beat the bodyweight default.
assert.equal(exerciseKind("Side Plank"), "isometric");

console.log("exerciseKind: all assertions passed");
