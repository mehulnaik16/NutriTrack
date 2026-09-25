/**
 * Calorie abuse limiter constants and validation utilities.
 * Enforces per-item bounds and dynamic daily intake ceilings
 * to protect leaderboard and telemetry integrity.
 */

export const MAX_SINGLE_FOOD_CALORIES = 4000;
export const MIN_DAILY_CALORIE_CEILING = 5000;
export const MAX_DAILY_CALORIE_CEILING = 10000;
export const DEFAULT_DAILY_CALORIE_TARGET = 2000;
export const SOFT_WARNING_MULTIPLIER = 1.25;

export interface FoodLogValidationResult {
  allowed: boolean;
  reason?: string;
  projectedTotal: number;
  maxAllowed: number;
  isOverSoftTarget: boolean;
}

/**
 * Calculates the dynamic daily ceiling for calorie intake.
 * Formula: min(10000, max(5000, round(daily_target * 2.0)))
 */
export function getDailyCalorieCeiling(dailyTarget?: number | null): number {
  const target =
    dailyTarget != null && dailyTarget > 0
      ? dailyTarget
      : DEFAULT_DAILY_CALORIE_TARGET;
  const scaled = Math.round(target * 2);
  return Math.min(
    MAX_DAILY_CALORIE_CEILING,
    Math.max(MIN_DAILY_CALORIE_CEILING, scaled),
  );
}

/**
 * Validates a prospective food log entry or batch against single-item and daily ceilings.
 * Correctly accounts for replaced calories when updating an existing log entry.
 */
export function validateFoodLogCalories(
  incomingCalories: number,
  currentDayCalories: number,
  dailyTarget?: number | null,
  editingOldCalories?: number,
): FoodLogValidationResult {
  const maxAllowed = getDailyCalorieCeiling(dailyTarget);
  const target =
    dailyTarget != null && dailyTarget > 0
      ? dailyTarget
      : DEFAULT_DAILY_CALORIE_TARGET;

  if (
    typeof incomingCalories !== "number" ||
    Number.isNaN(incomingCalories) ||
    !Number.isFinite(incomingCalories)
  ) {
    return {
      allowed: false,
      reason: "Calories must be a valid number",
      projectedTotal: currentDayCalories || 0,
      maxAllowed,
      isOverSoftTarget: false,
    };
  }

  if (incomingCalories < 0) {
    return {
      allowed: false,
      reason: "Calories cannot be negative",
      projectedTotal: currentDayCalories || 0,
      maxAllowed,
      isOverSoftTarget: false,
    };
  }

  if (incomingCalories > MAX_SINGLE_FOOD_CALORIES) {
    return {
      allowed: false,
      reason: `Single food item cannot exceed ${MAX_SINGLE_FOOD_CALORIES.toLocaleString()} kcal`,
      projectedTotal: currentDayCalories || 0,
      maxAllowed,
      isOverSoftTarget: false,
    };
  }

  const safeCurrent =
    typeof currentDayCalories === "number" && !Number.isNaN(currentDayCalories)
      ? currentDayCalories
      : 0;

  const oldCalories =
    typeof editingOldCalories === "number" && !Number.isNaN(editingOldCalories)
      ? Math.max(0, editingOldCalories)
      : 0;

  const projectedTotal = Math.max(
    0,
    safeCurrent - oldCalories + incomingCalories,
  );

  // Lowering an entry never blocks, so days already over the ceiling stay editable.
  if (projectedTotal > maxAllowed && incomingCalories > oldCalories) {
    return {
      allowed: false,
      reason: `Daily limit of ${maxAllowed.toLocaleString()} kcal reached (current: ${Math.round(
        safeCurrent,
      ).toLocaleString()} kcal, attempted: +${Math.round(
        incomingCalories - oldCalories,
      ).toLocaleString()} kcal)`,
      projectedTotal,
      maxAllowed,
      isOverSoftTarget: false,
    };
  }

  const isOverSoftTarget = projectedTotal > target * SOFT_WARNING_MULTIPLIER;

  return {
    allowed: true,
    projectedTotal,
    maxAllowed,
    isOverSoftTarget,
  };
}
