import assert from "node:assert";
import { getExerciseThumbnail, hasExerciseThumbnail, normalizeExerciseKey } from "./exerciseImages.ts";

// Test 1: Normalization
assert.strictEqual(normalizeExerciseKey("Barbell Bench Press"), "barbell bench press");
assert.strictEqual(normalizeExerciseKey("  Incline   Barbell Bench Press  "), "incline barbell bench press");
assert.strictEqual(normalizeExerciseKey("T-Bar Row"), "t bar row");
assert.strictEqual(normalizeExerciseKey("Close-Grip Bench Press"), "close grip bench press");

// Test 2: Approved exercises return exact image path
assert.strictEqual(getExerciseThumbnail("Barbell Bench Press"), "/exercises/barbell_bench_press.jpg");
assert.strictEqual(getExerciseThumbnail("Incline Barbell Bench Press"), "/exercises/incline_barbell_bench_press.jpg");
assert.strictEqual(getExerciseThumbnail("Dumbbell Bench Press"), "/exercises/dumbbell_bench_press.jpg");
assert.strictEqual(getExerciseThumbnail("Incline Dumbbell Bench Press"), "/exercises/incline_dumbbell_bench_press.jpg");
assert.strictEqual(getExerciseThumbnail("Machine Bench Press"), "/exercises/machine_bench_press.jpg");
assert.strictEqual(getExerciseThumbnail("Cable Crossover Fly"), "/exercises/cable_crossover_fly.jpg");
assert.strictEqual(getExerciseThumbnail("Back Squat"), "/exercises/back_squat.jpg");
// Batch 1 additions
assert.strictEqual(getExerciseThumbnail("Plate Loaded Chest Press"), "/exercises/plate_loaded_chest_press.jpg");
assert.strictEqual(getExerciseThumbnail("Dumbbell Fly"), "/exercises/dumbbell_fly.jpg");
assert.strictEqual(getExerciseThumbnail("Chest Dip"), "/exercises/chest_dip.jpg");
assert.strictEqual(getExerciseThumbnail("Push Up"), "/exercises/push_up.jpg");
assert.strictEqual(getExerciseThumbnail("Plyometric Push-ups"), "/exercises/plyometric_push_ups.jpg");
assert.strictEqual(getExerciseThumbnail("Deadlift"), "/exercises/deadlift.jpg");
assert.strictEqual(getExerciseThumbnail("Barbell Row"), "/exercises/barbell_row.jpg");
assert.strictEqual(getExerciseThumbnail("Pendlay Row"), "/exercises/pendlay_row.jpg");
assert.strictEqual(getExerciseThumbnail("Dumbbell Row"), "/exercises/dumbbell_row.jpg");
assert.strictEqual(getExerciseThumbnail("Cable Row"), "/exercises/cable_row.jpg");
// Batch 1 & 2 additions
assert.strictEqual(getExerciseThumbnail("Decline Barbell Bench Press"), "/exercises/decline_barbell_bench_press.jpg");
assert.strictEqual(getExerciseThumbnail("Decline Dumbbell Bench Press"), "/exercises/decline_dumbbell_bench_press.jpg");
assert.strictEqual(getExerciseThumbnail("Pull Up"), "/exercises/pull_up.jpg");
assert.strictEqual(getExerciseThumbnail("Lat Pulldown"), "/exercises/lat_pulldown.jpg");
assert.strictEqual(getExerciseThumbnail("Dumbbell Pullover"), "/exercises/dumbbell_pullover.jpg");
assert.strictEqual(getExerciseThumbnail("Inverted Row"), "/exercises/inverted_row.jpg");
assert.strictEqual(getExerciseThumbnail("Front Squat"), "/exercises/front_squat.jpg");
assert.strictEqual(getExerciseThumbnail("Leg Press"), "/exercises/leg_press.jpg");

// Test 3: Common aliases resolve to correct approved asset
assert.strictEqual(getExerciseThumbnail("Bench Press"), "/exercises/barbell_bench_press.jpg");
assert.strictEqual(getExerciseThumbnail("Flat Bench Press"), "/exercises/barbell_bench_press.jpg");
assert.strictEqual(getExerciseThumbnail("Barbell Incline Bench Press"), "/exercises/incline_barbell_bench_press.jpg");
assert.strictEqual(getExerciseThumbnail("Dumbbell Incline Bench Press"), "/exercises/incline_dumbbell_bench_press.jpg");
assert.strictEqual(getExerciseThumbnail("Squat"), "/exercises/back_squat.jpg");
assert.strictEqual(getExerciseThumbnail("Barbell Back Squat"), "/exercises/back_squat.jpg");
assert.strictEqual(getExerciseThumbnail("Squats"), "/exercises/back_squat.jpg");
assert.strictEqual(getExerciseThumbnail("Pushups"), "/exercises/push_up.jpg");
assert.strictEqual(getExerciseThumbnail("Clapping Push Up"), "/exercises/plyometric_push_ups.jpg");
assert.strictEqual(getExerciseThumbnail("Barbell Deadlift"), "/exercises/deadlift.jpg");
assert.strictEqual(getExerciseThumbnail("Seated Cable Row"), "/exercises/cable_row.jpg");
assert.strictEqual(getExerciseThumbnail("Decline Bench Press"), "/exercises/decline_barbell_bench_press.jpg");
assert.strictEqual(getExerciseThumbnail("Pullups"), "/exercises/pull_up.jpg");
assert.strictEqual(getExerciseThumbnail("Cable Lat Pulldown"), "/exercises/lat_pulldown.jpg");
assert.strictEqual(getExerciseThumbnail("Australian Pull Up"), "/exercises/inverted_row.jpg");
assert.strictEqual(getExerciseThumbnail("Barbell Front Squat"), "/exercises/front_squat.jpg");
assert.strictEqual(getExerciseThumbnail("45 Degree Leg Press"), "/exercises/leg_press.jpg");

// Test 4: hasExerciseThumbnail helper
assert.strictEqual(hasExerciseThumbnail("Barbell Bench Press"), true);
assert.strictEqual(hasExerciseThumbnail("Back Squat"), true);
assert.strictEqual(hasExerciseThumbnail("Some Unknown Move"), false);

// Test 5: Fallback behavior for ungenerated exercises or empty string
assert.strictEqual(getExerciseThumbnail("Non Existent Move 123"), null);
assert.strictEqual(getExerciseThumbnail(""), null);

console.log("✓ exerciseImages.test.ts: all assertions passed");
