// Self-check for audit-recipe-macros.mjs. Run: node scripts/audit-recipe-macros.test.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { auditRow } from "./audit-recipe-macros.mjs";

const rows = JSON.parse(readFileSync("src/data/ifct2017.json", "utf8"));
const byCode = (c) => rows.find((r) => r.code === c);
const flags = (c) => auditRow(byCode(c)).flags;

// After apply-recipe-fixes: the oil fix is in, the AI-estimate rows are not.
assert.deepEqual(flags("ASC279"), [], "dahi vada fixed");
assert.deepEqual(flags("ASC056"), [], "boiled egg fixed from IFCT M004");
assert.ok(flags("OSR025").includes("diluted_kcal"), "rabri: diluted_kcal");
assert.ok(
  flags("OSR119").includes("fat_oil"),
  "banana chips still needs a source",
);
assert.ok(flags("BFP439").includes("diluted_kcal"), "khaman: diluted_kcal");
for (const c of ["ASC266", "BFP312"])
  // mayonnaise, with and without eggs
  assert.deepEqual(flags(c), [], `${c} mayonnaise passes`);
assert.deepEqual(flags("A001"), [], "raw IFCT rows are not audited");
// Mixed dishes are low in protein by nature, not diluted.
for (const c of ["ASC122", "OSR005", "ASC134"])
  // mutton biryani, thandai, chicken chowmein
  assert.ok(!flags(c).includes("diluted_protein"), `${c}: not diluted_protein`);

// Kofta curries are gravies, not fried snacks.
for (const c of ["ASC198", "ASC200", "BFP246"])
  assert.ok(!flags(c).includes("fried_range"), `${c}: not fried_range`);
// Only the 8 crisp snacks still carry the frying-oil bug.
const fatOil = rows.filter((r) => auditRow(r).flags.includes("fat_oil")).length;
assert.equal(fatOil, 8, `fat_oil count ${fatOil}`);

console.log("audit-recipe-macros: all checks passed");
