/**
 * Romanised match keys for the AI food cache.
 *
 * Pure functions, tested with node:assert in src/lib/foodCache.test.ts, and
 * kept in src/server only for where that puts them: Sanscript, which these
 * need, is ~189 KB, and the browser never romanises anything. vite.config.ts
 * fails the build on any client import from a server/ directory, so this file
 * — and Sanscript with it — cannot reach the client bundle by accident. The
 * client-safe half of the cache logic stays in src/lib/foodCache.ts.
 *
 * Matching never runs on raw text: "thatte idli" and "ತಟ್ಟೆ ಇಡ್ಲಿ" share no
 * characters at all. Everything is compared on `searchKey`, which romanises
 * first, and cross-script lookups are EXACT matches on those keys (the
 * alias_keys step in foodCache.ts), never a similarity score.
 */
import Sanscript from "@indic-transliteration/sanscript";
import { similarity } from "../lib/foodFuzzy.ts";

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
 * "taṭṭè iḍli" into "tatte idli" — the same key the model's own native-script
 * alias for that food normalises to, which is what lets the exact alias_keys
 * lookup match a Kannada query against it.
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
  const roman = scheme ? Sanscript.t(text, scheme, "iast") : text;
  return roman
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * The form staged answers are GROUPED on: searchKey with its words sorted.
 *
 * The model does not return a stable canonical_key. One photo session produced
 * "protein blueberry shake" and "blueberry protein shake" for the same drink,
 * which agreed on macros to within 1% and could never be compared because the
 * write path grouped on exact key equality. Sorting the words collapses that.
 *
 * Sorting merges word ORDER and nothing else: "naan" and "paneer naan" keep
 * different token sets, so this can never fold a food into a dish that merely
 * contains it. Romanisation is inherited from searchKey, so a native-script
 * name and its transliteration share a group key for free.
 */
export function groupKey(text: string): string {
  return searchKey(text).split(" ").filter(Boolean).sort().join(" ");
}

/** How close two keys' wording must be to be treated as the same food. */
export const GROUP_SIM = 0.9;

/**
 * The open group an answer joins: the closest existing key at or above
 * GROUP_SIM, or its own key, which starts a new group.
 *
 * Measured on this database's own keys, after groupKey has sorted the words:
 *
 *   protein blueberry shake / blueberry protein shake   1.000  same food
 *   thatte idli / tatte idli                            0.909  same food
 *   dahi bhaat / dahi bhat                              0.900  same food
 *   amul...blueberry / blueberry protein shake          0.821  DIFFERENT
 *   flavoured milk / flavoured milkshake                0.737  DIFFERENT
 *   coconut rice / coconut dal                          0.667  DIFFERENT
 *   naan / paneer naan                                  0.364  DIFFERENT
 *
 * 0.9 sits 0.079 above the closest genuine split, and is the same measure and
 * threshold ALIAS_SIM already uses. Branded keys stay separate on merit: the
 * Amul shake answered 580 kJ against the generic 290, so they are not one food.
 *
 * Similarity is not transitive — A may match B and B match C while A and C do
 * not — so the winner must not depend on which answer arrived first. Candidates
 * are sorted and ties keep the earlier one, making the choice a function of the
 * open groups alone. Same first-come anchoring crossCheckAliases uses below.
 */
export function pickGroupKey(key: string, open: readonly string[]): string {
  let best = key;
  let score = 0;
  // ponytail: linear scan of the open groups for one food_class. Fine while
  // the staging table is transient — a group is deleted as soon as it promotes
  // or resets. Prefilter on trigrams if it ever holds thousands of open groups.
  for (const candidate of [...open].sort()) {
    const s = similarity(candidate, key);
    // Strictly greater, so on a tie the earlier candidate in sorted order wins.
    if (s >= GROUP_SIM && s > score) {
      best = candidate;
      score = s;
    }
  }
  return best;
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
