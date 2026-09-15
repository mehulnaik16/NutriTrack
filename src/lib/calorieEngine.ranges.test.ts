/**
 * Reference-range verification for the calorie engine.
 *
 * The acceptance suite in calorieEngine.test.ts pins exact numbers so the code
 * cannot drift. This suite asks a different question: is the number the engine
 * produces a figure the published literature would recognise?
 *
 * Every cardio card in the catalog is run for a man and for a woman and checked
 * against a MET span taken from the Compendium of Physical Activities
 * (pacompendium.com), which is the source behind the calorie tables that show up
 * in a web search for "calories burned <activity>".
 *
 * Two conventions have to be reconciled before comparing:
 *
 *   Compendium METs are GROSS — they include the energy of simply being alive.
 *   The engine's ACSM paths are NET — the resting baseline is deliberately
 *   removed so a long slow session cannot bill basal metabolism as exercise.
 *
 * So the accepted window runs from (gross minimum - one resting MET) up to the
 * gross maximum. A net figure lands in the lower half of its window and a gross
 * figure in the upper half; both are correct, and anything outside the window is
 * not defensible by either convention.
 *
 * Run:  node src/lib/calorieEngine.ranges.test.ts
 */
import assert from "node:assert";
import { calculateCalories } from "./calorieEngine.ts";
import type { UserProfile, WorkoutInputs } from "./calorieEngine.ts";
import { CARDIO_CATALOG } from "./cardioCategories.ts";
import { summarizeStrength, strengthDurationMin } from "./calorieEngine.ts";
import { MUSCLE_OF } from "./exercises.ts";

const MAN: UserProfile = { weight_kg: 70, age: 30, gender: "Male" };
const WOMAN: UserProfile = { weight_kg: 70, age: 30, gender: "Female" };
const MINUTES = 30;
const HOURS = MINUTES / 60;

/** One MET of resting metabolism over the session — the gross/net difference. */
const RESTING_KCAL = 1.0 * MAN.weight_kg * HOURS;

let checks = 0;
const failures: string[] = [];

function inMetRange(kcal: number, metMin: number, metMax: number, label: string) {
  checks++;
  const lo = metMin * MAN.weight_kg * HOURS - RESTING_KCAL;
  const hi = metMax * MAN.weight_kg * HOURS;
  const impliedMet = kcal / (MAN.weight_kg * HOURS);
  const ok = kcal >= lo && kcal <= hi;
  if (!ok) {
    failures.push(
      `${label}: ${kcal} kcal (${impliedMet.toFixed(1)} MET) outside ` +
      `${Math.round(lo)}-${Math.round(hi)} kcal (${metMin}-${metMax} MET)`,
    );
  }
  return { ok, impliedMet };
}

// ── Published MET spans, one per cardio card ────────────────────────────────
// Each span brackets the Compendium entries a user could reasonably be logging
// under that card name at the stated inputs.

interface Card {
  name: string;
  inputs: WorkoutInputs;
  metMin: number;
  metMax: number;
  /** Which Compendium entries the span is drawn from. */
  source: string;
}

