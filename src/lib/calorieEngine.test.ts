/**
 * Acceptance tests for the calorie calculation engine.
 *
 * Plain node:assert script — same convention as exerciseKind.test.ts.
 * Run:  node src/lib/calorieEngine.test.ts
 */
import assert from "node:assert";
import { calculateCalories } from "./calorieEngine.ts";
import type { UserProfile, WorkoutInputs } from "./calorieEngine.ts";
import { configFor } from "./cardioCategories.ts";
import {
  summarizeStrength,
  isStrengthExercise,
  confidenceTier,
  calorieRange,
  MUSCLE_MET,
  LOAD_REF,
} from "./calorieEngine.ts";
import { EXERCISES_DB } from "./exercises.ts";
import { weightToKg, distToKm } from "./units.ts";

const male70: UserProfile = { weight_kg: 70, age: 30, gender: "Male" };

function within10pct(actual: number, expected: number, label: string) {
  const pct = Math.abs(actual - expected) / expected;
  assert.ok(
    pct <= 0.1,
    `${label}: expected ~${expected}, got ${actual} (${(pct * 100).toFixed(1)}% off)`,
  );
}

// ── Test 1: Cycling with HR → HEART_RATE ~278 kcal ──────────────────────────
// Raw Keytel gives 386 here; the male branch carries a 0.72 bias correction
// because the unadjusted equation bills 11 MET for a 141 bpm ride that costs
// roughly 7-8. See MALE_KEYTEL_BIAS and calorieEngine.ranges.test.ts.
{
  const r = calculateCalories(
    "Cycling",
    {
      duration_min: 30,
      distance_km: 19,
      hr_bpm: 141,
    },
    male70,
  );
  within10pct(r.kcal, 278, "T1 cycling+HR");
  assert.strictEqual(r.method, "HEART_RATE");
  assert.strictEqual(r.confidence, "measured");
  console.log(
    `✓ T1 cycling+HR: ${r.kcal} kcal (expected ~278, raw Keytel 386)`,
  );
}

// ── Test 2: Cycling no HR → speed 38 km/h → SPEED_MET ~420 ─────────────────
{
  const r = calculateCalories(
    "Cycling",
    {
      duration_min: 30,
      distance_km: 19,
    },
    male70,
  );
  within10pct(r.kcal, 420, "T2 cycling speed");
  assert.strictEqual(r.method, "SPEED_MET");
  assert.strictEqual(r.confidence, "estimated");
  console.log(`✓ T2 cycling speed: ${r.kcal} kcal (expected ~420)`);
}

// ── Test 3: Treadmill 20 min, 10 km/h, 5% incline → ACSM ~311 ──────────────
{
  // distance = speed * time = 10 * (20/60) = 3.333 km
  const r = calculateCalories(
    "Treadmill running",
    {
      duration_min: 20,
      distance_km: 10 * (20 / 60),
      incline_pct: 5,
    },
    male70,
  );
  within10pct(r.kcal, 286, "T3 treadmill ACSM");
  assert.strictEqual(r.method, "ACSM_TREADMILL");
  assert.strictEqual(r.confidence, "estimated");
  console.log(`✓ T3 treadmill ACSM: ${r.kcal} kcal (expected ~286)`);
}

// ── Test 4: HIIT 5 min + HR 165 → short-interval exception → TIER_MET ~58 ──
{
  const r = calculateCalories(
    "HIIT",
    {
      duration_min: 5,
      hr_bpm: 165,
    },
    male70,
  );
  within10pct(r.kcal, 58, "T4 HIIT short");
  assert.strictEqual(r.method, "TIER_MET");
  assert.strictEqual(r.confidence, "estimated");
  console.log(`✓ T4 HIIT short: ${r.kcal} kcal (expected ~58)`);
}

// ── Test 5: HR = 14 → rejected → falls through ─────────────────────────────
{
  const r = calculateCalories(
    "Cycling",
    {
      duration_min: 30,
      hr_bpm: 14,
    },
    male70,
  );
  assert.notStrictEqual(r.method, "HEART_RATE");
  console.log(`✓ T5 HR=14 rejected: method=${r.method}`);
}

