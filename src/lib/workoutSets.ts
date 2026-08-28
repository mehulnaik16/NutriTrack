/**
 * The shape of one logged set, and the readers for it.
 *
 * Sets live in workout_logs.exercises_done (jsonb) — there is no sets table.
 * That column is polymorphic and holds three shapes:
 *   - logged sets   → [{ reps?, weight?, duration_seconds?, rpe?, unit?, kind? }]
 *   - cardio        → { bpm, distance }        (an object, not an array)
 *   - plan template → [{ name, sets, reps }]   (exercises, not sets)
 * Every read goes through setsOf so no caller can trip over the other two.
 *
 * weight and reps are strings because they come straight off
 * <input type="number">; duration_seconds and rpe are numbers because they are
 * computed rather than typed raw. Readers parse defensively either way — logs
 * written before this module existed carry no kind at all.
 */
import type { ExerciseKind } from "./exerciseKind.ts";
import { type WeightUnit, convWeight, round1 } from "@/lib/units";

export interface LoggedSet {
  /** weighted, bodyweight, assisted */
  reps?: string;
  /** weighted: the load · bodyweight: added weight · assisted: the assistance */
  weight?: string;
  /** isometric: hold time */
  duration_seconds?: number;
  /** bodyweight and isometric only: 1..10 */
  rpe?: number;
  unit?: "kg" | "lbs";
  /** Stamped at write time so readers never re-derive it. Absent on old logs. */
  kind?: ExerciseKind;
}

const num = (v: unknown) => parseFloat(String(v ?? "")) || 0;

export const setsOf = (raw: unknown): LoggedSet[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is LoggedSet =>
      !!s &&
      typeof s === "object" &&
      !("name" in s) && // a plan template entry, not a set
      ("weight" in s || "reps" in s || "duration_seconds" in s),
  );
};

/**
 * A logged set's weight converted into `to`. The set stores its own unit (legacy
 * logs may be lbs; absent → kg); this normalizes any set to the requested unit so
 * charts/lists never mix units.
 */
export const setWeightIn = (s: LoggedSet, to: WeightUnit): number =>
  convWeight(num(s.weight), s.unit ?? "kg", to);

/** Epley formula — estimated one-rep max. */
export const estimate1RM = (weight: number, reps: number): number => {
  if (!weight || !reps) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
};

export const formatDuration = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

/** Accepts "2:30" or a bare "150" (seconds). Returns 0 on anything unparseable. */
export const parseDuration = (text: string): number => {
  const t = String(text ?? "").trim();
  if (!t) return 0;
  if (!t.includes(":")) return Math.max(0, Math.floor(num(t)));
  const [m, s] = t.split(":");
  return Math.max(0, Math.floor(num(m) * 60 + num(s)));
};

/** One history row, rendered per kind, with weights shown in `displayUnit`. */
export const formatSet = (s: LoggedSet, displayUnit: WeightUnit = "kg"): string => {
  const unit = displayUnit;
  const w = round1(setWeightIn(s, unit));
  const rpe = s.rpe ? ` · RPE ${s.rpe}` : "";
  if (s.kind === "isometric" || (!s.reps && s.duration_seconds))
    return `${formatDuration(s.duration_seconds ?? 0)}${s.weight ? ` +${w}${unit}` : ""}${rpe}`;
  if (s.kind === "assisted") return `${num(s.reps)} reps · −${w}${unit} assist`;
  if (s.kind === "bodyweight")
    return `${num(s.reps)} reps${s.weight ? ` +${w}${unit}` : ""}${rpe}`;
  return `${num(s.reps)} reps @ ${w} ${unit}`;
};

/** The stats line under the set table, and the Analytics summary card. */
export const summarizeSets = (
  kind: ExerciseKind,
  sets: LoggedSet[],
  displayUnit: WeightUnit = "kg",
): { label: string; value: string } => {
  if (kind === "isometric") {
    const total = sets.reduce((t, s) => t + (s.duration_seconds ?? 0), 0);
    return { label: "Total hold time", value: formatDuration(total) };
  }
  if (kind === "bodyweight" || kind === "assisted") {
    const total = sets.reduce((t, s) => t + num(s.reps), 0);
    return { label: "Total reps", value: `${total} reps` };
  }
  const best = sets.reduce(
    (b, s) => Math.max(b, estimate1RM(setWeightIn(s, displayUnit), num(s.reps))),
    0,
  );
  return { label: "Est. 1RM from these sets", value: `${round1(best)} ${displayUnit}` };
};
