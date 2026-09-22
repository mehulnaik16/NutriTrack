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

assert.equal(CACHE_ENERGY_TOL, 0.1);
assert.equal(cacheGate(consistent), true);

// Within 10%: still cacheable.
assert.equal(cacheGate({ ...consistent, enerc: 165 * KJ * 1.08 }), true);
// Outside 10%: shown to the user, never cached.
assert.equal(cacheGate({ ...consistent, enerc: 165 * KJ * 1.2 }), false);

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
// 1.5x (50% over), not the brief's 1.2x: reconcileEnergy only repairs past its
// own ENERGY_TOL (25%), and 20% over sits inside that tolerance, so a 1.2x
// value is returned unrepaired and the "proof" assertion below would fail.
const bad = { ...consistent, enerc: 165 * KJ * 1.5 };
assert.equal(cacheGate(bad), false, "raw answer must fail");
assert.equal(
  cacheGate(reconcileEnergy(bad, "test food")),
  true,
  "repaired answer passes — proof the gate must see the raw value first",
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

console.log("foodCache: all assertions passed");
