/* Runnable self-check for the AI food cache's pure logic. No test framework in
   this repo, so this is a plain assert script — same convention as
   foodUnits.test.ts and ai.test.ts.

   Run:
     node src/lib/foodCache.test.ts

   Everything here is a pure function: no network, no Supabase, no API key. */
import assert from "node:assert";
import { catalogAliases } from "./foodCache.ts";
import { scriptOf, searchKey } from "../server/foodCacheKeys.ts";

// ── script detection ───────────────────────────────────────────────────────
assert.equal(scriptOf("thatte idli"), "Latin");
assert.equal(scriptOf("ತಟ್ಟೆ ಇಡ್ಲಿ"), "Kannada");
assert.equal(scriptOf("मेरा शेक"), "Devanagari");
assert.equal(scriptOf("என் இட்லி"), "Tamil");
// Mixed input takes the first non-Latin script it finds: a romanised word
// beside a native one is still a native-script query.
assert.equal(scriptOf("2 ಇಡ್ಲಿ"), "Kannada");

// ── search key ─────────────────────────────────────────────────────────────
assert.equal(searchKey("Thatte Idli"), "thatte idli");
assert.equal(searchKey("  Curd   Rice!  "), "curd rice");
// A native-script name must romanise to a plain Latin key.
const kn = searchKey("ಇಡ್ಲಿ");
assert.ok(kn.startsWith("idl"), `expected an idli-like key, got ${kn}`);
assert.equal(searchKey(""), "");

// Cross-script lookup is an EXACT match on these keys: a Kannada query and
// the model's Kannada alias for the same food must produce the same string,
// because lookupCache compares them with alias_keys containment, not a
// similarity score (pg_trgm could not separate cross-script spellings from
// different foods — see SIM_SAME_SCRIPT in src/server/foodCache.ts). So the
// key is pinned exactly. IAST + deburring gives a clean Latin key where ITRANS
// left accents ("tattè") and untransliterated Tamil letters behind.
assert.equal(searchKey("ತಟ್ಟೆ ಇಡ್ಲಿ"), "tatte idli");
// No native-script character may survive romanisation — ITRANS used to leave
// Tamil "ன்" untransliterated inside an otherwise-Latin key.
const tamilKey = searchKey("என் இட்லி");
assert.ok(
  /^[\p{L}\p{N} ]*$/u.test(tamilKey) && !/\p{Script=Tamil}/u.test(tamilKey),
  "no native characters may survive romanisation",
);
// Recorded, not asserted-to-taste: IAST's "dh" for this letter, not "d".
assert.equal(searchKey("இட்லி"), "idhli");

// ── alias shape 1: `lang`, semicolon-delimited (430 rows, real IFCT) ───────
assert.deepEqual(
  catalogAliases({
    name: "Bajra",
    lang: "A., Kash. Baajra; Kan. Sajje; Tam. Kambu",
  }),
  ["Baajra", "Sajje", "Kambu"],
);

// ── alias shape 2: parenthetical in `name` (1,014 rows, merged corpus) ─────
assert.deepEqual(
  catalogAliases({
    name: "Curd rice (Dahi bhaat/Dahi chawal/ Perugu annam/Thayir saadam)",
    lang: "",
  }),
  ["Dahi bhaat", "Dahi chawal", "Perugu annam", "Thayir saadam"],
);

// ── neither shape: roughly 630 rows carry no aliases at all ───────────────
assert.deepEqual(catalogAliases({ name: "Bajra", lang: "" }), []);

// A parenthetical that is a portion hint, not an alias, must not become one.
assert.deepEqual(
  catalogAliases({ name: "Roti (1 medium = 40g)", lang: "" }),
  [],
);

// ── Atwater cache gate ──────────────────────────────────────────────────────
import { cacheGate, CACHE_ENERGY_TOL } from "./foodCache.ts";
import { reconcileEnergy } from "./foodAiSchema.ts";

const KJ = 4.184;
/** Internally consistent: 10P + 5F + 20C implies (40 + 45 + 80) kcal. */
const consistent = {
  name: "test food",
  protcnt: 10,
  fatce: 5,
  choavldf: 20,
  fibtg: 2,
  enerc: +(165 * KJ).toFixed(1),
};

assert.equal(CACHE_ENERGY_TOL, 0.25);
assert.equal(cacheGate(consistent), true);

