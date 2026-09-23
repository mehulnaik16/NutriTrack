/**
 * Pure logic for the AI food cache.
 *
 * Everything here is a pure function so it can be tested with node:assert and
 * no database. All Postgres access lives in src/server/foodCache.ts.
 *
 * Nothing here may import Sanscript, directly or transitively: FoodSearch
 * (isPersonalName) and foodFuzzy (catalogAliases) put this module in the
 * client bundle. The romanised match keys — searchKey and the alias
 * cross-check built on it — live in src/server/foodCacheKeys.ts instead.
 */
import { altNames } from "./foodFuzzy.ts";

/**
 * A parenthetical group that is a list of names rather than a portion hint.
 * "Roti (1 medium = 40g)" is a measurement; "Curd rice (Dahi bhaat/...)" is an
 * alias list. Digits and "=" mark the former.
 */
export const isAliasGroup = (inner: string) => !/[0-9=]/.test(inner);

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
 * The SAME figure as ENERGY_TOL in foodAiSchema.ts, deliberately: the cache
 * learns exactly what the app is willing to put in front of a user. An answer
 * good enough to show is good enough to count toward the three that make a
 * food permanent, and an answer too inconsistent to cache had no business
 * being shown either.
 *
 * This was 0.1, on the reasoning that a row outliving its search deserves a
 * stricter test than one that is merely displayed. Measured against live model
 * output, that cost far more than it was thought to. Across 39 answers from 12
 * foods the 10% gate rejected 19 of them — 49%, against the ~6% its own note
 * predicted. The 6% was measured on IFCT catalogue rows, which are
 * human-curated and internally consistent by construction; model output is not
 * that population. It also rejected answers that were simply right: banana
 * came back at 372 kJ/100 g, the correct value, against an Atwater-implied
 * 414.6 — a 10.3% miss. The 4/9/4 approximation overestimates fruit and
 * high-fibre foods, so the strict gate was biased against precisely the foods
 * whose real values are best established.
 *
 * One asymmetry survives the change. reconcileEnergy also carries an absolute
 * floor (ENERGY_FLOOR_KJ, 85 kJ) and this has none, so below roughly 340 kJ of
 * implied energy the gate is still the tighter of the two. That is intended: a
 * relative test on a near-zero energy is meaningless, and a food that small is
 * cheap to ask about again.
 */
export const CACHE_ENERGY_TOL = 0.25;

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

/** What validation made of one raw item — or null where it dropped it. */
type ValidatedSlot = {
  name: string;
  canonical_key: string;
  food_class: string;
  basis: "100g" | "piece";
  piece_g?: number;
  aliases: string[];
} | null;

/** One answer fit to store: validated identity, raw numbers. */
export type CacheableAnswer = Macros & {
  canonical_key: string;
  food_name: string;
  food_class: string;
  basis: "100g" | "piece";
  piece_g?: number;
  aliases: string[];
};

/**
 * Pair each raw model item with what validation made of it, and keep the ones
 * fit to cache.
 *
 * Pairing is by POSITION, against the slots validateFoodSlots returns: one
 * slot per raw item, nulls where an item was dropped, so the two arrays line
 * up by construction. Two joins that look reasonable are both wrong here:
 *   - by name: two items called "Kofta" pin the first one's identity to the
 *     second one's macros, and at temperature 0.1 a malformed reply repeats
 *     word for word, so three identical wrong rows can reach quorum and become
 *     permanent shared data;
 *   - by index into the FILTERED item list: dropping an all-zero item shifts
 *     every later item onto its neighbour's numbers.
 * If the arrays ever disagree in length the pairing is a guess, and this
 * refuses to guess.
 *
 * The gate reads the RAW numbers, never the slot's. Validation repairs enerc
 * from the macros, and a repaired value passes the gate by construction, so
 * gating the slot would admit exactly the answers the gate exists to refuse.
 *
 * Never dereferences a non-object: a reply of {"items":[null]} is a cache
 * problem, and a cache problem costs money, never an error to the user.
 */
export function cacheableAnswers(
  rawItems: unknown,
  slots: readonly ValidatedSlot[],
): CacheableAnswer[] {
  if (!Array.isArray(rawItems) || rawItems.length !== slots.length) return [];
  const out: CacheableAnswer[] = [];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const raw: unknown = rawItems[i];
    if (!slot || !raw || typeof raw !== "object") continue;
    // A key of only spaces is no key: it would group every such answer, of
    // every food, under one row.
    const canonical_key = slot.canonical_key.trim();
    if (!canonical_key) continue;
    const m = {} as Macros;
    for (const k of MACROS) m[k] = Number((raw as Record<string, unknown>)[k]);
    if (!cacheGate(m)) continue;
    out.push({
      canonical_key,
      food_name: slot.name,
      food_class: slot.food_class,
      basis: slot.basis,
      piece_g: slot.piece_g,
      aliases: slot.aliases,
      ...m,
    });
  }
  return out;
}

