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
import { weightToKg, distToKm } from "./units.ts";

const male70: UserProfile = { weight_kg: 70, age: 30, gender: "Male" };

function within10pct(actual: number, expected: number, label: string) {
  const pct = Math.abs(actual - expected) / expected;
  assert.ok(
    pct <= 0.10,
    `${label}: expected ~${expected}, got ${actual} (${(pct * 100).toFixed(1)}% off)`,
  );
}

// ── Test 1: Cycling with HR → HEART_RATE ~385 kcal ──────────────────────────
{
  const r = calculateCalories("Cycling", {
    duration_min: 30, distance_km: 19, hr_bpm: 141,
  }, male70);
  within10pct(r.kcal, 385, "T1 cycling+HR");
  assert.strictEqual(r.method, "HEART_RATE");
  assert.strictEqual(r.confidence, "measured");
  console.log(`✓ T1 cycling+HR: ${r.kcal} kcal (expected ~385)`);
}

// ── Test 2: Cycling no HR → speed 38 km/h → SPEED_MET ~420 ─────────────────
{
  const r = calculateCalories("Cycling", {
    duration_min: 30, distance_km: 19,
  }, male70);
  within10pct(r.kcal, 420, "T2 cycling speed");
  assert.strictEqual(r.method, "SPEED_MET");
  assert.strictEqual(r.confidence, "estimated");
  console.log(`✓ T2 cycling speed: ${r.kcal} kcal (expected ~420)`);
}

// ── Test 3: Treadmill 20 min, 10 km/h, 5% incline → ACSM ~311 ──────────────
{
  // distance = speed * time = 10 * (20/60) = 3.333 km
  const r = calculateCalories("Treadmill running", {
    duration_min: 20, distance_km: 10 * (20 / 60), incline_pct: 5,
  }, male70);
  within10pct(r.kcal, 286, "T3 treadmill ACSM");
  assert.strictEqual(r.method, "ACSM_TREADMILL");
  assert.strictEqual(r.confidence, "estimated");
  console.log(`✓ T3 treadmill ACSM: ${r.kcal} kcal (expected ~286)`);
}

// ── Test 4: HIIT 5 min + HR 165 → short-interval exception → TIER_MET ~58 ──
{
  const r = calculateCalories("HIIT", {
    duration_min: 5, hr_bpm: 165,
  }, male70);
  within10pct(r.kcal, 58, "T4 HIIT short");
  assert.strictEqual(r.method, "TIER_MET");
  assert.strictEqual(r.confidence, "estimated");
  console.log(`✓ T4 HIIT short: ${r.kcal} kcal (expected ~58)`);
}

// ── Test 5: HR = 14 → rejected → falls through ─────────────────────────────
{
  const r = calculateCalories("Cycling", {
    duration_min: 30, hr_bpm: 14,
  }, male70);
  assert.notStrictEqual(r.method, "HEART_RATE");
  console.log(`✓ T5 HR=14 rejected: method=${r.method}`);
}

// ── Test 6: HR = 220 → rejected → falls through ────────────────────────────
{
  const r = calculateCalories("Cycling", {
    duration_min: 30, hr_bpm: 220,
  }, male70);
  assert.notStrictEqual(r.method, "HEART_RATE");
  console.log(`✓ T6 HR=220 rejected: method=${r.method}`);
}

// ── Test 7: Yoga 60 min → TIER_MET 3.0 × 70 × 1.0 = 210 ───────────────────
{
  const r = calculateCalories("Yoga & Pilates", {
    duration_min: 60,
  }, male70);
  assert.strictEqual(r.kcal, 210);
  assert.strictEqual(r.method, "TIER_MET");
  assert.strictEqual(r.confidence, "estimated");
  console.log(`✓ T7 yoga: ${r.kcal} kcal (expected 210)`);
}

// ── Test 8: Low HR never yields a negative burn (Keytel goes negative <58bpm) ─
{
  const r = calculateCalories("Cycling", {
    duration_min: 30, hr_bpm: 50,
  }, male70);
  assert.ok(r.kcal > 0, `T8 low HR: expected a positive burn, got ${r.kcal}`);
  assert.notStrictEqual(r.method, "HEART_RATE");
  console.log(`✓ T8 HR=50 falls through: ${r.kcal} kcal, method=${r.method}`);
}

// ── Test 9: Stretching has its own MET, not Yoga's ──────────────────────────
{
  const stretch = calculateCalories("Stretching", { duration_min: 60 }, male70);
  const yoga = calculateCalories("Yoga & Pilates", { duration_min: 60 }, male70);
  assert.strictEqual(stretch.kcal, 175); // 2.5 × 70 × 1.0
  assert.notStrictEqual(stretch.kcal, yoga.kcal);
  console.log(`✓ T9 stretching: ${stretch.kcal} kcal (yoga ${yoga.kcal})`);
}

// ── Test 10: Swimming honours intensity instead of a flat MET ───────────────
{
  const light = calculateCalories("Swimming", { duration_min: 60, intensity: "Light" }, male70);
  const hard = calculateCalories("Swimming", { duration_min: 60, intensity: "Vigorous" }, male70);
  assert.strictEqual(light.kcal, 385); // 5.5 × 70
  assert.strictEqual(hard.kcal, 665);  // 9.5 × 70
  console.log(`✓ T10 swimming tiers: ${light.kcal} / ${hard.kcal} kcal`);
}

