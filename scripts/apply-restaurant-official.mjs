/**
 * Replace the Domino's, KFC and Cafe Coffee Day rows of
 * src/data/restaurantFoods.json with the vendors' own published figures.
 *
 * Run:  node scripts/apply-restaurant-official.mjs
 *
 * Sources, extracted into data/restaurant-official/*.json (URLs inside each):
 *   - Domino's India nutrition PDF: energy, protein, carbs and fat PER SERVE
 *     (Regular = 4 slices = the whole pizza, Medium = 3 slices = half,
 *     Large = 2 slices = a quarter). Stored as the WHOLE pizza (serve x 1, 2
 *     or 4), or a medium reads as lighter than a regular. No weights published.
 *   - KFC India nutrition booklet V6: average portion weight, number of
 *     servings, and energy and macros per serve. Weights ARE published.
 *   - CCD nutrition charts: serve size and energy only. CCD publishes no
 *     macros, so those stay null rather than being made up.
 *
 * Where a vendor gives no weight, the per-serving numbers are still exact:
 * per-100 g values are derived from an estimated weight and serving_g is set
 * to that same estimate, so logging one serving multiplies back to exactly
 * the published figure. Such rows carry serving_est, shown as "≈" in the app.
 *
 * Idempotent: rows of the three brands are dropped and rebuilt every run.
 */
import fs from "node:fs";

const OUT = "src/data/restaurantFoods.json";
const SRC = "data/restaurant-official";
const KJ = 4.184;
const read = (f) => JSON.parse(fs.readFileSync(`${SRC}/${f}`, "utf8"));
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

/**
 * One row from a whole-item total. `grams` is the item's weight; `est` marks
 * a weight we estimated. kcal and macros are totals for that weight.
 */
function row(code, brand, name, grams, est, t, label) {
  const f = 100 / grams;
  return {
    code,
    name: `${brand} ${name}`,
    scie: "",
    lang: brand,
    grup: `Restaurant — ${brand}`,
    enerc: r2(t.kcal * f * KJ),
    protcnt: r2(t.protein == null ? null : t.protein * f),
    fatce: r2(t.fat == null ? null : t.fat * f),
    choavldf: r2(t.carbs == null ? null : t.carbs * f),
    fibtg: null,
    serving_g: Math.round(grams),
    serving_label: `1 ${label ?? "serving"} (${est ? "≈" : ""}${Math.round(grams)} g)`,
    ...(est ? { serving_est: true } : {}),
  };
}

// ── Domino's ────────────────────────────────────────────────────────────────
// No published weights. Densities (kcal per 100 g) to estimate them: Domino's
// own Czech guide gives a medium hand-tossed Margherita 595 g at 225 kcal/100 g.
export const DOMINOS_DENSITY = [
  [/garlic bread|sgb/i, 330],
  [/dip/i, 250],
  [/taco/i, 250],
  [/parcel/i, 280],
  [/wings|meatball/i, 230],
  [/lava|brownie|cake|bmc/i, 360],
  [/pasta/i, 160],
  [/shots|fries|stripes/i, 280],
  [/burger pizza/i, 260],
];
const PIZZA_DENSITY = { "Hand Tossed": 230, Pan: 255, "Thin Crust": 245, "Cheese Burst": 250 };
const SIZE_LABEL = {
  Regular: "regular pizza, 4 slices",
  Medium: "medium pizza, 6 slices",
  Large: "large pizza, 8 slices",
};
/** Domino's serves per whole pizza: Regular 4/4, Medium 3/6, Large 2/8 slices. */
const SERVES_PER_PIZZA = { Regular: 1, Medium: 2, Large: 4 };
const title = (s) =>
  s
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\bPp\b/g, "Pasta Pizza")
    .replace(/\bNv\b/g, "Non-Veg")
    .replace(/\bV\b/g, "Veg")
    .replace(/\bSgb\b/g, "Stuffed Garlic Bread")
    .replace(/\bBmc\b/g, "Butterscotch Mousse Cake")
    .replace(/Pemium/g, "Premium")
    .replace(/Jalaepno/g, "Jalapeno")
    .replace(/Cheesey/g, "Cheesy")
    .replace(/Delux /g, "Deluxe ");