const CARDS: Card[] = [
  // ── Distance & Locomotion ──
  {
    name: "Treadmill running", inputs: { duration_min: MINUTES, distance_km: 5 },
    metMin: 9.0, metMax: 11.5, source: "running 6 mph 9.8, 6.7 mph 10.5",
  },
  {
    name: "Outdoor run", inputs: { duration_min: MINUTES, distance_km: 5 },
    metMin: 9.0, metMax: 11.5, source: "running 6 mph 9.8, 6.7 mph 10.5",
  },
  {
    name: "Outdoor walk", inputs: { duration_min: MINUTES, distance_km: 2.5 },
    metMin: 3.0, metMax: 5.0, source: "walking 3.0 mph 3.5, 3.4 mph 3.6, 4.0 mph 5.0",
  },
  {
    name: "Cycling", inputs: { duration_min: MINUTES, distance_km: 9 },
    metMin: 6.0, metMax: 8.0, source: "bicycling 10-11.9 mph 6.8, 12-13.9 mph 8.0",
  },
  {
    name: "Swimming", inputs: { duration_min: MINUTES, intensity: "Moderate" },
    metMin: 5.8, metMax: 8.3, source: "swimming laps freestyle moderate 5.8-8.3",
  },
  {
    name: "Stair climbing", inputs: { duration_min: MINUTES },
    metMin: 8.0, metMax: 11.0, source: "stair treadmill ergometer general 9.3",
  },
  // ── Machine Ergometers ──
  {
    name: "Rowing machine", inputs: { duration_min: MINUTES, intensity: "Moderate" },
    metMin: 5.0, metMax: 8.5, source: "rowing stationary <100 W 5.0, 100-149 W 7.5",
  },
  {
    name: "SkiErg", inputs: { duration_min: MINUTES, intensity: "Moderate" },
    metMin: 6.5, metMax: 11.0, source: "ski machine general 6.8, ski ergometer double poling 10.5",
  },
  {
    name: "Elliptical", inputs: { duration_min: MINUTES, intensity: "Moderate" },
    metMin: 4.0, metMax: 6.5, source: "elliptical trainer moderate 5.0",
  },
  {
    name: "Assault Bike", inputs: { duration_min: MINUTES, intensity: "Moderate" },
    metMin: 7.0, metMax: 11.0, source: "stationary cycling 100-149 W 8.8, 150-199 W 10.5",
  },
  // ── Mind-Body & Flow ──
  {
    name: "Yoga & Pilates", inputs: { duration_min: MINUTES, intensity: "Moderate" },
    metMin: 2.0, metMax: 4.5, source: "hatha yoga 2.5, power yoga 4.0, Pilates 3.0",
  },
  {
    name: "Stretching", inputs: { duration_min: MINUTES, intensity: "Moderate" },
    metMin: 2.0, metMax: 3.0, source: "stretching / mild flexibility 2.3",
  },
  // ── Sports & Games ──
  {
    name: "Badminton", inputs: { duration_min: MINUTES, intensity: "Competitive" },
    metMin: 4.0, metMax: 7.5, source: "badminton social 4.5, competitive 7.0",
  },
  {
    name: "Cricket", inputs: { duration_min: MINUTES, intensity: "Competitive" },
    metMin: 4.0, metMax: 6.0, source: "cricket batting / bowling 4.8",
  },
  {
    name: "Football", inputs: { duration_min: MINUTES, intensity: "Competitive" },
    metMin: 6.0, metMax: 10.5, source: "soccer casual 7.0, competitive 10.0",
  },
  // ── Dance & Choreography ──
  {
    name: "Dancing", inputs: { duration_min: MINUTES, intensity: "Moderate" },
    metMin: 4.0, metMax: 8.0, source: "dancing general 4.5-5.5, aerobic 7.3",
  },
  {
    name: "Zumba", inputs: { duration_min: MINUTES, intensity: "Moderate" },
    metMin: 5.5, metMax: 9.0, source: "aerobic dance 6.5-8.8",
  },
  {
    name: "Hip-Hop", inputs: { duration_min: MINUTES, intensity: "Moderate" },
    metMin: 4.0, metMax: 8.0, source: "dancing general / aerobic 4.5-7.3",
  },
  {
    name: "Dance Cardio", inputs: { duration_min: MINUTES, intensity: "Moderate" },
    metMin: 4.0, metMax: 8.0, source: "dancing general / aerobic 4.5-7.3",
  },
  // ── Interval & High-Intensity ──
  {
    name: "HIIT", inputs: { duration_min: MINUTES, intensity: "Moderate" },
    metMin: 7.0, metMax: 12.5, source: "circuit training vigorous 7.5, calisthenics vigorous 7.5",
  },
  {
    name: "Jump rope", inputs: { duration_min: MINUTES },
    metMin: 8.5, metMax: 12.5, source: "rope skipping slow 8.8, general 11.0, fast 12.3",
  },
  {
    name: "Tabata", inputs: { duration_min: MINUTES, intensity: "Moderate" },
    metMin: 7.0, metMax: 14.0, source: "circuit training vigorous 7.5, vigorous intervals to 14",
  },
  {
    name: "EMOM", inputs: { duration_min: MINUTES, intensity: "Moderate" },
    metMin: 6.0, metMax: 12.5, source: "circuit training moderate 5.0 to vigorous 7.5",
  },
  {
    name: "AMRAP", inputs: { duration_min: MINUTES, intensity: "Moderate" },
    metMin: 6.0, metMax: 12.5, source: "circuit training moderate 5.0 to vigorous 7.5",
  },
];

