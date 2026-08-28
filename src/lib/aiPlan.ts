import { supabase } from "@/integrations/client";
import { serverGroqChat } from "@/lib/ai";
import { FITNESS_GOALS, SPLIT_GUIDE, type WorkoutPrefs } from "@/lib/workoutPrefs";

/**
 * Generate an AI workout plan from the user's saved workout preferences and
 * persist it as the user's single workout_plans row (replacing any prior
 * plan). Shared by /workout-setup and /choose-plan so both build the exact
 * same prompt from the same profile inputs.
 */
export async function generateAiPlan(
  userId: string,
  prefs: WorkoutPrefs,
): Promise<void> {
  const goalLabel =
    FITNESS_GOALS.find((g) => g.value === prefs.fitnessGoal)?.label ??
    prefs.fitnessGoal;
  const lifts: string[] = [];
  const { benchPress, squat: sq, deadlift: dl } = prefs.strongestLifts;
  if (benchPress.weight)
    lifts.push(`Bench Press ${benchPress.weight}kg × ${benchPress.reps ?? "?"} reps`);
  if (sq.weight) lifts.push(`Back Squat ${sq.weight}kg × ${sq.reps ?? "?"} reps`);
  if (dl.weight) lifts.push(`Deadlift ${dl.weight}kg × ${dl.reps ?? "?"} reps`);

  const prompt = `You are an expert strength & conditioning coach. Create a ${prefs.trainingDaysPerWeek}-day-per-week gym workout plan.
User profile:
- Experience: ${prefs.fitnessLevel}
- Primary goal: ${goalLabel}
- Session length: about ${prefs.preferredWorkoutTime} minutes
- Prefers training ${prefs.musclesPerWorkout === "not_sure" ? "a coach-recommended number of" : prefs.musclesPerWorkout} muscle group(s) per session
- Enjoys cardio: ${prefs.cardioActivities.length ? prefs.cardioActivities.join(", ") : "none specified"}
${lifts.length ? `- Current strength: ${lifts.join("; ")}` : ""}
Return ONLY valid JSON, no markdown. FORMAT EXAMPLE ONLY (shows the shape — do NOT
copy its exercises, day name, or focus; build the real plan from the user profile
above):
{
  "goal": "${goalLabel}",
  "days_per_week": ${prefs.trainingDaysPerWeek},
  "days": [
    {
      "day": "Day 1",
      "name": "Push Day",
      "focus": "Chest, Shoulders & Triceps",
      "exercises": [{ "name": "Barbell Bench Press", "sets": 4, "reps": "8-10" }]
    }
  ]
}
Hard requirements (this plan MUST reflect the user profile above):
- Exactly ${prefs.trainingDaysPerWeek} entries in "days", labelled "Day 1" … "Day ${prefs.trainingDaysPerWeek}" — not more, not fewer.
- Use this split for a ${prefs.trainingDaysPerWeek}-day week: ${SPLIT_GUIDE[prefs.trainingDaysPerWeek] ?? "a sensible split"}.
- Tailor exercise selection and volume to a ${prefs.fitnessLevel} lifter whose goal is "${goalLabel}".
- ${prefs.preferredWorkoutTime <= 40 ? "4-5" : prefs.preferredWorkoutTime <= 70 ? "5-7" : "6-8"} exercises per day, matched to the ${prefs.preferredWorkoutTime}-minute session length.
- ${prefs.cardioActivities.length ? `The user enjoys ${prefs.cardioActivities.join(", ")} — finish appropriate days with one of these as an exercise (e.g. { "name": "Running", "sets": 1, "reps": "15 min" }).` : "No cardio preference given — keep it strength-focused."}
- Use well-known gym exercise names only.
- "reps" is a string like "8-12", "5", or "30 sec".`;

  const { result: raw } = await serverGroqChat({
    data: {
      prompt,
      model: "openai/gpt-oss-120b",
      max_tokens: 2500,
      temperature: 0.4,
      response_format_json: true,
    },
  });
  const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  if (!parsed?.days || !Array.isArray(parsed.days) || parsed.days.length === 0) {
    throw new Error("The AI returned an invalid plan. Please try again.");
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
      .in("id", old.map((o: any) => o.id));
  }
  const { error } = await supabase.from("workout_plans").insert({
    user_id: userId,
    goal: goalLabel, // NOT NULL column in workout_plans
    plan_json: parsed,
  } as any);
  if (error) throw error;
}
