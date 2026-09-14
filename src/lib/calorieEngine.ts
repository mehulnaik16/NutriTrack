/**
 * Calorie Calculation Engine — Hybrid Method
 *
 * Five-level priority stack. One session = one method, never blended.
 * Pure function, no side effects, fully testable.
 *
 * Level 1: HEART_RATE      (Keytel equation)
 * Level 2: SPEED-BASED     (ACSM / speed-bracket MET)
 * Level 3: VERTICAL        (stair / jump rope)
 * Level 4: TIER_MET        (tiered MET tables)
 * Level 5: GENERIC         (last resort)
 *
 * Distances arrive in KILOMETRES. Callers holding a user-facing unit (miles,
 * ergometer metres) must convert before calling.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type CalcMethod =
  | "HEART_RATE"
  | "ACSM_TREADMILL"
  | "ACSM_RUN"
  | "ACSM_WALK"
  | "SPEED_MET"
  | "VERTICAL"
  | "TIER_MET"
  | "GENERIC"
  | "MANUAL";

export type Confidence = "measured" | "estimated" | "user_input";

export interface CalorieResult {
  kcal: number;
  method: CalcMethod;
  confidence: Confidence;
}

export interface WorkoutInputs {
  duration_min: number;
  distance_km?: number | null;
  hr_bpm?: number | null;
  intensity?: string | null;
  incline_pct?: number | null;
}

export interface UserProfile {
  weight_kg: number;
  age: number;
  gender: string; // "Male" | "Female" | "Other"
}

/** Median adult age, used only when the profile has none. */
const DEFAULT_AGE = 30;

/** Finite-number guard — anything else (NaN, Infinity, null) counts as absent. */
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Build a result. Keytel goes negative below ~58 bpm and bad input can produce
 * NaN, so every exit clamps to a non-negative integer — a stored negative or
 * NaN burn corrupts every daily total downstream.
 */
function res(kcal: number, method: CalcMethod, confidence: Confidence): CalorieResult {
  return {
    kcal: Number.isFinite(kcal) ? Math.max(0, Math.round(kcal)) : 0,
    method,
    confidence,
  };
}

// ── Exercise archetype mapping ───────────────────────────────────────────────

type Archetype = "treadmill" | "run" | "walk" | "cycling" | "swimming"
  | "stair" | "jump_rope" | "ergometer" | "tabata_interval"
  | "yoga" | "stretching" | "dance" | "zumba" | "sports_badminton"
  | "sports_cricket" | "sports_football" | "generic_cardio";

const EXERCISE_ARCHETYPE: Record<string, Archetype> = {};
function map(names: string[], arch: Archetype) {
  for (const n of names) EXERCISE_ARCHETYPE[n.toLowerCase()] = arch;
}

map(["Treadmill running"], "treadmill");
map(["Outdoor run"], "run");
map(["Outdoor walk"], "walk");
map(["Cycling"], "cycling");
map(["Swimming"], "swimming");
map(["Stair climbing", "Stair Stepper"], "stair");
map(["Jump rope"], "jump_rope");
map(["Rowing machine", "SkiErg", "Elliptical", "Assault Bike"], "ergometer");
map(["HIIT", "Tabata", "EMOM", "AMRAP"], "tabata_interval");
map(["Yoga & Pilates"], "yoga");
map(["Stretching"], "stretching");
map(["Dancing", "Hip-Hop", "Dance Cardio"], "dance");
map(["Zumba"], "zumba");
map(["Badminton"], "sports_badminton");
map(["Cricket"], "sports_cricket");
map(["Football"], "sports_football");

function archetypeOf(exercise: string): Archetype {
  return EXERCISE_ARCHETYPE[exercise.toLowerCase()] ?? "generic_cardio";
}

// ── Short-interval HIIT set ──────────────────────────────────────────────────

const SHORT_INTERVAL_ARCHETYPES = new Set<Archetype>(["tabata_interval"]);

