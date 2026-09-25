/**
 * Restaurant menus, kept apart from the everyday food search.
 *
 * Thousands of menu items in the main search would slow every keystroke and
 * push plain foods down the list, so they are only reached through Fast Food
 * Meal: the person names the brand first, then types part of the meal, and
 * only that brand's menu is searched. The data loads on first use as its own
 * chunk, so it is not part of the app's startup download.
 */
import type { IFCTItem } from "./foodDb.ts";
import type { RestaurantBuilder } from "./mealBuilder.ts";

export interface RestaurantDb {
  rows: IFCTItem[];
  /** Build-your-own brands (California Burrito): meals picked ingredient by ingredient. */
  builders: RestaurantBuilder[];
  /** Brand names: each row's `lang`, and every builder brand. */
  brands: string[];
}

let loading: Promise<RestaurantDb> | null = null;

export function loadRestaurants(): Promise<RestaurantDb> {
  loading ??= Promise.all([
    import("../data/restaurantFoods.json"),
    import("../data/restaurantBuilders.json"),
  ]).then(([f, b]) => {
    const rows = (f.default ?? f) as unknown as IFCTItem[];
    const builders = (b.default ?? b) as unknown as RestaurantBuilder[];
    const names = [...rows.map((r) => r.lang), ...builders.map((x) => x.brand)];
    return { rows, builders, brands: [...new Set(names)].sort() };
  });
  return loading;
}

/** "dominos" and "Domino's" are the same brand. */
export const normBrand = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The brand the typed text names exactly, if any. */
export function exactBrand(brands: string[], typed: string) {
  const q = normBrand(typed);
  return q ? brands.find((b) => normBrand(b) === q) : undefined;
}

/** Brands to suggest while the restaurant name is being typed. */
export function brandHints(brands: string[], typed: string, limit = 5) {
  const q = normBrand(typed);
  if (!q || exactBrand(brands, typed)) return [];
  return brands.filter((b) => normBrand(b).includes(q)).slice(0, limit);
}

/**
 * That brand's menu items matching what was typed. Nothing until at least two
 * letters are typed, so the list is a search, not a wall of the whole menu.
 * Every typed word must appear in the item name; names starting with the
 * first word come first.
 */
export function menuMatches(
  rows: IFCTItem[],
  brand: string,
  typed: string,
  limit = 40,
): IFCTItem[] {
  const q = typed.trim().toLowerCase();
  if (q.length < 2) return [];
  const words = q.split(/\s+/);
  const item = (r: IFCTItem) => r.name.slice(brand.length + 1).toLowerCase();
  return rows
    .filter((r) => r.lang === brand && words.every((w) => item(r).includes(w)))
    .sort(
      (a, b) =>
        Number(!item(a).startsWith(words[0])) -
        Number(!item(b).startsWith(words[0])),
    )
    .slice(0, limit);
}