// ── Test 11: Garbage numeric input never produces NaN ───────────────────────
{
  const r = calculateCalories("Cycling", {
    duration_min: NaN, distance_km: NaN, hr_bpm: NaN,
  }, male70);
  assert.strictEqual(r.kcal, 0);
  const noWeight = calculateCalories("Cycling", { duration_min: 30 }, {
    weight_kg: NaN, age: NaN, gender: "",
  });
  assert.strictEqual(noWeight.kcal, 0);
  console.log(`✓ T11 NaN inputs clamp to 0`);
}

// ── Test 12: Implausible speed falls through to the MET table ──────────────
{
  // 40 km in 20 min = 120 km/h — a mistyped distance, not a ride.
  const r = calculateCalories("Outdoor run", {
    duration_min: 20, distance_km: 40,
  }, male70);
  assert.strictEqual(r.method, "TIER_MET");
  console.log(`✓ T12 implausible speed rejected: ${r.kcal} kcal, method=${r.method}`);
}

// ── Test 13: ACSM paths report which equation actually ran ─────────────────
{
  const run = calculateCalories("Outdoor run", { duration_min: 30, distance_km: 5 }, male70);
  const walk = calculateCalories("Outdoor walk", { duration_min: 30, distance_km: 2.5 }, male70);
  assert.strictEqual(run.method, "ACSM_RUN");
  assert.strictEqual(walk.method, "ACSM_WALK");
  console.log(`✓ T13 ACSM labels: run=${run.method}, walk=${walk.method}`);
}

// ── Test 14: Running distance net invariance (same distance over different times) ──
{
  // 5 km at 70 kg should yield 350 kcal regardless of whether it took 25 min or 45 min
  const fast = calculateCalories("Outdoor run", { duration_min: 25, distance_km: 5 }, male70);
  const slow = calculateCalories("Outdoor run", { duration_min: 45, distance_km: 5 }, male70);
  assert.strictEqual(fast.kcal, 350);
  assert.strictEqual(slow.kcal, 350);
  console.log(`✓ T14 running net invariance: 25m=${fast.kcal} kcal, 45m=${slow.kcal} kcal (both 350)`);
}

// ── Test 15: Female Keytel uses correct negative weight coefficient ─────────
{
  const female60 = { weight_kg: 60, age: 30, gender: "Female" };
  // Keytel female: ((-20.4022 + 0.4472*140 - 0.1263*60 + 0.074*30) / 4.184) * 45
  // = ((-20.4022 + 62.608 - 7.578 + 2.22) / 4.184) * 45 = 36.8478 * 45 / 4.184 = 396.3 -> 396
  const r = calculateCalories("Cycling", { duration_min: 45, hr_bpm: 140 }, female60);
  assert.strictEqual(r.method, "HEART_RATE");
  assert.strictEqual(r.kcal, 396);
  console.log(`✓ T15 female Keytel correct sign: ${r.kcal} kcal (expected 396)`);
}

// ── Test 16: Resting HR (<85 bpm) falls through to category MET ─────────────
{
  const r = calculateCalories("Yoga & Pilates", { duration_min: 60, hr_bpm: 72 }, male70);
  assert.strictEqual(r.method, "TIER_MET");
  assert.strictEqual(r.kcal, 210); // Yoga 3.0 MET * 70
  console.log(`✓ T16 resting HR (72 bpm) falls through to MET: method=${r.method}`);
}

// ── Test 17: Swimming form configuration exposes intensity ─────────────────
{
  const config = configFor("Swimming");
  assert.ok(config.form.intensity, "Swimming must have intensity options in form config");
  assert.deepStrictEqual(Array.from(config.form.intensity), ["Light", "Moderate", "Vigorous"]);
  console.log(`✓ T17 swimming form has intensity: ${config.form.intensity.join(", ")}`);
}

// ── Test 18: Unit invariance across kg/lbs and km/mile combinations ──────────
{
  // Physical reality: 70 kg (~154 lbs) runner covers 5 km (~3.125 miles) in 30 min
  const combinations: Array<{ w: number; wu: "kg" | "lbs"; d: number; du: "km" | "mile"; label: string }> = [
    { w: 70, wu: "kg", d: 5, du: "km", label: "kg + km" },
    { w: 154, wu: "lbs", d: 3.125, du: "mile", label: "lbs + mile" },
    { w: 154, wu: "lbs", d: 5, du: "km", label: "lbs + km" },
    { w: 70, wu: "kg", d: 3.125, du: "mile", label: "kg + mile" },
  ];

  for (const c of combinations) {
    const r = calculateCalories("Outdoor run", {
      duration_min: 30,
      distance_km: distToKm(c.d, c.du),
    }, {
      weight_kg: weightToKg(c.w, c.wu),
      age: 30,
      gender: "Male",
    });
    assert.strictEqual(r.kcal, 350, `${c.label} failed: expected 350 kcal, got ${r.kcal}`);
  }
  console.log(`✓ T18 unit invariance: all 4 unit combinations (kg/lbs × km/mile) yield 350 kcal`);
}

console.log("\n✅ All 18 acceptance tests passed.");