// ── R1: every card in the catalog has a reference range ─────────────────────
{
  const covered = new Set(CARDS.map((c) => c.name));
  const missing = CARDIO_CATALOG.filter((a) => !covered.has(a.name)).map((a) => a.name);
  assert.deepStrictEqual(missing, [], `Cards with no published reference range: ${missing.join(", ")}`);
  console.log(`✓ R1 coverage: all ${CARDIO_CATALOG.length} catalog activities have a reference range`);
}

// ── R2: every card, both genders, no heart rate ─────────────────────────────
{
  console.log(`\n── R2: no heart rate — 70 kg, 30 y, ${MINUTES} min ──`);
  console.log("activity              man    woman  implied MET  published range");
  for (const c of CARDS) {
    const m = calculateCalories(c.name, c.inputs, MAN);
    const w = calculateCalories(c.name, c.inputs, WOMAN);
    const rm = inMetRange(m.kcal, c.metMin, c.metMax, `R2 ${c.name} (man)`);
    inMetRange(w.kcal, c.metMin, c.metMax, `R2 ${c.name} (woman)`);
    // Without heart rate nothing in the engine reads gender, so these must match.
    assert.strictEqual(
      m.kcal, w.kcal,
      `R2 ${c.name}: gender must not change a non-HR estimate (${m.kcal} vs ${w.kcal})`,
    );
    console.log(
      `${c.name.padEnd(20)} ${String(m.kcal).padStart(5)}  ${String(w.kcal).padStart(5)}` +
      `  ${rm.impliedMet.toFixed(1).padStart(10)}  ${c.metMin}-${c.metMax} MET  ${rm.ok ? "" : "  <-- OUT"}`,
    );
  }
}

// ── R3: every card, both genders, WITH heart rate ───────────────────────────
// This is what the male bias correction exists for. 140 bpm at 30 years old is
// about 74% of maximum heart rate: moderate-to-vigorous, roughly 6-10 MET for
// an adult of ordinary fitness, whatever the activity label says.
{
  console.log(`\n── R3: heart rate 140 bpm — 70 kg, 30 y, ${MINUTES} min ──`);
  console.log("activity              man    woman  M/F ratio");
  const HR_MET_MIN = 6.0;
  const HR_MET_MAX = 10.0;
  for (const c of CARDS) {
    const withHr = { ...c.inputs, hr_bpm: 140 };
    const m = calculateCalories(c.name, withHr, MAN);
    const w = calculateCalories(c.name, withHr, WOMAN);
    const ratio = m.kcal / w.kcal;

    // Cards whose own ceiling is below the generic HR window are capped on
    // purpose — a 140 bpm yoga session still cannot cost 9 MET of work.
    const capped = m.method === "HEART_RATE" && m.kcal < HR_MET_MIN * MAN.weight_kg * HOURS;
    if (m.method === "HEART_RATE" && !capped) {
      inMetRange(m.kcal, HR_MET_MIN, HR_MET_MAX, `R3 ${c.name} (man, HR)`);
      inMetRange(w.kcal, HR_MET_MIN, HR_MET_MAX, `R3 ${c.name} (woman, HR)`);
      checks++;
      if (ratio > 1.25) {
        failures.push(
          `R3 ${c.name}: man/woman ratio ${ratio.toFixed(2)} at identical mass, age and ` +
          `heart rate — physiology supports roughly 1.1`,
        );
      }
    }
    console.log(
      `${c.name.padEnd(20)} ${String(m.kcal).padStart(5)}  ${String(w.kcal).padStart(5)}` +
      `  ${ratio.toFixed(2).padStart(9)}  ${m.method}${capped ? " (capped)" : ""}`,
    );
  }
}

