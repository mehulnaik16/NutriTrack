/**
 * Typo-tolerant search over the food catalog.
 *
 * `searchFoods` in foodDb.ts is prefix/substring only, so "orage" matches
 * nothing and a food we already hold burns a metered Groq call — and gets back
 * invented numbers instead of our measured ones. This layer runs when that one
 * comes up empty, and answers from the catalog wherever it honestly can.
 *
 * It searches `lang` as well as `name`, which is where the value is: 430 IFCT
 * rows carry their regional names there ("Kan. Sajje; Tam. Kambu; Tel.
 * Sajjalu"), so "sajje" resolves to pearl millet locally, with no model
 * involved. Restaurant rows reuse the same field for the brand, so "mcveggie"
 * reaches the McDonald's row the same way.
 *
 * What it deliberately cannot do is native script. `lang` holds romanised
 * regional names, so a Kannada or Tamil query scores nothing here and falls
 * through to the AI path, which reads those scripts itself. A native-script
 * miss in this module is correct behaviour, not a tuning failure.
 */

import Fuse from "fuse.js";
import { ITEMS, curatedFirst, type IFCTItem } from "./foodDb.ts";
import { catalogAliases, isAliasGroup } from "./foodCache.ts";

/**
 * Confident enough to answer from the catalog and skip the model entirely.
 * A real measured row beats an estimate every time, so this is the goal.
 */
export const STRONG_MATCH = 0.25;

/**
 * Too loose to show a user, close enough to hand the model as an anchor. A
 * near-miss row is still real measured data, and grounding on it beats letting
 * the model invent numbers from nothing.
 */
export const WEAK_MATCH = 0.45;

/**
 * Built on first use rather than at module load. Indexing 2,675 rows costs
 * real milliseconds, and most sessions never search a food at all.
 */
interface Indexed {
  item: IFCTItem;
  /** The regional names from `lang`, one per entry, prefixes stripped. */
  alt: string[];
}

/**
 * The language tags this catalog actually uses, derived from every populated
 * `lang` field in ifct2017.json rather than guessed.
 *
 * A closed list, matched only at the START of each ";"-separated part, and
 * possibly several at once ("Mal., Tam., Tel. Kallu."). The old pattern
 * stripped ANY capital letter plus up to four lowercase letters ending in a
 * dot, anywhere in the part, so a regional name that happened to fit that shape
 * vanished: Toddy's "Kallu." was deleted outright, as was the last name of 80+
 * other rows ("U. Bajra."), and "Kaali Mirch." was cut to "Kaali". Every lost
 * name turned a free local match into a paid AI call. A comma after a tag,
 * when several languages share one name ("A., Kash. Baajra"), is stripped
 * with the tags rather than left dangling on the name.
 */
const LANG_TAGS = "A|B|E|G|H|K|Kan|Kash|Kh|Kon|M|Mal|Mar|N|O|P|S|Tam|Tel|U";
const LANG_PREFIX = new RegExp(`^\\s*(?:(?:${LANG_TAGS})\\.\\s*,?\\s*)+`);

/**
 * "A., Kash. Baajra; B. Bajra; E. Pearl millet; Kan. Sajje"
 *   -> ["Baajra", "Bajra", "Pearl millet", "Sajje"]
 *
 * Splitting matters more than it looks. Scored as one 250-character string, a
 * five-letter regional name is noise: "sajje" missed Bajra entirely at 0.53
 * while "kambu" falsely matched Rambutan at 0.23. As separate short entries
 * each name is matched on its own terms.
 */
export function altNames(lang: string): string[] {
  if (!lang) return [];
  return lang
    .split(";")
    .map((part) => part.replace(LANG_PREFIX, "").trim().replace(/\.$/, ""))
    .filter((n) => n.length >= 2);
}

let fuse: Fuse<Indexed> | null = null;

