import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SINGLE_FOOD_CALORIES,
  MIN_DAILY_CALORIE_CEILING,
  MAX_DAILY_CALORIE_CEILING,
  DEFAULT_DAILY_CALORIE_TARGET,
  SOFT_WARNING_MULTIPLIER,
  getDailyCalorieCeiling,
  validateFoodLogCalories,
} from "./calorieLimits.ts";

test("Constants are correctly configured", () => {
  assert.equal(MAX_SINGLE_FOOD_CALORIES, 4000);
  assert.equal(MIN_DAILY_CALORIE_CEILING, 5000);
  assert.equal(MAX_DAILY_CALORIE_CEILING, 10000);
  assert.equal(DEFAULT_DAILY_CALORIE_TARGET, 2000);
  assert.equal(SOFT_WARNING_MULTIPLIER, 1.25);
});

test("getDailyCalorieCeiling applies correct clamping and scaling", () => {
  // Missing or null targets use default 2000 -> min(10000, max(5000, 4000)) = 5000
  assert.equal(getDailyCalorieCeiling(null), 5000);
  assert.equal(getDailyCalorieCeiling(undefined), 5000);
  assert.equal(getDailyCalorieCeiling(0), 5000);

  // Low targets hit 5000 floor
  assert.equal(getDailyCalorieCeiling(1200), 5000);
  assert.equal(getDailyCalorieCeiling(1500), 5000);
  assert.equal(getDailyCalorieCeiling(2000), 5000);
  assert.equal(getDailyCalorieCeiling(2500), 5000);

  // Moderate to high targets scale at 2x target
  assert.equal(getDailyCalorieCeiling(3000), 6000);
  assert.equal(getDailyCalorieCeiling(3500), 7000);
  assert.equal(getDailyCalorieCeiling(4500), 9000);

  // Extreme targets hit 10000 ceiling
  assert.equal(getDailyCalorieCeiling(5000), 10000);
  assert.equal(getDailyCalorieCeiling(6000), 10000);
  assert.equal(getDailyCalorieCeiling(15000), 10000);
});

test("validateFoodLogCalories allows normal meal within limits", () => {
  const result = validateFoodLogCalories(500, 1000, 2000);
  assert.equal(result.allowed, true);
  assert.equal(result.projectedTotal, 1500);
  assert.equal(result.maxAllowed, 5000);
  assert.equal(result.isOverSoftTarget, false);
  assert.equal(result.reason, undefined);
});

test("validateFoodLogCalories allows zero-calorie foods (Diet Coke / water)", () => {
  const result = validateFoodLogCalories(0, 1500, 2000);
  assert.equal(result.allowed, true);
  assert.equal(result.projectedTotal, 1500);
  assert.equal(result.isOverSoftTarget, false);
});

test("validateFoodLogCalories rejects negative calories", () => {
  const result = validateFoodLogCalories(-50, 1000, 2000);
  assert.equal(result.allowed, false);
  assert.match(result.reason || "", /negative/i);
});

test("validateFoodLogCalories rejects NaN and non-finite values", () => {
  const nanResult = validateFoodLogCalories(NaN, 1000, 2000);
  assert.equal(nanResult.allowed, false);

  const infResult = validateFoodLogCalories(Infinity, 1000, 2000);
  assert.equal(infResult.allowed, false);
});

test("validateFoodLogCalories enforces 4,000 kcal per-item limit", () => {
  // 4000 exact allowed
  const exactResult = validateFoodLogCalories(4000, 0, 2000);
  assert.equal(exactResult.allowed, true);

  // 4001 blocked
  const overResult = validateFoodLogCalories(4001, 0, 2000);
  assert.equal(overResult.allowed, false);
  assert.match(overResult.reason || "", /4,000/);
});

test("validateFoodLogCalories enforces daily ceiling", () => {
  // Current: 4600, incoming: 500 -> projected: 5100 > ceiling 5000
  const result = validateFoodLogCalories(500, 4600, 2000);
  assert.equal(result.allowed, false);
  assert.equal(result.projectedTotal, 5100);
  assert.equal(result.maxAllowed, 5000);
  assert.match(result.reason || "", /Daily limit of 5,000 kcal/);
});

test("validateFoodLogCalories sets isOverSoftTarget when crossing 1.25x target", () => {
  // Target 2000 * 1.25 = 2500 threshold
  // Projected 2600 is <= 5000 ceiling, so allowed = true, but isOverSoftTarget = true
  const result = validateFoodLogCalories(600, 2000, 2000);
  assert.equal(result.allowed, true);
  assert.equal(result.projectedTotal, 2600);
  assert.equal(result.isOverSoftTarget, true);
});

test("validateFoodLogCalories handles edit mode correctly without double counting", () => {
  // Editing existing 800 kcal log to 600 kcal when day total is 3000
  // Projected: 3000 - 800 + 600 = 2800
  const editDown = validateFoodLogCalories(600, 3000, 2000, 800);
  assert.equal(editDown.allowed, true);
  assert.equal(editDown.projectedTotal, 2800);

  // Editing existing 500 kcal log up to 1000 kcal when day total is 4600
  // Projected: 4600 - 500 + 1000 = 5100 > 5000 -> rejected
  const editUpOver = validateFoodLogCalories(1000, 4600, 2000, 500);
  assert.equal(editUpOver.allowed, false);
  assert.equal(editUpOver.projectedTotal, 5100);
  assert.match(editUpOver.reason || "", /attempted: \+500 kcal/);

  // Day already over the ceiling (legacy data): lowering an entry stays allowed
  const editDownOverCeiling = validateFoodLogCalories(500, 6000, 2000, 800);
  assert.equal(editDownOverCeiling.allowed, true);
});
