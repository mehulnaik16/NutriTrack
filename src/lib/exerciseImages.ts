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
  "t bar row": "/exercises/t_bar_row.jpg",
  "barbell hip thrust": "/exercises/barbell_hip_thrust.jpg",
  "dumbbell hip thrust": "/exercises/dumbbell_hip_thrust.jpg",
  "box jump": "/exercises/box_jump.jpg",
  "sled push": "/exercises/sled_push.jpg",
  "trx pistol squat": "/exercises/trx_pistol_squat.jpg",
  // Approved Batch 3 Shoulder additions
  "barbell shoulder press": "/exercises/barbell_shoulder_press.jpg",
  "dumbbell shoulder press": "/exercises/dumbbell_shoulder_press.jpg",
  "arnold press": "/exercises/arnold_press.jpg",
  "dumbbell lateral raise": "/exercises/dumbbell_lateral_raise.jpg",
  "dumbbell front raise": "/exercises/dumbbell_front_raise.jpg",
  "cable face pull": "/exercises/cable_face_pull.jpg",
  "cable reverse fly": "/exercises/cable_reverse_fly.jpg",
  // Approved Batch 3 Arm additions
  "barbell curl": "/exercises/barbell_curl.jpg",
  "dumbbell bicep curl": "/exercises/dumbbell_bicep_curl.jpg",
  "hammer curls": "/exercises/hammer_curls.jpg",
  "preacher curl": "/exercises/preacher_curl.jpg",
  "tricep pushdown": "/exercises/tricep_pushdown.jpg",
  "ez bar skullcrusher": "/exercises/ez_bar_skullcrusher.jpg",
  "dumbbell overhead tricep extension": "/exercises/dumbbell_overhead_tricep_extension.jpg",
  "handstand push ups": "/exercises/handstand_push_ups.jpg",
  "incline dumbbell curl": "/exercises/incline_dumbbell_curl.jpg",
  "dumbbell concentration curl": "/exercises/dumbbell_concentration_curl.jpg",
  "cable bicep curl": "/exercises/cable_bicep_curl.jpg",
  "close grip bench press": "/exercises/close_grip_bench_press.jpg",
  "bench dip": "/exercises/bench_dip.jpg",
  "dumbbell kickbacks": "/exercises/dumbbell_kickbacks.jpg",
  "dumbbell shrug": "/exercises/dumbbell_shrug.jpg",
  "barbell shrug": "/exercises/barbell_shrug.jpg",
  "farmers carry": "/exercises/farmers_carry.jpg",
  "alternating battle rope": "/exercises/alternating_battle_rope.jpg",
  // Approved Batch 4 Core additions
  "plank": "/exercises/plank.jpg",
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
  "tbar row": "t bar row",
  "landmine row": "t bar row",
  "landmine t bar row": "t bar row",
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
  "hip thrust": "barbell hip thrust",
  "hip thrusts": "barbell hip thrust",
  "glute bridge": "barbell hip thrust",
  "box jumps": "box jump",
  "plyo box jump": "box jump",
  "prowler push": "sled push",
  "prowler sled push": "sled push",
  "pistol squat": "trx pistol squat",
  "single leg squat": "trx pistol squat",
  // Batch 3 Shoulder aliases
  "overhead press": "barbell shoulder press",
  "standing overhead press": "barbell shoulder press",
  "standing military press": "barbell shoulder press",
  "military press": "barbell shoulder press",
  "ohp": "barbell shoulder press",
  "seated dumbbell shoulder press": "dumbbell shoulder press",
  "seated dumbbell press": "dumbbell shoulder press",
  "db shoulder press": "dumbbell shoulder press",
  "arnold dumbbell press": "arnold press",
  "lateral raise": "dumbbell lateral raise",
  "side lateral raise": "dumbbell lateral raise",
  "db lateral raise": "dumbbell lateral raise",
  "front raise": "dumbbell front raise",
  "db front raise": "dumbbell front raise",
  "face pull": "cable face pull",
  "face pulls": "cable face pull",
  "rope face pull": "cable face pull",
  "reverse fly": "cable reverse fly",
  "reverse flyes": "cable reverse fly",
  "cable rear delt fly": "cable reverse fly",
  "rear delt fly": "cable reverse fly",
  // Batch 3 Arm aliases
  "bicep curl": "barbell curl",
  "bicep curls": "barbell curl",
  "standing barbell curl": "barbell curl",
  "dumbbell curl": "dumbbell bicep curl",
  "db bicep curl": "dumbbell bicep curl",
  "db curl": "dumbbell bicep curl",
  "hammer curl": "hammer curls",
  "dumbbell hammer curl": "hammer curls",
  "db hammer curl": "hammer curls",
  "preacher curls": "preacher curl",
  "ez bar preacher curl": "preacher curl",
  "cable tricep pushdown": "tricep pushdown",
  "triceps pushdown": "tricep pushdown",
  "skull crusher": "ez bar skullcrusher",
  "skullcrusher": "ez bar skullcrusher",
  "skull crushers": "ez bar skullcrusher",
  "skullcrushers": "ez bar skullcrusher",
  "lying triceps extension": "ez bar skullcrusher",
  "lying tricep extension": "ez bar skullcrusher",
  "overhead tricep extension": "dumbbell overhead tricep extension",
  "seated overhead tricep extension": "dumbbell overhead tricep extension",
  "dumbbell tricep extension": "dumbbell overhead tricep extension",
  "db overhead tricep extension": "dumbbell overhead tricep extension",
  "handstand push up": "handstand push ups",
  "handstand pushup": "handstand push ups",
  "handstand pushups": "handstand push ups",
  "hspu": "handstand push ups",
  "incline curl": "incline dumbbell curl",
  "incline bicep curl": "incline dumbbell curl",
  "incline db curl": "incline dumbbell curl",
  "concentration curl": "dumbbell concentration curl",
  "concentration curls": "dumbbell concentration curl",
  "db concentration curl": "dumbbell concentration curl",
  "low cable bicep curl": "cable bicep curl",
  "cable curl": "cable bicep curl",
  "cable curls": "cable bicep curl",
  "close grip barbell bench press": "close grip bench press",
  "cgbp": "close grip bench press",
  "tricep dip": "bench dip",
  "tricep dips": "bench dip",
  "bench dips": "bench dip",
  "dumbbell kickback": "dumbbell kickbacks",
  "db kickback": "dumbbell kickbacks",
  "db kickbacks": "dumbbell kickbacks",
  "tricep kickback": "dumbbell kickbacks",
  "tricep kickbacks": "dumbbell kickbacks",
  "shrug": "barbell shrug",
  "shrugs": "barbell shrug",
  "barbell shrugs": "barbell shrug",
  "dumbbell shrugs": "dumbbell shrug",
  "db shrug": "dumbbell shrug",
  "db shrugs": "dumbbell shrug",
  "farmer carry": "farmers carry",
  "farmers walk": "farmers carry",
  "farmer walk": "farmers carry",
  "farmer's carry": "farmers carry",
  "farmer's walk": "farmers carry",
  "dumbbell farmers walk": "farmers carry",
  "battle rope": "alternating battle rope",
  "battle ropes": "alternating battle rope",
  "alternating battle ropes": "alternating battle rope",
  "forearm plank": "plank",
  "front plank": "plank",
  "planks": "plank",
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
