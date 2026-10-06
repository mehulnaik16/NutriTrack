import { supabase } from "@/integrations/client";
import { serverWorkoutPlan } from "@/lib/ai";
import {
  FITNESS_GOALS,
  FITNESS_LEVELS,
  type WorkoutPrefs,
} from "@/lib/workoutPrefs";
import { EXERCISES_DB } from "@/lib/exercises";
import { decomposeGoalKey } from "@/lib/nutrition";

/** Human phrase for the user's nutrition goal, for the workout prompt. */
const GOAL_PHRASE: Record<string, string> = {
  lose: "losing fat (calorie deficit)",
  maintain: "maintaining weight / body recomposition",
  gain: "gaining muscle (calorie surplus)",
};

/** Lowercased name → canonical spelling, so we can reconcile the AI's output
 *  back to the app's exact names (same reconciliation library plans get). Built
 *  from the FULL EXERCISES_DB, so any catalog exercise resolves. */
const CANONICAL_BY_LOWER = new Map<string, string>();
for (const names of Object.values(EXERCISES_DB)) {
  for (const n of names) CANONICAL_BY_LOWER.set(n.toLowerCase(), n);
}

/**
 * Generate an AI workout plan from the user's saved workout preferences and
 * persist it as the user's single workout_plans row (replacing any prior
 * plan). Shared by /workout-setup and /choose-plan so both send the exact
 * same athlete answers; the coach prompt itself lives in lib/workoutPrompt.ts.
 */
export async function generateAiPlan(
  userId: string,
  prefs: WorkoutPrefs,
): Promise<void> {
  const goalLabel =
    FITNESS_GOALS.find((g) => g.value === prefs.fitnessGoal)?.label ??
    prefs.fitnessGoal;
  const levelDetail = FITNESS_LEVELS.find(
    (l) => l.value === prefs.fitnessLevel,
  )?.detail;
  const lifts: string[] = [];
  const { benchPress, squat: sq, deadlift: dl } = prefs.strongestLifts;
  if (benchPress.weight)
    lifts.push(
      `Bench Press ${benchPress.weight}kg x ${benchPress.reps ?? "?"} reps`,
    );
  if (sq.weight)
    lifts.push(`Back Squat ${sq.weight}kg x ${sq.reps ?? "?"} reps`);
  if (dl.weight) lifts.push(`Deadlift ${dl.weight}kg x ${dl.reps ?? "?"} reps`);

  // Age, sex, bodyweight and nutrition goal change programming; height and
  // activity add little the training frequency doesn't already say.
  const { data: up } = await supabase
    .from("user_profiles")
    .select("age, gender, weight_kg, goal")
    .eq("id", userId)
    .maybeSingle();
  const physical: string[] = [];
  if (up?.age) physical.push(`Age ${up.age}`);
  if (up?.gender) physical.push(String(up.gender));
  if (up?.weight_kg) physical.push(`${up.weight_kg} kg`);
  const goalPrimary = up?.goal ? decomposeGoalKey(up.goal).primary : null;
  if (goalPrimary && GOAL_PHRASE[goalPrimary])
    physical.push(`Nutrition goal: ${GOAL_PHRASE[goalPrimary]}`);

  const muscles = String(prefs.musclesPerWorkout) as
    | "1"
    | "2"
    | "3"
    | "not_sure";
  const athlete = [
    "ATHLETE",
    `- Experience: ${prefs.fitnessLevel}${levelDetail ? ` (${levelDetail})` : ""}`,
    `- Training goal: ${goalLabel}`,
    `- Days per week: ${prefs.trainingDaysPerWeek}`,
    `- Session length: ${prefs.preferredWorkoutTime} min`,
    `- Muscles per session: ${muscles === "not_sure" ? "not sure" : muscles}`,
    `- Cardio: ${prefs.cardioActivities.length ? prefs.cardioActivities.join(", ") : "none"}`,
    ...(physical.length ? [`- ${physical.join(" | ")}`] : []),
    ...(lifts.length ? [`- Lifts: ${lifts.join("; ")}`] : []),
  ].join("\n");

  const { result: raw } = await serverWorkoutPlan({
    data: {
      athlete,
      fitnessGoal: prefs.fitnessGoal,
      musclesPerWorkout: muscles,
    },
  });
  const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  if (
    !parsed?.days ||
    !Array.isArray(parsed.days) ||
    parsed.days.length === 0
  ) {
    throw new Error("The AI returned an invalid plan. Please try again.");
  }

  // Reconcile exercise names back to the app's canonical spelling (case-only
  // drift), so AI plans pin/favorite/log against EXERCISES_DB like library
  // plans do. Names not in the catalog are left untouched, never dropped.
  for (const day of parsed.days) {
    for (const ex of day?.exercises ?? []) {
      if (ex?.name) {
        ex.name =
          CANONICAL_BY_LOWER.get(String(ex.name).toLowerCase()) ?? ex.name;
      }
    }
  }

  // Replace any previous plan
  const { data: old } = await supabase
    .from("workout_plans")
    .select("id")
    .eq("user_id", userId);
  if (old && old.length > 0) {
    await supabase
      .from("workout_plans")
      .delete()
      .in(
        "id",
        old.map((o) => o.id),
      );
  }
  const { error } = await supabase.from("workout_plans").insert({
    user_id: userId,
    goal: goalLabel, // NOT NULL column in workout_plans
    plan_json: parsed,
  });
  if (error) throw error;
}