// Within 25%: cacheable. 1.2x used to be the "never cached" case at the old
// 10% gate — it is kept here, flipped, as the record of what changed.
assert.equal(cacheGate({ ...consistent, enerc: 165 * KJ * 1.2 }), true);
// Outside 25%: shown to the user, never cached.
assert.equal(cacheGate({ ...consistent, enerc: 165 * KJ * 1.35 }), false);

// Zero energy fails. The zero-energy IFCT oils are a catalog quirk, not
// something an AI answer may reproduce.
assert.equal(cacheGate({ ...consistent, enerc: 0 }), false);

// Mass balance: the macros of 100 g cannot exceed 100 g. The schema caps each
// field at 100 individually and never checks the sum.
assert.equal(
  cacheGate({ protcnt: 40, fatce: 40, choavldf: 40, fibtg: 5, enerc: 2800 }),
  false,
);

// ── Review Focus 1: the gate must run BEFORE reconcileEnergy ──────────────
// A repaired answer is Atwater-consistent by construction, so gating after the
// repair can never fail and the whole check becomes a no-op.
//
// Choosing the fixture, now that CACHE_ENERGY_TOL and ENERGY_TOL are both
// 0.25. The two assertions pull in opposite directions:
//   - cacheGate(raw) must be FALSE, so the deviation must exceed
//     0.25 * implied.
//   - cacheGate(repaired) must be TRUE, which needs reconcileEnergy to
//     actually rewrite enerc. It only does that past max(0.25 * implied, 85).
// So the fixture has to clear BOTH, i.e. deviation > max(0.25 * implied, 85).
// Anything between the two thresholds is returned unrepaired and would fail
// the second assertion, not pass it.
//
// implied here is 165 kcal = 690.36 kJ, so the bar is max(172.59, 85) = 172.59.
// 1.5x (50% over) gives a deviation of 345.18 — twice the bar — and was
// already chosen against the 25% repair threshold, so it survives the gate
// change unaltered. The value was NOT adjusted to make the assertion pass;
// it was checked against both thresholds and still clears them.
const bad = { ...consistent, enerc: 165 * KJ * 1.5 };
assert.equal(cacheGate(bad), false, "raw answer must fail");
assert.equal(
  cacheGate(reconcileEnergy(bad, "test food")),
  true,
  "repaired answer passes — proof the gate must see the raw value first",
);

// The one place the two tolerances still differ, and the reason the band
// between them is narrow rather than empty: reconcileEnergy has an absolute
// floor (ENERGY_FLOOR_KJ, 85 kJ) and cacheGate has none. Below ~340 kJ of
// implied energy the gate is the stricter of the two, so a low-energy answer
// can be shown unrepaired and still refused by the cache.
// 2P + 0F + 10C implies 48 kcal = 200.8 kJ. A deviation of 60 kJ is 30% —
// past the gate's 25% — but under the 85 kJ floor, so nothing is repaired.
const lowEnergy = {
  name: "test drink",
  protcnt: 2,
  fatce: 0,
  choavldf: 10,
  fibtg: 0,
};
const implied = 48 * KJ;
const shownButNotCached = { ...lowEnergy, enerc: +(implied + 60).toFixed(1) };
assert.equal(
  cacheGate(shownButNotCached),
  false,
  "30% over: refused by the gate",
);
assert.equal(
  reconcileEnergy(shownButNotCached, "test drink").enerc,
  shownButNotCached.enerc,
  "under the 85 kJ floor: shown to the user unrepaired",
);

// ── quorum check and consolidation ──────────────────────────────────────────
import { quorumPasses, consolidate } from "./foodCache.ts";

const macro = (over: Partial<Record<string, number>> = {}) => ({
  enerc: 700,
  protcnt: 10,
  fatce: 5,
  choavldf: 20,
  fibtg: 2,
  ...over,
});

// Three near-identical answers verify.
assert.equal(
  quorumPasses([macro(), macro({ enerc: 710 }), macro({ enerc: 690 })]),
  true,
);

// One macro outside mean ±5% fails the whole group — delete and restart.
assert.equal(quorumPasses([macro(), macro(), macro({ protcnt: 14 })]), false);

// A group that is not yet three rows never passes.
assert.equal(quorumPasses([macro(), macro()]), false);

// ── quorum counts distinct PEOPLE ───────────────────────────────────────────
import {
  MIN_DISTINCT_USERS,
  PER_USER_CAP,
  QUORUM_SIZE,
  enoughUsers,
} from "./foodCache.ts";

