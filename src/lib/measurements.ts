/**
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