// ── Test 6: HR = 220 → rejected → falls through ────────────────────────────
{
  const r = calculateCalories(
    "Cycling",
    {
      duration_min: 30,
      hr_bpm: 220,
    },
    male70,
  );
  assert.notStrictEqual(r.method, "HEART_RATE");
  console.log(`✓ T6 HR=220 rejected: method=${r.method}`);
}

// ── Test 7: Yoga 60 min → TIER_MET 3.0 × 70 × 1.0 = 210 ───────────────────
{
  const r = calculateCalories(
    "Yoga & Pilates",
    {
      duration_min: 60,
    },
    male70,
  );
  assert.strictEqual(r.kcal, 210);
  assert.strictEqual(r.method, "TIER_MET");
  assert.strictEqual(r.confidence, "estimated");
  console.log(`✓ T7 yoga: ${r.kcal} kcal (expected 210)`);
}

// ── Test 8: Low HR never yields a negative burn (Keytel goes negative <58bpm) ─
{
  const r = calculateCalories(
    "Cycling",
    {
      duration_min: 30,
      hr_bpm: 50,
    },
    male70,
  );
  assert.ok(r.kcal > 0, `T8 low HR: expected a positive burn, got ${r.kcal}`);
  assert.notStrictEqual(r.method, "HEART_RATE");
  console.log(`✓ T8 HR=50 falls through: ${r.kcal} kcal, method=${r.method}`);
}

// ── Test 9: Stretching has its own MET, not Yoga's ──────────────────────────
{
  const stretch = calculateCalories("Stretching", { duration_min: 60 }, male70);
  const yoga = calculateCalories(
    "Yoga & Pilates",
    { duration_min: 60 },
    male70,
  );
  assert.strictEqual(stretch.kcal, 175); // 2.5 × 70 × 1.0
  assert.notStrictEqual(stretch.kcal, yoga.kcal);
  console.log(`✓ T9 stretching: ${stretch.kcal} kcal (yoga ${yoga.kcal})`);
}

// ── Test 10: Swimming honours intensity instead of a flat MET ───────────────
{
  const light = calculateCalories(
    "Swimming",
    { duration_min: 60, intensity: "Light" },
    male70,
  );
  const hard = calculateCalories(
    "Swimming",
    { duration_min: 60, intensity: "Vigorous" },
    male70,
  );
  assert.strictEqual(light.kcal, 385); // 5.5 × 70
  assert.strictEqual(hard.kcal, 665); // 9.5 × 70
  console.log(`✓ T10 swimming tiers: ${light.kcal} / ${hard.kcal} kcal`);
}

// ── Test 11: Garbage numeric input never produces NaN ───────────────────────
{
  const r = calculateCalories(
    "Cycling",
    {
      duration_min: NaN,
      distance_km: NaN,
      hr_bpm: NaN,
    },
    male70,
  );
  assert.strictEqual(r.kcal, 0);
  const noWeight = calculateCalories(
    "Cycling",
    { duration_min: 30 },
    {
      weight_kg: NaN,
      age: NaN,
      gender: "",
    },
  );
  assert.strictEqual(noWeight.kcal, 0);
  console.log(`✓ T11 NaN inputs clamp to 0`);
}

// ── Test 12: Implausible speed falls through to the MET table ──────────────
{
  // 40 km in 20 min = 120 km/h — a mistyped distance, not a ride.
  const r = calculateCalories(
    "Outdoor run",
    {
      duration_min: 20,
      distance_km: 40,
    },
    male70,
  );
  assert.strictEqual(r.method, "TIER_MET");
  console.log(
    `✓ T12 implausible speed rejected: ${r.kcal} kcal, method=${r.method}`,
  );
}

// ── Test 13: ACSM paths report which equation actually ran ─────────────────
{
  const run = calculateCalories(
    "Outdoor run",
    { duration_min: 30, distance_km: 5 },
    male70,
  );
  const walk = calculateCalories(
    "Outdoor walk",
    { duration_min: 30, distance_km: 2.5 },
    male70,
  );
  assert.strictEqual(run.method, "ACSM_RUN");
  assert.strictEqual(walk.method, "ACSM_WALK");
  console.log(`✓ T13 ACSM labels: run=${run.method}, walk=${walk.method}`);
}