assert.equal(MIN_DISTINCT_USERS, 2);
assert.equal(PER_USER_CAP, QUORUM_SIZE - MIN_DISTINCT_USERS + 1);
assert.equal(PER_USER_CAP, 2);
const by = (...hs: (string | null)[]) => hs.map((user_hash) => ({ user_hash }));
assert.equal(enoughUsers(by("a", "a", "a")), false, "one person alone");
assert.equal(enoughUsers(by("a", "a", "b")), true);
assert.equal(enoughUsers(by("a", null, null)), false, "no id counts as nobody");
// The staging cap is what makes the promotion check hold by construction:
// replay every order of staging attempts by three users, staging a row only
// while that user holds fewer than PER_USER_CAP, and the first QUORUM_SIZE
// rows always span MIN_DISTINCT_USERS people. Checked against the cap formula
// for MIN_DISTINCT_USERS 1..3, so raising the constant cannot break it.
for (let min = 1; min <= QUORUM_SIZE; min++) {
  const cap = QUORUM_SIZE - min + 1;
  const users = ["a", "b", "c"];
  const orders = (n: number): string[][] =>
    n === 0 ? [[]] : orders(n - 1).flatMap((o) => users.map((u) => [...o, u]));
  for (const attempts of orders(6)) {
    const staged: string[] = [];
    for (const u of attempts)
      if (staged.filter((s) => s === u).length < cap) staged.push(u);
    if (staged.length >= QUORUM_SIZE)
      assert.ok(
        new Set(staged.slice(0, QUORUM_SIZE)).size >= min,
        `min ${min}: ${attempts.join("")}`,
      );
  }
}

// ── Review Focus 2: near-zero macros ──────────────────────────────────────
// Fibre 0 across all three is agreement, not a division by nothing.
assert.equal(
  quorumPasses([macro({ fibtg: 0 }), macro({ fibtg: 0 }), macro({ fibtg: 0 })]),
  true,
);
// 0.1 vs 0.3 g of fibre is 200% apart in relative terms and identical in
// practice — the absolute floor must let it through.
assert.equal(
  quorumPasses([
    macro({ fibtg: 0.1 }),
    macro({ fibtg: 0.3 }),
    macro({ fibtg: 0.2 }),
  ]),
  true,
);
// But a real disagreement at low values is still a disagreement.
assert.equal(
  quorumPasses([
    macro({ fibtg: 0.1 }),
    macro({ fibtg: 0.2 }),
    macro({ fibtg: 9 }),
  ]),
  false,
);

// ── the live incident this gate was retuned for ───────────────────────────
// Six answers for one tofu cheesecake, two accounts, 15 minutes. They formed
// two complete groups and BOTH were rejected and destroyed; ai_verified sat
// empty for three days. Kept as real numbers, not a fixture, so a future tighten
// has to look at what it is refusing. enerc is kcal x 4.184.
import { QUORUM_TOL, QUORUM_TOL_ENERC, energyConsistent } from "./foodCache.ts";
{
  const m = (
    enerc: number,
    protcnt: number,
    fatce: number,
    choavldf: number,
    fibtg: number,
  ) => ({ enerc, protcnt, fatce, choavldf, fibtg });
  const a170 = m(711.28, 5.2, 9.5, 16, 0.8);
  const a163 = m(682, 5.5, 8.2, 16.5, 0.8);
  const a180 = m(753.12, 6.5, 9.5, 17.2, 0.8);
  const a200 = m(836.8, 6.5, 10.5, 20, 1.2);
  const a155 = m(648.52, 5.5, 6, 18, 0.8);

  assert.equal(QUORUM_TOL, 0.15);
  assert.equal(QUORUM_TOL_ENERC, 0.08);

  // Round 1. Protein spreads 13.4% and fat 9.6%, but the deviations cancel in
  // the energy total, which lands at 5.3% — three answers about one dessert.
  // At the old 0.05 this failed on energy by 1.88 kJ, 0.45 kcal.
  assert.equal(quorumPasses([a170, a163, a180]), true, "round 1 must verify");

  // Round 2. Fat spreads 27.5% and surfaces as 15.8% on energy: a real
  // disagreement, still refused, which is the point of retuning rather than
  // removing the gate.
  assert.equal(quorumPasses([a200, a163, a155]), false, "round 2 must not");

  // The two knobs are not one knob. Every macro here is inside 15% — protein
  // 10.8, fat 12.8, carbs 11.7 — and energy alone rejects it at 10.5%.
  assert.equal(quorumPasses([a163, a180, a200]), false, "energy alone decides");

  // A promoted row must also agree with itself. Round 1's mean implies 714.6 kJ
  // against a stored 715.47.
  assert.equal(energyConsistent(consolidate([a170, a163, a180])), true);
  // A per-piece energy stored against per-100g macros is the failure this
  // catches: 2500 kJ beside macros implying 677.
  assert.equal(energyConsistent(m(2500, 5.5, 8.2, 16.5, 0.8)), false);
}

