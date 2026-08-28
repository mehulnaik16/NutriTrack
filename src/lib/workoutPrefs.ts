/**
 * Workout onboarding preferences — stored in the public.workout_profile
 * table (one row per user) with a localStorage fallback + cache, so the
 * app still works if a DB write/read fails.
 *
 * Used across the app:
 *  - AI plan generation (level, goal, days, duration, muscles/session, lifts)
 *  - Default weights for bench/squat/deadlift variations in the gym logger
 *  - "Recommended" sorting + badges on the Cardio tab
 */

import { supabase } from "@/integrations/client";

export interface LiftEntry {
  weight: number | null;
  reps: number | null;
}

export interface WorkoutPrefs {
  fitnessLevel: "beginner" | "intermediate" | "expert" | "pro";
  fitnessGoal: "build_muscle" | "general_fitness" | "conditioning" | "strength";
  strongestLifts: {
    benchPress: LiftEntry;
    squat: LiftEntry;
    deadlift: LiftEntry;
  };
  trainingDaysPerWeek: number;
  cardioActivities: string[]; // "Running" | "Cycling" | "Swimming"
  musclesPerWorkout: 1 | 2 | 3 | "not_sure";
  preferredWorkoutTime: number; // minutes
  preferredTrainingPlan: "ai_generated" | "library" | "custom" | "skip" | "none";
  completedAt?: string;
}

export const FITNESS_LEVELS = [
  { value: "beginner", label: "Beginner", detail: "Less than 1 year" },
  { value: "intermediate", label: "Intermediate", detail: "1–2 years" },
  { value: "expert", label: "Expert", detail: "3+ years" },
  { value: "pro", label: "Pro", detail: "Competitive athlete" },
] as const;

export const FITNESS_GOALS = [
  { value: "build_muscle", label: "Build Muscle & Get Toned", emoji: "💪" },
  { value: "general_fitness", label: "Enhance General Fitness", emoji: "⚡" },
  { value: "conditioning", label: "Improve Conditioning", emoji: "🏃" },
  { value: "strength", label: "Get Stronger (Powerlifting)", emoji: "🏋️" },
] as const;

export const CARDIO_OPTIONS = [
  "Treadmill running",
  "Outdoor run",
  "Outdoor walk",
  "Cycling",
  "Swimming",
  "Jump rope",
  "HIIT",
  "Yoga & Pilates",
  "Stair climbing",
  "Elliptical",
  "Rowing machine",
  "SkiErg",
  "Dancing",
  "Badminton",
  "Cricket",
  "Football",
] as const;

/** Split guidance used in the AI prompt, keyed by training days. */
export const SPLIT_GUIDE: Record<number, string> = {
  1: "Full Body",
  2: "Full Body",
  3: "Push/Pull/Legs or Full Body",
  4: "Upper/Lower",
  5: "Bro Split or Hybrid",
  6: "Push/Pull/Legs twice per week",
  7: "Advanced split with an optional active-recovery day",
};

const lsKey = (userId: string) => `workout_prefs_${userId}`;

/** WorkoutPrefs (app shape) → workout_profile row (DB shape). */
function toRow(userId: string, prefs: WorkoutPrefs) {
  return {
    user_id: userId,
    fitness_level: prefs.fitnessLevel,
    fitness_goal: prefs.fitnessGoal,
    bench_weight_kg: prefs.strongestLifts.benchPress.weight,
    bench_reps: prefs.strongestLifts.benchPress.reps,
    squat_weight_kg: prefs.strongestLifts.squat.weight,
    squat_reps: prefs.strongestLifts.squat.reps,
    deadlift_weight_kg: prefs.strongestLifts.deadlift.weight,
    deadlift_reps: prefs.strongestLifts.deadlift.reps,
    training_days_per_week: prefs.trainingDaysPerWeek,
    cardio_activities: prefs.cardioActivities,
    muscles_per_workout: String(prefs.musclesPerWorkout),
    preferred_workout_time_min: prefs.preferredWorkoutTime,
    preferred_training_plan: prefs.preferredTrainingPlan,
    updated_at: new Date().toISOString(),
  };
}

