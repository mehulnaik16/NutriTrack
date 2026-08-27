/* Runnable self-check for the logged-set reader and formatters. No test
   framework in this repo, so this is a plain assert script — same convention as
   foodUnits.test.ts.

   Run:
     node src/lib/workoutSets.test.ts */
import assert from "node:assert";
import {
  estimate1RM,
  formatDuration,
  formatSet,
  parseDuration,
  setsOf,
  summarizeSets,
} from "./workoutSets.ts";

// ── setsOf: the three shapes exercises_done actually holds ──────────────
// Legacy strength sets still read.
assert.equal(setsOf([{ weight: "60", reps: "8", unit: "kg" }]).length, 1);
// Bodyweight sets carry no weight key. The old `"weight" in s` filter dropped
// these entirely, which would have hidden every bodyweight log from history.
assert.equal(setsOf([{ reps: "20", rpe: 7, kind: "bodyweight" }]).length, 1);
// Isometric sets carry neither weight nor reps.
assert.equal(setsOf([{ duration_seconds: 150, kind: "isometric" }]).length, 1);
// Cardio stores a plain object, not an array.
assert.deepEqual(setsOf({ bpm: null, distance: 5 }), []);
// Plan templates are exercises, not sets — they have a name and must stay out
// even though they also carry a reps field.
assert.deepEqual(setsOf([{ name: "Squat", sets: 3, reps: "10" }]), []);
assert.deepEqual(setsOf(null), []);
assert.deepEqual(setsOf(undefined), []);
assert.deepEqual(setsOf([null, "junk", 7]), []);

// ── estimate1RM: Epley, unchanged from the two copies this replaces ─────
assert.equal(estimate1RM(100, 1), 100);
assert.equal(estimate1RM(100, 10), 133.3);
assert.equal(estimate1RM(0, 10), 0);
assert.equal(estimate1RM(100, 0), 0);

// ── duration round-tripping ─────────────────────────────────────────────
assert.equal(formatDuration(150), "2:30");
assert.equal(formatDuration(45), "0:45");
assert.equal(formatDuration(0), "0:00");
assert.equal(formatDuration(3600), "60:00");
assert.equal(parseDuration("2:30"), 150);
assert.equal(parseDuration("90"), 90); // bare number means seconds
assert.equal(parseDuration("1:05"), 65);
assert.equal(parseDuration(""), 0);
assert.equal(parseDuration("garbage"), 0);
assert.equal(parseDuration("-5"), 0); // never negative
assert.equal(formatDuration(parseDuration("2:30")), "2:30");

// ── formatSet: one history row per kind ─────────────────────────────────
assert.equal(
  formatSet({ reps: "8", weight: "60", unit: "kg", kind: "weighted" }),
  "8 reps @ 60 kg",
);
assert.equal(formatSet({ reps: "20", rpe: 7, kind: "bodyweight" }), "20 reps · RPE 7");
assert.equal(
  formatSet({ reps: "10", weight: "5", unit: "kg", kind: "bodyweight" }),
  "10 reps +5kg",
);
assert.equal(formatSet({ duration_seconds: 150, rpe: 8, kind: "isometric" }), "2:30 · RPE 8");
assert.equal(
  formatSet({ reps: "8", weight: "20", unit: "kg", kind: "assisted" }),
  "8 reps · −20kg assist",
);
// Logs written before this feature have no kind — they must still read.
assert.equal(formatSet({ reps: "8", weight: "60" }, "lbs"), "8 reps @ 60 lbs");

// ── summarizeSets: the stats line under the table ───────────────────────
assert.equal(
  summarizeSets("weighted", [{ weight: "100", reps: "5" }]).label,
  "Est. 1RM from these sets",
);
assert.equal(summarizeSets("weighted", [{ weight: "100", reps: "5" }]).value, "116.7 kg");
assert.equal(summarizeSets("bodyweight", [{ reps: "10" }, { reps: "12" }]).value, "22 reps");
assert.equal(
  summarizeSets("isometric", [{ duration_seconds: 60 }, { duration_seconds: 90 }]).value,
  "2:30",
);
// Assisted: 1RM is meaningless when the weight is what makes it easier.
assert.equal(summarizeSets("assisted", [{ reps: "8", weight: "20" }]).value, "8 reps");
// An empty form must not produce NaN.
assert.equal(summarizeSets("bodyweight", []).value, "0 reps");
assert.equal(summarizeSets("isometric", []).value, "0:00");

console.log("workoutSets: all assertions passed");
