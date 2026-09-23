/* Runnable self-check for the AI food cache's pure logic. No test framework in
   this repo, so this is a plain assert script — same convention as
   foodUnits.test.ts and ai.test.ts.

   Run:
     node src/lib/foodCache.test.ts

   Everything here is a pure function: no network, no Supabase, no API key. */
import assert from "node:assert";
import { scriptOf, searchKey, catalogAliases } from "./foodCache.ts";

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
// The whole point: a native-script name and its romanisation must land close
// enough for pg_trgm to see them as the same food.
const kn = searchKey("ಇಡ್ಲಿ");
assert.ok(kn.startsWith("idl"), `expected an idli-like key, got ${kn}`);
assert.equal(searchKey(""), "");

// Cross-script matching is the point of this module: a Kannada name and its
// English spelling must land close enough for pg_trgm/similarity to see them
// as the same food. ITRANS alone scored "tattè idli" vs "thatte idli" at
// 0.73, below the 0.85 cross-script threshold; IAST + deburring fixes it.
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

// consolidate takes the per-macro mean of the three.
assert.deepEqual(
  consolidate([
    macro({ enerc: 690 }),
    macro({ enerc: 700 }),
    macro({ enerc: 710 }),
  ]),
  macro({ enerc: 700 }),
);

// ── alias cross-check ────────────────────────────────────────────────────────
import { crossCheckAliases } from "./foodCache.ts";

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

/** raw reply -> the rows the cache would store, exactly as ai.ts derives them. */
const rowsFor = (reply: { items: unknown[] }) =>
  cacheableAnswers(reply.items, validateFoodSlots(reply, "q")?.slots ?? []);

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
  assert.deepEqual(cacheableAnswers([null], [slot]), []);
  assert.deepEqual(cacheableAnswers(["idli"], [slot]), []);
  assert.deepEqual(cacheableAnswers(undefined, []), []);
  // Arrays that disagree in length cannot be paired by position: refuse.
  assert.deepEqual(cacheableAnswers([{}, {}], [slot]), []);
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

console.log("foodCache: all assertions passed");
