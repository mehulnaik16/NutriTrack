/**
 * Build-your-own restaurant menus (src/data/restaurantBuilders.json).
 *
 * Some chains sell meals you assemble — pick a protein, a rice, toppings — and
 * publish figures per ingredient instead of per meal. Those can't be menu rows,
 * so each such brand becomes a "builder": meals, sizes, and for each size the
 * ordered steps with their options. The app's builder (src/lib/mealBuilder.ts)
 * only reads that generic shape; everything brand-specific lives here, in one
 * adapter per brand.
 *
 * Run:
 *   node scripts/build-restaurant-builders.mjs           rebuild from the saved raw data
 *   node scripts/build-restaurant-builders.mjs --fetch   re-download from the brand first
 *
 * After a --fetch that changes figures, update sourced_at in
 * data/restaurant-official/sources.json.
 */
import fs from "node:fs";
import vm from "node:vm";

const RAW_DIR = "data/restaurant-official/builders";
const OUT = "src/data/restaurantBuilders.json";

// ── California Burrito ──────────────────────────────────────────────────────
// Its nutrition calculator (californiaburrito.in/nutrition) carries every
// ingredient's cal, fat, protein and carbs, per meal and size, inside the
// page's own script. The script's file name is hashed and changes with each
// site release, so it is found from the page every time.
const CB_PAGE = "https://californiaburrito.in/nutrition";
const CB_RAW = `${RAW_DIR}/california-burrito.raw.json`;

export async function fetchCaliforniaBurrito() {
  const html = await (await fetch(CB_PAGE)).text();
  // The attribute may or may not be quoted.
  const src = html.match(
    /src=["']?([^"'\s>]*\/js\/nutrition\.[^"'\s>]+\.js)/,
  )?.[1];
  if (!src) throw new Error("nutrition script not found on " + CB_PAGE);
  const js = await (await fetch(new URL(src, CB_PAGE))).text();
  return { script: new URL(src, CB_PAGE).href, ...extractCalculator(js) };
}

/**
 * The calculator's data: `ce` (meals and sizes) and `s` (ingredients), plus
 * the statements that derive nachos, tacos, quesadilla and munchies from it.
 * Only that span is run, in an empty context: object literals and spreads, no
 * DOM, nothing of the page's own behaviour.
 */
export function extractCalculator(js) {
  const start = js.indexOf("const ce={");
  const end = js.indexOf(";let l={", start);
  if (start < 0 || end < 0) throw new Error("calculator data not found");
  const { ce, s } = vm.runInNewContext(`${js.slice(start, end)};({ce,s})`, {});
  return { meals: ce, data: s };
}

