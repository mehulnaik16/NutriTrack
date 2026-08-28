/**
 * Standardized muscle-group vocabulary for custom workout plans.
 *
 * EVERY surface (questionnaire chips, plan table cells, workout-page
 * highlighting) must use these exact 9 strings — character-for-character —
 * so filtering and highlighting stay in sync app-wide.
 */

import { daysBetweenLocal } from "./dates";

export const STANDARD_MUSCLE_GROUPS = [
  "Biceps",
  "Triceps",
  "Back",
  "Legs",
  "Compound Exercise",
  "Chest",
  "Core",
  "Shoulder",
  "Rest Day",
] as const;

export type StandardMuscle = (typeof STANDARD_MUSCLE_GROUPS)[number];

export const MAX_MUSCLES_PER_DAY = 3;

/** Emoji used on chips/cells for quick scanning. */
export const MUSCLE_EMOJI: Record<StandardMuscle, string> = {
  Biceps: "💪",
  Triceps: "🦾",
  Back: "🔙",
  Legs: "🦵",
  "Compound Exercise": "🏋️",
  Chest: "🛡️",
  Core: "🎯",
  Shoulder: "🙆",
  "Rest Day": "😴",
};

/**
 * Anatomy reference image per muscle — rendered as a small emoji-sized icon so
 * each group is recognisable (the same assets the Workout muscle grid uses).
 * Rest Day has no image and falls back to its emoji.
 */
export const MUSCLE_IMG: Partial<Record<StandardMuscle, string>> = {
  Biceps: "/images/biceps%20final.png",
  Triceps: "/images/tricepsfinal.png",
  Back: "/images/backfinal.png",
  Legs: "/images/legs.png",
  "Compound Exercise": "/images/compoundfinal.png",
  Chest: "/images/chestfinal.png",
  Core: "/images/corefinal.png",
  Shoulder: "/images/shouldersfinal.png",
};

/**
 * Maps each standard group to the muscle-grid ids on the Workout page
 * (keys of EXERCISES_DB) so today's targets can be auto-highlighted.
 */
export const MUSCLE_TO_GRID: Record<StandardMuscle, string[]> = {
  Biceps: ["biceps"],
  Triceps: ["triceps"],
  Back: ["back"],
  Legs: ["legs"],
  "Compound Exercise": ["compound"],
  Chest: ["chest"],
  Core: ["abs"],
  Shoulder: ["shoulders"],
  "Rest Day": [],
};

/** One row of a custom plan. `muscles` is [] or ["Rest Day"] on rest days. */
export interface CustomPlanDay {
  day: string; // "Day 1" … "Day 7"
  name: string; // display name, e.g. "Chest · Triceps · Core" or "Rest Day"
  focus: string;
  muscles: StandardMuscle[];
  exercises: { name: string; sets: number; reps: string }[]; // [] for custom
}

export interface CustomPlan {
  goal: string;
  type: "custom";
  days_per_week: number;
  days: CustomPlanDay[];
}

/** Type guard: is this stored plan a custom (table) plan? */
export function isCustomPlan(plan: any): plan is CustomPlan {
  return (
    !!plan &&
    plan.type === "custom" &&
    Array.isArray(plan.days) &&
    plan.days.some((d: any) => Array.isArray(d?.muscles))
  );
}

/** Non-rest muscles for a day (safe on any shape). */
export function activeMuscles(day: any): StandardMuscle[] {
  if (!day || !Array.isArray(day.muscles)) return [];
  return day.muscles.filter(
    (m: string): m is StandardMuscle =>
      m !== "Rest Day" &&
      (STANDARD_MUSCLE_GROUPS as readonly string[]).includes(m),
  );
}

/** Is the given day a rest day? */
export function isRestDay(day: any): boolean {
  return activeMuscles(day).length === 0;
}

/**
 * How many muscle columns should the plan table render?
 * (max selected on any day, clamped 1–3 → hides unused columns)
 */
export function tableColumnCount(days: { muscles?: string[] }[]): number {
  const max = days.reduce(
    (m, d) => Math.max(m, activeMuscles(d).length),
    0,
  );
  return Math.min(Math.max(max, 1), MAX_MUSCLES_PER_DAY);
}

/** Grid ids to highlight for a set of standard muscles. */
export function gridIdsForMuscles(muscles: StandardMuscle[]): Set<string> {
  const ids = new Set<string>();
  for (const m of muscles) {
    for (const id of MUSCLE_TO_GRID[m] ?? []) ids.add(id);
  }
  return ids;
}

/** Build the stored plan JSON from 7 days of selections. */
export function buildCustomPlan(
  selections: StandardMuscle[][],
): CustomPlan {
  const days: CustomPlanDay[] = selections.map((sel, i) => {
    const act = sel.filter((m) => m !== "Rest Day");
    const rest = act.length === 0;
    return {
      day: `Day ${i + 1}`,
      name: rest ? "Rest Day" : act.join(" · "),
      focus: rest ? "Recovery" : act.join(", "),
      muscles: rest ? (["Rest Day"] as StandardMuscle[]) : act,
      exercises: [],
    };
  });
  return {
    goal: "Custom Plan",
    type: "custom",
    days_per_week: days.filter((d) => !isRestDay(d)).length,
    days,
  };
}

/**
 * Which day of the plan is "today"?
 *
 * The plan is a repeating cycle, NOT a Mon-Sun calendar: the user picks which
 * day of their split they're on, and it rolls forward one per day from there,
 * wrapping at the end. `storedIdx` is the phase (which day they picked),
 * `anchorISO` is the clock (the date they picked it on) — neither is useful
 * without the other.
 *
 * A null anchor (legacy row written before the column existed) falls back to
 * the stored index unchanged, which is exactly the old behaviour.
 */
export function cycleDayIndex(
  storedIdx: number,
  anchorISO: string | null,
  todayISO: string,
  dayCount: number,
): number {
  if (dayCount <= 0) return 0;
  const elapsed = anchorISO ? daysBetweenLocal(anchorISO, todayISO) : 0;
  // Double-mod keeps it in range even if elapsed is negative (clock skew, or
  // a device whose date is behind the one the anchor was written on).
  return (((storedIdx + elapsed) % dayCount) + dayCount) % dayCount;
}

/**
 * Replace one day's muscles in an existing custom plan. Used for inline
 * single-day edits so changing one day doesn't require deleting and
 * rebuilding the whole 7-day plan.
 */
export function updatePlanDay(
  plan: CustomPlan,
  dayIndex: number,
  muscles: StandardMuscle[],
): CustomPlan {
  const act = muscles.filter((m) => m !== "Rest Day");
  const rest = act.length === 0;
  const days = plan.days.map((d, i) =>
    i === dayIndex
      ? {
          day: `Day ${dayIndex + 1}`,
          name: rest ? "Rest Day" : act.join(" · "),
          focus: rest ? "Recovery" : act.join(", "),
          muscles: rest ? (["Rest Day"] as StandardMuscle[]) : act,
          exercises: d.exercises,
        }
      : d,
  );
  return {
    ...plan,
    days_per_week: days.filter((d) => !isRestDay(d)).length,
    days,
  };
}