function index(): Fuse<Indexed> {
  if (fuse) return fuse;
  const rows: Indexed[] = ITEMS.map((item) => ({
    item,
    // altNames(lang) covers the 430 real-IFCT rows that carry regional names
    // in `lang`. catalogAliases additionally parses the 1,014 rows that bake
    // aliases into `name` as "(a/b/c)" groups instead — extending the lang
    // shape's coverage rather than replacing it. Deduped: catalogAliases
    // already includes the lang-derived names.
    alt: [...new Set([...altNames(item.lang ?? ""), ...catalogAliases(item)])],
  }));
  fuse = new Fuse(rows, {
    // The English name leads; the regional names and brand back it up. Fuse
    // scores an array key on its best element, which is the whole point of
    // splitting them.
    keys: [
      { name: "item.name", weight: 0.7 },
      { name: "alt", weight: 0.3 },
    ],
    // Fuse's default only matches near the start of a field, which would miss
    // any name that is not the first one listed.
    ignoreLocation: true,
    threshold: WEAK_MATCH,
    includeScore: true,
    minMatchCharLength: 2,
  });
  return fuse;
}

export interface FuzzyMatch {
  item: IFCTItem;
  /** 0 is a perfect match, 1 is no match. */
  score: number;
}

/** Nearest catalog rows to a query, best first. Empty below 2 characters. */
export function fuzzyFoods(query: string, limit = 5): FuzzyMatch[] {
  const term = query.trim();
  if (term.length < 2) return [];
  return index()
    .search(term, { limit })
    .map((r) => ({ item: r.item.item, score: r.score ?? 1 }));
}

/** Levenshtein distance. Small inputs only — single words, never sentences. */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * 1 for identical words, 0 for nothing in common.
 *
 * Exported because the food cache's alias cross-check compares alias lists at
 * 0.9 and must use the same measure this module matches on.
 */
export const similarity = (a: string, b: string): number =>
  1 - editDistance(a, b) / Math.max(a.length, b.length, 1);

/**
 * How close a one-word query comes to any single word this food is known by —
 * its English name or any of its regional names.
 *
 * Word-level, not whole-string: "mcveggie" is a perfect match for one word of
 * "McDonald's McVeggie Burger" and a poor match for the whole of it.
 */
function bestWordSimilarity(query: string, item: IFCTItem): number {
  const words = [
    ...item.name.toLowerCase().split(/[^a-z0-9]+/),
    ...altNames(item.lang ?? "").flatMap((n) =>
      n.toLowerCase().split(/[^a-z0-9]+/),
    ),
  ].filter((w) => w.length >= 3);

  let best = 0;
  for (const w of words) best = Math.max(best, similarity(query, w));
  return best;
}

/**
 * A single short word collides far too easily for the fuzzy score alone to be
 * trusted: "orage" scored 0.13 against Ragi and "chiken" 0.19 against snake
 * gourd, both well inside STRONG_MATCH. Requiring a real word-level likeness
 * as well rejects those while keeping the genuine typos — orange 0.83,
 * chicken 0.86, paneer 0.83, biryani 0.71.
 */
const MIN_WORD_SIMILARITY = 0.7;

/**
 * Catalog rows good enough to show the user instead of calling the model.
 * Empty when nothing is close, which is the signal to fall back.
 */
export function strongFoods(query: string, limit = 5): IFCTItem[] {
  const term = query.trim().toLowerCase();
  // Multi-word queries carry enough signal for the fuzzy score to stand alone;
  // it is the bare single word that needs the second opinion.
  const singleWord = !/\s/.test(term);

  if (!singleWord) {
    return fuzzyFoods(query, limit)
      .filter((m) => m.score <= STRONG_MATCH)
      .map((m) => m.item);
  }

  // Fuse generates candidates; the word check ranks them. Both halves of that
  // matter. Taking fuse's top few and filtering them left nothing for "orage",
  // because fuse ranked Ragi above Orange — hence the wide pool. And the fuzzy
  // score must not pre-filter either, because "orage" scores 0.45 against
  // Orange, outside STRONG_MATCH, while plainly being a typo for it. Fuse's own
  // threshold bounds the pool; word likeness decides what survives.
  return fuzzyFoods(query, 40)
    .map((m) => ({ item: m.item, sim: bestWordSimilarity(term, m.item) }))
    .filter((m) => m.sim >= MIN_WORD_SIMILARITY)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, limit)
    .map((m) => m.item);
}

