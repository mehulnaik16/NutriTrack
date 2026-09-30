/**
 * Exercise Thumbnail Image Mapping & Normalization Module
 *
 * Provides small-pixel, high-performance thumbnail paths for exercises.
 * Fallback to null when an exercise does not yet have an approved asset.
 */

/**
 * Normalizes an exercise name for robust dictionary lookup:
 * - Lowercase
 * - Strips punctuation / hyphens
 * - Collapses extra spaces
 */
export function normalizeExerciseKey(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Approved canonical exercise thumbnail registry.
 * Maps normalized exercise names to their optimized static asset path in /exercises/
 */
export const EXERCISE_THUMBNAILS: Record<string, string> = {
  // Phase 1 Approved Batch 1 (Chest & Squat Baseline)
  "barbell bench press": "/exercises/barbell_bench_press.jpg",
  "incline barbell bench press": "/exercises/incline_barbell_bench_press.jpg",
  "dumbbell bench press": "/exercises/dumbbell_bench_press.jpg",
  "incline dumbbell bench press": "/exercises/incline_dumbbell_bench_press.jpg",
  "machine bench press": "/exercises/machine_bench_press.jpg",
  "cable crossover fly": "/exercises/cable_crossover_fly.jpg",
  "back squat": "/exercises/back_squat.jpg",
  // Approved Batch 1 additions
  "plate loaded chest press": "/exercises/plate_loaded_chest_press.jpg",
  "dumbbell fly": "/exercises/dumbbell_fly.jpg",
  "chest dip": "/exercises/chest_dip.jpg",
  "push up": "/exercises/push_up.jpg",
  "plyometric push ups": "/exercises/plyometric_push_ups.jpg",
  "deadlift": "/exercises/deadlift.jpg",
  "barbell row": "/exercises/barbell_row.jpg",
  "pendlay row": "/exercises/pendlay_row.jpg",
  "dumbbell row": "/exercises/dumbbell_row.jpg",
  "cable row": "/exercises/cable_row.jpg",
  // Approved Batch 1 Decline & Back additions
  "decline barbell bench press": "/exercises/decline_barbell_bench_press.jpg",
  "decline dumbbell bench press": "/exercises/decline_dumbbell_bench_press.jpg",
  "pull up": "/exercises/pull_up.jpg",
  "lat pulldown": "/exercises/lat_pulldown.jpg",
  "dumbbell pullover": "/exercises/dumbbell_pullover.jpg",
  "inverted row": "/exercises/inverted_row.jpg",
  // Approved Batch 2 Leg additions
  "front squat": "/exercises/front_squat.jpg",
  "leg press": "/exercises/leg_press.jpg",
  "hack squat": "/exercises/hack_squat.jpg",
  "goblet squat": "/exercises/goblet_squat.jpg",
  "romanian deadlift": "/exercises/romanian_deadlift.jpg",
  "dumbbell romanian deadlift": "/exercises/dumbbell_romanian_deadlift.jpg",
  "bulgarian split squat": "/exercises/bulgarian_split_squat.jpg",
  "walking lunge": "/exercises/walking_lunge.jpg",
  "leg extension": "/exercises/leg_extension.jpg",
  "lying hamstring curl": "/exercises/lying_hamstring_curl.jpg",
  "seated leg curl": "/exercises/seated_leg_curl.jpg",
  "standing calf raise": "/exercises/standing_calf_raise.jpg",
  "seated calf raise": "/exercises/seated_calf_raise.jpg",
};

/**
 * Aliases and naming variations mapping to canonical keys
 */
export const EXERCISE_ALIASES: Record<string, string> = {
  "bench press": "barbell bench press",
  "flat bench press": "barbell bench press",
  "barbell flat bench press": "barbell bench press",
  "barbell incline bench press": "incline barbell bench press",
  "incline bench press": "incline barbell bench press",
  "dumbbell incline bench press": "incline dumbbell bench press",
  "flat dumbbell bench press": "dumbbell bench press",
  "machine chest press": "machine bench press",
  "seated machine chest press": "machine bench press",
  "cable fly": "cable crossover fly",
  "cable crossover": "cable crossover fly",
  "squat": "back squat",
  "squats": "back squat",
  "barbell back squat": "back squat",
  "barbell squat": "back squat",
  // Newly approved aliases
  "hammer strength chest press": "plate loaded chest press",
  "plate loaded incline chest press": "plate loaded chest press",
  "flat dumbbell fly": "dumbbell fly",
  "dumbbell chest fly": "dumbbell fly",
  "dips": "chest dip",
  "parallel bar dip": "chest dip",
  "pushups": "push up",
  "push ups": "push up",
  "floor push up": "push up",
  "clapping push up": "plyometric push ups",
  "plyometric push up": "plyometric push ups",
  "clapping pushups": "plyometric push ups",
  "barbell deadlift": "deadlift",
  "conventional deadlift": "deadlift",
  "bent over barbell row": "barbell row",
  "bent over row": "barbell row",
  "single arm dumbbell row": "dumbbell row",
  "one arm dumbbell row": "dumbbell row",
  "seated cable row": "cable row",
  "seated row": "cable row",
  "v bar cable row": "cable row",
  // Batch 1 Decline & Back aliases
  "decline bench press": "decline barbell bench press",
  "barbell decline bench press": "decline barbell bench press",
  "decline chest press": "decline barbell bench press",
  "dumbbell decline bench press": "decline dumbbell bench press",
  "pullups": "pull up",
  "pull ups": "pull up",
  "wide grip pull up": "pull up",
  "cable lat pulldown": "lat pulldown",
  "lat pulldowns": "lat pulldown",
  "wide grip lat pulldown": "lat pulldown",
  "pullover": "dumbbell pullover",
  "db pullover": "dumbbell pullover",
  "australian pull up": "inverted row",
  "bodyweight row": "inverted row",
  // Batch 2 Leg aliases
  "barbell front squat": "front squat",
  "45 degree leg press": "leg press",
  "incline leg press": "leg press",
  "sled leg press": "leg press",
  "barbell romanian deadlift": "romanian deadlift",
  "rdl": "romanian deadlift",
  "dumbbell rdl": "dumbbell romanian deadlift",
  "dumbbell walking lunge": "walking lunge",
  "lunges": "walking lunge",
  "lunge": "walking lunge",
  "split squat": "bulgarian split squat",
  "lying leg curl": "lying hamstring curl",
  "hamstring curl": "lying hamstring curl",
  "standing machine calf raise": "standing calf raise",
  "calf raise": "standing calf raise",
  "seated machine calf raise": "seated calf raise",
};

/**
 * Returns the URL path to an approved exercise thumbnail, or null if unassigned.
 */
export function getExerciseThumbnail(exerciseName: string): string | null {
  if (!exerciseName) return null;
  const key = normalizeExerciseKey(exerciseName);
  if (!key) return null;

  if (EXERCISE_THUMBNAILS[key]) {
    return EXERCISE_THUMBNAILS[key];
  }

  const aliasKey = EXERCISE_ALIASES[key];
  if (aliasKey && EXERCISE_THUMBNAILS[aliasKey]) {
    return EXERCISE_THUMBNAILS[aliasKey];
  }

  return null;
}

/**
 * Returns true if an exercise has an approved thumbnail asset available.
 */
export function hasExerciseThumbnail(exerciseName: string): boolean {
  return getExerciseThumbnail(exerciseName) !== null;
}