// consolidate takes the per-macro mean of the three.
assert.deepEqual(
  consolidate([
    macro({ enerc: 690 }),
    macro({ enerc: 700 }),
    macro({ enerc: 710 }),
  ]),
  macro({ enerc: 700 }),
);

// consolidateIdentity: the fields quorum never compares are voted on, not
// copied from whichever answer arrived first.
import { consolidateIdentity } from "./foodCache.ts";
const ans = (
  food_name: string,
  basis: "100g" | "piece",
  piece_g: number | string | null,
  canonical_key = food_name.toLowerCase(),
) => ({ food_name, canonical_key, basis, piece_g });
// An outlier first answer's piece weight (120 g against ~40 g) is not stored:
// piece_g multiplies every pieces log of the food, permanently. The key is
// voted on the same way — a group no longer shares one spelling of it.
assert.deepEqual(
  consolidateIdentity([
    ans("Thatte Idli", "piece", 120, "thatte idli"),
    ans("Thatte idli", "piece", 42, "idli thatte"),
    ans("Thatte idli", "100g", "40", "thatte idli"), // numeric may arrive as text
  ]),
  {
    food_name: "Thatte idli",
    canonical_key: "thatte idli",
    basis: "piece",
    piece_g: 42,
  },
);
// Majority basis; median of the piece weights that exist; a three-way tie on
// name and on key both keep the earliest answer's.
assert.deepEqual(
  consolidateIdentity([
    ans("Lassi", "100g", null),
    ans("Sweet lassi", "100g", 250),
    ans("Punjabi lassi", "piece", 300),
  ]),
  {
    food_name: "Lassi",
    canonical_key: "lassi",
    basis: "100g",
    piece_g: 275,
  },
);
// No piece weight in any answer stays null, never 0 (0 g per piece would
// log any count of pieces as nothing).
assert.equal(
  consolidateIdentity([
    ans("Poha", "100g", null),
    ans("Poha", "100g", null),
    ans("Poha", "100g", null),
  ]).piece_g,
  null,
);

// ── alias cross-check ────────────────────────────────────────────────────────
import { crossCheckAliases } from "../server/foodCacheKeys.ts";

// Backed by two of three, with a spelling difference inside 0.9.
assert.deepEqual(
  crossCheckAliases([
    ["Dahi bhaat", "Thayir saadam"],
    ["Dahi bhat", "Perugu annam"],
    ["Curd rice"],
  ]),
  ["Dahi bhaat"],
);

// A single answer's claim is never trusted on its own.
assert.deepEqual(
  crossCheckAliases([["Thayir saadam"], ["Perugu annam"], ["Daddojanam"]]),
  [],
);

// Native script and its romanisation are the same alias: comparison runs on
// searchKey, so the surviving alias is kept in the form it was first given.
const cross = crossCheckAliases([["ಇಡ್ಲಿ"], ["idli"], ["Idly"]]);
assert.equal(cross.length >= 1, true, `expected an idli alias, got ${cross}`);

assert.deepEqual(crossCheckAliases([[], [], []]), []);

// ── personal-name detection ─────────────────────────────────────────────────
import { isPersonalName } from "./foodCache.ts";

// English, the 66-of-293 case in the live data.
assert.equal(isPersonalName("My shake"), true);
assert.equal(isPersonalName("my chicken biryani"), true);
assert.equal(isPersonalName("our breakfast"), true);

// Native script, matched in its own script before any romanisation.
assert.equal(isPersonalName("ನನ್ನ ಶೇಕ್"), true); // Kannada
assert.equal(isPersonalName("मेरा शेक"), true); // Hindi
assert.equal(isPersonalName("என் இட்லி"), true); // Tamil
assert.equal(isPersonalName("నా అన్నం"), true); // Telugu

