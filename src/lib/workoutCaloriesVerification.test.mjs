/**
 * Comprehensive verification test for Calorie Burned across all workout types
 * on the Workout Page.
 *
 * Tests:
 * 1. Cardio Workouts (Treadmill, Running, Cycling, Rowing, Swimming, HIIT, Yoga, etc.)
 * 2. Speed-based calculations (ACSM running/walking equations, Cycling speed brackets)
 * 3. Heart Rate calculations (Keytel equation with M/F bias corrections)
 * 4. Ergometer Power calculations (Wattage to mechanical/metabolic burn)
 * 5. Strength Workouts (Comparing calculateCalories with real sets vs legacy sets.length * 15)
 *
 * Run: node src/lib/workoutCaloriesVerification.test.mjs
 */

import assert from "node:assert/strict";
import {
  calculateCalories,
  summarizeStrength,
  confidenceTier,
} from "./calorieEngine.ts";
import { weightToKg, distToKm } from "./units.ts";

const profile70 = { weight_kg: 70, age: 30, gender: "Male" };
const profileFemale60 = { weight_kg: 60, age: 28, gender: "Female" };

console.log("=================================================================");
console.log(" WORKOUT CALORIE BURN VERIFICATION REPORT");
console.log("=================================================================\n");

let passed = 0;
let total = 0;

function check(desc, actual, expectedMin, expectedMax, method) {
  total++;
  const ok = actual >= expectedMin && actual <= expectedMax;
  if (!ok) {
    console.error(
      `❌ FAIL: ${desc} -> Got ${actual} kcal (Expected between ${expectedMin} - ${expectedMax} kcal)`
    );
    process.exitCode = 1;
  } else {
    passed++;
    console.log(
      `✓ PASS: ${desc.padEnd(48)} -> ${String(actual).padStart(4)} kcal [${method}]`
    );
  }
}

// ── 1. CARDIO: RUNNING & WALKING (ACSM Equations) ──
console.log("── 1. Cardio: Running & Walking (ACSM Speed Models) ──");
{
  // 5 km in 30 min = 10 km/h (Running)
  const r1 = calculateCalories(
    "Treadmill running",
    { duration_min: 30, distance_km: 5 },
    profile70
  );
  check("Treadmill 5km in 30min (10 km/h)", r1.kcal, 330, 370, r1.method);
  assert.equal(r1.method, "ACSM_TREADMILL");

  // Outdoor running: 10 km/h for 30 min
  const r2 = calculateCalories(
    "Outdoor run",
    { duration_min: 30, distance_km: 5 },
    profile70
  );
  check("Outdoor Run 5km in 30min", r2.kcal, 330, 370, r2.method);
  assert.equal(r2.method, "ACSM_RUN");

  // Walking: 3 km in 45 min = 4 km/h (ACSM Net equation: 105 kcal)
  const r3 = calculateCalories(
    "Outdoor walk",
    { duration_min: 45, distance_km: 3 },
    profile70
  );
  check("Outdoor Walk 3km in 45min (4 km/h, ACSM net)", r3.kcal, 100, 115, r3.method);
  assert.equal(r3.method, "ACSM_WALK");
}

// ── 2. CARDIO: CYCLING & ERGOMETERS ──
console.log("\n── 2. Cardio: Cycling & Ergometers ──");
{
  // Moderate cycling (20 km/h for 30 min = 10 km -> 8.0 MET = 280 kcal)
  const r1 = calculateCalories(
    "Cycling",
    { duration_min: 30, distance_km: 10 },
    profile70
  );
  check("Cycling 10km in 30min (20 km/h, 8.0 MET)", r1.kcal, 270, 290, r1.method);
  assert.equal(r1.method, "SPEED_MET");

  // Fast cycling (30 km/h for 30 min = 15 km -> 12.0 MET = 420 kcal)
  const r2 = calculateCalories(
    "Cycling",
    { duration_min: 30, distance_km: 15 },
    profile70
  );
  check("Cycling 15km in 30min (30 km/h, 12.0 MET)", r2.kcal, 410, 430, r2.method);
  assert.equal(r2.method, "SPEED_MET");

  // Rowing machine with measured power (150 Watts for 30 min)
  const r3 = calculateCalories(
    "Rowing machine",
    { duration_min: 30, avg_power_w: 150 },
    profile70
  );
  check("Rowing Machine 150W for 30min", r3.kcal, 280, 330, r3.method);
  assert.equal(r3.method, "POWER");
}

