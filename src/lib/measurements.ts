/**
 * Body measurements — the metric vocabulary and every pure function, in one
 * place so nothing is hardcoded in JSX and the maths is testable without a
 * browser. See src/lib/measurements.test.ts for the runnable check.
 *
 * Storage: public.body_measurements holds one row per user per date with a
 * jsonb map of storage key -> centimetres, e.g. { "biceps_left": 35.5 }.
 * The keys are flat because the CHECK constraint on that column rejects nested
 * objects — see the 20260826140000_body_measurements migration.
 *
 * Body-part circumferences here are always centimetres. Body WEIGHT, however,
 * follows the user's weight-unit preference (see src/lib/units.ts and
 * workout_profile.weight_unit): it is stored canonically in kg (weight_kg) and
 * converted for display/entry. Height stays centimetres.
 *
 * ─── Profile / weight validation ────────────────────────────────────────────
 *
 * Bounds for the body measurements the user can type, and one validator for
 * all of them.
 *
 * The quiz already constrains these — its weight slider is 30–200 kg, its
 * height slider 100–250 cm, and it refuses to continue under age 16 — but the
 * quiz is the only place that did. The Weight page and the Profile page take
 * the same numbers through bare `<Input type="number">` fields with no `min`,
 * no `max` and no check before the write, so a goal weight of 1 kg saved
 * happily and then drove the progress ring, the chart's target line, and the
 * AI motivation prompt.
 *
 * These constants are the single source of truth. The sliders in quiz.tsx and
 * the check constraints in the migration both mirror them, so there is one
 * place to change if the range is ever wrong.
 */

// ── Body-tape tracking ───────────────────────────────────────────────────────

/** Step for the +/- buttons, in cm. Half a centimetre is about as fine as a
 *  tape measure around a limb is honestly repeatable. */
export const STEP = 0.5;

export type Side = "left" | "right";

export interface Metric {
  id: string;
  label: string;
  emoji: string;
  /** Anatomy reference image (small icon). Falls back to `emoji` when absent. */
  img?: string;
  /** Plausible range in cm, shared by both sides. Mirrors, more tightly, the
   *  0 < value <= 400 CHECK that the database enforces. */
  min: number;
  max: number;
  /** Limbs come in pairs and people track them separately; a torso does not. */
  sided: boolean;
}

export const METRICS: readonly Metric[] = [
  { id: "biceps", label: "Biceps", emoji: "💪", img: "/images/biceps%20final.png", min: 15, max: 70, sided: true },
  { id: "chest", label: "Chest", emoji: "🫁", img: "/images/chestfinal.png", min: 50, max: 200, sided: false },
  { id: "thigh", label: "Thigh", emoji: "🦵", img: "/images/legs.png", min: 30, max: 120, sided: true },
  {
    id: "abdomen",
    label: "Abdomen",
    emoji: "🧍",
    img: "/images/corefinal.png",
    min: 40,
    max: 200,
    sided: false,
  },
];

export function findMetric(id: string): Metric | undefined {
  return METRICS.find((m) => m.id === id);
}

/** A row as it comes back from the table. `measurements` is deliberately loose:
 *  it is jsonb, and a row written by an older build may hold keys this one does
 *  not know about. Readers ask for the keys they want and tolerate absence. */
export interface MeasurementRow {
  measured_at: string;
  measurements: Record<string, number>;
  note?: string | null;
}

/**
 * The single authority on storage keys — "biceps" + "left" -> "biceps_left",
 * "chest" -> "chest".
 *
 * Every read and every write goes through here so the two can never drift into
 * writing `biceps_l` and reading `biceps_left`. Sides are spelled out because
 * these keys get read by a human looking at raw jsonb in the Supabase table
 * editor, and the saved characters buy nothing.
 */
export function fieldKey(metricId: string, side?: Side): string {
  return side ? `${metricId}_${side}` : metricId;
}

/** Every storage key a metric can produce, in display order. */
export function fieldKeys(metric: Metric): string[] {
  return metric.sided
    ? [fieldKey(metric.id, "left"), fieldKey(metric.id, "right")]
    : [fieldKey(metric.id)];
}

/** Rows newest-first, which is the order the table query already returns. */
function byNewest(rows: MeasurementRow[]): MeasurementRow[] {
  return [...rows].sort((a, b) => b.measured_at.localeCompare(a.measured_at));
}

/** Rows holding a value for `key`, newest first. The jsonb column is sparse —
 *  a row logging only chest has no biceps key at all — so every reader below
 *  filters rather than assuming the newest row answers the question. */
function rowsWith(rows: MeasurementRow[], key: string): MeasurementRow[] {
  return byNewest(rows).filter(
    (r) => typeof r.measurements?.[key] === "number",
  );
}

/**
 * The most recent value for one storage key, with the date it was taken.
 *
 * Note this is not "the newest row" — a row logged yesterday holding only chest
 * must not hide a biceps value from last week.
 */