// ── Test 14: Running distance net invariance (same distance over different times) ──
{
  // 5 km at 70 kg should yield 350 kcal regardless of whether it took 25 min or 45 min
  const fast = calculateCalories(
    "Outdoor run",
    { duration_min: 25, distance_km: 5 },
    male70,
  );
  const slow = calculateCalories(
    "Outdoor run",
    { duration_min: 45, distance_km: 5 },
    male70,
  );
  assert.strictEqual(fast.kcal, 350);
  assert.strictEqual(slow.kcal, 350);
  console.log(
    `✓ T14 running net invariance: 25m=${fast.kcal} kcal, 45m=${slow.kcal} kcal (both 350)`,
  );
}

// ── Test 15: Female Keytel uses correct negative weight coefficient ─────────
{
  const female60 = { weight_kg: 60, age: 30, gender: "Female" };
  // Keytel female: ((-20.4022 + 0.4472*140 - 0.1263*60 + 0.074*30) / 4.184) * 45
  // = ((-20.4022 + 62.608 - 7.578 + 2.22) / 4.184) * 45 = 36.8478 * 45 / 4.184 = 396.3 -> 396
  const r = calculateCalories(
    "Cycling",
    { duration_min: 45, hr_bpm: 140 },
    female60,
  );
  assert.strictEqual(r.method, "HEART_RATE");
  assert.strictEqual(r.kcal, 396);
  console.log(
    `✓ T15 female Keytel correct sign: ${r.kcal} kcal (expected 396)`,
  );
}

// ── Test 16: Resting HR (<85 bpm) falls through to category MET ─────────────
{
  const r = calculateCalories(
    "Yoga & Pilates",
    { duration_min: 60, hr_bpm: 72 },
    male70,
  );
  assert.strictEqual(r.method, "TIER_MET");
  assert.strictEqual(r.kcal, 210); // Yoga 3.0 MET * 70
  console.log(
    `✓ T16 resting HR (72 bpm) falls through to MET: method=${r.method}`,
  );
}

// ── Test 17: Swimming form configuration exposes intensity ─────────────────
{
  const config = configFor("Swimming");
  assert.ok(
    config.form.intensity,
    "Swimming must have intensity options in form config",
  );
  assert.deepStrictEqual(Array.from(config.form.intensity), [
    "Light",
    "Moderate",
    "Vigorous",
  ]);
  console.log(
    `✓ T17 swimming form has intensity: ${config.form.intensity.join(", ")}`,
  );
}

// ── Test 18: Unit invariance across kg/lbs and km/mile combinations ──────────
{
  // Physical reality: 70 kg (~154 lbs) runner covers 5 km (~3.125 miles) in 30 min
  const combinations: Array<{
    w: number;
    wu: "kg" | "lbs";
    d: number;
    du: "km" | "mile";
    label: string;
  }> = [
    { w: 70, wu: "kg", d: 5, du: "km", label: "kg + km" },
    { w: 154, wu: "lbs", d: 3.125, du: "mile", label: "lbs + mile" },
    { w: 154, wu: "lbs", d: 5, du: "km", label: "lbs + km" },
    { w: 70, wu: "kg", d: 3.125, du: "mile", label: "kg + mile" },
  ];

  for (const c of combinations) {
    const r = calculateCalories(
      "Outdoor run",
      {
        duration_min: 30,
        distance_km: distToKm(c.d, c.du),
      },
      {
        weight_kg: weightToKg(c.w, c.wu),
        age: 30,
        gender: "Male",
      },
    );
    assert.strictEqual(
      r.kcal,
      350,
      `${c.label} failed: expected 350 kcal, got ${r.kcal}`,
    );
  }
  console.log(
    `✓ T18 unit invariance: all 4 unit combinations (kg/lbs × km/mile) yield 350 kcal`,
  );
}

console.log("\n✅ All 18 acceptance tests passed.");

// ── Strength: set-driven calculation ────────────────────────────────────────
// Appended when the strength calculator landed. The cardio assertions above are
// untouched; these cover the STRENGTH_SETS path and its inputs.

