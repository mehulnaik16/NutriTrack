// Self-check for suggest-recipe-fixes.mjs. Run: node scripts/suggest-recipe-fixes.test.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import {
  removeExcessOil,
  targetFat,
  suggest,
} from "./suggest-recipe-fixes.mjs";

const rows = JSON.parse(readFileSync("src/data/ifct2017.json", "utf8"));
const row = (c) => rows.find((r) => r.code === c);

// Dahi vada (ASC279): 70.4 g fat -> 15 g, its own protein and carbs concentrated.
const dv = removeExcessOil(row("ASC279"), 15);
assert.equal(dv.f, 15);
assert.ok(dv.kcal > 230 && dv.kcal < 245, `dahi vada kcal ${dv.kcal}`);
assert.ok(Math.abs(dv.p - 8.5) < 0.2, `dahi vada protein ${dv.p}`);
assert.equal(
  removeExcessOil({ fatce: 10, protcnt: 5, choavldf: 20 }, 15),
  null,
  "lean row untouched",
);

assert.equal(targetFat("Poori"), 15);
assert.equal(targetFat("Mathri"), 30);
assert.equal(targetFat("Paneer kofta curry"), 10);
assert.equal(
  targetFat("Paneer pakora/pakoda"),
  15,
  "fried paneer is not a paneer gravy",
);
assert.equal(
  targetFat("Potato pakora/pakoda (Aloo pakoda)"),
  15,
  "aloo pakoda is fried, not a gravy",
);
assert.equal(targetFat("Potato stuffed poori (Aloo ki poori)"), 15);
assert.equal(targetFat("Dum aloo"), 10);
assert.equal(
  targetFat("Fried fish and Chips (English Style)"),
  12,
  "fish and chips is not a dry snack",
);
assert.equal(targetFat("Banana chips (Kele ke chips)"), 30);

const egg = suggest(row("ASC056"), rows);
assert.equal(egg.method, "ifct_measured");
assert.ok(egg.p > 13, "boiled egg takes IFCT measured protein");

console.log("suggest-recipe-fixes: all checks passed");
