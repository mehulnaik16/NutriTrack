export const activityMultipliers: Record<string, number> = {
  Sedentary: 1.2,
  "Lightly Active": 1.375,
  "Moderately Active": 1.55,
  "Very Active": 1.725,
  "Super Active": 1.9,
};

export function calcBMI(weightKg: number, heightCm: number) {
  if (!weightKg || !heightCm) return 0;
  const m = heightCm / 100;
  return +(weightKg / (m * m)).toFixed(1);
}

export function bmiCategory(bmi: number) {
  if (!bmi) return "";
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25)   return "Normal";
  if (bmi < 30)   return "Overweight";
  if (bmi < 35)   return "Obesity Class I";
  if (bmi < 40)   return "Obesity Class II";
  return "Obesity Class III";
}

export function calcBMR(
  weightKg: number,
  heightCm: number,
  age: number,
  gender: string,
) {
  if (!weightKg || !heightCm || !age) return 0;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(gender === "Female" ? base - 161 : base + 5);
}

export function calcTDEE(bmr: number, activity: string) {
  const mult = activityMultipliers[activity] ?? 1.2;
  return Math.round(bmr * mult);
}

// ─── Goal multipliers (% of TDEE) ────────────────────────────────────────────
// Source: NutriTrack Nutrition Calculation Engine spec
const GOAL_MULTIPLIERS: Record<string, number> = {
  maintain:    1.00,
  lose_0_25kg: 0.90,   // −10% TDEE
  lose_0_5kg:  0.80,   // −20% TDEE
  lose_0_75kg: 0.70,   // −30% TDEE
  gain_muscle: 1.10,   // legacy key → same as gain_0_25kg
  gain_0_25kg: 1.10,   // +10% TDEE
  gain_0_5kg:  1.20,   // +20% TDEE
  gain_0_75kg: 1.30,   // +30% TDEE
};

// ─── Primary goal options shown as radio cards in the UI ──────────────────────
export const PRIMARY_GOALS = [
  { value: "lose",     label: "Lose Weight",                    emoji: "🔥" },
  { value: "maintain", label: "Maintain Weight and Gain Muscle", emoji: "⚖️" },
  { value: "gain",     label: "Gain Muscle",                    emoji: "💪" },
] as const;

// ─── Rate sub-options shown when user selects "lose" ─────────────────────────
export const LOSE_RATE_OPTIONS = [
  { value: "lose_0_25kg", label: "0.25 kg / week", detail: "Very conservative · −250 kcal/day" },
  { value: "lose_0_5kg",  label: "0.5 kg / week",  detail: "Steady & healthy · −500 kcal/day (NHS)" },
  { value: "lose_0_75kg", label: "0.75 kg / week", detail: "Aggressive · −750 kcal/day" },
] as const;

export const GAIN_RATE_OPTIONS = [
  { value: "gain_0_25kg", label: "0.25 kg / week", detail: "Lean bulk · +250 kcal/day" },
  { value: "gain_0_5kg",  label: "0.5 kg / week",  detail: "Standard bulk · +500 kcal/day" },
  { value: "gain_0_75kg", label: "0.75 kg / week", detail: "Aggressive bulk · +750 kcal/day" },
] as const;

/** Resolves the DB-stored goal key from the two-step UI selections. */
export function resolveGoalKey(primary: string, rate?: string): string {
  if (primary === "lose") return rate ?? "lose_0_25kg";
  if (primary === "gain") return rate ?? "gain_0_25kg";
  return "maintain";
}

/** Decomposes a stored DB key back into UI state (for profile edit pre-fill). */
export function decomposeGoalKey(key: string): { primary: string; loseRate?: string } {
  if (key === "lose_0_25kg") return { primary: "lose", loseRate: "lose_0_25kg" };
  if (key === "lose_0_5kg")  return { primary: "lose", loseRate: "lose_0_5kg" };
  if (key === "lose_0_75kg") return { primary: "lose", loseRate: "lose_0_75kg" };
  if (key === "gain_0_25kg") return { primary: "gain", loseRate: "gain_0_25kg" };
  if (key === "gain_0_5kg")  return { primary: "gain", loseRate: "gain_0_5kg" };
  if (key === "gain_0_75kg") return { primary: "gain", loseRate: "gain_0_75kg" };
  if (key === "gain_muscle") return { primary: "gain", loseRate: "gain_0_25kg" }; // legacy → default
  return { primary: "maintain" };
}

export function calcCalorieTarget(tdee: number, goalKey: string, gender: string) {
  const multiplier = GOAL_MULTIPLIERS[goalKey] ?? 1.00;
  const minCalories = gender === "Female" ? 1200 : 1500;
  return Math.max(Math.round(tdee * multiplier), minCalories);
}

/**
 * Spec: protein & fat from g/kg bodyweight, carbs from remaining calories.
 * Protein: loss=2.2 | maintain=1.8 | gain=2.0  g/kg
 * Fat:     loss=0.8 | maintain=0.9 | gain=1.0  g/kg
 * Carbs:   (targetCalories − proteinKcal − fatKcal) ÷ 4
 * Fiber:   14 g per 1000 kcal
 */
export function calcMacros(calories: number, goalKey: string, weightKg: number) {
  const isLoss = goalKey.startsWith("lose");
  const isGain = goalKey.startsWith("gain");

  const protein = Math.round(weightKg * (isLoss ? 2.2 : isGain ? 2.0 : 1.8));
  const fat     = Math.round(weightKg * (isLoss ? 0.8 : isGain ? 1.0 : 0.9));

  const remaining = Math.max(calories - protein * 4 - fat * 9, 0);
  const carbs     = Math.round(remaining / 4);
  const fiber     = Math.round((calories / 1000) * 14);

  return { protein, carbs, fat, fiber };
}

/** Base water intake: 35 mL × bodyweight (kg). Add 500–1000 mL for exercise/heat. */
export function calcWater(weightKg: number): number {
  return Math.round(weightKg * 35);
}