/** workout_profile row (DB shape) → WorkoutPrefs (app shape). */
function fromRow(row: any): WorkoutPrefs {
  const lift = (w: number | null, r: number | null) => ({ weight: w, reps: r });
  const muscles = row.muscles_per_workout;
  return {
    fitnessLevel: row.fitness_level,
    fitnessGoal: row.fitness_goal,
    strongestLifts: {
      benchPress: lift(row.bench_weight_kg, row.bench_reps),
      squat: lift(row.squat_weight_kg, row.squat_reps),
      deadlift: lift(row.deadlift_weight_kg, row.deadlift_reps),
    },
    trainingDaysPerWeek: row.training_days_per_week,
    cardioActivities: row.cardio_activities ?? [],
    musclesPerWorkout: muscles === "not_sure" ? "not_sure" : (Number(muscles) as 1 | 2 | 3),
    preferredWorkoutTime: row.preferred_workout_time_min,
    preferredTrainingPlan: row.preferred_training_plan,
    completedAt: row.completed_at,
  };
}

/** Save to DB (workout_profile row) and localStorage cache. Never throws. */
export async function saveWorkoutPrefs(
  userId: string,
  prefs: WorkoutPrefs,
): Promise<{ dbSaved: boolean }> {
  const payload = { ...prefs, completedAt: new Date().toISOString() };
  try {
    localStorage.setItem(lsKey(userId), JSON.stringify(payload));
  } catch {
    /* storage full/blocked — DB is still attempted */
  }
  const { error } = await supabase
    .from("workout_profile" as any)
    .upsert(toRow(userId, prefs) as any, { onConflict: "user_id" });
  if (error) {
    console.warn("[workoutPrefs] DB save failed:", error.message);
    return { dbSaved: false };
  }
  return { dbSaved: true };
}

/** Load prefs: localStorage first (fast), then DB (authoritative). */
export async function loadWorkoutPrefs(
  userId: string,
): Promise<WorkoutPrefs | null> {
  let cached: WorkoutPrefs | null = null;
  try {
    const raw = localStorage.getItem(lsKey(userId));
    if (raw) cached = JSON.parse(raw) as WorkoutPrefs;
  } catch {
    /* ignore */
  }

  const { data, error } = await supabase
    .from("workout_profile" as any)
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const dbPrefs = !error && data ? fromRow(data) : null;

  if (dbPrefs) {
    try {
      localStorage.setItem(lsKey(userId), JSON.stringify(dbPrefs));
    } catch {
      /* ignore */
    }
    return dbPrefs;
  }
  return cached;
}

/** Synchronous cached read for render-time use (cardio sorting, etc.). */
export function getCachedWorkoutPrefs(userId: string): WorkoutPrefs | null {
  try {
    const raw = localStorage.getItem(lsKey(userId));
    return raw ? (JSON.parse(raw) as WorkoutPrefs) : null;
  } catch {
    return null;
  }
}

/**
 * Default weight/reps for an exercise from the user's strongest lifts.
 * Bench → bench/chest-press variations, Squat → squat variations
 * (bodyweight/jump styles excluded), Deadlift → deadlift/RDL variations.
 */
export function defaultLiftForExercise(
  exerciseName: string,
  prefs: WorkoutPrefs | null,
): LiftEntry | null {
  if (!prefs) return null;
  const n = exerciseName.toLowerCase();

  if (/bench press|chest press/.test(n)) {
    const l = prefs.strongestLifts.benchPress;
    return l?.weight ? l : null;
  }
  if (/deadlift|romanian/.test(n)) {
    const l = prefs.strongestLifts.deadlift;
    return l?.weight ? l : null;
  }
  if (
    /squat/.test(n) &&
    !/air|jump|pistol|sissy|wall|cossack|pause squat \(bodyweight\)/.test(n)
  ) {
    const l = prefs.strongestLifts.squat;
    return l?.weight ? l : null;
  }
  return null;
}

/** Does a cardio activity on the Cardio tab match the user's preferences? */
export function isRecommendedCardio(
  activity: string,
  prefs: WorkoutPrefs | null,
): boolean {
  if (!prefs || prefs.cardioActivities.length === 0) return false;
  const a = activity.toLowerCase();
  return prefs.cardioActivities.some((c) => a.includes(c.toLowerCase()) || c.toLowerCase().includes(a));
}
