/**
 * Acceptance tests for the typo-tolerant food search.
 *
 * Plain node:assert script, same convention as foodUnits.test.ts.
 * Run:  node src/lib/foodFuzzy.test.ts
 *
 * The point of this layer is that a food we already hold never reaches the paid
 * model, so the two failure modes are symmetrical and both are tested: a miss
 * spends money and returns invented numbers, while a false positive silently
 * logs the wrong food. F2 and F3 are the halves of that.
 */
import assert from "node:assert";
import {
  strongFoods,
  fuzzyFoods,
  referenceFoods,
  isComposite,
  similarity,
  altNames,
  catalogFood,
} from "./foodFuzzy.ts";
import { searchFoods } from "./foodDb.ts";

const top = (q: string) => strongFoods(q, 3)[0]?.name ?? "";
const hits = (q: string) => strongFoods(q, 3).length;

// ── F1: the index builds once, and quickly ──────────────────────────────────
{
  const t0 = Date.now();
  fuzzyFoods("warmup");
  const build = Date.now() - t0;
  assert.ok(build < 1000, `F1 index took ${build}ms to build`);

  const t1 = Date.now();
  for (let i = 0; i < 20; i++) fuzzyFoods("paneer");
  const perSearch = (Date.now() - t1) / 20;
  assert.ok(perSearch < 50, `F1 search averaged ${perSearch}ms`);
  console.log(`✓ F1 index ${build}ms, search ~${perSearch.toFixed(1)}ms`);
}

// ── F2: misspellings resolve locally, so the model is never called ──────────
{
  const typos: [string, string][] = [
    ["orage", "orange"],
    ["panner", "paneer"],
    ["chiken", "chicken"],
    ["briyani", "biryani"],
    ["idly", "idli"],
    ["chapathi", "chapati"],
  ];
  for (const [typed, expected] of typos) {
    const name = top(typed).toLowerCase();
    assert.ok(
      name.includes(expected),
      `F2 "${typed}" should reach ${expected}, got "${name || "(nothing)"}"`,
    );
  }
  console.log(`✓ F2 ${typos.length} misspellings resolved without the model`);
}

// ── F3: nonsense stays unmatched, so the model still gets its turn ──────────
// The mirror of F2. A fuzzy matcher loose enough to fix "orage" is loose enough
// to claim "asdfgh" is Afghani chicken, and that silently logs the wrong food.
{
  for (const junk of ["asdfgh", "zzzzz", "qwerty", "xkcdplm"]) {
    assert.strictEqual(hits(junk), 0, `F3 "${junk}" must not match any food`);
  }
  console.log(`✓ F3 nonsense queries fall through to the AI path`);
}

// ── F4: regional names typed in English reach the right row ────────────────
// These live in the `lang` field of the IFCT rows, which is why the index
// splits that field into separate names instead of matching it as one blob.
{
  const regional: [string, string][] = [
    ["sajje", "bajra"], // Kannada
    ["kambu", "bajra"], // Tamil
    ["jonna", "jowar"], // Telugu
    ["keerai", "amaranth"], // Tamil
  ];
  for (const [typed, expected] of regional) {
    const name = top(typed).toLowerCase();
    assert.ok(
      name.includes(expected),
      `F4 "${typed}" should reach ${expected}, got "${name || "(nothing)"}"`,
    );
  }
  console.log(`✓ F4 regional names resolve: sajje/kambu → Bajra, jonna → Jowar`);
}

// ── F5: a brand item is findable without naming the brand ──────────────────
// Restaurant rows are stored brand-first ("McDonald's McVeggie Burger"), so the
// old prefix/substring search missed every query that started with the item.
{
  for (const q of ["veggie burger", "mcveggie"]) {
    assert.ok(
      top(q).toLowerCase().includes("mcveggie"),
      `F5 "${q}" should reach the McVeggie row, got "${top(q)}"`,
    );
  }
  console.log(`✓ F5 brand items found by item name alone`);
}

// ── F6: native script does not match, and that is correct ──────────────────
// `lang` holds romanised regional names, never the script itself, so these
// queries are meant to fall through to the model — which reads them.
{
  for (const q of ["ತಟ್ಟೆ ಇಡ್ಲಿ", "இட்லி சாம்பார்", "छोले भटूरे"]) {
    assert.strictEqual(
      hits(q),
      0,
      `F6 native script should fall through to the AI path, but "${q}" matched`,
    );
  }
  console.log(`✓ F6 native script falls through by design`);
}

// ── F7: composite queries are recognised and split for grounding ───────────
{
  assert.strictEqual(isComposite("dosa"), false);
  assert.strictEqual(isComposite("palak paneer with roti"), true);
  assert.strictEqual(isComposite("naanu idli mattu chutney tindhe"), true);
  // No connector at all, but five words is still a meal.
  assert.strictEqual(isComposite("2 idli 1 vada sambar"), true);

  // Searching the whole sentence matches nothing; searching each half matches
  // both, which is the entire reason referenceFoods splits first.
  const refs = referenceFoods("palak paneer with roti").map((i) =>
    i.name.toLowerCase(),
  );
  assert.ok(refs.some((n) => n.includes("paneer")), `F7 no paneer in ${refs}`);
  assert.ok(refs.some((n) => n.includes("roti")), `F7 no roti in ${refs}`);
  assert.ok(refs.length <= 5, "F7 reference block must stay within 5 rows");
  console.log(`✓ F7 "palak paneer with roti" grounds on both halves`);
}

// ── F8: an exact name still wins outright ──────────────────────────────────
{
  assert.strictEqual(top("dosa"), "Dosa");
  assert.ok(top("paneer").toLowerCase().startsWith("paneer"));
  console.log(`✓ F8 exact names rank first`);
}