/** "GRILLED BARBEQUE CHICKEN" → "Grilled Barbeque Chicken"; mixed case is kept. */
export function titleCase(name) {
  const fixed = name.replace(/\bGUACMOLE\b/, "GUACAMOLE").trim();
  if (fixed !== fixed.toUpperCase()) return fixed;
  return fixed
    .toLowerCase()
    .split(" ")
    .map((w, i) =>
      i > 0 && ["and", "with"].includes(w)
        ? w
        : w === "bbq"
          ? "BBQ"
          : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
}

const STEP = {
  tortilla: { title: "Tortilla", kind: "base" },
  shell: { title: "Shell", kind: "base" },
  filling: { title: "Taco", kind: "main" },
  proteins: { title: "Protein", kind: "main" },
  rice: { title: "Rice", kind: "base" },
  beans: { title: "Beans", kind: "beans" },
  toppings: { title: "Toppings", kind: "veg" },
  extraToppings: { title: "Extra toppings", kind: "veg" },
  extraFillings: { title: "Extra filling", kind: "main" },
  makeItRich: { title: "Make it rich", kind: "sauce" },
  dressing: { title: "Dressing", kind: "sauce" },
  chooseyourdip: { title: "Dip", kind: "sauce" },
  snacks: { title: "Snack", kind: "main" },
};
// The calculator's own radio sections; every other section is tick-any.
const PICK_ONE = new Set([
  "tortilla",
  "shell",
  "filling",
  "proteins",
  "rice",
  "beans",
  "snacks",
]);

const FULL = [
  "proteins",
  "rice",
  "beans",
  "toppings",
  "extraToppings",
  "extraFillings",
  "makeItRich",
];
/**
 * Which sections the calculator shows, in order, for each meal and size —
 * its display rules (function Ee in the page script), written out.
 */
const CB_STEPS = {
  ricebowl: {
    regular: FULL,
    mini: FULL,
    pro: ["proteins", "extraFillings", "makeItRich"],
  },
  burrito: {
    regular: ["tortilla", ...FULL],
    mini: ["tortilla", ...FULL],
    habanero: ["tortilla", "proteins"],
  },
  salad: {
    regular: [...FULL, "dressing"],
    mini: [...FULL, "dressing"],
    pro: ["proteins", "extraFillings", "makeItRich", "dressing"],
  },
  nachos: { regular: FULL },
  tacos: {
    three: ["shell", ...FULL],
    one: ["shell", ...FULL],
    overcrowded: ["shell", "filling"],
  },
  quesadilla: { regular: ["proteins", "beans", "chooseyourdip"] },
  munchies: { regular: ["snacks", "chooseyourdip"] },
  sides: { regular: ["snacks"] },
};
const CB_MEALS = {
  ricebowl: { name: "Rice Bowl", unit: "bowl", density: 150 },
  burrito: { name: "Burrito", unit: "burrito", density: 190 },
  salad: { name: "Salad Bowl", unit: "bowl", density: 110 },
  nachos: { name: "Nachos", unit: "bowl", density: 250 },
  tacos: { name: "Tacos", unit: "serving", density: 210 },
  quesadilla: { name: "Quesadilla", unit: "quesadilla", density: 270 },
  munchies: { name: "Munchies", unit: "serving", density: 300 },
  sides: { name: "Sides", unit: "side", density: 200 },
};
const CB_SIZE = {
  regular: "Regular",
  mini: "Mini",
  pro: "Pro",
  habanero: "Habanero",
  three: "3 tacos",
  one: "1 taco",
  overcrowded: "Overcrowded",
};
// Titles that differ from the default for one meal.
const CB_TITLE = {
  quesadilla: { proteins: "Quesadilla", beans: "Add extras" },
  sides: { snacks: "Side" },
  ricebowl: { "pro:proteins": "Pro bowl" },
  salad: { "pro:proteins": "Pro bowl" },
};

export function californiaBurrito({ meals, data }) {
  const out = [];
  for (const [key, def] of Object.entries(CB_MEALS)) {
    const sizes = meals[key].sizes.length
      ? meals[key].sizes.map((x) => x.toLowerCase())
      : ["regular"];
    const src = key === "sides" ? { snacks: data.sides } : data[key];
    out.push({
      key,
      name: def.name,
      density: def.density,
      sizes: sizes.map((size) => ({
        key: size,
        label: meals[key].sizes.length ? CB_SIZE[size] : null,
        unit: key === "tacos" && size === "one" ? "taco" : def.unit,
        steps: CB_STEPS[key][size].flatMap((step) => {
          const v = src[step];
          const list = Array.isArray(v) ? v : v?.[size];
          if (!list?.length) return [];
          const options = list.map((o) => ({
            name: titleCase(o.name),
            kcal: o.cal,
            protein: o.protein,
            carbs: o.carbs,
            fat: o.fat,
          }));
          const names = options.map((o) => o.name);
          if (new Set(names).size !== names.length)
            throw new Error(`duplicate option in ${key}/${size}/${step}`);
          return [
            {
              key: step,
              title:
                CB_TITLE[key]?.[`${size}:${step}`] ??
                CB_TITLE[key]?.[step] ??
                STEP[step].title,
              // The calculator has quesadilla extras as pick-one, but they are
              // add-ons (mayo, queso, beans) whose figures simply add up.
              pick:
                PICK_ONE.has(step) &&
                !(key === "quesadilla" && step === "beans")
                  ? "one"
                  : "any",
              kind: STEP[step].kind,
              options,
            },
          ];
        }),
      })),
    });
  }
  return { brand: "California Burrito", code: "ZC", meals: out };
}

// ── main ────────────────────────────────────────────────────────────────────
if (process.argv[1]?.endsWith("build-restaurant-builders.mjs")) {
  if (process.argv.includes("--fetch")) {
    fs.mkdirSync(RAW_DIR, { recursive: true });
    const raw = await fetchCaliforniaBurrito();
    fs.writeFileSync(CB_RAW, JSON.stringify(raw, null, 1) + "\n");
    console.log("fetched", raw.script);
  }
  const builders = [
    californiaBurrito(JSON.parse(fs.readFileSync(CB_RAW, "utf8"))),
  ];
  fs.writeFileSync(OUT, JSON.stringify(builders) + "\n");
  for (const b of builders)
    console.log(
      b.brand,
      b.meals
        .map((m) => `${m.key}:${m.sizes.map((s) => s.steps.length).join("/")}`)
        .join(" "),
    );
}
