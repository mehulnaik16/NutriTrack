import assert from "node:assert";
import { calculateCalories } from "./calorieEngine.ts";

const sets = [
  { reps: "10", weight: "20" },
  { reps: "10", weight: "20" },
  { reps: "10", weight: "100" },
];

const strengthSets = sets.map((s) => ({
  reps: parseInt(s.reps, 10),
  weight_kg: parseFloat(s.weight),
}));

const result = calculateCalories(
  "Barbell Row",
  { duration_min: 9, strength_sets: strengthSets },
  { weight_kg: 70, age: 25, gender: "Male" }
);

assert(result.kcal > 0, "Calorie calculation should be positive");
assert.strictEqual(result.method, "STRENGTH_SETS");
console.log("✓ workoutCalcBridge test passed: Barbell Row 3 sets ->", result.kcal, "kcal [STRENGTH_SETS]");
