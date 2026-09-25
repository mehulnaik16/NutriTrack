/**
 * Runnable checks for the restaurant data: portion wording from
 * apply-restaurant-official.mjs, and a sourcing record for every brand.
 * Run: node scripts/restaurant-data.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { portion } from "./apply-restaurant-official.mjs";

const r = (name, label, g = 200, est = false) => ({
  name: `Brand ${name}`, lang: "Brand", serving_g: g, serving_label: label,
  ...(est ? { serving_est: true } : {}),
});

// The brand's own word wins; its weight is shown as published.
assert.equal(portion(r("Crispy Veg", "1 burger (137 g)", 137)).serving_label, "1 burger = 137 g");
// A generic serving takes the item's own unit when it names one thing.
assert.equal(portion(r("McVeggie Burger", "1 serving (168 g)", 168)).serving_label, "1 burger = 168 g");
assert.equal(portion(r("Rajma Rice Bowl", "1 order, as sold (≈677 g)", 677, true)).serving_label, "1 bowl ≈ 677 g");
// Multiples, combos and cakes stay a serving.
assert.equal(portion(r("10 Crispy Chicken Burger", "1 serving (≈1780 g)", 1780, true)).portion_unit, "serving");
assert.equal(portion(r("Burger Meal + Pepsi", "1 serving (400 g)")).portion_unit, "serving");
assert.equal(portion(r("Waffle Cake Double Layer", "1 serving (522 g)")).portion_unit, "serving");
// Size detail is kept; logging one piece is the whole serving.
const pizza = portion(r("Farmhouse Pizza (Regular)", "1 regular pizza, 4 slices (≈316 g)", 316, true));
assert.equal(pizza.serving_label, "1 regular pizza (4 slices) ≈ 316 g");
assert.equal(pizza.piece_g, 316);
// Per-100 g brands are left in grams.
const per100 = r("Mango Ice Cream", "100 g, as published", 100);
assert.equal(portion(per100), per100);
// Reading its own output gives the same row.
assert.deepEqual(portion(pizza), pizza);

// Every brand in the app has a source and a date on record (internal only).
const rows = JSON.parse(fs.readFileSync("src/data/restaurantFoods.json", "utf8"));
const { brands } = JSON.parse(fs.readFileSync("data/restaurant-official/sources.json", "utf8"));
const recorded = new Map(brands.map((b) => [b.brand, b]));
for (const brand of new Set(rows.map((x) => x.lang))) {
  const b = recorded.get(brand);
  assert.ok(b, `${brand} has no entry in data/restaurant-official/sources.json`);
  assert.match(b.sourced_at, /^\d{4}-\d{2}-\d{2}$/, `${brand} needs a sourced_at date`);
  assert.ok(["official", "restaurant_provided", "third_party"].includes(b.source_type), brand);
}

console.log("restaurant-data: all checks passed");