// ── 3. CARDIO: HEART RATE (Keytel Equation) ──
console.log("\n── 3. Cardio: Heart Rate Monitored ──");
{
  // Moderate aerobic HR (135 bpm for 30 min)
  const r1 = calculateCalories(
    "Cycling",
    { duration_min: 30, hr_bpm: 135 },
    profile70
  );
  check("Cycling with HR 135 bpm (30min, Male 70kg)", r1.kcal, 240, 280, r1.method);
  assert.equal(r1.method, "HEART_RATE");

  // High intensity HR (160 bpm for 30 min)
  const r2 = calculateCalories(
    "HIIT",
    { duration_min: 30, hr_bpm: 160 },
    profile70
  );
  check("HIIT with HR 160 bpm (30min, Male 70kg)", r2.kcal, 330, 380, r2.method);
  assert.equal(r2.method, "HEART_RATE");

  // Female user 60kg with HR 140 bpm
  const r3 = calculateCalories(
    "Outdoor run",
    { duration_min: 30, hr_bpm: 140 },
    profileFemale60
  );
  check("Run with HR 140 bpm (30min, Female 60kg)", r3.kcal, 230, 270, r3.method);
  assert.equal(r3.method, "HEART_RATE");
}

// ── 4. CARDIO: TIERED MET (Classes, Dancing, Swimming, Yoga) ──
console.log("\n── 4. Cardio: Tiered MET Activities ──");
{
  const r1 = calculateCalories("Yoga & Pilates", { duration_min: 45 }, profile70);
  check("Yoga & Pilates (45 min)", r1.kcal, 140, 180, r1.method);
  assert.equal(r1.method, "TIER_MET");

  const r2 = calculateCalories("HIIT", { duration_min: 30 }, profile70);
  check("HIIT session (30 min)", r2.kcal, 320, 380, r2.method);
  assert.equal(r2.method, "TIER_MET");

  const r3 = calculateCalories("Zumba", { duration_min: 45 }, profile70);
  check("Zumba dance (45 min)", r3.kcal, 340, 390, r3.method);
  assert.equal(r3.method, "TIER_MET");

  const r4 = calculateCalories("Swimming", { duration_min: 30, intensity: "Vigorous" }, profile70);
  check("Swimming Vigorous (30 min)", r4.kcal, 300, 360, r4.method);
  assert.equal(r4.method, "TIER_MET");
}

// ── 5. STRENGTH EXERCISES: ENGINE VS LEGACY DUMMY ──
console.log("\n── 5. Strength Exercises: Engine vs Legacy (sets * 15) ──");
{
  // A: 4 sets of heavy Back Squats @ 90kg (reps: 8, 8, 8, 8)
  const squatSets = [
    { reps: 8, weight_kg: 90 },
    { reps: 8, weight_kg: 90 },
    { reps: 8, weight_kg: 90 },
    { reps: 8, weight_kg: 90 },
  ];
  const rSquat = calculateCalories(
    "Back Squat",
    { duration_min: 12, strength_sets: squatSets, rest_sec: 90 },
    profile70
  );
  const legacySquat = 4 * 15; // 60 kcal
  check(
    `Back Squat 4x8 @90kg (Engine: ${rSquat.kcal} vs Legacy: ${legacySquat})`,
    rSquat.kcal,
    75,
    110,
    rSquat.method
  );

  // B: 4 sets of light Barbell Curl @ 20kg (reps: 10, 10, 10, 10)
  const curlSets = [
    { reps: 10, weight_kg: 20 },
    { reps: 10, weight_kg: 20 },
    { reps: 10, weight_kg: 20 },
    { reps: 10, weight_kg: 20 },
  ];
  const rCurl = calculateCalories(
    "Barbell Curl",
    { duration_min: 10, strength_sets: curlSets, rest_sec: 60 },
    profile70
  );
  const legacyCurl = 4 * 15; // 60 kcal
  check(
    `Barbell Curl 4x10 @20kg (Engine: ${rCurl.kcal} vs Legacy: ${legacyCurl})`,
    rCurl.kcal,
    30,
    55,
    rCurl.method
  );

  // C: 2 sets of 60s Planks (isometric)
  const plankSets = [
    { hold_sec: 60 },
    { hold_sec: 60 },
  ];
  const rPlank = calculateCalories(
    "Plank",
    { duration_min: 4, strength_sets: plankSets, rest_sec: 60 },
    profile70
  );
  const legacyPlank = 2 * 15; // 30 kcal
  check(
    `Plank 2x60s hold (Engine: ${rPlank.kcal} vs Legacy: ${legacyPlank})`,
    rPlank.kcal,
    14,
    26,
    rPlank.method
  );
}

console.log("\n=================================================================");
console.log(` SUMMARY: ${passed}/${total} verification tests passed cleanly.`);
console.log("=================================================================");
