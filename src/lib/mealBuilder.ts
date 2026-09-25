/**
 * Build-your-own restaurant meals (California Burrito and any brand like it).
 *
 * Such brands publish figures per ingredient, not per meal, so a meal is the
 * sum of what the person picks: a protein, a rice, toppings… The data
 * (src/data/restaurantBuilders.json, made by scripts/build-restaurant-builders.mjs)
 * is brand-neutral — meals, sizes, and each size's ordered steps — so a new
 * brand is a new adapter in that script, never new code here or in the UI.
 *
 * Picks are kept by option NAME per step, not by position: they survive a size
 * change (Regular → Mini keeps the chicken) and a saved "usual" still reloads
 * after the brand reorders its list.
 */
import { KJ_PER_KCAL, type IFCTItem } from "./foodDb.ts";

export interface BuilderOption {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}
/** What a step adds, for its colour in the meal strip. */
export type StepKind = "main" | "base" | "beans" | "veg" | "sauce";
export interface BuilderStep {
  key: string;
  title: string;
  /** "one": required, exactly one (rice has its own "No rice"). "any": optional. */
  pick: "one" | "any";
  kind: StepKind;
  options: BuilderOption[];
}
export interface BuilderSize {
  key: string;
  /** null when the meal comes in one size. */
  label: string | null;
  /** What one of it is called when logged: "bowl", "burrito", "taco". */
  unit: string;
  steps: BuilderStep[];
}
export interface BuilderMeal {
  key: string;
  name: string;
  /** kcal per 100 g, only to estimate a weight (shown with ≈): no brand publishes one. */
  density: number;
  sizes: BuilderSize[];
}
export interface RestaurantBuilder {
  brand: string;
  code: string;
  meals: BuilderMeal[];
}
export type Picks = Record<string, string[]>;
export interface Totals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** A pick-one step with a single option (a burrito's tortilla) is always in. */
export const isFixed = (s: BuilderStep) =>
  s.pick === "one" && s.options.length === 1;

/** Fixed steps picked; everything else empty. */
export function initialPicks(size: BuilderSize): Picks {
  return Object.fromEntries(
    size.steps.map((s) => [s.key, isFixed(s) ? [s.options[0].name] : []]),
  );
}

/** Tap an option: pick-one replaces, pick-any toggles. */
export function toggle(step: BuilderStep, picks: Picks, name: string): Picks {
  const cur = picks[step.key] ?? [];
  const next =
    step.pick === "one"
      ? [name]
      : cur.includes(name)
        ? cur.filter((n) => n !== name)
        : [...cur, name];
  return { ...picks, [step.key]: next };
}

/** The same picks on another size: whatever still exists there is kept. */
export function remapPicks(size: BuilderSize, picks: Picks): Picks {
  const out = initialPicks(size);
  for (const s of size.steps) {
    if (isFixed(s)) continue;
    const names = new Set(s.options.map((o) => o.name));
    out[s.key] = (picks[s.key] ?? []).filter((n) => names.has(n));
  }
  return out;
}

/** Picked options in step order, each with its step. */
export function picked(size: BuilderSize, picks: Picks) {
  return size.steps.flatMap((step) =>
    step.options
      .filter((o) => (picks[step.key] ?? []).includes(o.name))
      .map((option) => ({ step, option })),
  );
}

export function totals(size: BuilderSize, picks: Picks): Totals {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const { option: o } of picked(size, picks)) {
    t.kcal += o.kcal;
    t.protein += o.protein;
    t.carbs += o.carbs;
    t.fat += o.fat;
  }
  return t;
}

/** Required steps still without a pick, in order. */
export const missingSteps = (size: BuilderSize, picks: Picks) =>
  size.steps.filter((s) => s.pick === "one" && !picks[s.key]?.length);

/**
 * "California Burrito Rice Bowl (Regular)". A meal the brand is named after
 * is not said twice: "California Burrito (Regular)", not "…Burrito Burrito".
 */