// Romanised possessives long enough to be safe.
assert.equal(isPersonalName("mera shake"), true);
assert.equal(isPersonalName("nanna shake"), true);

// ── Review Focus 3: short romanisations must NOT flag real foods ──────────
// "en" and "naa" are Tamil and Telugu possessives, and also ordinary letters
// inside real food names. Two-letter tokens are excluded from the Latin list.
assert.equal(isPersonalName("en idli"), false);
assert.equal(isPersonalName("naan"), false);
assert.equal(isPersonalName("naa rice"), false);

// Ordinary foods are never personal.
assert.equal(isPersonalName("curd rice"), false);
assert.equal(isPersonalName("thatte idli"), false);
// A possessive in the middle is not a possessive name.
assert.equal(isPersonalName("chicken my way"), false);

// ── native-script prefix boundary (post-review fix) ────────────────────────
// A short native possessive glued to the front of an ordinary word must not
// flag it: Telugu నా ("my", 2 code points) is also the first two letters of
// real food and ingredient names.
assert.equal(isPersonalName("నాన్"), false); // naan (the bread), Telugu script
assert.equal(isPersonalName("నాటు కోడి"), false); // country chicken
assert.equal(isPersonalName("నారింజ"), false); // orange
assert.equal(isPersonalName("నా అన్నం"), true); // "my rice" — possessive + space
// Kannada agglutinates the possessive straight onto the noun with no space,
// and ನನ್ನ is long enough (4 code points) that this glued form is still safe.
assert.equal(isPersonalName("ನನ್ನಶೇಕ್"), true); // "my shake", no space

// ── Latin possessive joined by punctuation, not just whitespace ───────────
// A false negative is the expensive direction: it lets a private name reach
// shared storage permanently, where a false positive only costs one AI call.
assert.equal(isPersonalName("My-shake"), true);
assert.equal(isPersonalName("My_shake"), true);

// ── "<word>'s" possessive: a family member's own version of a dish ────────
for (const q of [
  "mom's shake",
  "amma's rasam",
  "grandma’s curry", // curly apostrophe, as phone keyboards type it
  "MOM'S DAL",
  "nani's",
  "papa's special chai",
  "mummy's rajma",
])
  assert.equal(isPersonalName(q), true, q);
// Real foods with a leading possessive must not be flagged: brands and dishes
// whose own name is possessive. Also a possessive that is not leading.
for (const q of [
  "bikaji's bhujia",
  "britannia's good day",
  "amul's butter",
  "parle's monaco",
  "ching's hakka noodles",
  "reese's peanut butter cups",
  "campbell's tomato soup",
  "nature's basket granola",
  "farmer's cheese",
  "baker's chocolate",
  "chef's special",
  "lay's",
  "haldiram's",
  "domino's",
  "hershey's",
  "wendy's",
  "McDonald's McVeggie Burger",
  "Wendy's Frosty",
  "Domino's farmhouse pizza",
  "Haldiram's aloo bhujia",
  "Lay's classic salted",
  "Kellogg's corn flakes",
  "Hershey's chocolate syrup",
  "Nando's peri peri chicken",
  "shepherd's pie",
  "lady's finger fry", // okra
  "devil's food cake",
  "chicken 65",
  "ben and jerry's ice cream",
])
  assert.equal(isPersonalName(q), false, q);
// Known miss, recorded rather than hidden: with no apostrophe there is no
// possessive to see. The saved-meals match in FoodSearch is what catches a
// name like this once the user has logged it.
assert.equal(isPersonalName("moms shake"), false);
// Known miss: a first name is not a family word. Accepted so that brands
// (bikaji's, amul's) cache; the saved-meals match catches it once saved.
assert.equal(isPersonalName("Priya's salad"), false);
// No name in the bundled catalog — 2,675 real foods, 309 of them led by a
// brand possessive — is flagged.
{
  const { ITEMS } = await import("./foodDb.ts");
  const flagged = ITEMS.filter((it) => isPersonalName(it.name));
  assert.deepEqual(
    flagged.map((it) => it.name),
    [],
  );
}

// ── pairing raw answers with their validated identity ─────────────────────
// runFoodSearch gates the RAW numbers of each model item and records the
// VALIDATED identity of that same item. These pin how the two are paired.
import { cacheableAnswers } from "./foodCache.ts";
import { validateFoodSlots, validateFoodResponse } from "./foodAiSchema.ts";

