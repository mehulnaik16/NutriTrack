/**
 * Standardized muscle-group vocabulary for custom workout plans.
 *
 * EVERY surface (questionnaire chips, plan table cells, workout-page
 * highlighting) must use these exact 9 strings — character-for-character —
 * so filtering and highlighting stay in sync app-wide.
 */

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
