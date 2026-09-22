/**
 * Pure logic for the AI food cache.
 *
 * Everything here is a pure function so it can be tested with node:assert and
 * no database. All Postgres access lives in src/server/foodCache.ts.
 *
 * Matching never runs on raw text. pg_trgm compares characters, so
 * "thatte idli" and "ತಟ್ಟೆ ಇಡ್ಲಿ" share nothing at all; everything is compared
 * on `searchKey`, which romanises first.
 */
import Sanscript from "@indic-transliteration/sanscript";
import { altNames } from "./foodFuzzy.ts";

/** The scripts this app actually meets, plus Latin. */
const SCRIPTS = [
  ["Devanagari", /\p{Script=Devanagari}/u, "devanagari"],
  ["Kannada", /\p{Script=Kannada}/u, "kannada"],
  ["Tamil", /\p{Script=Tamil}/u, "tamil"],
  ["Telugu", /\p{Script=Telugu}/u, "telugu"],
  ["Malayalam", /\p{Script=Malayalam}/u, "malayalam"],
  ["Bengali", /\p{Script=Bengali}/u, "bengali"],
  ["Gujarati", /\p{Script=Gujarati}/u, "gujarati"],
  ["Gurmukhi", /\p{Script=Gurmukhi}/u, "gurmukhi"],
  ["Arabic", /\p{Script=Arabic}/u, ""], // Urdu: no Sanscript scheme, kept as-is
] as const;

/**
 * Which script a query is written in.
 *
 * A non-Latin hit wins over Latin, because "2 ಇಡ್ಲಿ" is a Kannada query with a
 * digit in it, not a Latin one.
 */
export function scriptOf(text: string): string {
  for (const [name, re] of SCRIPTS) if (re.test(text)) return name;
  if (/\p{Script=Latin}/u.test(text)) return "Latin";
  return "Unknown";
}

/**
 * The form everything is matched on: romanised, lowercased, stripped of
 * punctuation and collapsed whitespace. The original text is always kept
 * beside it for display — nothing is replaced.
 *
 * The target scheme is IAST, not ITRANS, and deliberately so. ITRANS leaves
 * some Tamil letters (e.g. the alveolar "ன்") completely untransliterated —
 * the native character survives straight into a "romanised" key — and it
 * marks vowel length with an accent (è) that a plain punctuation strip
 * doesn't touch. IAST always renders in Latin letters, using combining
 * diacritics (ṭ, ḍ, ā, ...) for what ITRANS encodes as stray marks or leaves
 * native. NFD-decomposing and dropping those combining marks (\p{M}) turns
 * "taṭṭè iḍli" into "tatte idli", which is what lets a Kannada name and its
 * English spelling land close enough for pg_trgm to match.
 *
 * Known, accepted gap: Devanagari and Bengali keep an inherent trailing
 * vowel IAST always writes out ("मेरा" -> "merā" -> "mera", not "mer") that
 * English speakers often drop (schwa deletion, e.g. "mera" vs "mer"). Fixing
 * that needs real linguistics, not a search-key transform, and is out of
 * scope here — a miss just costs one extra AI call, not a wrong answer.
 */
export function searchKey(text: string): string {
  const script = scriptOf(text);
  const scheme = SCRIPTS.find((s) => s[0] === script)?.[2];
  const roman =
    scheme && scheme !== "" ? Sanscript.t(text, scheme, "iast") : text;
  return roman
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * A parenthetical group that is a list of names rather than a portion hint.
 * "Roti (1 medium = 40g)" is a measurement; "Curd rice (Dahi bhaat/...)" is an
 * alias list. Digits and "=" mark the former.
 */
const isAliasGroup = (inner: string) => !/[0-9=]/.test(inner);

/**
 * Every alias a catalog row carries, in whichever of the two shapes it uses.
 *
 * The catalog is not one corpus. Its 430 real IFCT rows keep regional names in
 * `lang`, semicolon-delimited with language tags. Its 1,014 merged rows leave
 * `lang` empty and bake aliases into `name`, in parentheses, slash-delimited.
 * Reading only one shape silently loses the other's aliases entirely, so this
 * reads both.
 */
export function catalogAliases(row: { name: string; lang?: string }): string[] {
  const out = [...altNames(row.lang ?? "")];
  for (const [, inner] of row.name.matchAll(/\(([^)]*)\)/g)) {
    if (!isAliasGroup(inner)) continue;
    for (const part of inner.split("/")) {
      const alias = part.trim();
      if (alias) out.push(alias);
    }
  }
  return out;
}

const KJ_PER_KCAL = 4.184;

/**
 * How far a cacheable answer's stated energy may sit from what its own macros
 * imply.
 *
 * Deliberately stricter than ENERGY_TOL (0.25) in foodAiSchema.ts, and doing a
 * different job. That one repairs a bad value so the user still sees an
 * answer, because this path only runs when local search found nothing. This
 * one decides whether the answer is solid enough to count toward the three
 * that make a food permanent. A borderline answer is shown and not cached.
 *
 * 10% costs roughly 6% of genuine foods by the measurement recorded on
 * ENERGY_TOL — an acceptable price for a row that outlives the search.
 */
export const CACHE_ENERGY_TOL = 0.1;

/**
 * Is this single answer internally consistent enough to be cached?
 *
 * MUST be called on the raw model answer, before reconcileEnergy touches it.
 * Run afterwards it always returns true, because a repaired enerc is computed
 * from these very macros.
 */
export function cacheGate(it: {
  enerc: number;
  protcnt: number;
  fatce: number;
  choavldf: number;
  fibtg: number;
}): boolean {
  if (!(it.enerc > 0)) return false;
  // Per 100 g, the parts cannot outweigh the whole.
  if (it.protcnt + it.fatce + it.choavldf + it.fibtg > 100) return false;
  const implied =
    (4 * it.protcnt + 9 * it.fatce + 4 * it.choavldf) * KJ_PER_KCAL;
  if (!(implied > 0)) return false;
  return Math.abs(it.enerc - implied) <= CACHE_ENERGY_TOL * implied;
}

/** The five macros the cache stores and agrees on. enerc is kJ, the rest grams. */
export const MACROS = [
  "enerc",
  "protcnt",
  "fatce",
  "choavldf",
  "fibtg",
] as const;
export type Macros = Record<(typeof MACROS)[number], number>;

/** How far each answer may sit from the group mean, per macro. */
export const QUORUM_TOL = 0.05;

/**
 * Below this the relative test is meaningless and an absolute one takes over.
 * 0.1 g and 0.3 g of fibre are 200% apart and the same food; without this
 * floor every food with a near-zero macro fails forever.
 */
export const QUORUM_ABS_FLOOR = 0.5;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Do three independent answers agree closely enough to become permanent?
 *
 * All five macros must pass. A single failure deletes the whole group and
 * restarts it from empty — deliberately not a sliding window, so a run of bad
 * answers can never accumulate into a verified row.
 */
export function quorumPasses(rows: Macros[]): boolean {
  if (rows.length !== 3) return false;
  return MACROS.every((m) => {
    const values = rows.map((r) => r[m]);
    const avg = mean(values);
    const tol = Math.max(QUORUM_TOL * avg, QUORUM_ABS_FLOOR);
    return values.every((v) => Math.abs(v - avg) <= tol);
  });
}

/** The per-macro mean of an agreeing group — what reaches ai_verified. */
export function consolidate(rows: Macros[]): Macros {
  const out = {} as Macros;
  for (const m of MACROS) out[m] = +mean(rows.map((r) => r[m])).toFixed(2);
  return out;
}