/** How far each answer may sit from the group mean, per macro. */
export const QUORUM_TOL = 0.05;

/**
 * Below this the relative test is meaningless and an absolute one takes over.
 * 0.1 g and 0.3 g of fibre are 200% apart and the same food; without this
 * floor every food with a near-zero macro fails forever.
 */
export const QUORUM_ABS_FLOOR = 0.5;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** How many staged answers a group needs before quorum is tested. */
export const QUORUM_SIZE = 3;

/**
 * How many DIFFERENT people a group's answers must come from. Without it one
 * user searching a food three times fills a quorum alone — including a private
 * meal name isPersonalName misses.
 *
 * SCALE-DEPENDENT. 2 is chosen for the current small user base (about 5 real
 * users), where 3 would stall verification: few foods would ever be searched
 * by three different people. Raise it to 3 once the user base is large enough
 * (the owner's figure: 1k–10k users) that it is no longer a bottleneck.
 * PER_USER_CAP follows automatically.
 */
export const MIN_DISTINCT_USERS = 2;

/**
 * Most rows one user may hold in one open (canonical_key, food_class) group.
 * With at most this many per person, any QUORUM_SIZE staged rows necessarily
 * span MIN_DISTINCT_USERS people, so a group can never fill — and stall — on
 * one user's rows. 2 today; 1 when MIN_DISTINCT_USERS is 3.
 */
export const PER_USER_CAP = QUORUM_SIZE - MIN_DISTINCT_USERS + 1;

/** Whether a group's answers come from enough different people. */
export const enoughUsers = (group: readonly { user_hash: string | null }[]) =>
  new Set(group.map((g) => g.user_hash).filter(Boolean)).size >=
  MIN_DISTINCT_USERS;

/**
 * Do three independent answers agree closely enough to become permanent?
 * (Independent of each other, and from at least MIN_DISTINCT_USERS people —
 * see enoughUsers, which recordAnswer checks beside this.)
 *
 * All five macros must pass. A single failure deletes the whole group and
 * restarts it from empty — deliberately not a sliding window, so a run of bad
 * answers can never accumulate into a verified row.
 */