export const mealTitle = (
  b: RestaurantBuilder,
  meal: BuilderMeal,
  size: BuilderSize,
) => {
  const named = b.brand.toLowerCase().endsWith(meal.name.toLowerCase());
  return `${b.brand}${named ? "" : ` ${meal.name}`}${size.label ? ` (${size.label})` : ""}`;
};

/** The title, then what was picked (a fixed tortilla goes without saying). */
export function buildName(
  b: RestaurantBuilder,
  meal: BuilderMeal,
  size: BuilderSize,
  picks: Picks,
) {
  const parts = picked(size, picks)
    .filter(({ step }) => !isFixed(step))
    .map(({ option }) => option.name);
  return `${mealTitle(b, meal, size)}${parts.length ? `: ${parts.join(", ")}` : ""}`;
}

/**
 * The finished meal as a food for the usual log card, opening on "1 bowl".
 * Per 100 g is derived from an estimated weight, and that same weight is the
 * serving, so logging 1 bowl multiplies back to exactly the summed figures.
 */
export function buildFood(
  b: RestaurantBuilder,
  meal: BuilderMeal,
  size: BuilderSize,
  picks: Picks,
): IFCTItem {
  const t = totals(size, picks);
  const g = Math.max(1, Math.round((t.kcal / meal.density) * 100));
  const per = 100 / g;
  return {
    code: `${b.code}-${meal.key}-${size.key}`,
    name: buildName(b, meal, size, picks),
    scie: "",
    lang: b.brand,
    grup: `Restaurant — ${b.brand}`,
    enerc: t.kcal * per * KJ_PER_KCAL,
    protcnt: t.protein * per,
    choavldf: t.carbs * per,
    fatce: t.fat * per,
    fibtg: null,
    serving_g: g,
    serving_est: true,
    piece_g: g,
    portion_unit: size.unit,
    units: ["pcs", "g"],
    serving_label: `1 ${size.unit} ≈ ${g} g`,
  };
}

// ── Usuals ───────────────────────────────────────────────────────────────────
// A usual is an ordinary saved_meals row (so it is also in Favourites, one tap
// to log), whose ingredients each carry `ref` = "brand|meal|size|step". That is
// enough to reopen the builder on it; no table of its own.

export interface UsualIngredient {
  name: string;
  quantity_g: number;
  calories: number;
  ref?: string;
}

export function usualIngredients(
  b: RestaurantBuilder,
  meal: BuilderMeal,
  size: BuilderSize,
  picks: Picks,
): UsualIngredient[] {
  return picked(size, picks).map(({ step, option }) => ({
    name: option.name,
    // No weight is published per ingredient; 0 means "not given".
    quantity_g: 0,
    calories: option.kcal,
    ref: [b.brand, meal.key, size.key, step.key].join("|"),
  }));
}

export interface Usual {
  meal: BuilderMeal;
  size: BuilderSize;
  picks: Picks;
}

/** The build a saved meal was made from, or null if it isn't one of this brand's. */
export function readUsual(
  b: RestaurantBuilder,
  ingredients: UsualIngredient[] | null | undefined,
): Usual | null {
  const refs = (ingredients ?? []).map((i) => i.ref?.split("|"));
  if (!refs.length || refs.some((r) => !r || r[0] !== b.brand)) return null;
  const [, mealKey, sizeKey] = refs[0]!;
  const meal = b.meals.find((m) => m.key === mealKey);
  const size = meal?.sizes.find((s) => s.key === sizeKey);
  if (!meal || !size) return null;
  const picks = initialPicks(size);
  ingredients!.forEach((ing, i) => {
    const stepKey = refs[i]![3];
    if (stepKey in picks && !picks[stepKey].includes(ing.name))
      picks[stepKey] = [...picks[stepKey], ing.name];
  });
  // Anything the brand has since dropped falls away here.
  return { meal, size, picks: remapPicks(size, picks) };
}
