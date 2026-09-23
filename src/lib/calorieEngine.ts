/**
 * Calorie Calculation Engine — Hybrid Method
 *
 * Five-level priority stack. One session = one method, never blended.
 * Pure function, no side effects, fully testable.
 *
 * Level 0: POWER           (measured mechanical work on an ergometer)
 * Level 1: HEART_RATE      (Keytel equation)
 * Level 2: SPEED-BASED     (ACSM / speed-bracket MET)
 * Level 3: VERTICAL        (stair / jump rope)
 * Level 4: TIER_MET        (tiered MET tables)
 * Level 5: GENERIC         (last resort)
 *
 * Distances arrive in KILOMETRES. Callers holding a user-facing unit (miles,
 * ergometer metres) must convert before calling.
 */

import { MUSCLE_OF } from "./exercises.ts";
import { exerciseKind } from "./exerciseKind.ts";

// ── Types ────────────────────────────────────────────────────────────────────

export type CalcMethod =
  | "POWER"
  | "HEART_RATE"
  | "ACSM_TREADMILL"
  | "ACSM_RUN"
  | "ACSM_WALK"
  | "SPEED_MET"
  | "VERTICAL"
  | "STRENGTH_SETS"
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
  /** Average mechanical power in watts, from an ergometer's own display. */
  avg_power_w?: number | null;
  /** Strength: one entry per working set. Shaped like the logger's LoggedSet. */
  strength_sets?: StrengthSet[] | null;
  /** Strength: rest taken between sets, in seconds. */
  rest_sec?: number | null;
}