/** A complete model item; macros are per 100 g, enerc in kJ. */
const answer = (over: Record<string, unknown>) => ({
  heard: "q",
  name: "x",
  lang: "",
  confidence: "high",
  units: ["g"],
  serving_g: 100,
  code: "ai-fallback",
  scie: "",
  grup: "AI Fallback",
  aliases: [],
  basis: "100g",
  ...over,
});

/**
 * raw reply -> the rows the cache would store, exactly as ai.ts derives them.
 *
 * kind defaults to "meal" because these fixtures are about PAIRING an item with
 * its own validated identity, and every item has to survive for that to be
 * observable. Under "single" only the first is kept, which would make the
 * multi-item assertions below pass for the wrong reason. The single-vs-meal
 * policy has its own block further down.
 */
const rowsFor = (
  reply: { items: unknown[] },
  kind: "single" | "meal" = "meal",
) =>
  cacheableAnswers(
    reply.items,
    validateFoodSlots(reply, "q")?.slots ?? [],
    kind,
  );

// The two-Koftas case, from review. Both items are named "Kofta".
//   A: malai kofta, a curry. 6P/20F/12C implies 1054.4 kJ; it claims 1600,
//      51.7% over — so it FAILS the gate raw, and validation repairs it.
//   B: chicken kofta, protein. 18P/12F/6C implies 853.5 kJ, and says so.
// A join by name paired B's numbers with A's identity: it recorded
// canonical_key "malai kofta", food_class "curry" with B's macros. At
// temperature 0.1 that reply repeats word for word, so three identical wrong
// rows could reach quorum and become permanent shared data.
{
  const reply = {
    items: [
      answer({
        name: "Kofta",
        canonical_key: "malai kofta",
        food_class: "curry",
        enerc: 1600,
        protcnt: 6,
        fatce: 20,
        choavldf: 12,
        fibtg: 2,
      }),
      answer({
        name: "Kofta",
        canonical_key: "chicken kofta",
        food_class: "protein",
        enerc: 853.5,
        protcnt: 18,
        fatce: 12,
        choavldf: 6,
        fibtg: 1,
      }),
    ],
  };
  const rows = rowsFor(reply);
  // One row, not two: A's REPAIRED slot passes the gate by construction, so
  // this also fails if the slot's numbers are gated instead of the raw ones.
  assert.equal(rows.length, 1, "only B passes the gate on its raw numbers");
  assert.equal(rows[0].canonical_key, "chicken kofta", "B's own identity");
  assert.equal(rows[0].food_class, "protein");
  assert.equal(rows[0].protcnt, 18, "B's own macros");
  assert.equal(rows[0].enerc, 853.5);
  assert.ok(
    !rows.some((r) => r.canonical_key === "malai kofta"),
    "A's identity must never be recorded with anyone's numbers",
  );
}

// Positions shift when validation DROPS an item. An all-zero item is removed
// from the list the user sees, so an index into that filtered list pairs every
// later item with its neighbour's numbers: here, sambar's name on dosa's
// macros. The slots keep a null in the dropped item's place instead.
{
  const reply = {
    items: [
      answer({
        name: "Water",
        canonical_key: "water",
        food_class: "beverage",
        enerc: 0,
        protcnt: 0,
        fatce: 0,
        choavldf: 0,
        fibtg: 0,
      }),
      answer({
        name: "Masala dosa",
        canonical_key: "masala dosa",
        food_class: "breakfast dish",
        enerc: 677,
        protcnt: 3.3,
        fatce: 7.8,
        choavldf: 19.6,
        fibtg: 2.5,
      }),
      answer({
        name: "Sambar",
        canonical_key: "sambar",
        food_class: "curry",
        enerc: 276,
        protcnt: 3,
        fatce: 2,
        choavldf: 9,
        fibtg: 2,
      }),
    ],
  };
  const v = validateFoodSlots(reply, "q");
  assert.ok(v);
  assert.equal(v.items.length, 2, "the all-zero item is dropped for the user");
  assert.equal(v.slots.length, 3, "but keeps its slot, so positions hold");
  assert.equal(v.slots[0], null);

  const rows = rowsFor(reply);
  const byKey = Object.fromEntries(rows.map((r) => [r.canonical_key, r]));
  assert.equal(rows.length, 2);
  assert.equal(byKey["masala dosa"].protcnt, 3.3, "dosa keeps dosa's numbers");
  assert.equal(byKey["sambar"].protcnt, 3, "sambar keeps sambar's numbers");
}

