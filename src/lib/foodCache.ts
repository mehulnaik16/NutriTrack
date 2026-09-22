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
import { altNames, similarity } from "./foodFuzzy.ts";

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

/** How close two spellings must be to count as the same alias. */
export const ALIAS_SIM = 0.9;

/**
 * The aliases at least two of the three answers agree on.
 *
 * A single model's claim is never written to the trusted set: one confident
 * hallucination would otherwise make "biryani" an alias of "pulao" forever.
 * Comparison runs on searchKey, so a native-script spelling and its
 * romanisation count as the same alias rather than two separate ones.
 *
 * Dedup against `kept` uses similarity, not exact searchKey equality: "Dahi
 * bhaat" and "Dahi bhat" have different keys (one letter apart) but are the
 * same alias by the same 0.9 measure that backs them in the first place, so
 * an exact-match seen-set would let both through as separate entries.
 */
export function crossCheckAliases(lists: string[][]): string[] {
  const kept: string[] = [];
  const keptKeys: string[] = [];
  for (let i = 0; i < lists.length; i++) {
    for (const alias of lists[i]) {
      const key = searchKey(alias);
      if (!key || keptKeys.some((k) => similarity(k, key) >= ALIAS_SIM))
        continue;
      const backers = lists.filter((other, j) =>
        j !== i
          ? other.some((b) => similarity(searchKey(b), key) >= ALIAS_SIM)
          : true,
      ).length;
      if (backers >= 2) {
        keptKeys.push(key);
        kept.push(alias);
      }
    }
  }
  return kept;
}

/**
 * Possessive markers, in their own scripts.
 *
 * Matched before romanisation, because that is where these words lose their
 * distinctiveness: Tamil என் and Telugu నా romanise to "en" and "naa", which
 * occur inside ordinary food names. Closed-class words with fixed spellings,
 * so the comparison is a plain substring prefix match — never fuzzy — but a
 * prefix match alone isn't enough: see NATIVE_SAFE_GLUED_LEN below for why
 * short entries also need a word boundary.
 */
const NATIVE_POSSESSIVES = [
  "मेरा",
  "मेरी",
  "मेरे",
  "माझा",
  "माझी", // Hindi, Marathi
  "ನನ್ನ", // Kannada
  "என்",
  "எனது", // Tamil
  "నా",
  "నాది", // Telugu
  "എന്റെ", // Malayalam
  "আমার", // Bengali
  "મારું",
  "મારી", // Gujarati
  "ਮੇਰਾ",
  "ਮੇਰੀ", // Punjabi
  "میرا",
  "میری", // Urdu
];

/**
 * Below this many code points, a prefix match on its own is too likely to be
 * a coincidence: Telugu నా ("my", 2 code points) is also the first two
 * letters of నాన్ ("naan"), నాటు కోడి ("country chicken") and నారింజ
 * ("orange"). At or above this length a coincidental prefix is implausible
 * enough to trust even when glued directly onto the next word — which
 * matters because Kannada agglutinates its possessive straight onto the
 * noun with no space (ನನ್ನಶೇಕ್, "my shake"), and ನನ್ನ itself is exactly 4
 * code points, the shortest entry this list needs to stay glued-safe. Every
 * entry below 4 (నా at 2, என் at 3) instead requires a word boundary —
 * end of string or a following non-letter — right after the match.
 */
const NATIVE_SAFE_GLUED_LEN = 4;

/**
 * True when the match doesn't run straight into another letter of the same
 * word: either the possessive was the whole string, or whatever follows it
 * is not itself a letter (whitespace, punctuation, digit, ...).
 */
const hasNativeBoundary = (text: string, possessive: string): boolean => {
  const rest = text.slice(possessive.length);
  return rest === "" || !/^\p{L}/u.test(rest);
};

/**
 * Latin possessives. Every entry is three characters or more on purpose:
 * "en" and "naa" collide with ordinary words far too often to be trusted, so
 * those two languages are detected in their own script only.
 */
const LATIN_POSSESSIVES = [
  "my",
  "mine",
  "our",
  "mera",
  "meri",
  "nanna",
  "enadhu",
  "amar",
  "maru",
  "majha",
];

/**
 * Is this someone's private meal name rather than a food?
 *
 * Nothing that returns true may reach ai_unverified, ai_verified or an alias
 * set, on a hit or a miss. Ties break toward personal: a false positive costs
 * one AI call, a false negative writes somebody's private meal name into a
 * shared table permanently.
 *
 * This is a heuristic and will miss unusual phrasings. The quorum is the real
 * protection — a private name needs three independent agreeing answers to be
 * promoted, which it essentially never gets.
 */
export function isPersonalName(query: string): boolean {
  const text = query.trim();
  if (!text) return false;

  // Possessives lead the phrase in every language listed, so only the opening
  // tokens are examined: "chicken my way" is a recipe, not a private name.
  if (
    NATIVE_POSSESSIVES.some(
      (p) =>
        text.startsWith(p) &&
        (p.length >= NATIVE_SAFE_GLUED_LEN || hasNativeBoundary(text, p)),
    )
  )
    return true;

  // The leading run of letters, not the leading whitespace-delimited token:
  // "My-shake" and "My_shake" must isolate "my", not fail as one glued
  // "myshake" or "my-shake". A false negative here is the expensive
  // direction — it lets a private name into shared storage permanently —
  // so punctuation-joined possessives must not slip through.
  const first = text.toLowerCase().match(/^\p{L}+/u)?.[0] ?? "";
  // "my" is two letters but unambiguous in English, unlike "en"/"naa".
  return LATIN_POSSESSIVES.includes(first);
}
