/**
 * Shared food database + search helpers.
 * Used by the FoodSearch component and the /meal-builder page.
 */

import ifctData from "@/data/ifct2017.json";
import restaurantData from "@/data/restaurantFoods.json";
import { EXTRA_FOODS } from "@/data/extraFoods";
import { serverAiFoodSearch } from "@/lib/ai";

export interface IFCTItem {
  code: string;
  name: string;
  scie: string;
  lang: string;
  grup: string;
  enerc: number | null;
  protcnt: number | null;
  fatce: number | null;
  choavldf: number | null;
  fibtg: number | null;
  /**
   * Weight of one serving, for items that come as a portion rather than an
   * ingredient — a burger, a sub, a cup of a drink. Per 100 g remains the
   * storage basis for every food; this only changes the quantity the UI starts
   * on, so there is never a second set of numbers that can drift out of step.
   * Absent on IFCT and curated rows, which are ingredients with no fixed
   * portion.
   */
  serving_g?: number;
  /** Display text for the serving, e.g. "1 serving (168 g)". */
  serving_label?: string;
  /**
   * True when `serving_g` was estimated rather than published. Logging one
   * serving still reproduces the source's own per-serving figures exactly —
   * the estimate only affects the per-100 g view and hand-edited quantities.
   */
  serving_est?: boolean;
}

export const KJ_PER_KCAL = 4.184;

/** Full searchable database: IFCT 2017 + curated prepared foods + menu items. */
export const ITEMS: IFCTItem[] = [
  ...(ifctData as IFCTItem[]),
  ...(EXTRA_FOODS as IFCTItem[]),
  ...(restaurantData as IFCTItem[]),
];

/**
 * The quantity, in grams, that the UI should start on for an item. A menu item
 * opens at one serving because nobody weighs a burger; an ingredient opens at
 * 100 g, which is the basis its numbers are quoted on.
 */
export const defaultQtyFor = (item: IFCTItem): number => item.serving_g ?? 100;

/** kJ → kcal (IFCT stores energy in kJ). */
export const kcal = (kj: number | null) => (kj == null ? 0 : kj / KJ_PER_KCAL);

/** Relevance rank for a search term — lower is better, 5 = no match. */
export function rank(item: IFCTItem, q: string): number {
  const name = item.name.toLowerCase();
  const lang = item.lang.toLowerCase();
  if (name.startsWith(q)) return 0;
  if (name.includes(` ${q}`)) return 1;
  if (name.includes(q)) return 2;
  if (lang.includes(q)) return 3;
  return 5;
}

/** Local search over the combined database. */
export function searchFoods(query: string, limit = 8): IFCTItem[] {
  const term = query.trim().toLowerCase();
  if (term.length < 2) return [];
  const matches: { item: IFCTItem; r: number }[] = [];
  for (const it of ITEMS) {
    const r = rank(it, term);
    if (r < 5) matches.push({ item: it, r });
  }
  matches.sort((a, b) => a.r - b.r || a.item.name.localeCompare(b.item.name));
  return matches.slice(0, limit).map((m) => m.item);
}

/**
 * AI fallback search — asks the LLM for typical per-100g values when the
 * local database has no match. Returns up to 3 IFCT-shaped items.
 */
export async function aiFoodSearch(query: string): Promise<IFCTItem[]> {
  if (query.trim().length < 2) return [];
  const { items } = await serverAiFoodSearch({ data: query });
  return (items || []) as IFCTItem[];
}