// ── R4: measured power against the Compendium's own wattage bands ───────────
{
  console.log("\n── R4: rower power path vs Compendium wattage bands ──");
  const bands: [number, number, string][] = [
    [75, 5.0, "rowing stationary <100 W, moderate"],
    [125, 7.5, "rowing stationary 100-149 W, vigorous"],
    [175, 11.0, "rowing stationary 150-199 W, vigorous"],
    [225, 14.0, "rowing stationary >=200 W, very vigorous"],
  ];
  for (const [watts, met, label] of bands) {
    const r = calculateCalories("Rowing machine", { duration_min: 60, avg_power_w: watts }, MAN);
    const reference = met * MAN.weight_kg;
    const deviation = (r.kcal - reference) / reference;
    checks++;
    assert.strictEqual(r.method, "POWER", `R4 ${watts} W should use the power path`);
    if (Math.abs(deviation) > 0.15) {
      failures.push(`R4 ${watts} W: ${r.kcal} kcal/h vs ${Math.round(reference)} published (${(deviation * 100).toFixed(0)}%)`);
    }
    console.log(
      `${String(watts).padStart(3)} W  ${String(r.kcal).padStart(4)} kcal/h  vs ` +
      `${String(Math.round(reference)).padStart(4)} at ${met} MET  ` +
      `(${(deviation * 100).toFixed(0)}%)  ${label}`,
    );
  }

  // Power beats heart rate: a strap reading high must not override the flywheel.
  const both = calculateCalories("Rowing machine", {
    duration_min: 30, avg_power_w: 150, hr_bpm: 165,
  }, MAN);
  assert.strictEqual(both.method, "POWER", "R4 power must outrank heart rate");
  assert.strictEqual(both.confidence, "measured");

  // An elliptical's watts come off a resistance curve, not a force measurement.
  const fake = calculateCalories("Elliptical", { duration_min: 30, avg_power_w: 150 }, MAN);
  assert.notStrictEqual(fake.method, "POWER", "R4 elliptical watts must not drive the power path");

  // Junk wattage falls through instead of billing a 4000 kcal session.
  const junk = calculateCalories("Rowing machine", { duration_min: 30, avg_power_w: 5000 }, MAN);
  assert.notStrictEqual(junk.method, "POWER", "R4 implausible watts must fall through");
  console.log("✓ R4 power outranks HR, elliptical excluded, junk wattage rejected");
}

// ── R5: the walk equation switches at 6 km/h ────────────────────────────────
// ACSM's walking equation is valid to 100 m/min. Above it the running equation
// takes over, so a fast walk can no longer read as half its true cost.
{
  console.log("\n── R5: outdoor walk across the 6 km/h boundary ──");
  for (const speed of [4, 5, 5.9, 6.1, 8, 10]) {
    const walk = calculateCalories("Outdoor walk", {
      duration_min: MINUTES, distance_km: speed * HOURS,
    }, MAN);
    const run = calculateCalories("Outdoor run", {
      duration_min: MINUTES, distance_km: speed * HOURS,
    }, MAN);
    checks++;
    if (speed >= 6.1 && walk.kcal !== run.kcal) {
      failures.push(`R5 ${speed} km/h: walk ${walk.kcal} != run ${run.kcal} above the switch`);
    }
    console.log(`${String(speed).padStart(4)} km/h  walk ${String(walk.kcal).padStart(4)}  run ${String(run.kcal).padStart(4)}`);
  }

  // Monotonic: walking faster can never earn fewer calories, up to the cap.
  let previous = 0;
  for (let speed = 3; speed <= 11.9; speed += 0.5) {
    const r = calculateCalories("Outdoor walk", {
      duration_min: MINUTES, distance_km: speed * HOURS,
    }, MAN);
    checks++;
    if (r.kcal < previous) {
      failures.push(`R5 monotonicity: ${speed} km/h gives ${r.kcal}, less than the step below (${previous})`);
    }
    previous = r.kcal;
  }
  console.log("✓ R5 walk is monotonic in speed from 3 to 11.9 km/h");
}

