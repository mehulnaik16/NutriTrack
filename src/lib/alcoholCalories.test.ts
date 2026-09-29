import assert from "node:assert";
import { kcalOf, type IFCTItem, ITEMS, rank } from "./foodDb.ts";
import { parseBarcodeProduct } from "./barcodeFood.ts";

// Test 1: Standard non-alcoholic food unchanged
const roti: IFCTItem = {
  code: "test_roti",
  name: "Roti",
  scie: "",
  lang: "",
  grup: "Bread",
  enerc: null,
  protcnt: 3,
  fatce: 1,
  choavldf: 20,
  fibtg: 2,
};
assert.strictEqual(kcalOf(roti), 101, "standard food kcalOf works");

// Test 2: Alcoholic beverage with missing enerc falls back to macros + 7 kcal/g alcohol
const beer: IFCTItem = {
  code: "test_beer",
  name: "Kingfisher Lager",
  scie: "",
  lang: "",
  grup: "Beverages",
  enerc: null,
  protcnt: 0.3,
  fatce: 0,
  choavldf: 3.6,
  fibtg: 0,
  alcohol: 3.79, // ~4.8% ABV * 0.789
};
const expectedKcal = 4 * 0.3 + 4 * 3.6 + 7 * 3.79;
assert(
  Math.abs(kcalOf(beer) - expectedKcal) < 0.01,
  `expected ${expectedKcal}, got ${kcalOf(beer)}`,
);

// Test 3: parseBarcodeProduct reconciles energy for beer with missing energy
const mockBeerData = {
  status: 1,
  product: {
    product_name: "Kingfisher Beer (lager)",
    nutriments: {
      alcohol: 4.8,
      proteins_100g: 0.3,
      fat_100g: 0,
      carbohydrates_100g: 3.6,
      fiber_100g: 0,
    },
  },
};
const parsedBeer = parseBarcodeProduct(mockBeerData, "5011789000030");
assert(parsedBeer !== null, "parsed beer should not be null");
assert.strictEqual(parsedBeer.alcohol, 3.79, "4.8% ABV * 0.789 = 3.79 g");
const perServingKcal = Math.round((kcalOf(parsedBeer) * 330) / 100);
assert.strictEqual(
  perServingKcal,
  139,
  `expected ~139 kcal for 330ml beer, got ${perServingKcal}`,
);

// Test 4: parseBarcodeProduct preserves stated energy when reliable
const mockSnackData = {
  status: 1,
  product: {
    product_name: "Protein Bar",
    nutriments: {
      "energy-kcal_100g": 400,
      proteins_100g: 20,
      fat_100g: 10,
      carbohydrates_100g: 45,
      fiber_100g: 5,
    },
  },
};
const parsedSnack = parseBarcodeProduct(mockSnackData, "123456789");
assert(parsedSnack !== null);
assert.strictEqual(Math.round(kcalOf(parsedSnack)), 400);

// Test 5: Text Search for all alcohol types in ITEMS catalog
import { searchFoods } from "./foodDb.ts";
console.log("\n--- TEXT SEARCH VERIFICATION ---");
const searchQueries = ["beer", "vodka", "whiskey", "rum", "gin", "tequila", "brandy", "wine"];
for (const q of searchQueries) {
  const matches = searchFoods(q);
  assert(matches.length > 0, `Query "${q}" must return results from searchFoods`);
  const top = matches[0];
  const per100ml = Math.round(kcalOf(top));
  console.log(`Search "${q}" -> Found: "${top.name}" (${per100ml} kcal / 100ml, group: ${top.grup})`);
}

// Test 6: Verify Standard Serving Sizes and USDA Benchmark Calories
const beerItem = ITEMS.find((it) => it.code === "XE180");
assert(beerItem !== undefined, "Beer item must exist");
assert.strictEqual(beerItem.serving_g, 330, "Beer default serving must be 330 mL");
assert.strictEqual(beerItem.serving_label, "1 bottle = 330 mL");
assert.strictEqual(Math.round((kcalOf(beerItem) * beerItem.serving_g!) / 100), 142, "Beer 330 mL must be 142 kcal");

const vodkaItem = ITEMS.find((it) => it.code === "XE182");
assert(vodkaItem !== undefined, "Vodka item must exist");
assert.strictEqual(vodkaItem.serving_g, 30, "Vodka default serving must be 30 mL (1 peg)");
assert.strictEqual(vodkaItem.serving_label, "1 peg = 30 mL");
assert.strictEqual(Math.round((kcalOf(vodkaItem) * vodkaItem.serving_g!) / 100), 66, "Vodka 30 mL peg must be 66 kcal");

const wineItem = ITEMS.find((it) => it.code === "XE188");
assert(wineItem !== undefined, "Red wine item must exist");
assert.strictEqual(wineItem.serving_g, 150, "Red wine default serving must be 150 mL (1 glass)");
assert.strictEqual(wineItem.serving_label, "1 glass = 150 mL");
assert.strictEqual(Math.round((kcalOf(wineItem) * wineItem.serving_g!) / 100), 128, "Red wine 150 mL glass must be ~128 kcal");

console.log("\n✓ alcoholCalories.test.ts: all assertions passed");
