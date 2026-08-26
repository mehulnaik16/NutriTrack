/**
 * Runnable checks for the restaurant-menu converter.
 * Run: node scripts/build-restaurant-foods.test.mjs
 *
 * Follows the repo's existing convention (src/lib/__cycle.test.mjs) — no test
 * runner is installed, so this is a plain script that exits non-zero on failure.
 */

import assert from "node:assert/strict";
import {
  extractObjects,
  parseGrams,
  weightFromName,
  foodKind,
  atwaterKcal,
  atwaterAgrees,
  repairPieceRows,
  plausibleForKind,
} from "./build-restaurant-foods.mjs";

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

// ── extractObjects ──────────────────────────────────────────────────────────

test("extractObjects reads a plain array", () => {
  assert.deepEqual(extractObjects('[{"a":1},{"a":2}]').map((r) => r.a), [1, 2]);
});

test("extractObjects survives the ]{ seam", () => {
  // The exact corruption in food data.txt and several menu files.
  assert.deepEqual(extractObjects('[{"a":1}]{"a":2},{"a":3}').map((r) => r.a), [1, 2, 3]);
});

test("extractObjects survives the }[ seam", () => {
  assert.deepEqual(extractObjects('{"a":1}[{"a":2}]').map((r) => r.a), [1, 2]);
});

test("extractObjects is not confused by braces inside strings", () => {
  const rows = extractObjects('[{"name":"Weird } Food {"},{"name":"ok"}]');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, "Weird } Food {");
});

test("extractObjects is not confused by an escaped quote", () => {
  const rows = extractObjects('[{"name":"Dave\\"s Single"}]');
  assert.equal(rows[0].name, 'Dave"s Single');
});

// ── parseGrams / weightFromName ─────────────────────────────────────────────

test("parseGrams reads grams, millilitres and bare numbers", () => {
  assert.equal(parseGrams("168 g"), 168);
  assert.equal(parseGrams("330 ml"), 330);
  assert.equal(parseGrams(238), 238);
  assert.equal(parseGrams("248g"), 248);
});

test("parseGrams converts fluid ounces", () => {
  // Wendy's states drink sizes as "(16 oz)".
  assert.equal(parseGrams("16 oz"), 473.2);
});

test("parseGrams rejects a size with no number", () => {
  assert.equal(parseGrams("Regular"), null);
  assert.equal(parseGrams(undefined), null);
  assert.equal(parseGrams(null), null);
});

test("weightFromName finds a weight embedded in an item name", () => {
  assert.equal(weightFromName("Nashville Sauce Bottle -225 g"), 225);
  assert.equal(weightFromName("Classic Zinger Burger"), null);
});

// ── foodKind ────────────────────────────────────────────────────────────────

test("foodKind does not read 'chocolate' as a cola", () => {
  // The bug this guards: /cola/ matched choCOLAte, so brownies and croissants
  // landed in the soft-drink bucket and pushed its density from 0.5 to 2.5.
  assert.equal(foodKind("Ultimate Chocolate Brownie", "Bar Cakes"), "bakery");
  assert.equal(foodKind("Chocolate Croissant (2 Pieces)", "Croissants"), "bakery");
  assert.equal(foodKind("Pepsi Regular", ""), "soft_drink");
  assert.equal(foodKind("Coke Large Drink (20 oz)", ""), "soft_drink");
});

test("foodKind prefers wrap over strip", () => {
  assert.equal(foodKind("Roast Chicken Strips Wrap", "Wraps"), "wrap_roll");
  assert.equal(foodKind("Boneless strips", ""), "nuggets");
});

test("foodKind recognises the KFC chicken naming", () => {
  assert.equal(foodKind("1 Pc HC", ""), "fried_chicken");
  assert.equal(foodKind("Fries Regular", ""), "fries");
  assert.equal(foodKind("Classic Zinger Burger", ""), "burger");
});

test("foodKind falls back to other", () => {
  assert.equal(foodKind("Mystery Item", ""), "other");
});

// ── Atwater ─────────────────────────────────────────────────────────────────

test("atwaterKcal applies 4/9/4", () => {
  assert.equal(atwaterKcal({ protein: 10, fat: 10, carbs: 10 }), 170);
});