// ── F9: parenthetical name-aliases now widen the index, not just `lang` ────
// "Semolina porridge (Suji/Rava daliya)" has no `lang`; before catalogAliases
// was wired into the index, "Suji" ranked behind "Wheat, semolina" and "Shahi
// suji halwa" on this exact catalog. Verified against src/data/ifct2017.json.
{
  assert.strictEqual(top("Suji"), "Semolina porridge (Suji/Rava daliya)");
  console.log(`✓ F9 name-parenthetical alias "Suji" reaches its row`);
}

// ── similarity: exported for the cache's alias cross-check ─────────────────
assert.equal(similarity("idli", "idli"), 1);
assert.ok(similarity("idli", "idly") >= 0.7);
assert.ok(similarity("idli", "dosa") < 0.5);
assert.equal(similarity("", ""), 1);

// ── altNames: the lang shape, 430 catalog rows use it ─────────────────────
assert.deepEqual(altNames("A., Kash. Baajra; Kan. Sajje; Tam. Kambu"), [
  "Baajra",
  "Sajje",
  "Kambu",
]);
assert.deepEqual(altNames(""), []);

// ── catalogFood: the automatic pick voice and photo logs make ──────────────
// Each of these used to log a different food that merely contains the word
// (coffee -> Coffee biscuit, water -> Water Chestnut, milk -> Milk cake, egg ->
// a sandwich, sugar -> sugarcane juice). No catalog row IS any of them, so
// they must go to the server rather than be guessed.
for (const q of [
  "coffee",
  "water",
  "milk",
  "egg",
  "sugar",
  "dal",
  "chicken",
  "chai",
  "tea",
  "rice",
])
  assert.equal(catalogFood(q), undefined, `${q} must fall through`);
// Where a raw corpus row and a curated row share a name, the curated one —
// with its piece weight — is the pick, and searchFoods puts it first too.
for (const [q, code] of [
  ["idli", "XE004"],
  ["Naan", "XE031"],
  ["dhokla", "XE104"],
]) {
  assert.equal(catalogFood(q)?.code, code, `${q} -> ${code}`);
  assert.equal(searchFoods(q, 1)[0]?.code, code, `searchFoods ${q} -> ${code}`);
}
// A spaced " / " separates names, and a curated row's bracket is its default
// state, so these still count as the name.
for (const [q, code] of [
  ["roti", "XE030"],
  ["chapati", "XE030"],
  ["poha", "XE010"],
  ["paneer", "XE083"],
  ["curd", "XE160"],
  ["dahi", "XE160"],
])
  assert.equal(catalogFood(q)?.code, code, `${q} -> ${code}`);
// Bare-name rows: whichever row is plainly this food, by its own name.
for (const q of ["banana", "dosa"])
  assert.equal(catalogFood(q)?.name.split(" (")[0].toLowerCase(), q, q);
// Raw IFCT rows use an UNSPACED "/" for a spelling variant of the last word
// and brackets for qualifiers. Neither may turn one word into a different
// food: each of these used to log the named row with no model call.
for (const [q, wrong] of [
  ["paratha", "Potato parantha/paratha (Aloo ka parantha/paratha)"],
  ["lassi", "Lassi (salted)"],
  ["jackfruit", "Jackfruit/Kathal (dry)"],
  ["kathal", "Jackfruit/Kathal (dry)"],
  ["eggplant", "Eggplant/Brinjal rice (Vangi bhat)"],
  ["okra", "Okra/Lady's fingers fry (Bhindi sabzi/sabji/subji)"],
  ["pakoda", "Potato pakora/pakoda (Aloo pakoda)"],
  ["chilla", "Moong dal stuffed cheela/chilla (Moong dal ka cheela/chilla)"],
  ["cheela", "Gram flour chilla/cheela (Besan chilla/cheela)"],
  ["khichri", "Sago khitchdi/khichri (Sabudana khitchdi/khichri)"],
  ["tikka", "Paneer shaslik/tikka"],
  ["imli", "Saunth/Sonth chutney with tamarind/imli"],
  ["ghiya", "Ghiya/Lauki Kofta Curry"],
  ["vadas", "Sago cutlet/vadas (Sabudana cutlet/vadas)"],
  ["fudge", "Split bengal gram burfi/fudge (Channa dal burfi)"],
  ["puree", "Banana groundnut paste/puree"],
  ["omlet", "Plain omelette/omlet"],
  ["biriyani", "Mutton biryani/biriyani"],
])
  assert.notEqual(catalogFood(q)?.name, wrong, `${q} must not log ${wrong}`);

// ── F10: a regional name shaped like a language tag is not stripped ─────────
// Toddy's lang ends "Mal., Tam., Tel. Kallu." — a capital, four lowercase
// letters and a dot, the same shape as "Kash." The old tag pattern deleted it,
// so "kallu" found nothing locally and went to the paid model. "Kaali Mirch."
// lost its second word the same way.
{
  assert.ok(
    top("kallu").toLowerCase().includes("toddy"),
    `F10 "kallu" should reach Toddy, got "${top("kallu") || "(nothing)"}"`,
  );
  assert.ok(
    top("kaali mirch").toLowerCase().includes("pepper"),
    `F10 "kaali mirch" should reach black pepper, got "${top("kaali mirch") || "(nothing)"}"`,
  );
  console.log(`✓ F10 tag-shaped regional names survive: kallu → Toddy, kaali mirch → Pepper`);
}

console.log("\n✅ All food-fuzzy tests passed.");
