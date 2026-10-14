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
// The two rows as they were before apply-recipe-fixes (git 2430bbd).
const ORIGINAL = {
  ASC279: {
    code: "ASC279",
    name: "Dahi vadas/Dahi bhalla",
    scie: "",
    lang: "",
    grup: "asc_manual",
    enerc: 2748.733154296875,
    protcnt: 2.960587739944458,
    fatce: 70.4029312133789,
    choavldf: 5.486240863800049,
    fibtg: 0.9654499292373657,
  },
  ASC056: {
    code: "ASC056",
    name: "Boiled egg (Ubla anda)",
    scie: "",
    lang: "",
    grup: "asc_manual",
    enerc: 189.76821899414062,
    protcnt: 4.430860996246338,
    fatce: 3.0388741493225098,
    choavldf: 0.11993376910686493,
    fibtg: 0.10980132967233658,
  },
};

// Dahi vada (ASC279): 70.4 g fat -> 15 g, its own protein and carbs concentrated.
const dv = removeExcessOil(ORIGINAL.ASC279, 15);
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

const egg = suggest(ORIGINAL.ASC056, rows);
assert.equal(egg.method, "ifct_measured");
assert.ok(egg.p > 13, "boiled egg takes IFCT measured protein");

console.log("suggest-recipe-fixes: all checks passed");

// applyFixes: only calculated and measured fixes are written; AI estimates,
// crisp snacks and looks_ok rows stay as they are for a source to decide.
{
  const { applyFixes } = await import("./apply-recipe-fixes.mjs");
  const copy = structuredClone(rows).map((r) =>
    ORIGINAL[r.code] ? structuredClone(ORIGINAL[r.code]) : r,
  );
  const changed = applyFixes(copy);
  const c = (code) => copy.find((r) => r.code === code);
  assert.deepEqual(changed.sort(), ["ASC056", "ASC279"], `changed ${changed}`);
  assert.equal(c("ASC279").fatce, 15, "dahi vada fat fixed");
  assert.ok(
    Math.abs(c("ASC279").enerc / 4.184 - 237.6) < 0.5,
    "dahi vada kcal ~238",
  );
  assert.ok(c("ASC056").protcnt > 13, "boiled egg from IFCT M004");
  assert.equal(
    c("OSR024").enerc,
    row("OSR024").enerc,
    "shrikhand (AI estimate) untouched",
  );
  assert.equal(
    c("OSR119").enerc,
    row("OSR119").enerc,
    "banana chips (crisp) untouched",
  );
  assert.deepEqual(
    applyFixes(structuredClone(rows)),
    [],
    "the shipped data needs no further fix",
  );
  console.log("applyFixes: all checks passed");
}
