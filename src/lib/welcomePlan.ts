/**
 * The 8-week weight projection shown on /welcome, built from the quiz answers.
 * Pure so it can be checked without a browser (see welcomePlan.test.ts).
 */
import { resolveGoalKey } from "./nutrition";

export const PLAN_WEEKS = 8;

export interface WeightPlan {
  direction: "lose" | "gain" | "maintain";
  startKg: number;
  endKg: number;
  endDate: Date;
}

/** Weekly change in kg encoded in a goal key ("lose_0_5kg" → 0.5), else 0. */
export function weeklyRateKg(goalKey: string): number {
  const m = /^(?:lose|gain)_(\d+)_(\d+)kg$/.exec(goalKey);
  return m ? Number(`${m[1]}.${m[2]}`) : 0;
}

/** Null when the quiz has no usable weight, so the page shows its generic hero. */
export function weightPlan(
  weightKg: number | undefined,
  goal: string | undefined,
  loseRate: string | undefined,
  today: Date,
): WeightPlan | null {
  if (!weightKg || weightKg <= 0) return null;
  const key = resolveGoalKey(goal ?? "maintain", loseRate || undefined);
  const rate = weeklyRateKg(key);
  const direction = key.startsWith("lose")
    ? "lose"
    : key.startsWith("gain") && rate > 0
      ? "gain"
      : "maintain";
  const delta = direction === "lose" ? -rate : direction === "gain" ? rate : 0;
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + PLAN_WEEKS * 7);
  return {
    direction,
    startKg: weightKg,
    endKg: Math.round((weightKg + delta * PLAN_WEEKS) * 10) / 10,
    endDate,
  };
}

/** "78 kg" / "172 lb", in the unit the user picked in the quiz. */
export function formatWeight(kg: number, unit: "kg" | "lb" = "kg"): string {
  return unit === "lb"
    ? `${Math.round(kg * 2.20462)} lb`
    : `${Math.round(kg * 10) / 10} kg`;
}
