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

export function calcBMR(weightKg: number, heightCm: number, age: number, gender: string) {
  if (!weightKg || !heightCm || !age) return 0;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(gender === "Female" ? base - 161 : base + 5);
}

export function calcTDEE(bmr: number, activity: string) {
  const mult = activityMultipliers[activity] ?? 1.2;
  return Math.round(bmr * mult);
}

export function calcCalorieTarget(tdee: number, goal: string) {
  if (goal === "Lose Weight") return tdee - 500;
  if (goal === "Gain Muscle") return tdee + 300;
  return tdee;
}

export function calcMacros(calories: number) {
  return {
    protein: Math.round((calories * 0.3) / 4),
    carbs: Math.round((calories * 0.4) / 4),
    fat: Math.round((calories * 0.3) / 9),
  };
}
