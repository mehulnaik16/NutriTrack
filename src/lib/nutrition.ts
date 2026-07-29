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
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obese";
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

// ─── Goal adjustment map (kcal/day) ───────────────────────────────────────────
const GOAL_ADJUSTMENTS: Record<string, number> = {
  maintain:    0,
  lose_0_25kg: -250,
  lose_0_5kg:  -500,
  gain_muscle: +300,
};

// ─── Primary goal options shown as radio cards in the UI ──────────────────────
export const PRIMARY_GOALS = [
  { value: "lose",     label: "Lose Weight",     emoji: "🔥" },
  { value: "maintain", label: "Maintain Weight", emoji: "⚖️" },
  { value: "gain",     label: "Gain Muscle",     emoji: "💪" },
] as const;

// ─── Rate sub-options shown when user selects "lose" ─────────────────────────
export const LOSE_RATE_OPTIONS = [
  { value: "lose_0_25kg", label: "0.25 kg / week", detail: "Very conservative · 250 cal deficit" },
  { value: "lose_0_5kg",  label: "0.5 kg / week",  detail: "Steady & healthy · 500 cal deficit (NHS)" },
] as const;

/** Resolves the DB-stored goal key from the two-step UI selections. */
export function resolveGoalKey(primary: string, loseRate?: string): string {
  if (primary === "lose") return loseRate ?? "lose_0_5kg";
  if (primary === "gain") return "gain_muscle";
  return "maintain";
}

/** Decomposes a stored DB key back into UI state (for profile edit pre-fill). */
export function decomposeGoalKey(key: string): { primary: string; loseRate?: string } {
  if (key === "lose_0_25kg") return { primary: "lose", loseRate: "lose_0_25kg" };
  if (key === "lose_0_5kg")  return { primary: "lose", loseRate: "lose_0_5kg" };
  if (key === "gain_muscle") return { primary: "gain" };
  return { primary: "maintain" };
}

export function calcCalorieTarget(tdee: number, goalKey: string, gender: string) {
  const adjusted = tdee + (GOAL_ADJUSTMENTS[goalKey] ?? 0);
  const minCalories = gender === "Female" ? 1200 : 1500;
  return Math.max(Math.round(adjusted), minCalories);
}

export function calcMacros(calories: number, goalKey: string) {
  const isLoss     = goalKey.startsWith("lose");
  const proteinPct = isLoss ? 0.35 : 0.30;
  const fatPct     = isLoss ? 0.25 : 0.30;
  const carbPct    = 1 - proteinPct - fatPct; // always 0.40
  return {
    protein: Math.round((calories * proteinPct) / 4),
    carbs:   Math.round((calories * carbPct)    / 4),
    fat:     Math.round((calories * fatPct)     / 9),
    fiber:   30,
  };
}
