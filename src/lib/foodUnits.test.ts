/* Runnable self-check for the quantity-unit maths. No test framework in this
   repo, so this is a plain assert script — same convention as measurements.test.ts.

   Run:
     node src/lib/foodUnits.test.ts

   Node 22 strips TypeScript natively, so this imports the real module rather
   than restating its logic. Exits non-zero on the first failure. */
import assert from "node:assert";
import ifct from "../data/ifct2017.json" with { type: "json" };
import restaurant from "../data/restaurantFoods.json" with { type: "json" };
import { EXTRA_FOODS } from "../data/extraFoods.ts";
import {
  DENSITY,
  PIECE_G,
  type Unit,
  defaultUnitFor,
  density,
  formatQty,
  pieceGrams,
  toGrams,
  unitsFor,
  validateQuantity,
} from "./foodUnits.ts";

const idli = { code: "XE004", grup: "Breakfast" };
const oil = { code: "T001", grup: "Edible Oils and Fats" };
const ghee = { code: "XE161", grup: "Dairy & Fats" };
const seed = { code: "A001", grup: "Cereal Grains and Products" };
// IFCT's own E004 is an apple. Curated rows are prefixed so the two never
// collide; without that, every fruit in the catalog inherits a piece weight.
const ifctApple = { code: "E004", grup: "Fruits" };

// ── pcs: the "2 idlis" case this whole feature exists for ──────────────────
assert.equal(toGrams(2, "pcs", idli), 80);
assert.equal(toGrams(1, "pcs", idli), 40);
assert.equal(pieceGrams(idli), 40);
assert.equal(pieceGrams(seed), undefined);
assert.equal(pieceGrams(ifctApple), undefined);
assert.ok(!unitsFor(ifctApple).includes("pcs"));

// A food with no piece weight must not log the count as grams.
assert.equal(toGrams(3, "pcs", seed), 0);

// ── density applies to volume units only ───────────────────────────────────
assert.equal(toGrams(1, "tbsp", oil), 13.7); // 15 × 0.91
assert.equal(toGrams(1, "tsp", ghee), 4.6); // 5 × 0.91, curated row keyed by code
assert.equal(density(oil), 0.91);
assert.equal(density(seed), 1);

// Grams are never scaled, even for a food that has a density.
assert.equal(toGrams(100, "g", oil), 100);

// A food with no density entry converts at 1 g/ml.
assert.equal(toGrams(1, "cup", seed), 240);
assert.equal(toGrams(1, "cup", ifctApple), 240);
assert.equal(toGrams(2, "ml", seed), 2);

// ── which units a food offers ──────────────────────────────────────────────
assert.ok(!unitsFor(seed).includes("pcs"));
assert.ok(unitsFor(idli).includes("pcs"));
// Reopening a log entered in pieces: the synthesised item has no code, but the
// current unit must still appear in its own list.
assert.ok(unitsFor({ code: "edit" }, "pcs").includes("pcs"));
assert.equal(unitsFor(seed).length, 5);
assert.equal(defaultUnitFor(idli), "pcs");
assert.equal(defaultUnitFor(seed), "g");

// ── validation: +"" is 0 and +"abc" is NaN, both would log a wrong number ──
for (const bad of ["", "   ", "abc", "0", "-5"]) {
  assert.equal(validateQuantity(bad, "g", seed).ok, false, `accepted ${bad}`);
}
assert.equal(validateQuantity("0", "pcs", idli).ok, false);

// Pieces of an uncountable food are rejected with their own message.
const noPiece = validateQuantity("2", "pcs", seed);
assert.equal(noPiece.ok, false);
assert.match(noPiece.ok ? "" : noPiece.error, /piece/i);

// Out of range: 200 cups is 48 kg.
assert.equal(validateQuantity("200", "cup", seed).ok, false);
assert.equal(validateQuantity("6000", "g", seed).ok, false);

// Valid input returns grams, not the entered number.
const ok = validateQuantity("2", "pcs", idli);
assert.deepEqual(ok, { ok: true, value: 80 });
assert.deepEqual(validateQuantity("2.5", "tbsp", oil), {
  ok: true,
  value: 34.1,
});

// ── read-back formatting ───────────────────────────────────────────────────
assert.equal(formatQty(80, "pcs", 2), "2 pcs");
assert.equal(formatQty(34.1, "tbsp", 2.5), "2.5 tbsp");
assert.equal(formatQty(80, "g", 80), "80g");
// Rows written before units existed carry neither field.
assert.equal(formatQty(80, null, null), "80g");
assert.equal(formatQty(79.6), "80g");

// Every unit the selector can show must convert without throwing.
for (const u of unitsFor(idli)) {
  assert.ok(Number.isFinite(toGrams(1, u as Unit, idli)));
}

// ── the lookups must point at real, unambiguous catalog rows ───────────────
// Codes are only unique because curated rows are prefixed. Keyed off a bare
// code, PIECE_G["E004"] resolved to IFCT's apple and handed a piece weight to
// every fruit in the database.
const catalog = [...ifct, ...EXTRA_FOODS, ...restaurant] as {
  code: string;
  name: string;
}[];

const byCode = new Map<string, string[]>();
for (const row of catalog) {
  byCode.set(row.code, [...(byCode.get(row.code) ?? []), row.name]);
}

assert.deepEqual(
  [...byCode].filter(([, names]) => names.length > 1),
  [],
  "two catalog rows share a code — a code lookup cannot tell them apart",
);

for (const code of [...Object.keys(PIECE_G), ...Object.keys(DENSITY)]) {
  // Density is also keyed by group name, which is deliberately not a code.
  if (!code.match(/^[A-Z]+\d/)) continue;
  assert.ok(byCode.has(code), `${code} matches no food in the catalog`);
}

console.log(
  `foodUnits: all checks passed (${catalog.length} foods, ${Object.keys(PIECE_G).length} countable)`,
);