function dominos() {
  const d = read("dominos.json");
  const out = [];
  let n = 0;
  const code = () => `ZD${String(++n).padStart(3, "0")}`;
  for (const [pizza, v] of Object.entries(d.pizzas)) {
    d.cols.forEach(([crust, size], i) => {
      if (v.kcal[i] == null) return;
      const x = SERVES_PER_PIZZA[size];
      const kcal = v.kcal[i] * x;
      const g = kcal / (PIZZA_DENSITY[crust] / 100);
      const t = { kcal, protein: v.protein[i] * x, carbs: v.carbs[i] * x, fat: v.fat[i] * x };
      // One cell is a typo (Creamy Tomato Pasta Pizza Veg, Regular Hand Tossed:
      // 7 g fat at 865 kcal, against 41 g for the non-veg twin at 869). When a
      // row's macros miss its energy by over 15 %, the fat is what is left.
      const atw = 4 * t.protein + 4 * t.carbs + 9 * t.fat;
      if (Math.abs(atw - kcal) / kcal > 0.15) t.fat = (kcal - 4 * t.protein - 4 * t.carbs) / 9;
      const name = /pizza/i.test(title(pizza)) ? title(pizza) : `${title(pizza)} Pizza`;
      out.push(row(code(), "Domino's", `${name} (${size}, ${crust})`, g, true, t, SIZE_LABEL[size]));
    });
  }
  for (const m of d.mania) {
    ["Hand Tossed", "Pan"].forEach((crust, i) => {
      if (m.kcal[i] == null) return;
      const g = m.kcal[i] / (PIZZA_DENSITY[crust] / 100);
      out.push(
        row(code(), "Domino's", `Pizza Mania ${title(m.name)} (${crust})`, g, true,
          { kcal: m.kcal[i], protein: m.protein[i], carbs: m.carbs[i], fat: m.fat[i] },
          "pizza mania, 4 slices"),
      );
    });
  }
  const seen = new Set();
  for (let s of d.sides) {
    const name = title(s.name.replace(/\s+-\s*|\s*-\s+/g, " - ").replace(/Non- veg/i, "Non-veg"));
    if (seen.has(name)) continue; // the PDF lists wings and meatballs twice
    seen.add(name);
    const dens = DOMINOS_DENSITY.find(([re]) => re.test(s.name))?.[1] ?? 260;
    // Plain Stuffed Garlic Bread is listed at 288 kcal, which is plain garlic
    // bread's figure; its own macros (9/43/19 g) give 378, in line with the
    // paneer (429) and chicken (373) versions. Trust the macros.
    if (s.name === "Stuffed Garlic Bread") s = { ...s, kcal: 4 * s.protein + 4 * s.carbs + 9 * s.fat };
    const label = s.serves > 1 ? `pack of ${s.serves}` : "serving";
    out.push(row(code(), "Domino's", name, s.kcal / (dens / 100), true, s, label));
  }
  for (const b of d.beverages) {
    const ml = 350;
    out.push(
      row(code(), "Domino's", b.name, ml, false,
        { kcal: (b.kcal100ml * ml) / 100, protein: 0, carbs: (b.carbs * ml) / 100, fat: 0 },
        "drink, 350 ml"),
    );
  }
  return out;
}

// ── KFC ─────────────────────────────────────────────────────────────────────
const KFC_SKIP = /bottle|seasoning|^2 Krush|Wednesday Offer|Peri Peri 5 Leg piece/i;
const KFC_NAME = (s) =>
  s
    .replace(/\bHC\b/g, "Hot & Crispy")
    .replace(/Bonless/g, "Boneless")
    .replace(/Chiken/g, "Chicken")
    .replace(/Buger/g, "Burger")
    .replace(/Chatpta Channa/g, "Chatpata Chana")
    .replace(/Andra/g, "Andhra")
    .replace(/Nashvillle/g, "Nashville")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The booklet's own inconsistencies, each resolved by which figure the
 * product's other rows agree with. Returns totals for the whole item.
 */