/** HR lags effort in short intervals and underestimates the burn. */
function isShortInterval(arch: Archetype, duration_min: number): boolean {
  return SHORT_INTERVAL_ARCHETYPES.has(arch) && duration_min < 8;
}

// ── Level 1: Heart Rate (Keytel) ─────────────────────────────────────────────

function heartRateKcal(hr: number, weight: number, age: number, gender: string, duration: number): number {
  // "Other" and anything unrecognised take the male equation, matching calcBMR
  // in lib/nutrition.ts so the two never disagree for the same profile.
  // Note: Keytel et al. (2005) specifies a negative coefficient for female weight.
  if (gender === "Female") {
    return ((-20.4022 + 0.4472 * hr - 0.1263 * weight + 0.074 * age) / 4.184) * duration;
  }
  return ((-55.0969 + 0.6309 * hr + 0.1988 * weight + 0.2017 * age) / 4.184) * duration;
}

// ── Level 2: Speed-based ─────────────────────────────────────────────────────

/** Cycling speed brackets: [max_kmh, MET] pairs, ordered ascending. */
const CYCLING_BRACKETS: [number, number][] = [
  [16, 4.0], [19, 6.8], [22, 8.0], [25, 10.0], [Infinity, 12.0],
];

function bracketMet(speed: number, brackets: [number, number][]): number {
  for (const [max, met] of brackets) {
    if (speed <= max) return met;
  }
  return brackets[brackets.length - 1][1];
}

/**
 * Max plausible speed (km/h) per locomotion archetype. Above it the distance is
 * bad data (stationary-bike fiction, mistyped unit) and we fall through.
 */
const MAX_SPEED: Partial<Record<Archetype, number>> = {
  cycling: 45,
  run: 25,
  treadmill: 25,
  walk: 12,
};

/**
 * ACSM running net VO2 equation.
 * Omits the 3.5 ml/kg/min resting baseline so energy is purely active burn,
 * ensuring the same distance does not inflate over longer durations and double-count BMR.
 */
function acsmRunKcalMin(speed_kmh: number, weight_kg: number, grade: number): number {
  const speed_mmin = speed_kmh * 1000 / 60; // m/min
  const vo2_net = 0.2 * speed_mmin + 0.9 * speed_mmin * grade;
  return (vo2_net * weight_kg) / 200;
}

/** ACSM walking net VO2 equation (omits 3.5 ml/kg/min resting baseline). */
function acsmWalkKcalMin(speed_kmh: number, weight_kg: number, grade: number): number {
  const speed_mmin = speed_kmh * 1000 / 60;
  const vo2_net = 0.1 * speed_mmin + 1.8 * speed_mmin * grade;
  return (vo2_net * weight_kg) / 200;
}

// ── Level 4: Tiered MET tables ───────────────────────────────────────────────

interface TieredMet { light: number; default: number; hard: number; }

const TIERED_MET: Partial<Record<Archetype, TieredMet>> = {
  yoga:              { light: 2.5, default: 3.0, hard: 4.0 },
  stretching:        { light: 2.3, default: 2.5, hard: 3.5 },
  ergometer:         { light: 4.8, default: 7.0, hard: 8.4 },
  swimming:          { light: 5.5, default: 7.0, hard: 9.5 },
  zumba:             { light: 5.5, default: 7.0, hard: 8.5 },
  dance:             { light: 4.5, default: 6.0, hard: 8.0 },
  sports_badminton:  { light: 4.5, default: 5.5, hard: 7.0 },
  sports_cricket:    { light: 3.5, default: 4.8, hard: 7.0 },
  sports_football:   { light: 6.0, default: 8.0, hard: 10.0 },
  tabata_interval:   { light: 8.0, default: 10.0, hard: 13.0 },
};

/** Flat MET for locomotion archetypes logged without a usable distance. */
const FALLBACK_MET: Partial<Record<Archetype, number>> = {
  treadmill: 9.8,
  run: 9.8,
  walk: 3.5,
  cycling: 7.5,
};

