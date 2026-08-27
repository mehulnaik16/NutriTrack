/**
 * Runnable checks for the measurement bounds.
 * Run: node scripts/../src/lib/measurements.test.mjs  (or: node src/lib/measurements.test.mjs)
 *
 * The source is TypeScript, and this repo has no test runner or TS loader
 * wired up (see src/lib/__cycle.test.mjs, which cannot run for that reason),
 * so the pure logic is restated here and checked against the same cases. If
 * measurements.ts changes shape, this file must change with it.
 */

import assert from "node:assert/strict";

const WEIGHT_KG = { min: 30, max: 200, unit: "kg", label: "Weight" };
const GOAL_WEIGHT_KG = { ...WEIGHT_KG, label: "Goal weight" };
const HEIGHT_CM = { min: 100, max: 250, unit: "cm", label: "Height" };
const AGE_YEARS = { min: 16, max: 100, unit: "", label: "Age" };

function validateMeasurement(raw, range) {
  const value = typeof raw === "number" ? raw : parseFloat(String(raw).trim());
  if (!Number.isFinite(value)) {
    return { ok: false, error: `Enter a ${range.label.toLowerCase()}.` };
  }
  if (value < range.min || value > range.max) {
    const unit = range.unit ? ` ${range.unit}` : "";
    return {
      ok: false,
      error: `${range.label} must be between ${range.min}${unit} and ${range.max}${unit}.`,
    };
  }
  return { ok: true, value: Math.round(value * 10) / 10 };
}

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

test("the reported bug: a 1 kg goal weight is rejected", () => {
  const r = validateMeasurement("1", GOAL_WEIGHT_KG);
  assert.equal(r.ok, false);
  assert.equal(r.error, "Goal weight must be between 30 kg and 200 kg.");
});

test("accepts ordinary weights", () => {
  assert.deepEqual(validateMeasurement("82.5", WEIGHT_KG), { ok: true, value: 82.5 });
  assert.deepEqual(validateMeasurement(70, WEIGHT_KG), { ok: true, value: 70 });
});

test("bounds are inclusive at both ends", () => {
  assert.equal(validateMeasurement(30, WEIGHT_KG).ok, true);
  assert.equal(validateMeasurement(200, WEIGHT_KG).ok, true);
  assert.equal(validateMeasurement(29.9, WEIGHT_KG).ok, false);
  assert.equal(validateMeasurement(200.1, WEIGHT_KG).ok, false);
});

test("rejects zero and negatives", () => {
  assert.equal(validateMeasurement(0, WEIGHT_KG).ok, false);
  assert.equal(validateMeasurement(-70, WEIGHT_KG).ok, false);
});

test("rejects a blank field rather than reading it as zero", () => {
  // `+""` is 0, which would otherwise pass straight through to the database.
  const r = validateMeasurement("", WEIGHT_KG);
  assert.equal(r.ok, false);
  assert.equal(r.error, "Enter a weight.");
  assert.equal(validateMeasurement("   ", WEIGHT_KG).ok, false);
});

test("rejects text and infinities", () => {
  assert.equal(validateMeasurement("abc", WEIGHT_KG).ok, false);
  assert.equal(validateMeasurement(Infinity, WEIGHT_KG).ok, false);
  assert.equal(validateMeasurement(NaN, WEIGHT_KG).ok, false);
});

test("rounds to one decimal, matching the inputs' step", () => {
  assert.equal(validateMeasurement("82.46", WEIGHT_KG).value, 82.5);
  assert.equal(validateMeasurement("82.44", WEIGHT_KG).value, 82.4);
});

test("height uses its own range and wording", () => {
  assert.equal(validateMeasurement(175, HEIGHT_CM).ok, true);
  const r = validateMeasurement(5.9, HEIGHT_CM);
  assert.equal(r.ok, false, "feet typed into a centimetres field");
  assert.equal(r.error, "Height must be between 100 cm and 250 cm.");
});

test("age omits the unit from the message", () => {
  assert.equal(validateMeasurement(30, AGE_YEARS).ok, true);
  assert.equal(validateMeasurement(15, AGE_YEARS).error, "Age must be between 16 and 100.");
});

test("bounds match the quiz sliders they mirror", () => {
  // quiz.tsx: weight slider min=30 max=200, height slider min=100 max=250,
  // and it refuses to advance below age 16. Drift here is a real bug.
  assert.equal(WEIGHT_KG.min, 30);
  assert.equal(WEIGHT_KG.max, 200);
  assert.equal(HEIGHT_CM.min, 100);
  assert.equal(HEIGHT_CM.max, 250);
  assert.equal(AGE_YEARS.min, 16);
});

console.log(`${passed} checks passed`);
