/**
 * Shared food database + search helpers.
 * Used by the FoodSearch component and the /meal-builder page.
 */

import ifctData from "../data/ifct2017.json" with { type: "json" };
import { EXTRA_FOODS } from "../data/extraFoods.ts";
import type { Unit } from "./foodUnits.ts";

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
  /** Display text for the serving, e.g. "1 burger = 168 g". */
  serving_label?: string;
  /**
   * What one piece is called on a restaurant row ("burger", "bowl", "regular
   * pizza", "serving"). The row sets `piece_g` to its serving, so logging in
   * `pcs` logs whole portions, and the UI says "1 burger" instead of "1 pcs".
   */
  portion_unit?: string;
  /**
   * True when `serving_g` was estimated rather than published. Logging one
   * serving still reproduces the source's own per-serving figures exactly —
   * the estimate only affects the per-100 g view and hand-edited quantities.
   */
  serving_est?: boolean;

  // ── Carried only by AI fallback rows ──────────────────────────────────────
  // A catalog row never sets these, so every existing food behaves as before.

  /**
   * The words from the query this row was matched to, which the model records
   * before it quotes any number. Shown to the user so a wrong correction —
   * "thatte idli" quietly becoming plain idli — is visible rather than silent.
   */
  heard?: string;
  /** How sure the model is. Below "high" it returns alternatives instead. */
  confidence?: "high" | "medium" | "low";
  /** The units that make sense for this food. Absent means all of them. */
  units?: Unit[];
  /** Grams in one piece, for a countable food with no PIECE_G entry. */
  piece_g?: number;
  /** Grams per millilitre, for a food with no DENSITY entry. */
  density?: number;
  /**
   * What the user typed when this row was fetched. Set on the client, never
   * by the model: a personal name is saved under these words, not under
   * `name`, which is the model's corrected English ("Protein Shake" for "my
   * shake").
   */
  query?: string;
}

export const KJ_PER_KCAL = 4.184;

/**
 * Everyday searchable database: IFCT 2017 + curated prepared foods.
 * Restaurant menus are NOT here: they live in restaurantDb.ts, load only when
 * Fast Food Meal opens, and are searched brand first. Thousands of menu items
 * in this list would slow every keystroke of the main search.
 */
export const ITEMS: IFCTItem[] = [
  ...(ifctData as IFCTItem[]),
  ...(EXTRA_FOODS as IFCTItem[]),
];

/**
 * The quantity, in grams, that the UI should start on for an item. A menu item
 * opens at one serving because nobody weighs a burger; an ingredient opens at
 * 100 g, which is the basis its numbers are quoted on.
 */
export const defaultQtyFor = (item: IFCTItem): number => item.serving_g ?? 100;

/** kJ → kcal (IFCT stores energy in kJ). */
export const kcal = (kj: number | null) => (kj == null ? 0 : kj / KJ_PER_KCAL);

/**
 * Energy for one item, in kcal per 100 g.
 *
 * Prefer the source's own figure, but fall back to Atwater when it has none:
 * all 14 IFCT oils and fats report `enerc: 0` alongside `fatce: 100`, so
 * reading `enerc` alone logs a tablespoon of oil as zero calories.
 */
export const kcalOf = (it: IFCTItem) =>
  it.enerc
    ? it.enerc / KJ_PER_KCAL
    : 9 * (it.fatce ?? 0) + 4 * (it.protcnt ?? 0) + 4 * (it.choavldf ?? 0);

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

/**
 * 0 for a curated extraFoods row (every code there is prefixed "X"), 1 for
 * anything else. Curated rows are cooked dishes with a piece weight; the raw
 * corpus rows sharing their names ("Idli", "Naan", "Dhokla") are neither.
 */
export const curatedFirst = (it: IFCTItem) => (it.code.startsWith("X") ? 0 : 1);

/**
 * Local search over the combined database.
 *
 * Two rows with the same name tie on rank and on name, and ITEMS lists the
 * IFCT corpus before extraFoods, so the raw row used to win every such tie:
 * "idli" opened on ASC144 (138 kcal, no piece weight) instead of the curated
 * XE004. Names compare case-insensitively so "Masala dosa" and "Masala Dosa"
 * tie too, and only then does the curated row go first. Rank and name still
 * decide everything else, so a query with one clear match is untouched.
 */
export function searchFoods(query: string, limit = 8): IFCTItem[] {
  const term = query.trim().toLowerCase();
  if (term.length < 2) return [];
  const matches: { item: IFCTItem; r: number }[] = [];
  for (const it of ITEMS) {
    const r = rank(it, term);
    if (r < 5) matches.push({ item: it, r });
  }
  matches.sort(
    (a, b) =>
      a.r - b.r ||
      a.item.name.localeCompare(b.item.name, undefined, {
        sensitivity: "base",
      }) ||
      curatedFirst(a.item) - curatedFirst(b.item),
  );
  return matches.slice(0, limit).map((m) => m.item);
}