/** One working set. Which fields are present depends on the exercise kind. */
export interface StrengthSet {
  reps?: number | null;
  /** Load in KILOGRAMS. Callers holding lbs must convert before calling. */
  weight_kg?: number | null;
  /** Seconds held, for isometric exercises. */
  hold_sec?: number | null;
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
function res(
  kcal: number,
  method: CalcMethod,
  confidence: Confidence,
): CalorieResult {
  return {
    kcal: Number.isFinite(kcal) ? Math.max(0, Math.round(kcal)) : 0,
    method,
    confidence,
  };
}

// ── Exercise archetype mapping ───────────────────────────────────────────────

type Archetype =
  | "treadmill"
  | "run"
  | "walk"
  | "cycling"
  | "swimming"
  | "stair"
  | "jump_rope"
  | "rower"
  | "skierg"
  | "elliptical"
  | "air_bike"
  | "strength"
  | "tabata_interval"
  | "yoga"
  | "stretching"
  | "dance"
  | "zumba"
  | "sports_badminton"
  | "sports_cricket"
  | "sports_football"
  | "generic_cardio";

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
// One MET table cannot span these four. Measured effort runs from 5.0 MET on an
// elliptical to 14.0 on a rower at race wattage, so each machine gets its own.
map(["Rowing machine"], "rower");
map(["SkiErg"], "skierg");
map(["Elliptical"], "elliptical");
map(["Assault Bike"], "air_bike");
map(["HIIT", "Tabata", "EMOM", "AMRAP"], "tabata_interval");
map(["Yoga & Pilates"], "yoga");
map(["Stretching"], "stretching");
map(["Dancing", "Hip-Hop", "Dance Cardio"], "dance");
map(["Zumba"], "zumba");
map(["Badminton"], "sports_badminton");
map(["Cricket"], "sports_cricket");
map(["Football"], "sports_football");

function archetypeOf(exercise: string): Archetype {
  const key = exercise.toLowerCase();
  // The cardio map is consulted first on purpose. "Stair Stepper" is filed under
  // glutes in EXERCISES_DB and "Jump Rope" under calves, but both are cardio
  // machines — checking cardio first keeps them off the strength path without a
  // separate blacklist that could drift.
  return (
    EXERCISE_ARCHETYPE[key] ??
    (MUSCLE_OF.has(key) ? "strength" : "generic_cardio")
  );
}

/**
 * Whether an exercise belongs in a strength picker. False for the handful of
 * cardio machines that live in the muscle lists, and for anything unrecognised.
 * A cardio name added to EXERCISE_ARCHETYPE later excludes itself automatically.
 */
export const isStrengthExercise = (name: string): boolean =>
  archetypeOf(name) === "strength";

// ── Short-interval HIIT set ──────────────────────────────────────────────────

const SHORT_INTERVAL_ARCHETYPES = new Set<Archetype>(["tabata_interval"]);

/** HR lags effort in short intervals and underestimates the burn. */
function isShortInterval(arch: Archetype, duration_min: number): boolean {
  return SHORT_INTERVAL_ARCHETYPES.has(arch) && duration_min < 8;
}

// ── Level 0: Measured mechanical power ───────────────────────────────────────

/**
 * Machines whose watts are real mechanical power off a calibrated flywheel.
 * An elliptical's "watts" are read off a resistance curve with no force
 * measurement behind them, so it is deliberately absent.
 */
const POWER_ARCHETYPES = new Set<Archetype>(["rower", "skierg", "air_bike"]);

/** Plausible average power for a whole session; outside this the figure is junk. */
const MIN_POWER_W = 10;
const MAX_POWER_W = 800;

/**
 * Mechanical work converted to metabolic energy.
 *
 * Human gross efficiency on a stationary ergometer sits near 24%, and
 * 1 / (0.24 x 4.184) ~= 1.00, so a kilojoule of work costs about a kilocalorie
 * — the same convention Concept2 prints on a PM5. That product is the active
 * cost only, so the resting baseline is added back to keep this figure gross,
 * matching the MET tables it displaces.
 *
 * Checked against the Compendium's own wattage bands for stationary rowing:
 * 75 W -> 340 kcal/h here vs 350 at its 5.0 MET; 125 W -> 520 vs 525 at 7.5 MET.
 */
function powerKcal(
  watts: number,
  weight_kg: number,
  duration_min: number,
): number {
  const work_kJ = (watts * 60 * duration_min) / 1000;
  return work_kJ + 1.0 * weight_kg * (duration_min / 60);
}

// ── Level 1: Heart Rate (Keytel) ─────────────────────────────────────────────

/**
 * Keytel's male branch reads high. Validation work reports the equation
 * overestimates energy expenditure, and the implied intensity makes that
 * concrete: at 140 bpm a 30-year-old 70 kg man is billed 10.9 MET, where 74%
 * of maximum heart rate corresponds to roughly 7-8 MET. The female branch
 * tracks the MET tables closely and is left untouched.
 *
 * This factor is a calibration, not a published constant. It is the value that
 * brings the male implied MET across 110-170 bpm back inside the Compendium
 * range for the activity being logged; calorieEngine.ranges.test.ts is what
 * holds it honest.
 */
const MALE_KEYTEL_BIAS = 0.72;

/**
 * Ceiling on the heart-rate estimate, expressed in MET.
 *
 * Heart rate rises for reasons that are not mechanical work — heat, caffeine,
 * stress, cardiac drift late in a session — so the estimate may not exceed
 * what the activity can physically cost. 1.5x the vigorous tier leaves room
 * for a genuinely hard effort; archetypes with no tier table fall back to a
 * flat 18.0, near the ceiling of sustained human output.
 */
function hrCeilingMet(arch: Archetype): number {
  const tiered = TIERED_MET[arch];
  return tiered ? tiered.hard * 1.5 : 18.0;
}

function heartRateKcal(
  hr: number,
  weight: number,
  age: number,
  gender: string,
  duration: number,
): number {
  // "Other" and anything unrecognised take the male equation, matching calcBMR
  // in lib/nutrition.ts so the two never disagree for the same profile.
  // Note: Keytel et al. (2005) specifies a negative coefficient for female weight.
  if (gender === "Female") {
    return (
      ((-20.4022 + 0.4472 * hr - 0.1263 * weight + 0.074 * age) / 4.184) *
      duration
    );
  }
  const raw =
    ((-55.0969 + 0.6309 * hr + 0.1988 * weight + 0.2017 * age) / 4.184) *
    duration;
  return raw * MALE_KEYTEL_BIAS;
}

// ── Level 2: Speed-based ─────────────────────────────────────────────────────

/** Cycling speed brackets: [max_kmh, MET] pairs, ordered ascending. */
const CYCLING_BRACKETS: [number, number][] = [
  [16, 4.0],
  [19, 6.8],
  [22, 8.0],
  [25, 10.0],
  [Infinity, 12.0],
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
function acsmRunKcalMin(
  speed_kmh: number,
  weight_kg: number,
  grade: number,
): number {
  const speed_mmin = (speed_kmh * 1000) / 60; // m/min
  const vo2_net = 0.2 * speed_mmin + 0.9 * speed_mmin * grade;
  return (vo2_net * weight_kg) / 200;
}

/** ACSM walking net VO2 equation (omits 3.5 ml/kg/min resting baseline). */
function acsmWalkKcalMin(
  speed_kmh: number,
  weight_kg: number,
  grade: number,
): number {
  const speed_mmin = (speed_kmh * 1000) / 60;
  const vo2_net = 0.1 * speed_mmin + 1.8 * speed_mmin * grade;
  return (vo2_net * weight_kg) / 200;
}

// ── Strength: MET, load and tempo ────────────────────────────────────────────

/**
 * MET while a set is actually running, by muscle group.
 *
 * These are DURING-SET values, not whole-bout values. The Compendium's
 * resistance entries average rest into the number; this path bills active and
 * rest seconds separately, so the during-set figure is necessarily higher. What
 * keeps them honest is the blend: active plus rest has to land back on the
 * Compendium's own bout codes — 3.5 light (02054, multiple exercises 8-15 reps),
 * 5.0 (02052, squats and deadlift), 6.0 (02050, power lifting or body building,
 * vigorous). calorieEngine.ranges.test.ts asserts exactly that.
 *
 * Muscle mass under load is the only axis 469 bare exercise names can support.
 * Keys must match EXERCISES_DB; the test suite asserts it, so a renamed group
 * fails loudly instead of silently dropping every exercise in it to the default.
 */
export const MUSCLE_MET: Record<string, number> = {
  // Multi-joint, largest mass — squat, deadlift, hip thrust. Implied by 02040
  // (circuit incl. kettlebells, minimal rest, vigorous, 7.5 bout) unblended.
  quads: 9.0,
  hamstrings: 9.0,
  glutes: 9.0,
  // Large but seated or supported — rows, pulldowns, pull-ups.
  back: 8.0,
  // Upper-body press and pull. 02032 (circuit, body weight, 6.0 bout) unblended.
  chest: 7.0,
  shoulders: 7.0,
  // Shrugs, back extensions, banded hip work — short range, moderate mass.
  traps: 5.5,
  lowerback: 5.5,
  abductors: 5.5,
  adductors: 5.5,
  // Dynamic ab work. 02022 calisthenics moderate (push ups, sit ups) 3.8 bout.
  abs: 5.0,
  // Single-joint, small mass. Below the 02054 resistance floor of 3.5 bout.
  biceps: 4.5,
  triceps: 4.5,
  forearms: 4.5,
  calves: 4.5,
};

/** Unresolved exercise name — the last-resort MET, reported as low confidence. */
const STRENGTH_DEFAULT_MET = 5.0;

/**
 * Static holds. Nothing moves, so the muscle-mass axis stops meaning much and
 * one number is more honest than fifteen. 02030 (calisthenics, light or moderate,
 * general) 3.5, which blends to 2.6-3.0 over a set of holds and brackets 02024
 * (calisthenics light — curl ups, crunches, plank) at 2.8.
 */
const ISOMETRIC_MET = 3.5;

/**
 * Assisted pull-ups and dips: the machine carries part of bodyweight, so less of
 * it gets lifted. The Compendium has no assisted entry — this is a calibration
 * between calisthenics moderate (02022, 3.8) and vigorous (02020, 7.5).
 */
const ASSISTED_FACTOR = 0.8;

/**
 * Rest between sets. 07040 (standing quietly) is 1.3; 1.5 covers the breathing
 * and heart rate that have not yet come back down after a set. At a 60 s rest
 * this governs roughly two thirds of the session's wall-clock time, which makes
 * it the model's most sensitive constant.
 */
const REST_MET = 1.5;

/**
 * Intensity multipliers, taken as ratios against the Compendium's moderate
 * resistance entry: 3.5/5.0 = 0.7 light (02054), 6.0/5.0 = 1.2 vigorous (02050).
 */
const STRENGTH_INTENSITY: Record<"light" | "default" | "hard", number> = {
  light: 0.7,
  default: 1.0,
  hard: 1.2,
};

/**
 * Load a typical trainee handles on that group's main lift, as a multiple of
 * body weight. Dividing the logged load by body weight and comparing against
 * this gives an intensity tier without needing a per-exercise strength standard.
 *
 * ponytail: these are a calibration, not a sourced table — the Compendium has
 * nothing at this resolution. They are the widest lever in the whole model (the
 * light-to-hard span is 0.7 to 1.2), so they are the first thing to revisit if
 * the numbers read wrong in use. Replace with real strength standards per
 * exercise if that ever matters more than the data cost.
 */
export const LOAD_REF: Record<string, number> = {
  glutes: 1.2,
  quads: 1.0,
  calves: 1.0,
  hamstrings: 0.9,
  chest: 0.8,
  traps: 0.8,
  back: 0.7,
  shoulders: 0.5,
  abductors: 0.5,
  adductors: 0.5,
  triceps: 0.3,
  lowerback: 0.3,
  biceps: 0.25,
  forearms: 0.25,
  abs: 0.2,
};

/** One rep is roughly 1 s lifting and 2 s lowering. Reps are all the form
 *  collects, so time under load has to come from a tempo assumption. */
const SEC_PER_REP = 3;

/** Rest assumed when the caller supplies none. */
const DEFAULT_REST_SEC = 60;

// ── Level 4: Tiered MET tables ───────────────────────────────────────────────

interface TieredMet {
  light: number;
  default: number;
  hard: number;
}

// Ergometer tiers follow the Compendium's own effort and wattage bands:
// stationary rowing 5.0 / 7.5 / 11.0, elliptical 5.0 moderate and 9.0 vigorous,
// ski machine 6.8 general and 10.5 double-poling. The air bike has no Compendium
// code of its own and is anchored to stationary cycling's wattage bands, which
// understates it slightly since it drives the arms as well.
const TIERED_MET: Partial<Record<Archetype, TieredMet>> = {
  yoga: { light: 2.5, default: 3.0, hard: 4.0 },
  stretching: { light: 2.3, default: 2.5, hard: 3.5 },
  rower: { light: 5.0, default: 7.5, hard: 11.0 },
  skierg: { light: 6.8, default: 10.5, hard: 14.0 },
  elliptical: { light: 3.5, default: 5.0, hard: 9.0 },
  air_bike: { light: 6.0, default: 9.0, hard: 13.0 },
  swimming: { light: 5.5, default: 7.0, hard: 9.5 },
  zumba: { light: 5.5, default: 7.0, hard: 8.5 },
  dance: { light: 4.5, default: 6.0, hard: 8.0 },
  sports_badminton: { light: 4.5, default: 5.5, hard: 7.0 },
  sports_cricket: { light: 3.5, default: 4.8, hard: 7.0 },
  sports_football: { light: 6.0, default: 8.0, hard: 10.0 },
  tabata_interval: { light: 8.0, default: 10.0, hard: 13.0 },
  // The Compendium's resistance ladder used verbatim: 02054 multiple exercises
  // 8-15 reps 3.5 / 02052 squats, deadlift 5.0 / 02050 power lifting or body
  // building, vigorous 6.0. Whole-bout convention, rest included, so this is
  // only reached when no set rows were supplied. It also gives strength a
  // 9.0 MET heart-rate ceiling for free via hrCeilingMet().
  strength: { light: 3.5, default: 5.0, hard: 6.0 },
};

/** Flat MET for locomotion archetypes logged without a usable distance. */
const FALLBACK_MET: Partial<Record<Archetype, number>> = {
  treadmill: 9.8,
  run: 9.8,
  walk: 3.5,
  cycling: 7.5,
};

/** Map user-facing intensity strings to tier keys. */
function intensityTier(
  intensity: string | null | undefined,
): "light" | "default" | "hard" {
  if (!intensity) return "default";
  const lower = intensity.toLowerCase();
  if (lower === "light" || lower === "casual") return "light";
  if (lower === "vigorous" || lower === "training" || lower === "hard")
    return "hard";
  return "default"; // Moderate, Competitive, or unknown
}

// ── Strength session shape ───────────────────────────────────────────────────

export interface StrengthSession {
  /** Seconds of actual work across every set. */
  active_sec: number;
  /** Seconds of rest, counted between sets only. */
  rest_sec: number;
  /** The during-set MET after the intensity tier is applied. */
  met: number;
  /** Volume-weighted mean load in kg, or null when the sets carry no weight. */
  mean_load_kg: number | null;
  tier: "light" | "default" | "hard";
  /** False when the exercise name is unknown and the MET was defaulted. */
  met_resolved: boolean;
}

/**
 * Reduce set rows to the numbers both formulas need. Returns null when there is
 * nothing usable, so the caller falls through to heart rate and then the tables.
 *
 * Rest falls BETWEEN sets, so n sets carry n-1 rests. Counting a rest after the
 * final set bills time the user has already left the gym for.
 */
export function summarizeStrength(
  exercise: string,
  sets: StrengthSet[],
  rest_sec_each: number | null | undefined,
  body_weight_kg: number,
): StrengthSession | null {
  if (!Array.isArray(sets) || sets.length === 0) return null;

  const kind = exerciseKind(exercise);
  const group = MUSCLE_OF.get(exercise.toLowerCase());
  const met_resolved = group != null && MUSCLE_MET[group] != null;

  let active_sec = 0;
  let load_x_reps = 0;
  let total_reps = 0;
  for (const s of sets) {
    if (kind === "isometric") {
      active_sec += Math.max(0, num(s.hold_sec) ?? 0);
      continue;
    }
    const reps = Math.max(0, num(s.reps) ?? 0);
    active_sec += reps * SEC_PER_REP;
    const load = num(s.weight_kg);
    // A zero-rep row contributes nothing to the mean: it is an empty row in the
    // form, not a set performed with no load.
    if (load != null && load > 0 && reps > 0) {
      load_x_reps += load * reps;
      total_reps += reps;
    }
  }
  if (active_sec <= 0) return null;

  const mean_load_kg = total_reps > 0 ? load_x_reps / total_reps : null;

  // Load picks the tier, measured against the user's own body weight so no
  // per-exercise strength standard is needed. Isometrics and bodyweight work
  // have no external load to judge, so they sit at the default tier.
  let tier: "light" | "default" | "hard" = "default";
  if (
    mean_load_kg != null &&
    body_weight_kg > 0 &&
    group != null &&
    LOAD_REF[group] != null
  ) {
    const ratio = mean_load_kg / body_weight_kg;
    const ref = LOAD_REF[group];
    // Assistance inverts the scale: more of it means less bodyweight lifted,
    // so a big assist number is an easier set, not a harder one.
    if (kind === "assisted") tier = ratio > 0.4 * ref ? "light" : "default";
    else if (ratio < 0.6 * ref) tier = "light";
    else if (ratio > 1.4 * ref) tier = "hard";
  }

  const base =
    kind === "isometric"
      ? ISOMETRIC_MET
      : (group != null
          ? (MUSCLE_MET[group] ?? STRENGTH_DEFAULT_MET)
          : STRENGTH_DEFAULT_MET) * (kind === "assisted" ? ASSISTED_FACTOR : 1);

  return {
    active_sec,
    rest_sec:
      (num(rest_sec_each) ?? DEFAULT_REST_SEC) * Math.max(0, sets.length - 1),
    met: base * STRENGTH_INTENSITY[tier],
    mean_load_kg,
    tier,
    met_resolved,
  };
}

/** Rest-phase energy. Shared by both formulas — rest costs the same either way. */
export function restKcal(rest_min: number, weight_kg: number): number {
  return (rest_min * (REST_MET * 3.5 * weight_kg)) / 200;
}

/** Whole-session minutes implied by the set rows, before any manual override. */
export const strengthDurationMin = (s: StrengthSession): number =>
  (s.active_sec + s.rest_sec) / 60;

export type ConfidenceTier = "high" | "medium" | "low";

/**
 * How wide the reported band should be.
 *
 * A single integer would overstate what any of these formulas can resolve.
 * Heart rate measures the individual and earns the tightest band; a known MET
 * still carries the Compendium's between-subject spread of roughly 25%; a
 * defaulted MET is a guess at the exercise on top of that.
 */
const BAND: Record<ConfidenceTier, number> = {
  high: 0.1,
  medium: 0.2,
  low: 0.3,
};

export function calorieRange(
  kcal: number,
  tier: ConfidenceTier,
): { low: number; high: number } {
  const b = BAND[tier];
  return {
    low: Math.max(0, Math.round(kcal * (1 - b))),
    high: Math.round(kcal * (1 + b)),
  };
}

/** Which band a finished result earns. */
export function confidenceTier(
  method: CalcMethod,
  met_resolved: boolean,
): ConfidenceTier {
  if (method === "HEART_RATE") return "high";
  return met_resolved ? "medium" : "low";
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
  if (
    duration_min == null ||
    duration_min <= 0 ||
    weight_kg == null ||
    weight_kg <= 0
  ) {
    return res(0, "GENERIC", "estimated");
  }

  const age = num(user.age) ?? DEFAULT_AGE;
  const gender = user.gender ?? "";
  const hours = duration_min / 60;
  const hr_bpm = num(inputs.hr_bpm);
  const distance_km = num(inputs.distance_km);

  // ── Level 0: Measured mechanical power ──
  // Work actually done on the flywheel beats every regression below it: there
  // is no resistance level, cadence or fitness assumption left to get wrong.
  const watts = num(inputs.avg_power_w);
  if (
    watts != null &&
    watts >= MIN_POWER_W &&
    watts <= MAX_POWER_W &&
    POWER_ARCHETYPES.has(arch)
  ) {
    return res(powerKcal(watts, weight_kg, duration_min), "POWER", "measured");
  }

  // ── Level 1: Heart Rate ──
  // Keytel is validated only for active exercise (>= 85 bpm). Below 85 bpm
  // (resting/recovery HR), heart rate does not linearly track exercise VO2,
  // so we fall through to the category's speed or MET tables.
  // Strength sessions split into active and rest phases, and rest costs the
  // same whichever formula runs. Heart rate therefore bills only the active
  // minutes, with rest added on top — otherwise a long rest would be charged
  // at the working heart rate, which is exactly where Keytel over-reads most.
  const strength =
    arch === "strength"
      ? summarizeStrength(
          exercise,
          inputs.strength_sets ?? [],
          inputs.rest_sec,
          weight_kg,
        )
      : null;

  if (
    hr_bpm != null &&
    hr_bpm >= 85 &&
    hr_bpm <= 210 &&
    !isShortInterval(arch, duration_min)
  ) {
    const rest_min = strength ? strength.rest_sec / 60 : 0;
    const active_min = Math.max(0, duration_min - rest_min);
    const hrKcal =
      heartRateKcal(hr_bpm, weight_kg, age, gender, active_min) +
      restKcal(rest_min, weight_kg);
    const ceiling = hrCeilingMet(arch) * weight_kg * hours;
    if (hrKcal > 0)
      return res(Math.min(hrKcal, ceiling), "HEART_RATE", "measured");
  }

  // ── Level 1b: Strength sets (Formula A) ──
  // Reached only without a usable heart rate, matching the spec: heart rate is
  // the more accurate path and takes precedence whenever it is present.
  if (strength) {
    const rest_min = strength.rest_sec / 60;
    // duration_min is the total the form shows, so overriding it stretches the
    // active phase rather than inventing extra rest.
    const active_min = Math.max(0, duration_min - rest_min);
    const active_kcal = (active_min * (strength.met * 3.5 * weight_kg)) / 200;
    return res(
      active_kcal + restKcal(rest_min, weight_kg),
      "STRENGTH_SETS",
      "estimated",
    );
  }

  // ── Level 2: Speed-based (locomotion with distance) ──
  const maxSpeed = MAX_SPEED[arch];
  if (distance_km != null && distance_km > 0 && maxSpeed != null) {
    const speed_kmh = distance_km / hours;
    if (speed_kmh <= maxSpeed) {
      if (arch === "treadmill") {
        const grade = (num(inputs.incline_pct) ?? 0) / 100;
        const fn = speed_kmh < 6.0 ? acsmWalkKcalMin : acsmRunKcalMin;
        return res(
          fn(speed_kmh, weight_kg, grade) * duration_min,
          "ACSM_TREADMILL",
          "estimated",
        );
      }
      if (arch === "run") {
        const fn = speed_kmh < 6.0 ? acsmWalkKcalMin : acsmRunKcalMin;
        return res(
          fn(speed_kmh, weight_kg, 0) * duration_min,
          "ACSM_RUN",
          "estimated",
        );
      }
      if (arch === "walk") {
        // ACSM's walking equation is only valid to 100 m/min (6.0 km/h). Above
        // that it halves the burn, and anything logged as a walk at that pace
        // is either a jog or a race walk — both of which the running equation
        // is the validated one for. Same switch run and treadmill already use.
        const fn = speed_kmh < 6.0 ? acsmWalkKcalMin : acsmRunKcalMin;
        return res(
          fn(speed_kmh, weight_kg, 0) * duration_min,
          "ACSM_WALK",
          "estimated",
        );
      }
      if (arch === "cycling") {
        return res(
          bracketMet(speed_kmh, CYCLING_BRACKETS) * weight_kg * hours,
          "SPEED_MET",
          "estimated",
        );
      }
    }
    // Implausible speed: fall through to the MET tables.
  }

  // ── Level 3: Vertical / rep work ──
  // No vertical_meters or skip-rate field exists on the board yet, so both use
  // their slow-pace MET.
  if (arch === "stair")
    return res(9.0 * weight_kg * hours, "VERTICAL", "estimated");
  if (arch === "jump_rope")
    return res(11.0 * weight_kg * hours, "VERTICAL", "estimated");

  // ── Level 4: Tiered MET fallback ──
  const tiered = TIERED_MET[arch];
  if (tiered) {
    return res(
      tiered[intensityTier(inputs.intensity)] * weight_kg * hours,
      "TIER_MET",
      "estimated",
    );
  }

  const flat = FALLBACK_MET[arch];
  if (flat) return res(flat * weight_kg * hours, "TIER_MET", "estimated");

  // ── Level 5: Generic last resort ──
  return res(5.0 * weight_kg * hours, "GENERIC", "estimated");
}
