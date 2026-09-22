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