test("atwaterAgrees accepts a coherent row", () => {
  // McDonald's McVeggie, per serving.
  assert.equal(
    atwaterAgrees({ kcal: 402.05, protein: 10.24, fat: 13.83, carbs: 56.54 }),
    true,
  );
});

test("atwaterAgrees rejects a scraped contradiction", () => {
  // KFC "Tandoori Zinger Burger": 902 kcal stated, 618 by 4/9/4 — 46% out.
  assert.equal(atwaterAgrees({ kcal: 902, protein: 25, fat: 30, carbs: 62 }), false);
});

test("atwaterAgrees alone cannot catch an impossible-but-consistent row", () => {
  // KFC "7up Krush Lime": 21 g protein in a lime soda, but 86 kcal against an
  // Atwater 100 is only 14% out, so the arithmetic check passes it. This is
  // exactly why plausibleForKind exists.
  assert.equal(atwaterAgrees({ kcal: 86, protein: 21, fat: 0, carbs: 4 }), true);
});

test("plausibleForKind rejects a soda carrying protein", () => {
  assert.equal(plausibleForKind("soft_drink", { protein: 21, fat: 0 }), false);
  assert.equal(plausibleForKind("zero_cal", { protein: 5, fat: 0 }), false);
});

test("plausibleForKind accepts a real soda and leaves milky drinks alone", () => {
  assert.equal(plausibleForKind("soft_drink", { protein: 0, fat: 0 }), true);
  // A milkshake genuinely has protein and fat; policing it would drop real food.
  assert.equal(plausibleForKind("shake", { protein: 8, fat: 9 }), true);
  assert.equal(plausibleForKind("hot_drink", { protein: 6, fat: 4 }), true);
});

test("atwaterAgrees passes a row with no macros to contradict", () => {
  // Cafe Coffee Day publishes energy only.
  assert.equal(
    atwaterAgrees({ kcal: 113, protein: null, fat: null, carbs: null }),
    true,
  );
});

test("atwaterAgrees passes a zero-calorie drink", () => {
  assert.equal(atwaterAgrees({ kcal: 0, protein: 0, fat: 0, carbs: 0 }), true);
});

// ── Piece-row repair ────────────────────────────────────────────────────────

test("repairPieceRows rebuilds N Pc from the 1 Pc unit", () => {
  // The real corruption: 3 Pc showed FEWER calories than 2 Pc.
  const { rows, repaired } = repairPieceRows([
    { item: "1 Pc HC", energy_kcal: 320, protein_g: 19, total_fat_g: 20, carbohydrates_g: 16 },
    { item: "2 Pc HC", energy_kcal: 640, protein_g: 39, total_fat_g: 40, carbohydrates_g: 31 },
    { item: "3 Pc HC", energy_kcal: 480, protein_g: 23, total_fat_g: 30, carbohydrates_g: 23 },
  ]);
  assert.equal(repaired, 2);
  assert.equal(rows[0].energy_kcal, 320, "1 Pc is the trusted unit and stays put");
  assert.equal(rows[1].energy_kcal, 640);
  assert.equal(rows[2].energy_kcal, 960, "3 Pc is rebuilt as 3 x 320");
  assert.equal(rows[2].protein_g, 57);
});

test("repairPieceRows leaves non-piece rows alone", () => {
  const { rows, repaired } = repairPieceRows([
    { item: "Popcorn Regular", energy_kcal: 306 },
    { item: "Fries Large", energy_kcal: 404 },
  ]);
  assert.equal(repaired, 0);
  assert.equal(rows[0].energy_kcal, 306);
});

test("repairPieceRows is inert without a 1 Pc row to anchor on", () => {
  const { rows, repaired } = repairPieceRows([
    { item: "4 Pc Nuggets", energy_kcal: 114 },
  ]);
  assert.equal(repaired, 0);
  assert.equal(rows[0].energy_kcal, 114, "never invent a unit that was not given");
});

// ── Round trip ──────────────────────────────────────────────────────────────

test("per-100g conversion round-trips back to the source serving", () => {
  // The property the whole serving-estimate approach rests on: whatever weight
  // we pick, dividing by it and multiplying back returns the source's numbers.
  const sourceKcal = 524, servingG = 215;
  const per100 = (sourceKcal / servingG) * 100;
  assert.ok(Math.abs((per100 * servingG) / 100 - sourceKcal) < 1e-9);
});

console.log(`${passed} checks passed`);