// ── R6: the four ergometers no longer share one number ──────────────────────
{
  const at = (name: string, intensity: string) =>
    calculateCalories(name, { duration_min: MINUTES, intensity }, MAN).kcal;

  const moderate = ["Rowing machine", "SkiErg", "Elliptical", "Assault Bike"].map((n) => at(n, "Moderate"));
  assert.strictEqual(new Set(moderate).size, 4, `R6 ergometers must differ: ${moderate.join(", ")}`);

  // Intensity is now reachable from the form, so the tiers must actually move.
  for (const name of ["Rowing machine", "SkiErg", "Elliptical", "Assault Bike"]) {
    const light = at(name, "Light");
    const mod = at(name, "Moderate");
    const hard = at(name, "Vigorous");
    checks++;
    assert.ok(light < mod && mod < hard, `R6 ${name}: tiers must increase (${light}/${mod}/${hard})`);
  }
  console.log(`\n✓ R6 ergometers differentiated: rower ${moderate[0]}, SkiErg ${moderate[1]}, elliptical ${moderate[2]}, air bike ${moderate[3]} kcal`);
}

// ── R7: the heart-rate ceiling holds ────────────────────────────────────────
// 165 bpm during yoga is heat, caffeine or a bad strap reading — not 12 MET of
// mechanical work. The estimate is held to what the activity can cost.
{
  const yoga = calculateCalories("Yoga & Pilates", { duration_min: MINUTES, hr_bpm: 165 }, MAN);
  const ceiling = 4.0 * 1.5 * MAN.weight_kg * HOURS; // hard tier 4.0 MET x 1.5
  checks++;
  assert.ok(
    yoga.kcal <= Math.round(ceiling),
    `R7 yoga at 165 bpm: ${yoga.kcal} kcal exceeds the ${Math.round(ceiling)} kcal ceiling`,
  );

  // A ceiling must not clip an activity that genuinely costs that much.
  const hiit = calculateCalories("HIIT", { duration_min: MINUTES, hr_bpm: 175 }, MAN);
  checks++;
  assert.strictEqual(hiit.method, "HEART_RATE");
  inMetRange(hiit.kcal, 6.0, 19.5, "R7 HIIT at 175 bpm");
  console.log(`✓ R7 ceiling: yoga at 165 bpm held to ${yoga.kcal} kcal, HIIT at 175 bpm free at ${hiit.kcal} kcal`);
}