const sq = (reps: number, weight_kg: number, n: number) =>
  Array.from({ length: n }, () => ({ reps, weight_kg }));

// ── Test 19: a loaded squat uses the set model, not a flat MET ──────────────
{
  const r = calculateCalories(
    "Back Squat",
    {
      duration_min: 10,
      rest_sec: 60,
      strength_sets: sq(8, 70, 4),
    },
    male70,
  );
  assert.strictEqual(r.method, "STRENGTH_SETS");
  assert.strictEqual(r.confidence, "estimated");
  assert.ok(r.kcal > 0, `T19 expected a positive burn, got ${r.kcal}`);
  console.log(`✓ T19 squat 4x8 @70kg: ${r.kcal} kcal, method=${r.method}`);
}

// ── Test 20: heavier load on identical reps costs more ─────────────────────
{
  const light = calculateCalories(
    "Back Squat",
    {
      duration_min: 10,
      rest_sec: 60,
      strength_sets: sq(8, 30, 4),
    },
    male70,
  );
  const heavy = calculateCalories(
    "Back Squat",
    {
      duration_min: 10,
      rest_sec: 60,
      strength_sets: sq(8, 120, 4),
    },
    male70,
  );
  assert.ok(
    heavy.kcal > light.kcal,
    `T20 heavy (${heavy.kcal}) must exceed light (${light.kcal}) on identical reps`,
  );
  console.log(
    `✓ T20 load tiers: 30kg=${light.kcal} kcal, 120kg=${heavy.kcal} kcal`,
  );
}

// ── Test 21: the mean load is volume-weighted and skips empty rows ──────────
{
  const withEmpty = summarizeStrength(
    "Back Squat",
    [
      { reps: 10, weight_kg: 60 },
      { reps: 0, weight_kg: 999 },
    ],
    60,
    70,
  );
  assert.strictEqual(
    withEmpty?.mean_load_kg,
    60,
    "T21 a 0-rep row must not move the mean",
  );

  const weighted = summarizeStrength(
    "Back Squat",
    [
      { reps: 10, weight_kg: 50 },
      { reps: 5, weight_kg: 80 },
    ],
    60,
    70,
  );
  // (50*10 + 80*5) / 15 = 60
  assert.strictEqual(
    weighted?.mean_load_kg,
    60,
    "T21 mean must weight by reps",
  );
  console.log(`✓ T21 volume-weighted mean load: ${weighted?.mean_load_kg} kg`);
}

// ── Test 22: isometrics read hold seconds and ignore reps ──────────────────
{
  const held = summarizeStrength(
    "Plank",
    [{ hold_sec: 60 }, { hold_sec: 45 }],
    60,
    70,
  );
  assert.strictEqual(held?.active_sec, 105, "T22 hold seconds must sum");
  const withReps = summarizeStrength(
    "Plank",
    [{ reps: 20, hold_sec: 60 }],
    60,
    70,
  );
  assert.strictEqual(
    withReps?.active_sec,
    60,
    "T22 reps must be ignored for a hold",
  );
  console.log(`✓ T22 plank: ${held?.active_sec}s active from two holds`);
}

// ── Test 23: rest falls BETWEEN sets, so n sets carry n-1 rests ────────────
{
  const s = summarizeStrength("Back Squat", sq(8, 70, 4), 60, 70);
  assert.strictEqual(
    s?.rest_sec,
    180,
    `T23 four sets must carry three rests, got ${s?.rest_sec}`,
  );
  const one = summarizeStrength("Back Squat", sq(8, 70, 1), 60, 70);
  assert.strictEqual(one?.rest_sec, 0, "T23 a single set carries no rest");
  console.log(
    `✓ T23 rest between sets: 4 sets = ${s?.rest_sec}s, 1 set = ${one?.rest_sec}s`,
  );
}

// ── Test 24: heart rate takes precedence over the set model ────────────────
{
  const r = calculateCalories(
    "Back Squat",
    {
      duration_min: 10,
      rest_sec: 60,
      strength_sets: sq(8, 70, 4),
      hr_bpm: 140,
    },
    male70,
  );
  assert.strictEqual(r.method, "HEART_RATE", "T24 a supplied BPM must win");
  console.log(`✓ T24 BPM switches formula: ${r.kcal} kcal, method=${r.method}`);
}

