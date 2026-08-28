/**
 * Weight/distance unit conversions for the per-user unit preference.
 *
 * Two units per dimension: the ORIGINAL unit (chosen once at first workout-setup,
 * what the DB stores in and graphs plot in) and the CURRENT unit (editable, what
 * the logging card / history lists / inputs display). Body weight stays stored in
 * kg regardless (BMI/calorie math depends on it) — see weight.tsx.
 *
 * Factors are the user-specified 2.2 (kg↔lbs) and 1.6 (km↔mile) — the same factor
 * both directions, so round-trips are exact.
 */

export type WeightUnit = "kg" | "lbs";
export type DistanceUnit = "km" | "mile";

export const weightToKg = (v: number, u: WeightUnit) => (u === "lbs" ? v / 2.2 : v);
export const kgToWeight = (v: number, u: WeightUnit) => (u === "lbs" ? v * 2.2 : v);
export const convWeight = (v: number, from: WeightUnit, to: WeightUnit) =>
  kgToWeight(weightToKg(v, from), to);

export const distToKm = (v: number, u: DistanceUnit) => (u === "mile" ? v * 1.6 : v);
export const kmToDist = (v: number, u: DistanceUnit) => (u === "mile" ? v / 1.6 : v);
export const convDist = (v: number, from: DistanceUnit, to: DistanceUnit) =>
  kmToDist(distToKm(v, from), to);

export const round1 = (n: number) => Math.round(n * 10) / 10;
