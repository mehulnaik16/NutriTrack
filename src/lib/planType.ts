import { supabase } from "@/integrations/client";
import { isCustomPlan } from "@/lib/musclePlan";
import type { WorkoutPrefs } from "@/lib/workoutPrefs";

/**
 * Derive the display label for the user's current plan type. Reads the real
 * workout_plans row so it can never drift from what the Workout page shows —
 * deleting a plan makes this return "No plan" with no delete-side write.
 */
export async function resolvePlanTypeLabel(
  userId: string,
  preferred: WorkoutPrefs["preferredTrainingPlan"],
): Promise<string> {
  const { data } = await supabase
    .from("workout_plans")
    .select("plan_json")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.plan_json) {
    const pj = data.plan_json as any;
    if (isCustomPlan(pj)) return "Build my own";
    if (pj.source === "library") return "Workout library";
    return "Let AI pick for me";
  }
  return preferred === "skip" ? "Skipped for now" : "No plan";
}