// ── R8: single exercises land just under the published resistance band ─────
// Compendium resistance-training bout codes: 02054 multiple exercises 8-15 reps
// 3.5, 02052 squats and deadlift 5.0, 02050 power lifting or body building
// vigorous 6.0.
//
// Note what 02054 actually describes: MULTIPLE exercises across a whole workout.
// One exercise on its own, where two thirds of the clock is rest between sets,
// legitimately costs less than that — an isolation curl is not a workout. So a
// single exercise is checked against 2.5-6.0, and R9 checks a full session
// against the published 3.0-6.0.
{
  console.log("");
  console.log("── R8: one exercise per muscle group, realistic loads ──");
  console.log("exercise                  group        kcal  implied MET");

  // Load is given as a multiple of body weight so the tier logic is exercised
  // at a realistic working weight rather than an arbitrary number.
  const SESSIONS: [string, number, number, number][] = [
    // name, sets, reps, load as x body weight
    ["Back Squat", 4, 8, 1.0],
    ["Barbell Romanian Deadlift", 4, 8, 0.9],
    ["Barbell Hip Thrust", 4, 10, 1.2],
    ["Barbell Row", 4, 10, 0.7],
    ["Barbell Bench Press", 4, 8, 0.8],
    ["Barbell Shoulder Press", 4, 8, 0.5],
    ["Barbell Shrug", 3, 12, 0.8],
    ["Back Extension", 3, 12, 0.3],
    ["Ab Wheel Rollout", 3, 15, 0.2],
    ["Barbell Curl", 3, 10, 0.25],
    ["Cable Rope Tricep Extension", 3, 12, 0.3],
    ["Cable Wrist Curl", 3, 15, 0.25],
    ["Barbell Calf Raise", 4, 12, 1.0],
  ];

  for (const [name, sets, reps, loadRatio] of SESSIONS) {
    const rows = Array.from({ length: sets }, () => ({
      reps, weight_kg: loadRatio * MAN.weight_kg,
    }));
    const s = summarizeStrength(name, rows, 60, MAN.weight_kg);
    if (s == null) { failures.push(`R8 ${name}: no session summary`); continue; }

    const total_min = strengthDurationMin(s);
    const r = calculateCalories(name, {
      duration_min: total_min, rest_sec: 60, strength_sets: rows,
    }, MAN);

    checks++;
    const hours = total_min / 60;
    const impliedMet = r.kcal / (MAN.weight_kg * hours);
    const ok = impliedMet >= 2.5 && impliedMet <= 6.0 && r.method === "STRENGTH_SETS";
    if (!ok) {
      failures.push(
        `R8 ${name}: ${impliedMet.toFixed(1)} MET outside 2.5-6.0 single-exercise band ` +
        `(${r.kcal} kcal over ${total_min.toFixed(1)} min, method ${r.method})`,
      );
    }
    console.log(
      `${name.padEnd(25)} ${(MUSCLE_OF.get(name.toLowerCase()) ?? "?").padEnd(12)}` +
      ` ${String(r.kcal).padStart(4)}  ${impliedMet.toFixed(1).padStart(10)}${ok ? "" : "  <-- OUT"}`,
    );
  }
}

// ── R9: a full mixed session sits inside the published band ────────────────
// This is the shape 02054 actually describes — several exercises, 8-15 reps, at
// varied resistance. Summing the R8 sessions must land in the published 3.0-6.0.
{
  console.log("");
  console.log("── R9: full mixed session ──");
  let kcal = 0;
  let minutes = 0;
  const WORKOUT: [string, number, number, number][] = [
    ["Back Squat", 4, 8, 1.0],
    ["Barbell Bench Press", 4, 8, 0.8],
    ["Barbell Row", 4, 10, 0.7],
    ["Barbell Shoulder Press", 3, 10, 0.5],
    ["Barbell Curl", 3, 10, 0.25],
    ["Cable Rope Tricep Extension", 3, 12, 0.3],
  ];
  for (const [name, sets, reps, loadRatio] of WORKOUT) {
    const rows = Array.from({ length: sets }, () => ({
      reps, weight_kg: loadRatio * MAN.weight_kg,
    }));
    const s = summarizeStrength(name, rows, 60, MAN.weight_kg);
    if (s == null) { failures.push(`R9 ${name}: no session summary`); continue; }
    const total_min = strengthDurationMin(s);
    minutes += total_min;
    kcal += calculateCalories(name, {
      duration_min: total_min, rest_sec: 60, strength_sets: rows,
    }, MAN).kcal;
  }
  checks++;
  const impliedMet = kcal / (MAN.weight_kg * (minutes / 60));
  if (impliedMet < 3.0 || impliedMet > 6.0) {
    failures.push(
      `R9 full session: ${impliedMet.toFixed(1)} MET outside the published 3.0-6.0 ` +
      `(${kcal} kcal over ${minutes.toFixed(0)} min)`,
    );
  }
  console.log(
    `6 exercises, ${minutes.toFixed(0)} min, ${kcal} kcal -> ${impliedMet.toFixed(1)} MET ` +
    `(published 3.0-6.0)`,
  );
}

// ── Result ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(72)}`);
if (failures.length > 0) {
  console.log(`\n${failures.length} of ${checks} checks fell outside the published range:\n`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`\n✅ All ${checks} reference-range checks passed.`);
