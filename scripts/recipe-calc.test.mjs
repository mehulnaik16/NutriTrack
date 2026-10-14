// Self-check for recipe-calc.mjs. Run: node scripts/recipe-calc.test.mjs
import assert from "node:assert";
import { calcRecipe } from "./recipe-calc.mjs";

// 100 g raw rice cooked to 275 g: IFCT rice (356 kcal) / 2.75.
const rice = calcRecipe({ ing: { A015: 100 }, yield: 275 });
assert.ok(Math.abs(rice.kcal - 356.2 / 2.75) < 2, `rice ${rice.kcal}`);
assert.ok(Math.abs(rice.c - 78.24 / 2.75) < 0.05, `rice carbs ${rice.c}`);

// Sugar is pure sucrose: 100 g carbs, nothing else.
const syrup = calcRecipe({ ing: { SUGAR: 50 }, yield: 100 });
assert.equal(syrup.c, 50);
assert.equal(syrup.p, 0);

// Oil adds only fat; kcal = 4P + 4C + 9F + 2 fibre.
const oil = calcRecipe({ ing: { T005: 10 }, yield: 100 });
assert.equal(oil.f, 10);
assert.equal(oil.kcal, 90);

// Only raw IFCT rows and the named reference ingredients are allowed.
assert.throws(
  () => calcRecipe({ ing: { ASC279: 10 }, yield: 100 }),
  /not a raw ingredient/,
);
assert.throws(() => calcRecipe({ ing: { NOPE: 10 }, yield: 100 }), /unknown/);

console.log("recipe-calc: all checks passed");
