/**
 * Macros of a cooked dish from its recipe: raw ingredient grams × IFCT 2017
 * lab values, divided by the cooked weight. No number here is estimated; the
 * recipe (grams and cooked weight) is the only assumption, and it is written
 * out in full beside every row so it can be checked.
 *
 * Fried food lists only the oil the food absorbs, not the oil in the pan.
 * kcal = 4 protein + 4 carbs + 9 fat + 2 fibre, as IFCT counts it.
 *
 * Run: node scripts/recipe-calc.mjs  (writes src/data/recipeFoods.json and
 * docs/data/new-foods.csv from scripts/recipes/missing-foods.mjs)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const IFCT = JSON.parse(readFileSync("src/data/ifct2017.json", "utf8"));
const RECIPE_GROUPS = /manual|open_source/;

/**
 * Ingredients IFCT 2017 does not list. Per 100 g: protein, fat, carbs, fibre.
 * SUGAR is sucrose by definition; the others are the catalog's own curated
 * rows (USDA-based values), named so a reviewer can find them.
 */
const REFERENCE = {
  SUGAR: { p: 0, f: 0, c: 100, fib: 0, name: "Sugar (sucrose)" },
  XE160: {
    p: 3.1,
    f: 3.3,
    c: 4.7,
    fib: 0,
    name: "Curd / Dahi (full fat), catalog XE160",
  },
  XE162: { p: 0.9, f: 81, c: 0.1, fib: 0, name: "Butter, catalog XE162" },
  XE020: { p: 8, f: 3.5, c: 49, fib: 2.5, name: "White bread, catalog XE020" },
};

function ingredient(code) {
  if (REFERENCE[code]) return REFERENCE[code];
  const r = IFCT.find((x) => x.code === code);
  if (!r) throw new Error(`unknown ingredient ${code}`);
  if (RECIPE_GROUPS.test(r.grup))
    throw new Error(`${code} is a recipe row, not a raw ingredient`);
  return {
    p: r.protcnt,
    f: r.fatce,
    c: r.choavldf,
    fib: r.fibtg ?? 0,
    name: r.name,
  };
}

/** Per 100 g of the cooked dish. */
export function calcRecipe(recipe) {
  const t = { p: 0, f: 0, c: 0, fib: 0 };
  for (const [code, g] of Object.entries(recipe.ing)) {
    const m = ingredient(code);
    for (const k of Object.keys(t)) t[k] += (m[k] * g) / 100;
  }
  const s = 100 / recipe.yield;
  const out = { p: t.p * s, f: t.f * s, c: t.c * s, fib: t.fib * s };
  return { ...out, kcal: 4 * out.p + 4 * out.c + 9 * out.f + 2 * out.fib };
}

const r1 = (v) => Math.round(v * 10) / 10;

function main() {
  return import("./recipes/missing-foods.mjs").then(({ RECIPES }) => {
    const rows = [];
    const csv = [
      "code,name,kcal,protein,fat,carbs,fibre,piece_g,recipe_g,cooked_g,note",
    ];
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    RECIPES.forEach((r, i) => {
      const m = calcRecipe(r);
      const code = `XR${String(i + 1).padStart(3, "0")}`;
      rows.push({
        code,
        name: r.name,
        scie: "",
        lang: "",
        grup: r.grup,
        enerc: Math.round(m.kcal * 4.184 * 10) / 10,
        protcnt: r1(m.p),
        fatce: r1(m.f),
        choavldf: r1(m.c),
        fibtg: r1(m.fib),
        ...(r.piece_g ? { piece_g: r.piece_g } : {}),
      });
      const recipeText = Object.entries(r.ing)
        .map(([c, g]) => `${g} g ${ingredient(c).name} [${c}]`)
        .join("; ");
      csv.push(
        [
          code,
          r.name,
          Math.round(m.kcal),
          r1(m.p),
          r1(m.f),
          r1(m.c),
          r1(m.fib),
          r.piece_g ?? "",
          recipeText,
          r.yield,
          r.note ?? "",
        ]
          .map(q)
          .join(","),
      );
    });
    writeFileSync(
      "src/data/recipeFoods.json",
      JSON.stringify(rows, null, 2) + "\n",
    );
    writeFileSync("docs/data/new-foods.csv", csv.join("\n") + "\n");
    console.log(`wrote ${rows.length} dishes`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