function kfcTotals(it, all) {
  const n = it.servings;
  const t = { kcal: it.kcal_serve * n, protein: it.protein * n, carbs: it.carbs * n, fat: it.fat * n };
  const pieces = /^(\d+) Pc (Boneless strips|Piripiri\s+Strips?)$/i.exec(it.name);
  if (pieces && +pieces[1] >= 4) {
    // Energy scales exactly with the 1-piece row; the macros of the big packs
    // do not (6 strips listed with less fat per serve than 3). Scale 1 piece.
    const word = pieces[2].split(/\s+/)[0];
    const one = all.find((x) => new RegExp(`^1 Pc ${word}\\s+Strips?$`, "i").test(x.name));
    const k = +pieces[1];
    return { kcal: t.kcal, protein: one.protein * k, carbs: one.carbs * k, fat: one.fat * k };
  }
  if (/Bonless Wing|Tandoori Zinger (Burger|Box)|(Korean|Thai|Tandoori) Chi\w* Roll|Popcorn Rice Bowlz & Pepsi/i.test(it.name)) {
    // Stated energy is far off its own macros, and the macros match the
    // product's siblings (a Tandoori Zinger at 902 kcal against a Classic at 612).
    return { ...t, kcal: 4 * t.protein + 4 * t.carbs + 9 * t.fat };
  }
  const legs = /^(\d+) Pc\s+Grilled leg$/i.exec(it.name);
  if (legs && +legs[1] > 2) {
    // 3 and 4 legs are listed at 340 g and 676 kcal, the same as 2 legs; the
    // 1- and 2-leg rows agree at 170 g and 338 kcal a leg. Scale one leg.
    const one = all.find((x) => /^1 Pc\s+Grilled leg$/i.test(x.name));
    const k = +legs[1];
    it.weight = one.weight * k;
    return { kcal: one.kcal_serve * k, protein: one.protein * k, carbs: one.carbs * k, fat: one.fat * k };
  }
  if (it.name === "Veg Longer") {
    // Listed with 0 g fat at 259 kcal; the fat is what the energy leaves over.
    return { ...t, fat: Math.max(0, (t.kcal - 4 * t.protein - 4 * t.carbs) / 9) };
  }
  if (/Xtra Large Popcorn/.test(it.name)) {
    const lg = all.find((x) => x.name === "Popcorn Large");
    return { kcal: t.kcal, protein: lg.protein * 2, carbs: lg.carbs * 2, fat: lg.fat * 2 };
  }
  return t;
}

function kfc() {
  const d = read("kfc.json");
  const out = [];
  const seen = new Set();
  let n = 0;
  for (let it of d.items) {
    if (KFC_SKIP.test(it.name) || it.weight <= 0) continue;
    const name = KFC_NAME(it.name);
    if (seen.has(name)) continue;
    seen.add(name);
    const t = kfcTotals((it = { ...it }), d.items);
    const drink = /pepsi|mirinda|7 ?up|dew|mojito|krush|can$|pet$/i.test(name) && !/meal|combo|snackers|&|\+/i.test(name);
    out.push(row(`ZK${String(++n).padStart(3, "0")}`, "KFC", name, it.weight, false, t, drink ? `drink, ${it.weight} ml` : undefined));
  }
  return out;
}

// ── Cafe Coffee Day ─────────────────────────────────────────────────────────
function ccd() {
  const d = read("ccd.json");
  let n = 0;
  const mk = (list, drink) =>
    list.map(([name, size, kcal]) =>
      row(`ZC${String(++n).padStart(3, "0")}`, "Cafe Coffee Day", name, size, false,
        { kcal, protein: null, carbs: null, fat: null },
        drink ? `cup, ${size} ml` : /Full Cake/.test(name) ? "100 g slice" : undefined),
    );
  return [...mk(d.food, false), ...mk(d.beverages, true)];
}