// {"items":[null]} — a cache problem, never an error. Validation rejects it,
// so no slots exist and nothing is dereferenced.
{
  assert.equal(validateFoodResponse({ items: [null] }, "q"), null);
  assert.deepEqual(rowsFor({ items: [null] }), []);
  // Even handed a slot, a raw entry that is not an object is skipped, not read.
  const slot = {
    name: "x",
    canonical_key: "x",
    food_class: "snack",
    basis: "100g" as const,
    aliases: [],
  };
  assert.deepEqual(cacheableAnswers([null], [slot], "meal"), []);
  assert.deepEqual(cacheableAnswers(["idli"], [slot], "meal"), []);
  assert.deepEqual(cacheableAnswers(undefined, [], "meal"), []);
  // Arrays that disagree in length cannot be paired by position: refuse.
  assert.deepEqual(cacheableAnswers([{}, {}], [slot], "meal"), []);
}

// A key of only spaces is no key.
{
  const idli = (canonical_key: string) => ({
    items: [
      answer({
        name: "Idli",
        canonical_key,
        food_class: "breakfast dish",
        enerc: 376.6,
        protcnt: 2.5,
        fatce: 0.2,
        choavldf: 19.5,
        fibtg: 0.8,
      }),
    ],
  });
  assert.deepEqual(rowsFor(idli("   ")), [], "a whitespace key is not stored");
  // And a real key is stored trimmed, so " idli " and "idli" share a group.
  assert.equal(rowsFor(idli(" idli "))[0]?.canonical_key, "idli");
}

// ── alternatives are not foods anybody searched ────────────────────────────
// Under kind "single" the items are 2-3 candidates for ONE query, returned
// because the model is not confident. Caching all of them put "mango
// cheesecake" into ai_unverified off a search for tofu cheesecake, built from
// the model's own lower-confidence numbers.
{
  const shake = (over: Record<string, unknown>) =>
    answer({
      food_class: "sweet",
      enerc: 419,
      protcnt: 3.4,
      fatce: 1.2,
      choavldf: 17.5,
      fibtg: 0.5,
      ...over,
    });
  const reply = {
    items: [
      shake({ name: "Tofu Cheesecake", canonical_key: "tofu cheesecake" }),
      shake({ name: "Mango cheesecake", canonical_key: "mango cheesecake" }),
      shake({ name: "Baked cheesecake", canonical_key: "baked cheesecake" }),
    ],
  };
  const alternatives = rowsFor(reply, "single");
  assert.equal(alternatives.length, 1, "only the best candidate is cached");
  assert.equal(alternatives[0].canonical_key, "tofu cheesecake");
  // The same three items eaten together are three real answers.
  assert.equal(rowsFor(reply, "meal").length, 3);

  // "The first item that SURVIVES", not "items[0]": a first item the gate
  // refuses must not take the one slot with it, or a bad lead answer would
  // silence the whole reply.
  const badFirst = {
    items: [
      shake({
        name: "Tofu Cheesecake",
        canonical_key: "tofu cheesecake",
        enerc: 0,
        protcnt: 0,
        fatce: 0,
        choavldf: 0,
        fibtg: 0,
      }),
      shake({ name: "Mango cheesecake", canonical_key: "mango cheesecake" }),
    ],
  };
  const kept = rowsFor(badFirst, "single");
  assert.equal(kept.length, 1);
  assert.equal(kept[0].canonical_key, "mango cheesecake");
}

