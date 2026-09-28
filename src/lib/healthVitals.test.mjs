import assert from "node:assert/strict";
import {
  evaluateHypertension,
  evaluateDiabetes,
  sanitizeNumericInput,
  validateBloodPressure,
  validateBloodGlucose,
} from "./healthVitals.ts";

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

// ─── Input Sanitization Tests ───
test("sanitizes numeric input: removes non-digits, decimals, negatives", () => {
  assert.equal(sanitizeNumericInput("120"), "120");
  assert.equal(sanitizeNumericInput("120.5"), "1205");
  assert.equal(sanitizeNumericInput("-80"), "80");
  assert.equal(sanitizeNumericInput("abc130def"), "130");
  assert.equal(sanitizeNumericInput("   "), "");
});

// ─── Blood Pressure Validation Tests ───
test("validates valid BP range and cross-validation", () => {
  const valid = validateBloodPressure("120", "80");
  assert.equal(valid.ok, true);
  assert.equal(valid.systolic, 120);
  assert.equal(valid.diastolic, 80);

  // Systolic must be strictly greater than diastolic
  const inverted = validateBloodPressure("80", "120");
  assert.equal(inverted.ok, false);
  assert.equal(inverted.diastolicError, "Diastolic must be lower than systolic.");

  const equal = validateBloodPressure("100", "100");
  assert.equal(equal.ok, false);
  assert.equal(equal.diastolicError, "Diastolic must be lower than systolic.");

  // Out of bounds
  const lowSys = validateBloodPressure("40", "35");
  assert.equal(lowSys.ok, false);
  assert.match(lowSys.systolicError, /50–280/);

  const highSys = validateBloodPressure("290", "80");
  assert.equal(highSys.ok, false);
  assert.match(highSys.systolicError, /50–280/);

  const lowDia = validateBloodPressure("120", "20");
  assert.equal(lowDia.ok, false);
  assert.match(lowDia.diastolicError, /30–180/);

  const highDia = validateBloodPressure("200", "190");
  assert.equal(highDia.ok, false);
  assert.match(highDia.diastolicError, /30–180/);
});

// ─── InSH 2023 Blood Pressure Inference Tests ───
test("InSH 2023: Optimal (<120 and <80)", () => {
  const r = evaluateHypertension(115, 75);
  assert.equal(r.category, "Optimal");
  assert.equal(r.color, "#2E7D32");
  assert.equal(r.pulse, false);
});

test("InSH 2023: Normal (120–129 and 80–84)", () => {
  const r = evaluateHypertension(122, 82);
  assert.equal(r.category, "Normal");
  assert.equal(r.color, "#2E7D32");
});

test("InSH 2023: High-Normal (130–139 or 85–89)", () => {
  const r = evaluateHypertension(135, 84);
  assert.equal(r.category, "High-Normal");
  assert.equal(r.color, "#F9A825");
});

test("InSH 2023: Grade 1 Hypertension (140–159 or 90–99)", () => {
  const r = evaluateHypertension(145, 92);
  assert.equal(r.category, "Grade 1 Hypertension");
  assert.equal(r.color, "#EF6C00");
});

test("InSH 2023: Grade 2 Hypertension (160–179 or 100–109)", () => {
  const r = evaluateHypertension(165, 102);
  assert.equal(r.category, "Grade 2 Hypertension");
  assert.equal(r.color, "#C62828");
  assert.equal(r.pulse, false);
});

test("InSH 2023: Grade 3 Hypertension (≥180 or ≥110, pulsing)", () => {
  const r1 = evaluateHypertension(185, 100);
  assert.equal(r1.category, "Grade 3 Hypertension");
  assert.equal(r1.pulse, true);

  const r2 = evaluateHypertension(150, 115);
  assert.equal(r2.category, "Grade 3 Hypertension");
  assert.equal(r2.pulse, true);
});

test("InSH 2023: Low BP / Hypotension (<90 or <60)", () => {
  const r1 = evaluateHypertension(85, 55);
  assert.equal(r1.category, "Low BP (Hypotension)");
  assert.equal(r1.color, "#1565C0");
});

test("InSH 2023: Higher category priority rule", () => {
  // 130 sys (High-Normal) and 90 dia (Grade 1) -> Grade 1 Hypertension
  const r1 = evaluateHypertension(130, 90);
  assert.equal(r1.category, "Grade 1 Hypertension");
  assert.equal(r1.color, "#EF6C00");

  // 165 sys (Grade 2) and 85 dia (High-Normal) -> Grade 2 Hypertension
  const r2 = evaluateHypertension(165, 85);
  assert.equal(r2.category, "Grade 2 Hypertension");
});

// ─── Blood Glucose Validation Tests ───
test("validates blood glucose bounds", () => {
  const normal = validateBloodGlucose("95");
  assert.equal(normal.ok, true);
  assert.equal(normal.glucose, 95);

  // Below 50 mg/dL is blocked from logging
  const severeLow = validateBloodGlucose("45");
  assert.equal(severeLow.ok, false);
  assert.match(severeLow.error, /below 50 mg\/dL are not loggable/);

  // Above 1800 mg/dL is capped to 1800
  const capped = validateBloodGlucose("1900");
  assert.equal(capped.ok, true);
  assert.equal(capped.glucose, 1800);
  assert.equal(capped.capped, true);
  assert.match(capped.warning, /Maximum loggable value reached/);
});

// ─── Diabetes Inference Tests ───
test("Diabetes: Hypoglycaemia (50–69 mg/dL)", () => {
  const r = evaluateDiabetes(60);
  assert.equal(r.category, "Hypoglycaemia (Low)");
  assert.equal(r.color, "#1565C0");
});

test("Diabetes: Normal fasting (70–99 mg/dL)", () => {
  const r = evaluateDiabetes(85);
  assert.equal(r.category, "Normal");
  assert.equal(r.color, "#2E7D32");
});

test("Diabetes: Prediabetes (100–125 mg/dL)", () => {
  const r = evaluateDiabetes(110);
  assert.equal(r.category, "Prediabetes");
  assert.equal(r.color, "#F9A825");
});

test("Diabetes: Diabetes range (126–199 mg/dL)", () => {
  const r = evaluateDiabetes(140);
  assert.equal(r.category, "Diabetes");
  assert.equal(r.color, "#EF6C00");
});

test("Diabetes: High Hyperglycaemia (200–399 mg/dL)", () => {
  const r = evaluateDiabetes(250);
  assert.equal(r.category, "High Hyperglycaemia");
  assert.equal(r.color, "#C62828");
  assert.equal(r.pulse, false);
});

test("Diabetes: Severe Hyperglycaemia (400–1799 mg/dL, pulsing)", () => {
  const r = evaluateDiabetes(500);
  assert.equal(r.category, "Severe Hyperglycaemia");
  assert.equal(r.pulse, true);
});

test("Diabetes: Extreme (1800 mg/dL, pulsing)", () => {
  const r = evaluateDiabetes(1800);
  assert.equal(r.category, "Extreme (Capped)");
  assert.equal(r.pulse, true);
});

console.log(`\nTests passed: ${passed}`);