/** A name reduced to lowercase words: "Roti / Chapati" -> "roti chapati". */
const plain = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * Every whole name a row answers to. The catalog's two corpora write names
 * differently, and reading one as the other logs the wrong food:
 *
 * - Only a SPACED " / " separates alternative names, as the curated rows write
 *   it: "Roti / Chapati" is both "roti" and "chapati". Raw IFCT rows use an
 *   unspaced "/" for a spelling variant of the last word alone — "Potato
 *   parantha/paratha" is never plain "paratha", "Eggplant/Brinjal rice" never
 *   plain "eggplant" — so an unspaced slash splits nothing.
 * - A bracket is dropped only when it holds a measurement ("(1 piece = 80g)",
 *   as isAliasGroup decides). On a raw IFCT row any other bracket is a
 *   qualifier that makes it a different food — "Lassi (salted)" at 19 kcal is
 *   not "lassi", "Jackfruit/Kathal (dry)" at 481 not "jackfruit" — so it stays
 *   part of the name. On a curated (X) row it is the hand-picked default
 *   state the row was written for — "Paneer (raw)", "Poha (cooked)" — and is
 *   dropped, so those still answer to the bare word.
 */
const wholeNames = (it: IFCTItem) =>
  it.name
    .replace(/\(([^)]*)\)/g, (all, inner: string) =>
      it.code.startsWith("X") || !isAliasGroup(inner) ? " " : all,
    )
    .split(" / ")
    .map(plain)
    .filter(Boolean);

/**
 * The one catalog row a food name IS, for callers that pick without a human
 * looking: a voice or photo log decides someone's calories from this.
 *
 * strongFoods is confident enough to show a list, not to choose from one — it
 * keeps every row that merely contains the word. Its first hit for "coffee" is
 * a KFC mousse cake, for "water" a watermelon, for "milk" a fish, for "sugar"
 * black coffee (no sugar), for "dal" raw dry Bengal gram at 329 kcal/100 g. So
 * its candidates must also pass an identity check: the name, in full, is one
 * of the row's whole names. Where two rows qualify, the curated extraFoods row
 * wins, as it does in searchFoods, because it carries the piece weight a
 * counted log needs.
 *
 * Undefined means the catalog does not hold that food by that name, and the
 * caller asks the server — the cache, then the model — instead of guessing.
 */
export function catalogFood(name: string): IFCTItem | undefined {
  const term = plain(name);
  if (!term) return undefined;
  const hits = strongFoods(name, 40).filter((it) =>
    wholeNames(it).includes(term),
  );
  return hits.sort((a, b) => curatedFirst(a) - curatedFirst(b))[0];
}

/**
 * The connectors that turn one query into several foods.
 *
 * English plus the equivalents in the languages this app's users write in —
 * "mattu" and "jothe" (Kannada), "aur" (Hindi), "udan" (Tamil), "mariyu" and
 * "kalisi" (Telugu), "ebong" (Bengali), "ani" (Marathi). Exported because the
 * same split does two jobs: deciding whether a query is composite, and
 * splitting it so each half can be looked up separately.
 */
export const COMPOSITE_SPLIT =
  /\s*(?:,|\+|\band\b|\bwith\b|\bplus\b|\balong with\b|\baur\b|\bmattu\b|\bjothe\b|\budan\b|\bmariyu\b|\bkalisi\b|\bebong\b|\bani\b)\s*/i;

/** Whether a query names more than one food. Five words counts even without a
 *  connector — "2 idli 1 vada sambar" has none. */
export const isComposite = (query: string): boolean =>
  COMPOSITE_SPLIT.test(query) ||
  query.trim().split(/\s+/).filter(Boolean).length >= 5;

/**
 * Up to `limit` real catalog rows to anchor the model on.
 *
 * A composite query is split first: searching the whole of "palak paneer with
 * roti" matches nothing, while its two halves each match well. Deduped by code
 * so one row cannot fill the whole reference block.
 */
export function referenceFoods(query: string, limit = 5): IFCTItem[] {
  const parts = query
    .split(COMPOSITE_SPLIT)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);

  const hits = (parts.length > 1 ? parts : [query]).flatMap((p) =>
    fuzzyFoods(p, 3).map((m) => m.item),
  );

  return [...new Map(hits.map((it) => [it.code, it])).values()].slice(0, limit);
}