// ── a correction goes back on the cache's own basis ────────────────────────
import { per100g } from "./foodCache.ts";
{
  const edit = (quantity_g: number, t: number[]) => ({
    food_name: "x",
    quantity_g,
    calories: t[0],
    protein_g: t[1],
    carbs_g: t[2],
    fat_g: t[3],
    fiber_g: t[4],
  });
  // What every reader does with a cache row: per 100 g, scaled by grams.
  const served = (m: NonNullable<ReturnType<typeof per100g>>, g: number) =>
    [m.enerc / 4.184, m.protcnt, m.choavldf, m.fatce, m.fibtg].map(
      (v) => +((v * g) / 100).toFixed(2),
    );

  // '100g' row: 250 g logged at 400 kcal -> 160 kcal/100 g = 669.44 kJ.
  const bowl = per100g(edit(250, [400, 10, 60, 12.5, 5]))!;
  assert.deepEqual(bowl, {
    enerc: 669.44,
    protcnt: 4,
    fatce: 5,
    choavldf: 24,
    fibtg: 2,
  });
  assert.deepEqual(served(bowl, 250), [400, 10, 60, 12.5, 5]);

  // 'piece' row, piece_g 50: three rotis were logged as 150 g. Stored per
  // 100 g like every other row, so serving the same 150 g gives back exactly
  // what the user typed. Per piece (130 kcal) would come back as 195 kcal.
  const rotis = per100g(edit(150, [390, 12, 66, 9, 6]))!;
  assert.equal(rotis.enerc, 1087.84); // 260 kcal/100 g
  assert.deepEqual(served(rotis, 150), [390, 12, 66, 9, 6]);

  // Not a food: no grams, more than pure fat, a macro over 100 g per 100 g.
  assert.equal(per100g(edit(0, [100, 1, 1, 1, 1])), null);
  assert.equal(per100g(edit(10, [100, 0, 0, 10, 0])), null); // 1000 kcal/100 g
  assert.equal(per100g(edit(10, [40, 11, 0, 0, 0])), null); // 110 g protein
  assert.equal(per100g(edit(100, [NaN, 1, 1, 1, 1])), null);
  // Pure fat is the ceiling, not over it.
  assert.equal(per100g(edit(10, [90, 0, 0, 10, 0]))?.enerc, 3765.6);
}

// ── grouping: which staged answers are the same food ───────────────────────
// The bug these exist for: the model returns a different canonical_key for one
// food on every call, so grouping on exact equality left ai_verified empty for
// two days. Scores below are measured, not guessed — see pickGroupKey's table.
{
  const { groupKey, pickGroupKey, GROUP_SIM } =
    await import("../server/foodCacheKeys.ts");

  assert.equal(GROUP_SIM, 0.9);

  // Word order only. This exact pair was filed as two foods in production,
  // agreeing on macros to within 1%.
  assert.equal(
    groupKey("protein blueberry shake"),
    groupKey("blueberry protein shake"),
  );
  // Sorting merges order and nothing else: a food is never folded into a dish
  // that merely contains it.
  assert.notEqual(groupKey("naan"), groupKey("paneer naan"));
  assert.notEqual(groupKey("coconut rice"), groupKey("coconut dal"));
  // Romanisation is inherited from searchKey, so script is not a barrier.
  assert.equal(groupKey("ತಟ್ಟೆ ಇಡ್ಲಿ"), groupKey("idli tatte"));
  assert.equal(groupKey(""), "");

  // Joins the near-identical open group: 0.900, exactly at the floor.
  assert.equal(
    pickGroupKey(groupKey("dahi bhat"), ["bhaat dahi"]),
    "bhaat dahi",
  );
  // 0.909.
  assert.equal(
    pickGroupKey(groupKey("tatte idli"), ["idli thatte"]),
    "idli thatte",
  );

  // Each of these must start its own group. Branded vs generic is 0.821 — and
  // the two answers behind it disagreed 580 kJ against 290, so they are not
  // one food however close the wording looks.
  assert.equal(
    pickGroupKey(groupKey("blueberry protein shake"), [
      "amul blueberry protein shake",
    ]),
    "blueberry protein shake",
  );
  // 0.737.
  assert.equal(
    pickGroupKey(groupKey("flavoured milkshake"), ["flavoured milk"]),
    "flavoured milkshake",
  );
  // 0.364.
  assert.equal(pickGroupKey(groupKey("paneer naan"), ["naan"]), "naan paneer");

  // No open groups at all: the answer anchors its own.
  assert.equal(
    pickGroupKey("blueberry protein shake", []),
    "blueberry protein shake",
  );

  // Similarity is not transitive, so the winner must not depend on arrival
  // order. Both orderings of the same candidates pick the same group, and the
  // closer candidate wins over the merely-eligible one.
  const two = ["bhaat dahi", "bhaats dahi"];
  assert.equal(pickGroupKey("bhat dahi", two), "bhaat dahi");
  assert.equal(pickGroupKey("bhat dahi", [...two].reverse()), "bhaat dahi");
}

console.log("foodCache: all assertions passed");