export function quorumPasses(rows: Macros[]): boolean {
  if (rows.length !== QUORUM_SIZE) return false;
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

/**
 * The non-macro fields of an agreeing group, which quorumPasses never
 * compares: median piece_g, majority basis, and the most common food_name
 * (the earliest answer's on a tie). Taking all three from the first answer
 * let a single answer's piece weight — which multiplies every pieces log of
 * the food, permanently — through unchecked. Changes only what is stored,
 * never whether the group promotes.
 */
export function consolidateIdentity(
  group: readonly {
    food_name: string;
    basis: "100g" | "piece";
    piece_g: number | string | null;
  }[],
): { food_name: string; basis: "100g" | "piece"; piece_g: number | null } {
  const pieces = group
    .map((g) => Number(g.piece_g))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const mid = pieces.length >> 1;
  const piece_g = !pieces.length
    ? null
    : pieces.length % 2
      ? pieces[mid]
      : (pieces[mid - 1] + pieces[mid]) / 2;

  const pieceVotes = group.filter((g) => g.basis === "piece").length;
  const basis = pieceVotes * 2 > group.length ? "piece" : "100g";

  const count = (n: string) => group.filter((g) => g.food_name === n).length;
  let food_name = group[0]?.food_name ?? "";
  for (const g of group)
    if (count(g.food_name) > count(food_name)) food_name = g.food_name;

  return { food_name, basis, piece_g };
}

/** One edited food_logs entry: whole-portion kcal and grams, as logged. */
export type LoggedEdit = {
  food_name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
};

/**
 * A logged entry's totals, put back on the basis the cache stores: per 100 g,
 * energy in kJ. lookupCache swaps an ai_flagged row's numbers straight in for
 * the verified row's, so a correction stored on any other basis would be
 * served as if it were per 100 g.
 *
 * That holds for a 'piece' row too. `basis` says a food is countable and
 * carries piece_g; it does not change what the numbers mean. The model is told
 * "every value is per 100 g ... never per serving" whatever the basis, and
 * every reader (runFoodSearch, macrosFor in FoodSearch, resolveVoiceItem)
 * scales them by grams / 100. quantity_g is already grams — a count of pieces
 * was converted with piece_g when it was logged — so no piece arithmetic is
 * needed, and dividing by a piece count here would store per-piece numbers
 * that every reader then misreads as per-100 g.
 *
 * Null when the result is not a food: zero grams, or more energy or more of
 * one macro per 100 g than anything can hold — the same ceilings the model's
 * own answers are held to in foodAiSchema.ts.
 */
export function per100g(edit: LoggedEdit): Macros | null {
  if (!(edit.quantity_g > 0)) return null;
  const f = 100 / edit.quantity_g;
  const out: Macros = {
    enerc: +(edit.calories * KJ_PER_KCAL * f).toFixed(2),
    protcnt: +(edit.protein_g * f).toFixed(2),
    fatce: +(edit.fat_g * f).toFixed(2),
    choavldf: +(edit.carbs_g * f).toFixed(2),
    fibtg: +(edit.fiber_g * f).toFixed(2),
  };
  if (!MACROS.every((m) => out[m] >= 0)) return null;
  if (out.enerc > 3766) return null; // 900 kcal/100 g: pure fat
  if (MACROS.some((m) => m !== "enerc" && out[m] > 100)) return null;
  return out;
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
 * Leading "<word>'s" possessives that mark somebody's own version of a dish:
 * family and relationship words only. Any other "<word>'s" is far more often
 * a brand or a dish name — bikaji's, amul's, reese's, campbell's, nature's
 * basket, baker's chocolate, shepherd's pie — and flagging those kept packaged
 * foods, the cheapest to cache, from ever caching. An allowlist of brands
 * could never be complete; the family words that turn a dish private are a
 * short closed set.
 * ponytail: a fixed list. A name missing from it ("bhabhi's") reads as a food,
 * so the model is asked and the answer staged; the quorum and the saved-meal
 * check are the next guards. Add words here as they turn up.
 */
const FAMILY_POSSESSORS = [
  "mom",
  "mum",
  "mommy",
  "mummy",
  "mama",
  "maa",
  "ma",
  "amma",
  "ammi",
  "appa",
  "dad",
  "daddy",
  "papa",
  "mother",
  "father",
  "grandma",
  "granny",
  "grandpa",
  "nani",
  "dadi",
  "nana",
  "dada",
  "aunty",
  "auntie",
  "aunt",
  "uncle",
  "wife",
  "husband",
];

/**
 * Is this someone's private meal name rather than a food?
 *
 * Nothing that returns true may reach ai_unverified, ai_verified or an alias
 * set, on a hit or a miss. Ties break toward personal: a false positive costs
 * one AI call, a false negative writes somebody's private meal name into a
 * shared table permanently.
 *
 * This is a heuristic and will miss unusual phrasings. The quorum behind it
 * raises the bar but does not close the gap: promotion needs three answers
 * agreeing within 5%, and those answers can all come from the same model, so
 * what the quorum really rules out is a one-off outlier, not a mistake the
 * model makes consistently. A private name the model reads as a real food the
 * same way three times over can still be promoted. This check is the guard
 * that matters; treat the quorum as a second line, not a safety net.
 *
 * The spec's strongest signal — the query matching one of the user's own
 * saved_meals — is not in here, because it needs that user's rows: FoodSearch
 * checks it on the client for every query, before any server call.
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

  // "mom's shake", "amma's rasam", "grandma’s curry": a family word in the
  // possessive means somebody's own version of a dish. Straight or curly
  // apostrophe, since phone keyboards emit both.
  const owner = text.toLowerCase().match(/^(\p{L}+)['’]s(?!\p{L})/u)?.[1];
  if (owner && FAMILY_POSSESSORS.includes(owner)) return true;

  // The leading run of letters, not the leading whitespace-delimited token:
  // "My-shake" and "My_shake" must isolate "my", not fail as one glued
  // "myshake" or "my-shake". A false negative here is the expensive
  // direction — it lets a private name into shared storage permanently —
  // so punctuation-joined possessives must not slip through.
  const first = text.toLowerCase().match(/^\p{L}+/u)?.[0] ?? "";
  // "my" is two letters but unambiguous in English, unlike "en"/"naa".
  return LATIN_POSSESSIVES.includes(first);
}