export function latestFor(
  rows: MeasurementRow[],
  key: string,
): { value: number; date: string } | null {
  const hit = rowsWith(rows, key)[0];
  return hit ? { value: hit.measurements[key], date: hit.measured_at } : null;
}

/** Signed change from the previous entry holding this key. Null until there are
 *  two of them — one measurement is not a trend. */
export function deltaFor(rows: MeasurementRow[], key: string): number | null {
  const hits = rowsWith(rows, key);
  if (hits.length < 2) return null;
  return round1(hits[0].measurements[key] - hits[1].measurements[key]);
}

/**
 * Right minus left, from the newest row carrying BOTH sides. Null for an
 * unsided metric, or when no single session recorded the pair.
 *
 * Comparing across sessions would be misleading: a left arm from March against
 * a right arm from August is a difference in time, not in the body.
 */
export function imbalance(
  rows: MeasurementRow[],
  metricId: string,
): number | null {
  const metric = findMetric(metricId);
  if (!metric?.sided) return null;
  const left = fieldKey(metricId, "left");
  const right = fieldKey(metricId, "right");
  const hit = byNewest(rows).find(
    (r) =>
      typeof r.measurements?.[left] === "number" &&
      typeof r.measurements?.[right] === "number",
  );
  return hit ? round1(hit.measurements[right] - hit.measurements[left]) : null;
}

/** Prose for the imbalance readout. Stated flat, with no threshold and no
 *  colour: calling a given gap concerning is a clinical judgement this app has
 *  no basis for making. */
export function imbalanceLabel(diff: number | null): string | null {
  if (diff === null) return null;
  if (diff === 0) return "Even";
  const side = diff > 0 ? "Right" : "Left";
  return `${side} ${Math.abs(diff)} cm larger`;
}

/** The client mirror of the database CHECK, tightened per metric. Side-
 *  independent — a left and a right biceps share one plausible range.
 *
 *  Named `inRangeMetric` to avoid collision with the profile/weight validator
 *  `inRange(raw, range)` below. */
export function inRangeMetric(metricId: string, value: number): boolean {
  const metric = findMetric(metricId);
  if (!metric) return false;
  return Number.isFinite(value) && value >= metric.min && value <= metric.max;
}

/** One decimal place, which is the precision a tape measure actually offers.
 *  Also kills the float noise in 35.5 - 35.0. */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Clamp a stepped value into the metric's range so +/- can never walk a value
 *  out of bounds and silently disable the save button. */
export function step(metricId: string, value: number, by: number): number {
  const metric = findMetric(metricId);
  const next = round1(value + by);
  if (!metric) return next;
  return Math.min(Math.max(next, metric.min), metric.max);
}

/** Format one metric's values for a history line: "35 / 35.5" for a pair,
 *  "101" for a single, null when the row holds neither. */
export function formatValues(
  row: MeasurementRow,
  metric: Metric,
): string | null {
  const values = fieldKeys(metric).map((k) => row.measurements?.[k]);
  if (values.every((v) => typeof v !== "number")) return null;
  return values.map((v) => (typeof v === "number" ? v : "—")).join(" / ");
}

// ── Profile / weight validation ──────────────────────────────────────────────

export interface Range {
  min: number;
  max: number;
  unit: string;
  label: string;
}

/** Matches the quiz weight slider (30–200 kg). */
export const WEIGHT_KG: Range = {
  min: 30,
  max: 200,
  unit: "kg",
  label: "Weight",
};

/** Goal weight is a body weight, so it lives in the same range. */
export const GOAL_WEIGHT_KG: Range = { ...WEIGHT_KG, label: "Goal weight" };

/** Matches the quiz height slider (100–250 cm). */
export const HEIGHT_CM: Range = {
  min: 100,
  max: 250,
  unit: "cm",
  label: "Height",
};

/** The quiz refuses to continue below 16; the upper bound is a typo guard. */
export const AGE_YEARS: Range = { min: 16, max: 100, unit: "", label: "Age" };

export type Validated =
  | { ok: true; value: number }
  | { ok: false; error: string };

/**
 * Parse and range-check one typed measurement.
 *
 * Rejects blanks, non-numbers, and infinities as well as out-of-range values —
 * `+""` is 0 and `+"abc"` is NaN, and both would otherwise reach the database
 * as a silently wrong number.
 */
export function validateMeasurement(
  raw: string | number,
  range: Range,
): Validated {
  const value = typeof raw === "number" ? raw : parseFloat(String(raw).trim());

  if (!Number.isFinite(value)) {
    return { ok: false, error: `Enter a ${range.label.toLowerCase()}.` };
  }
  if (value < range.min || value > range.max) {
    const unit = range.unit ? ` ${range.unit}` : "";
    return {
      ok: false,
      error: `${range.label} must be between ${range.min}${unit} and ${range.max}${unit}.`,
    };
  }
  return { ok: true, value: Math.round(value * 10) / 10 };
}

/** `true` when the value is inside the range — for live input styling. */
export function inRange(raw: string | number, range: Range): boolean {
  return validateMeasurement(raw, range).ok;
}
