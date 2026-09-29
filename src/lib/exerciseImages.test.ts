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

// Test 3: Common aliases resolve to correct approved asset
assert.strictEqual(getExerciseThumbnail("Bench Press"), "/exercises/barbell_bench_press.jpg");
assert.strictEqual(getExerciseThumbnail("Flat Bench Press"), "/exercises/barbell_bench_press.jpg");
assert.strictEqual(getExerciseThumbnail("Barbell Incline Bench Press"), "/exercises/incline_barbell_bench_press.jpg");
assert.strictEqual(getExerciseThumbnail("Dumbbell Incline Bench Press"), "/exercises/incline_dumbbell_bench_press.jpg");
assert.strictEqual(getExerciseThumbnail("Squat"), "/exercises/back_squat.jpg");
assert.strictEqual(getExerciseThumbnail("Barbell Back Squat"), "/exercises/back_squat.jpg");
assert.strictEqual(getExerciseThumbnail("Squats"), "/exercises/back_squat.jpg");

// Test 4: hasExerciseThumbnail helper
assert.strictEqual(hasExerciseThumbnail("Barbell Bench Press"), true);
assert.strictEqual(hasExerciseThumbnail("Back Squat"), true);
assert.strictEqual(hasExerciseThumbnail("Some Unknown Move"), false);

// Test 5: Fallback behavior for ungenerated exercises or empty string
assert.strictEqual(getExerciseThumbnail("Non Existent Move 123"), null);
assert.strictEqual(getExerciseThumbnail(""), null);

console.log("✓ exerciseImages.test.ts: all assertions passed");
