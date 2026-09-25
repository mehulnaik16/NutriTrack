/**
 * Run: node src/lib/mealBuilder.test.ts
 *
 * Every meal, size, step and ingredient of every builder brand: each figure
 * against the brand's raw calculator data, each ingredient picked on its own
 * and all together, the logged food multiplying back to the exact sum, and a
 * saved usual reopening on the same picks.
 */
import assert from "node:assert";
import fs from "node:fs";
import builders from "../data/restaurantBuilders.json" with { type: "json" };
import { kcalOf } from "./foodDb.ts";
import {
  buildFood,
  buildName,
  initialPicks,
  isFixed,
  mealTitle,
  missingSteps,
  readUsual,
  remapPicks,
  toggle,
  totals,
  usualIngredients,
  type BuilderSize,
  type Picks,
  type RestaurantBuilder,
} from "./mealBuilder.ts";

const all = builders as RestaurantBuilder[];
const close = (a: number, b: number, what: string) =>
  assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} ≠ ${b}`);

// ── California Burrito against its own calculator data ───────────────────────
type Raw = {
  name: string;
  cal: number;
  protein: number;
  carbs: number;
  fat: number;
};
const raw = JSON.parse(
  fs.readFileSync(
    "data/restaurant-official/builders/california-burrito.raw.json",
    "utf8",
  ),
);
const cb = all.find((b) => b.brand === "California Burrito")!;
assert.ok(cb, "California Burrito builder exists");
assert.deepStrictEqual(
  cb.meals.map((m) => m.key),
  Object.keys(raw.meals),
  "every calculator meal is there, in its order",
);
const norm = (s: string) =>
  s.toUpperCase().replace("GUACAMOLE AND", "GUACMOLE AND");
let checked = 0;
for (const meal of cb.meals) {
  const sizes = raw.meals[meal.key].sizes.map((s: string) => s.toLowerCase());
  assert.deepStrictEqual(
    meal.sizes.map((s) => s.key),
    sizes.length ? sizes : ["regular"],
    `${meal.key} sizes`,
  );
  for (const size of meal.sizes) {
    assert.ok(size.steps.length > 0, `${meal.key}/${size.key} has steps`);
    for (const step of size.steps) {
      const v =
        meal.key === "sides" ? raw.data.sides : raw.data[meal.key][step.key];
      const list: Raw[] = Array.isArray(v) ? v : v[size.key];
      assert.strictEqual(
        step.options.length,
        list.length,
        `${meal.key}/${size.key}/${step.key} count`,
      );
      step.options.forEach((o, i) => {
        const r = list[i];
        assert.strictEqual(
          norm(o.name),
          r.name.toUpperCase(),
          `${meal.key}/${size.key}/${step.key} name`,
        );
        assert.deepStrictEqual(
          [o.kcal, o.protein, o.carbs, o.fat],
          [r.cal, r.protein, r.carbs, r.fat],
          `${o.name} in ${meal.key}/${size.key}`,
        );
        checked++;
      });
    }
  }
}
// The calculator's section rules, spot-checked.
const steps = (m: string, s: string) =>
  cb.meals
    .find((x) => x.key === m)!
    .sizes.find((x) => x.key === s)!
    .steps.map((x) => x.key);
assert.deepStrictEqual(steps("ricebowl", "pro"), [
  "proteins",
  "extraFillings",
  "makeItRich",
]);
assert.deepStrictEqual(steps("burrito", "habanero"), ["tortilla", "proteins"]);
assert.deepStrictEqual(steps("tacos", "overcrowded"), ["shell", "filling"]);
assert.deepStrictEqual(steps("salad", "regular").at(-1), "dressing");
assert.deepStrictEqual(steps("munchies", "regular"), [
  "snacks",
  "chooseyourdip",
]);

// ── The engine, on every meal and size of every brand ────────────────────────
let combos = 0;
function check(
  b: RestaurantBuilder,
  mealKey: string,
  size: BuilderSize,
  picks: Picks,
) {
  const meal = b.meals.find((m) => m.key === mealKey)!;
  // The sum, done by hand.
  const want = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const s of size.steps)
    for (const o of s.options)
      if (picks[s.key]?.includes(o.name)) {
        want.kcal += o.kcal;
        want.protein += o.protein;
        want.carbs += o.carbs;
        want.fat += o.fat;
      }
  const t = totals(size, picks);
  for (const k of ["kcal", "protein", "carbs", "fat"] as const)
    close(t[k], want[k], k);
  if (t.kcal === 0) return;
  // Logging one portion gives back exactly the sum.
  const food = buildFood(b, meal, size, picks);
  const g = food.serving_g!;
  close((kcalOf(food) * g) / 100, want.kcal, "logged kcal");
  close((food.protcnt! * g) / 100, want.protein, "logged protein");
  close((food.choavldf! * g) / 100, want.carbs, "logged carbs");
  close((food.fatce! * g) / 100, want.fat, "logged fat");
  assert.strictEqual(food.piece_g, g);
  assert.strictEqual(food.portion_unit, size.unit);
  assert.strictEqual(food.serving_label, `1 ${size.unit} ≈ ${g} g`);
  assert.ok(food.name.startsWith(mealTitle(b, meal, size)));
  // A saved usual reopens on the very same meal, size and picks.
  const u = readUsual(b, usualIngredients(b, meal, size, picks));
  assert.ok(u, "usual reads back");
  assert.strictEqual(u!.meal.key, meal.key);
  assert.strictEqual(u!.size.key, size.key);
  assert.deepStrictEqual(u!.picks, picks);
  combos++;
}

for (const b of all)
  for (const meal of b.meals)
    for (const size of meal.sizes) {
      const start = initialPicks(size);
      // Fixed steps come picked; nothing else does.
      for (const s of size.steps)
        assert.deepStrictEqual(
          start[s.key],
          isFixed(s) ? [s.options[0].name] : [],
        );
      // A required step blocks until picked.
      const required = size.steps.filter(
        (s) => s.pick === "one" && !isFixed(s),
      );
      assert.deepStrictEqual(
        missingSteps(size, start).map((s) => s.key),
        required.map((s) => s.key),
      );
      // The first option of each required step: the base every test adds to.
      let base = start;
      for (const s of required) base = toggle(s, base, s.options[0].name);
      assert.deepStrictEqual(missingSteps(size, base), []);
      check(b, meal.key, size, base);
      for (const s of size.steps)
        for (const o of s.options) {
          const one = toggle(s, base, o.name);
          if (s.pick === "one")
            assert.deepStrictEqual(one[s.key], [o.name], "pick-one replaces");
          check(b, meal.key, size, one);
          if (s.pick === "any") {
            // Toggling twice takes it out again.
            assert.deepStrictEqual(toggle(s, one, o.name)[s.key], base[s.key]);
          }
        }
      // Everything optional at once.
      let full = base;
      for (const s of size.steps)
        if (s.pick === "any")
          for (const o of s.options) full = toggle(s, full, o.name);
      check(b, meal.key, size, full);
      // Switching size keeps what exists there and drops the rest.
      for (const other of meal.sizes) {
        const moved = remapPicks(other, full);
        for (const s of other.steps) {
          const names = s.options.map((o) => o.name);
          assert.ok(moved[s.key].every((n) => names.includes(n)));
          if (isFixed(s)) assert.deepStrictEqual(moved[s.key], [names[0]]);
        }
      }
    }

// Names: the fixed tortilla is not listed, picks are, in step order.
const burrito = cb.meals.find((m) => m.key === "burrito")!;
const reg = burrito.sizes[0];
let p = initialPicks(reg);
p = toggle(
  reg.steps.find((s) => s.key === "proteins")!,
  p,
  "Grilled Barbeque Chicken",
);
p = toggle(reg.steps.find((s) => s.key === "rice")!, p, "No Rice");
assert.strictEqual(
  buildName(cb, burrito, reg, p),
  "California Burrito (Regular): Grilled Barbeque Chicken, No Rice",
);
// 142 tortilla + 190 chicken.
assert.strictEqual(totals(reg, p).kcal, 332);
// A saved meal that is not a build, or another brand's, is not a usual.
assert.strictEqual(
  readUsual(cb, [{ name: "Oats", quantity_g: 50, calories: 190 }]),
  null,
);
assert.strictEqual(readUsual(cb, null), null);
assert.strictEqual(
  readUsual(cb, [
    {
      name: "X",
      quantity_g: 0,
      calories: 1,
      ref: "Other|ricebowl|regular|proteins",
    },
  ]),
  null,
);

console.log(
  `mealBuilder: ${checked} ingredient figures and ${combos} builds checked`,
);
