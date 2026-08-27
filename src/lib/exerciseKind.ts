/**
 * Which logging columns an exercise needs.
 *
 * The library stores exercises as bare name strings (see EXERCISES_DB) — there
 * is no exercises table and no per-exercise metadata — so classification is by
 * name. Lists are hand-curated rather than regex-matched: a regex on "Curl"
 * misfiles "Loop Band Bicep Curl" (no weight to log), and one on "Push"
 * misfiles "Sled Push" (very much loaded).
 *
 * Anything not listed here is "weighted", which is the pre-existing
 * Set/Reps/Weight table. That fallback is deliberate — an unclassified or
 * misspelled exercise renders exactly as it did before this feature existed,
 * rather than breaking. exerciseKind.test.ts asserts every name below exists in
 * EXERCISES_DB, so a typo fails the check instead of silently degrading.
 *
 * ponytail: loaded carries ("Farmer's Carry", "Suitcase Carry") are left
 * weighted even though they are timed — they need weight AND duration at once,
 * which no kind here models. Add a "loaded_carry" kind if that starts to matter.
 */
export type ExerciseKind = "weighted" | "bodyweight" | "isometric" | "assisted";

/**
 * Machine-assisted. The weight column is assistance, so a falling number is
 * progress — the inverse of every other kind, and why Est. 1RM is suppressed.
 */
export const ASSISTED_NAMES = [
  "Assisted Pull up",
  "Assisted Wide Grip Pull Up",
  "Assisted Neutral Grip Pull Up",
  "Assisted Dip",
];

/** Static holds — measured in seconds, not reps. */
export const ISOMETRIC_NAMES = [
  // Planks and their variations
  "Plank",
  "Side Plank",
  "Bear Plank",
  "High Plank Arm Reach",
  "Plank Shoulder Taps",
  "Plank Surrender",
  "Copenhagen Plank",
  // Core stability holds
  "Stability Ball Plank Rollouts",
  "TRX Fallout",
  "TRX Ab Rollout",
  "V Sit",
  // Lower body / back holds
  "Wall Sit",
  "Superman",
  "Alternating Superman",
  // Grip holds — timed by definition, never counted in reps
  "Dead Hang",
  "Towel Grip Dead Hang",
  "Plate Pinch Hold",
  "Fat Grip Dumbbell Hold",
  "Adductor Squeeze (Ball)",
];

/**
 * Reps against bodyweight (or a band, which has no loggable load). The weight
 * column stays hidden unless the user opts in via the Add Weight toggle, where
 * it then means ADDED weight — a vest, a belt, a dumbbell between the feet.
 */
export const BODYWEIGHT_NAMES = [
  // Pull-ups and rows
  "Pull Up",
  "Chin Up",
  "Neutral Grip Pull Ups",
  "Inverted Row",
  "Inverted Row Reverse Grip",
  "Renegade Row",
  "TRX Inverted Row",
  // Push-ups
  "Push Up",
  "Close Grip Push Up",
  "Decline Push Up",
  "Diamond Push Up",
  "Hand Release Push Up",
  "Incline Push Up",
  "Wide Push Up",
  "Push Up on Knees",
  "Pike Push Up",
  "TRX Chest Press",
  // Dips
  "Chest Dip",
  "Bench Dip",
  "Tricep Dip",
  "Ring Dip",
  "TRX Tricep Extension",
  "TRX Bicep Curl",
  "TRX Rear Delt Fly",
  "Arm Circles",
  // Dynamic abs
  "Ab Wheel Rollout",
  "Alternating Heel Touch",
  "Bicycle Crunch",
  "Cocoon Crunch",
  "Cross Body Mountain Climber",
  "Crunches",
  "Decline Crunch",
  "Decline Leg Raise",
  "Decline Oblique Crunch",
  "Decline Russian Twists",
  "Decline Sit Up",
  "Elbow to Knee Crunch",
  "Flutter Kicks",
  "Hanging Knee Raise",
  "Hanging Leg Raise",
  "Hanging Oblique Knee Raise",
  "Knee Raise",
  "Leg Raise",
  "Leg Raises with Stability Ball",
  "Mountain Climber",
  "Oblique Crunch",
  "Opposite Leg Toe Touch",
  "Plank Jack",
  "Reverse Crunch",
  "Russian Twist",
  "Scissor Kick",
  "Sit Up",
  "Stability Ball Crunch",
  "Stability Ball Pull In",
  "Toe Touches",
  "Torso Rotation",
  "Tuck Crunch",
  "V Up",
  "Vertical Knee Raise",
  "Vertical Leg Raise",
  // Legs and explosive
  "Air Squat",
  "Alternating Lunge Jumps",
  "Box Jump",
  "Burpee",
  "Burpee Broad Jump",
  "Cossack Squat",
  "Lunge",
  "Lunge Jump",
  "Pause Squat (bodyweight)",
  "Reverse Lunge",
  "Sissy Squat",
  "Squat Jump",
  "TRX Pistol Squat",
  "Walking Lunge",
  // Calves
  "Calf Raise",
  "Deficit Calf Raise (Step)",
  "Jump Rope",
  "Pogo Jumps",
  "Tibialis Raise",
  // Lower back
  "45-Degree Back Extension",
  "Bird Dog",
  "Stability Ball Back Extension",
  // Hips — the banded and bodyweight ones; machine/cable stay weighted
  "Banded Adduction",
  "Banded Seated Abduction",
  "Banded Side Lying Hip Abduction",
  "Clamshells",
  "Curtsy Lunge",
  "Fire Hydrant",
  "Lateral Band Walk",
  "Lying Adduction Leg Raise",
  "Side Lunge",
  "Side Plank Hip Abduction",
  "Standing Side Leg Raise",
  // Loop band accessory work — resistance is the band, nothing to log
  "Loop Band Bent Over Row",
  "Loop Band Bicep Curl",
  "Loop Band Chin Up",
  "Loop Band Face Pull",
  "Loop Band Hammer Curl",
  "Loop Band Lat Pulldown",
  "Loop Band Lateral Raise",
  "Loop Band Overhead Press",
  "Loop Band Pull Up",
  "Loop Band Push Up",
  "Loop Band Standing Chest Press",
  "Loop Band Standing Incline Chest Press",
  "Loop Band Standing Single Arm Row",
  "Loop Band Tricep Extension",
];

const KIND_OF = new Map<string, ExerciseKind>();
for (const n of BODYWEIGHT_NAMES) KIND_OF.set(n.toLowerCase(), "bodyweight");
for (const n of ISOMETRIC_NAMES) KIND_OF.set(n.toLowerCase(), "isometric");
for (const n of ASSISTED_NAMES) KIND_OF.set(n.toLowerCase(), "assisted");

export const exerciseKind = (name: string | null | undefined): ExerciseKind =>
  KIND_OF.get((name ?? "").toLowerCase()) ?? "weighted";