/** Map user-facing intensity strings to tier keys. */
function intensityTier(intensity: string | null | undefined): "light" | "default" | "hard" {
  if (!intensity) return "default";
  const lower = intensity.toLowerCase();
  if (lower === "light" || lower === "casual") return "light";
  if (lower === "vigorous" || lower === "training" || lower === "hard") return "hard";
  return "default"; // Moderate, Competitive, or unknown
}

// ── Main engine ──────────────────────────────────────────────────────────────

export function calculateCalories(
  exercise: string,
  inputs: WorkoutInputs,
  user: UserProfile,
): CalorieResult {
  const arch = archetypeOf(exercise);
  const duration_min = num(inputs.duration_min);
  const weight_kg = num(user.weight_kg);

  // No duration or no body weight means there is nothing to scale — report zero
  // rather than letting NaN propagate into the log.
  if (duration_min == null || duration_min <= 0 || weight_kg == null || weight_kg <= 0) {
    return res(0, "GENERIC", "estimated");
  }

  const age = num(user.age) ?? DEFAULT_AGE;
  const gender = user.gender ?? "";
  const hours = duration_min / 60;
  const hr_bpm = num(inputs.hr_bpm);
  const distance_km = num(inputs.distance_km);

  // ── Level 1: Heart Rate ──
  // Keytel is validated only for active exercise (>= 85 bpm). Below 85 bpm
  // (resting/recovery HR), heart rate does not linearly track exercise VO2,
  // so we fall through to the category's speed or MET tables.
  if (hr_bpm != null && hr_bpm >= 85 && hr_bpm <= 210 && !isShortInterval(arch, duration_min)) {
    const hrKcal = heartRateKcal(hr_bpm, weight_kg, age, gender, duration_min);
    if (hrKcal > 0) return res(hrKcal, "HEART_RATE", "measured");
  }

  // ── Level 2: Speed-based (locomotion with distance) ──
  const maxSpeed = MAX_SPEED[arch];
  if (distance_km != null && distance_km > 0 && maxSpeed != null) {
    const speed_kmh = distance_km / hours;
    if (speed_kmh <= maxSpeed) {
      if (arch === "treadmill") {
        const grade = (num(inputs.incline_pct) ?? 0) / 100;
        const fn = speed_kmh < 6.0 ? acsmWalkKcalMin : acsmRunKcalMin;
        return res(fn(speed_kmh, weight_kg, grade) * duration_min, "ACSM_TREADMILL", "estimated");
      }
      if (arch === "run") {
        const fn = speed_kmh < 6.0 ? acsmWalkKcalMin : acsmRunKcalMin;
        return res(fn(speed_kmh, weight_kg, 0) * duration_min, "ACSM_RUN", "estimated");
      }
      if (arch === "walk") {
        return res(acsmWalkKcalMin(speed_kmh, weight_kg, 0) * duration_min, "ACSM_WALK", "estimated");
      }
      if (arch === "cycling") {
        return res(bracketMet(speed_kmh, CYCLING_BRACKETS) * weight_kg * hours, "SPEED_MET", "estimated");
      }
    }
    // Implausible speed: fall through to the MET tables.
  }

  // ── Level 3: Vertical / rep work ──
  // No vertical_meters or skip-rate field exists on the board yet, so both use
  // their slow-pace MET.
  if (arch === "stair") return res(9.0 * weight_kg * hours, "VERTICAL", "estimated");
  if (arch === "jump_rope") return res(11.0 * weight_kg * hours, "VERTICAL", "estimated");

  // ── Level 4: Tiered MET fallback ──
  const tiered = TIERED_MET[arch];
  if (tiered) {
    return res(tiered[intensityTier(inputs.intensity)] * weight_kg * hours, "TIER_MET", "estimated");
  }

  const flat = FALLBACK_MET[arch];
  if (flat) return res(flat * weight_kg * hours, "TIER_MET", "estimated");

  // ── Level 5: Generic last resort ──
  return res(5.0 * weight_kg * hours, "GENERIC", "estimated");
}