// ── Any other brand: data/restaurant-official/brands/<brand>.json ───────────
// {
//   "brand": "Burger King", "code": "ZB", "source": "<url>", "basis": "...",
//   "density": 250,            // kcal/100 g to estimate weights the brand omits
//   "items": [
//     { "name": "Whopper", "serving": "burger", "g": 270, "kcal": 620,
//       "protein": 27, "carbs": 50, "fat": 34, "density": 230,
//       "label": "optional full portion text", "note": "why a figure differs" }
//   ]
// }
// Every number is the brand's own, for the item as sold ("serving" is the
// brand's portion word: burger, regular, 6 pcs, cup, 100 ml...). "g" and the
// macros may be omitted where the brand does not publish them; a missing "g"
// is estimated from the item's or the file's density and marked "≈".
const BRANDS_DIR = `${SRC}/brands`;
function brandFiles() {
  if (!fs.existsSync(BRANDS_DIR)) return [];
  return fs
    .readdirSync(BRANDS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(`${BRANDS_DIR}/${f}`, "utf8")));
}
export function brandRows(d) {
  let n = 0;
  return d.items.map((it) => {
    const est = !it.g;
    const g = it.g || it.kcal / ((it.density ?? d.density) / 100);
    const r = row(`${d.code}${String(++n).padStart(3, "0")}`, d.brand, it.name, g, est,
      { kcal: it.kcal, protein: it.protein ?? null, carbs: it.carbs ?? null, fat: it.fat ?? null },
      it.serving);
    // "label" replaces the whole portion text, e.g. "100 g, as published".
    return it.label ? { ...r, serving_label: it.label } : r;
  });
}

const BRANDS = brandFiles();
const REPLACED = new Set(["Domino's", "KFC", "Cafe Coffee Day", ...BRANDS.map((b) => b.brand)]);

/**
 * The scraped brands' duplicate names: exact repeats are dropped, and two
 * look-alikes get told apart (a Subway filling on its own, a Polar Bear
 * scoop), so search never offers two identical names with different numbers.
 */
/**
 * Size ladders that run backwards in the scraped data, set right from the
 * brand's own sibling rows.
 *   - Taco Bell Molten Choco Pie: 4 pies 538 kcal but 6 pies 388. The 4-pie
 *     row is 134 kcal a pie, a normal chocolate pie; the 6 pies are the same
 *     pie, so they take its per-100 g values at their own stated weight.
 *   - Wendy's Breakfast Potatoes: estimated weights (Wendy's publishes none)
 *     came out small 100 g, medium 79 g, large 100 g. Re-estimated at one
 *     density, 186 kcal/100 g (the medium's), so the sizes grow in order.
 *     The published calories stay as they were.
 */
function fixSizes(r, rows) {
  const kcal = (r.enerc / KJ) * (r.serving_g / 100);
  if (r.name === "Taco Bell Molten Choco Pie - 6 Pieces") {
    const four = rows.find((x) => x.name === "Taco Bell Molten Choco Pie - 4 Pieces");
    const { enerc, protcnt, fatce, choavldf, fibtg } = four;
    return { ...r, enerc, protcnt, fatce, choavldf, fibtg };
  }
  if (/^Wendy's (Small|Medium|Large) Breakfast Potatoes$/.test(r.name)) {
    const g = Math.round(kcal / 1.86);
    const f = r.serving_g / g;
    const sc = (v) => (v == null ? null : r2(v * f));
    return {
      ...r, enerc: sc(r.enerc), protcnt: sc(r.protcnt), fatce: sc(r.fatce), choavldf: sc(r.choavldf),
      fibtg: sc(r.fibtg), serving_g: g, serving_label: `1 serving (≈${g} g)`, serving_est: true,
    };
  }
  return r;
}

export function tidy(rows) {
  const seen = new Set();
  const names = {};
  rows.forEach((r) => (names[r.name] = (names[r.name] || 0) + 1));
  return rows.flatMap((r) => {
    const key = JSON.stringify({ ...r, code: "" });
    if (seen.has(key)) return [];
    seen.add(key);
    if (names[r.name] > 1 && r.lang === "Subway" && r.serving_g < 100)
      return [{ ...r, name: `${r.name} (filling only)` }];
    if (names[r.name] > 1 && r.lang === "Polar Bear" && r.serving_g < 100)
      return [{ ...r, name: `${r.name} (1 scoop)` }];
    return [fixSizes(r, rows)];
  });
}

if (process.argv[1]?.endsWith("apply-restaurant-official.mjs")) {
  const rows = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const kept = tidy(rows.filter((r) => !REPLACED.has(r.lang)));
  const fresh = [...dominos(), ...kfc(), ...ccd(), ...BRANDS.flatMap(brandRows)];
  fs.writeFileSync(OUT, JSON.stringify([...kept, ...fresh], null, 0) + "\n");
  const by = {};
  fresh.forEach((r) => (by[r.lang] = (by[r.lang] || 0) + 1));
  console.log(`kept ${kept.length}, rebuilt`, by);
}

export { dominos, kfc, ccd };
