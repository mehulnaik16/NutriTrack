/**
 * Meal-category names, persisted server-side.
 *
 * The DB is the source of truth (`user_profiles.meal_names`, a jsonb string
 * array) so custom names survive a cache/session clear and follow the user
 * across devices. localStorage is kept only as a legacy/offline fallback for
 * data written before the column existed. `meal_frequency` (the count) is still
 * written alongside, since older read paths and widgets rely on it.
 */

import { supabase } from "@/integrations/client";
import type { DietPreference, Tables } from "@/integrations/types";

/**
 * One entry of saved_meals.ingredients (a json column), as the meal builder
 * writes it. A type alias rather than an interface so it stays assignable to
 * Json on insert.
 */
export type MealIngredient = {
  name: string;
  quantity_g: number;
  calories: number;
  /**
   * Set on a restaurant build's ingredients ("brand|meal|size|step"), which
   * reopens the builder on it; their quantity_g is 0, as no weight is given.
   */
  ref?: string;
};

/** A saved_meals row with its json ingredients given their real shape. */
export type SavedMeal = Omit<Tables<"saved_meals">, "ingredients"> & {
  ingredients: MealIngredient[] | null;
};

export const DEFAULT_MEALS = ["Breakfast", "Lunch", "Dinner", "Snack"];
const BASE_MEALS = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snack",
  "Meal 5",
  "Meal 6",
];

/** Generic names for a given count, when the user has none saved. */
export function defaultMealsForCount(n: number): string[] {
  const clamped = Math.max(1, Math.min(n, BASE_MEALS.length));
  return BASE_MEALS.slice(0, clamped);
}

function localKey(userId: string) {
  return `meal_prefs_${userId}`;
}

function readLocal(userId: string): string[] | null {
  try {
    const saved = localStorage.getItem(localKey(userId));
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the user's meal names, DB-first. Returns `null` only for a truly
 * first-time user (no DB names, no count, no localStorage) — callers use that
 * to trigger the meal-setup questionnaire.
 */
export async function loadMealNames(userId: string): Promise<string[] | null> {
  const { data } = await supabase
    .from("user_profiles")
    .select("meal_frequency, meal_names")
    .eq("id", userId)
    .maybeSingle();

  const dbNames = data?.meal_names as string[] | null;
  if (Array.isArray(dbNames) && dbNames.length > 0) return dbNames;

  const dbFreq = data?.meal_frequency as number | null;
  const local = readLocal(userId);

  if (dbFreq != null && dbFreq > 0) {
    // Legacy: only the count was in the DB, names in localStorage.
    const names =
      local && local.length === dbFreq ? local : defaultMealsForCount(dbFreq);
    // Backfill the new column so it survives the next cache clear.
    await saveMealNames(userId, names);
    return names;
  }

  if (local) {
    await saveMealNames(userId, local);
    return local;
  }

  return null;
}

/** Persist meal names (and the derived count) to the DB and localStorage. */
export async function saveMealNames(
  userId: string,
  names: string[],
): Promise<void> {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return;
  await supabase
    .from("user_profiles")
    .update({ meal_frequency: clean.length, meal_names: clean })
    .eq("id", userId);
  try {
    localStorage.setItem(localKey(userId), JSON.stringify(clean));
  } catch {
    /* private mode / storage disabled — the DB write already succeeded */
  }
}

/**
 * Diet preference. Asked once in the /food setup modal (step 2) and never shown
 * back to the user — there is deliberately no editor for it and no loader here:
 * `food.tsx` already selects the whole user_profiles row, so the current value
 * comes free with the page's existing fetch.
 */
export const DIET_OPTIONS: { value: DietPreference; label: string }[] = [
  { value: "veg", label: "Vegetarian" },
  { value: "veg_eggs", label: "Eggetarian" },
  { value: "non_veg", label: "Non-vegetarian" },
];

export async function saveDietPreference(
  userId: string,
  pref: DietPreference,
): Promise<void> {
  await supabase
    .from("user_profiles")
    .update({ diet_preference: pref })
    .eq("id", userId);
}
