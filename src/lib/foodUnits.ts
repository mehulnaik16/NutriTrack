/**
 * Quantity units for food logging.
 *
 * Grams stay the single basis. Every catalog row quotes nutrition per 100 g, so
 * a unit is only a converter on the way in and a label on the way out — there
 * is never a second set of numbers that can drift out of step with the per-100 g
 * figures. This is the same rule `serving_g` follows in `foodDb.ts`.
 *
 * Kept free of runtime imports so it stays cheap and its self-check can run
 * under bare `node` without pulling in the 1556-row catalog.
 */

import type { Range, Validated } from "./measurements";

export type Unit = "g" | "ml" | "tsp" | "tbsp" | "cup" | "pcs";

/** The only catalog fields this module reads. */
export type UnitFood = { code: string; grup?: string };

/** Every unit, in the order the selector shows them. */
export const UNITS: Unit[] = ["g", "ml", "tsp", "tbsp", "cup", "pcs"];

/** Grams of water in one unit. Volume units are then scaled by density. */
const GRAMS_PER: Record<Exclude<Unit, "pcs">, number> = {
  g: 1,
  ml: 1,
  tsp: 5,
  tbsp: 15,
  cup: 240,
};

/** Units that measure volume, so density applies. */
const VOLUME = new Set<Unit>(["ml", "tsp", "tbsp", "cup"]);

/**
 * Weight of one piece, keyed by food code. Only these foods offer `pcs`.
 *
 * These numbers used to live inside the food names in `extraFoods.ts`
 * ("Idli (1 medium = 50g)"); they are here now so the UI can do the arithmetic
 * instead of the user. Keep in step with the portion sizes in the voice-logging
 * prompt in `FoodSearch.tsx`.
 */
export const PIECE_G: Record<string, number> = {
  XE004: 40, // Idli
  XE005: 40, // Dosa
  XE013: 85, // Masala Dosa
  XE030: 40, // Roti / Chapati
  XE034: 25, // Puri
  XE016: 60, // Plain Paratha
  XE015: 80, // Aloo Paratha
  XE031: 75, // Naan
  XE032: 85, // Butter Naan
  XE023: 50, // Medu Vada
  XE100: 70, // Samosa
  XE130: 20, // Gulab Jamun
  XE131: 25, // Jalebi
  XE134: 25, // Rasgulla
  XE104: 40, // Dhokla
  XE106: 9, // Pani Puri / Gol Gappa
  XE007: 50, // Whole Egg
  XE170: 120, // Banana
};

/**
 * Grams per millilitre, for the foods anyone actually measures by spoon or cup.
 * Group keys cover IFCT wholesale; the code keys are curated rows whose own
 * group ("Dairy & Fats", "Beverages") is too broad to key on.
 */
export const DENSITY: Record<string, number> = {
  "Edible Oils and Fats": 0.91, // IFCT T001–T014, every oil plus ghee
  "Milk and Milk Products": 1.03, // IFCT L001–L004
  XE161: 0.91, // Ghee
  XE162: 0.91, // Butter
  XE149: 1.03, // Full Fat Milk
  XE150: 1.03, // Toned Milk
};

/**
 * Bounds for one logged quantity, in grams. Mirrored by the
 * `food_logs_quantity_g_range` constraint — change both together.
 */
export const QUANTITY_G: Range = {
  min: 0.1,
  max: 5000,
  unit: "g",
  label: "Quantity",
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Weight of one piece, or `undefined` when the food is not countable. */
export const pieceGrams = (food: UnitFood): number | undefined =>
  PIECE_G[food.code];

/** Grams per millilitre. 1 unless the food has a known density. */
export const density = (food: UnitFood): number =>
  DENSITY[food.code] ?? DENSITY[food.grup ?? ""] ?? 1;

/**
 * Units this food can be logged in. `pcs` appears only for countable foods —
 * or when it is already the selected unit, so reopening a log entered in pieces
 * does not show a value missing from its own list.
 */
export const unitsFor = (food: UnitFood, current?: Unit): Unit[] =>
  UNITS.filter(
    (u) => u !== "pcs" || current === "pcs" || pieceGrams(food) !== undefined,
  );

/** Countable foods open in pieces — that is the whole point of counting them. */
export const defaultUnitFor = (food: UnitFood): Unit =>
  pieceGrams(food) === undefined ? "g" : "pcs";

/**
 * Convert an entered quantity to grams. Returns 0 for pieces of a food with no
 * piece weight, so the value fails validation rather than silently logging the
 * count as grams.
 */
export function toGrams(qty: number, unit: Unit, food: UnitFood): number {
  if (unit === "pcs") {
    const per = pieceGrams(food);
    return per === undefined ? 0 : round1(qty * per);
  }
  const factor = VOLUME.has(unit) ? density(food) : 1;
  return round1(qty * GRAMS_PER[unit] * factor);
}

/**
 * Parse, convert, and range-check one typed quantity in a single call, so no
 * caller does its own arithmetic. `value` is grams, ready to log.
 *
 * Rejects blanks and non-numbers as well as out-of-range values — `+""` is 0
 * and `+"abc"` is NaN, and both would otherwise reach the database as a
 * silently wrong number.
 */
export function validateQuantity(
  raw: string | number,
  unit: Unit,
  food: UnitFood,
): Validated {
  const qty = typeof raw === "number" ? raw : parseFloat(String(raw).trim());

  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: "Enter a valid quantity." };
  }
  if (unit === "pcs" && pieceGrams(food) === undefined) {
    return {
      ok: false,
      error: "Weight per piece not set — log this in grams.",
    };
  }

  const grams = toGrams(qty, unit, food);
  if (grams < QUANTITY_G.min || grams > QUANTITY_G.max) {
    return {
      ok: false,
      error: `Quantity must be between ${QUANTITY_G.min} g and ${QUANTITY_G.max} g.`,
    };
  }
  return { ok: true, value: grams };
}

/**
 * How a logged entry's quantity reads back. Falls back to grams for rows
 * written before units existed, which carry no unit at all.
 */
export function formatQty(
  grams: number,
  unit?: string | null,
  unitQty?: number | null,
): string {
  if (unit && unit !== "g" && unitQty != null) {
    return `${+unitQty.toFixed(2)} ${unit}`;
  }
  return `${Math.round(grams)}g`;
}