// ── Test 25: no set rows falls through to the bout MET table ───────────────
{
  const r = calculateCalories("Back Squat", { duration_min: 30 }, male70);
  assert.strictEqual(r.method, "TIER_MET");
  assert.strictEqual(r.kcal, 175); // 5.0 MET x 70 x 0.5
  console.log(
    `✓ T25 no sets falls through: ${r.kcal} kcal, method=${r.method}`,
  );
}

// ── Test 26: cardio machines filed under muscles stay cardio ───────────────
{
  for (const name of ["Stair Stepper", "Jump Rope"]) {
    const r = calculateCalories(
      name,
      {
        duration_min: 10,
        rest_sec: 60,
        strength_sets: sq(8, 70, 4),
      },
      male70,
    );
    assert.strictEqual(
      r.method,
      "VERTICAL",
      `T26 ${name} must stay on its cardio archetype`,
    );
    assert.strictEqual(
      isStrengthExercise(name),
      false,
      `T26 ${name} must not reach the picker`,
    );
  }
  assert.strictEqual(isStrengthExercise("Back Squat"), true);
  assert.strictEqual(isStrengthExercise("Nonexistent Lift"), false);
  console.log(`✓ T26 Stair Stepper and Jump Rope excluded from strength`);
}

// ── Test 27: assistance makes a set cheaper, not dearer ────────────────────
{
  const assisted = calculateCalories(
    "Assisted Pull up",
    {
      duration_min: 10,
      rest_sec: 60,
      strength_sets: sq(8, 30, 4),
    },
    male70,
  );
  const unassisted = calculateCalories(
    "Pull Up",
    {
      duration_min: 10,
      rest_sec: 60,
      strength_sets: sq(8, 0, 4),
    },
    male70,
  );
  assert.ok(
    assisted.kcal < unassisted.kcal,
    `T27 assisted (${assisted.kcal}) must cost less than unassisted (${unassisted.kcal})`,
  );
  console.log(
    `✓ T27 assisted ${assisted.kcal} kcal < unassisted ${unassisted.kcal} kcal`,
  );
}

// ── Test 28: an unknown exercise still answers, at low confidence ──────────
{
  const s = summarizeStrength("Nonexistent Lift", sq(10, 40, 3), 60, 70);
  assert.strictEqual(
    s?.met_resolved,
    false,
    "T28 an unknown name must report an unresolved MET",
  );
  assert.strictEqual(confidenceTier("STRENGTH_SETS", false), "low");
  assert.strictEqual(confidenceTier("STRENGTH_SETS", true), "medium");
  assert.strictEqual(confidenceTier("HEART_RATE", false), "high");
  console.log(`✓ T28 unknown name -> low confidence, MET defaulted to 5.0`);
}

// ── Test 29: MUSCLE_MET and LOAD_REF cover every muscle group ──────────────
// A renamed or added group would not throw — every exercise in it would quietly
// fall to the default MET. This is the check that makes that loud.
{
  const groups = Object.keys(EXERCISES_DB).sort();
  assert.deepStrictEqual(
    Object.keys(MUSCLE_MET).sort(),
    groups,
    "T29 MUSCLE_MET keys must match EXERCISES_DB exactly",
  );
  assert.deepStrictEqual(
    Object.keys(LOAD_REF).sort(),
    groups,
    "T29 LOAD_REF keys must match EXERCISES_DB exactly",
  );
  console.log(
    `✓ T29 both strength tables cover all ${groups.length} muscle groups`,
  );
}

// ── Test 30: the reported range widens as confidence drops ────────────────
{
  const high = calorieRange(200, "high");
  const low = calorieRange(200, "low");
  assert.deepStrictEqual(high, { low: 180, high: 220 });
  assert.deepStrictEqual(low, { low: 140, high: 260 });
  assert.strictEqual(
    calorieRange(0, "low").low,
    0,
    "T30 a range must never go negative",
  );
  console.log(
    `✓ T30 bands: high ${high.low}-${high.high}, low ${low.low}-${low.high}`,
  );
}

console.log("\n✅ Strength tests passed.");
