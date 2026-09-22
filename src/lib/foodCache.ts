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
 * Sanscript's ITRANS output uses ASCII marks (`.`, `~`, `^`) to carry vowel
 * length and nasalisation that plain ASCII can't otherwise represent — e.g.
 * "ಇಡ್ಲಿ" (idli) romanises to "iDli" with a retroflex marker, not bare
 * "idli". Since search keys only need to be *close*, not lossless, those
 * marks are stripped along with all other punctuation below rather than
 * preserved.
 */
export function searchKey(text: string): string {
  const script = scriptOf(text);
  const scheme = SCRIPTS.find((s) => s[0] === script)?.[2];
  const roman =
    scheme && scheme !== "" ? Sanscript.t(text, scheme, "itrans") : text;
  return roman
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
