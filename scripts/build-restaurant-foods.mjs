/**
 * Restaurant menu → src/data/restaurantFoods.json
 *
 * Converts the ten scraped menu files in zenin-nutrition-scraper-main.zip into
 * the IFCTItem shape the app's food database uses.
 *
 * Run:  node scripts/build-restaurant-foods.mjs <path-to-extracted-data-dir>
 *
 * ── Why this script is not a simple field rename ────────────────────────────
 *
 * The ten source files come in four different shapes, none of them valid JSON
 * (they are concatenated chunks glued together with `]{` and `}[` seams), and
 * they disagree about the basis of their numbers:
 *
 *   - dominos.json          already per-100 g, already IFCTItem-shaped
 *   - polar bera.json       per-serving macros + an explicit per-100 g energy
 *   - mcdonald / pizzahut / taco bell / starbucks / cafe coffee day / subway
 *                           per-serving, with a stated pack weight
 *   - kfc / wendys          per-serving, with NO stated weight at all
 *
 * The app stores everything per 100 g and multiplies by quantity/100, so the
 * last group needs a serving weight before it can be represented at all.
 *
 * ── The serving-weight estimate, and why it is safe ─────────────────────────
 *
 * For a row with no stated weight we estimate one from energy density measured
 * on the 590 rows that DO state a weight, matched by food kind (see KINDS).
 *
 * The important property: we then store per-100 g values derived from that same
 * estimate, and set serving_g to it. Logging one serving therefore multiplies
 * back by exactly the factor we divided by, and reproduces the source's
 * per-serving numbers EXACTLY, whatever the estimate was. The estimate only
 * affects two secondary things:
 *   1. the "per 100 g" figure shown on the row, and
 *   2. what happens if the user overrides the quantity by hand.
 * Rows whose weight was estimated are marked `serving_est: true` so the UI can
 * render the weight with a "≈" rather than implying it was measured.
 *
 * ── Data repairs ────────────────────────────────────────────────────────────
 *
 * KFC's 77 "N Pc" rows are corrupt: 3 Pc frequently shows fewer calories than
 * 2 Pc, and no piece-group scales linearly. In every group, though, 2 Pc is
 * exactly twice 1 Pc, so the 1-piece row is trustworthy and the rest are
 * rebuilt as N x the unit. That is arithmetic from the definition of "N pieces",
 * not an estimate.
 *
 * Every row is finally checked against Atwater (4/9/4). A stated energy that
 * disagrees with its own macros by more than ATWATER_TOLERANCE is a scraping
 * error, not a food, and is dropped.
 */

import fs from "node:fs";
import path from "node:path";

const KJ_PER_KCAL = 4.184;
/** Stated energy may differ from 4/9/4 by this much before the row is junk. */
const ATWATER_TOLERANCE = 0.3;
const OUT = path.join(process.cwd(), "src/data/restaurantFoods.json");

// ── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Pull every top-level {...} object out of a file, whatever glued the chunks
 * together. String-aware, so a brace inside a name never shifts the depth.
 */
export function extractObjects(text) {
  const s = text.replace(/^﻿/, "");
  const spans = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{") { if (depth === 0) start = i; depth++; }
    else if (c === "}") {
      depth--;
      if (depth === 0 && start >= 0) { spans.push(s.slice(start, i + 1)); start = -1; }
    }
  }
  const rows = [];
  for (const span of spans) {
    try { rows.push(JSON.parse(span)); } catch { /* skip a truncated chunk */ }
  }
  return rows;
}

/** subway.json and wendys.json nest their items under a category header. */
function flatten(rows) {
  const out = [];
  for (const r of rows) {
    if (Array.isArray(r.items)) for (const it of r.items) out.push({ category: r.category, ...it });
    else out.push(r);
  }
  return out;
}

/** "168 g" | "330 ml" | 238 | "16 oz" -> grams. ml is treated as g. */
export function parseGrams(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const oz = value.match(/(\d+(?:\.\d+)?)\s*oz/i);
  if (oz) return +(parseFloat(oz[1]) * 29.5735).toFixed(1);
  const m = value.match(/(\d+(?:\.\d+)?)\s*(?:g|ml)\b/i);
  return m ? parseFloat(m[1]) : null;
}

/** Some items carry their weight in the name: "Nashville Sauce Bottle -225 g". */
export function weightFromName(name) {
  return parseGrams(String(name || ""));
}

// ── Food-kind classifier ────────────────────────────────────────────────────

/**
 * One classifier applied to BOTH the rows that state a weight and the rows that
 * do not. The reference rows give each kind its energy density; the weightless
 * rows then borrow the density of their own kind. Order matters — the first
 * match wins, so the specific patterns come before the general ones.
 */
const KINDS = [
  // `cola` is deliberately absent: as a bare substring it matches "choCOLAte",
  // which put brownies and croissants in the soft-drink bucket and pushed its
  // density from 0.4 to 2.5 kcal/g. Coke and Pepsi already cover the real colas.
  ["zero_cal",    /zero sugar|diet |sugar free|black coffee|plain water|sea salt/i],
  ["sauce_dip",   /mayo|dip\b|sauce|ketchup|dressing|vinaigrette|chutney|syrup|condiment|chives/i],
  // Bakery is tested before the drinks so "Chocolate Brownie" cannot be read as
  // a beverage; only then do the drink patterns get a look.
  ["bakery",      /cake|cookie|muffin|donut|doughnut|croissant|brownie|pastry|pain au|tartlet|loaf|biscuit/i],
  ["shake",       /shake|frosty|frappe|smoothie|falooda/i],
  ["ice_cream",   /sundae|ice cream|gelato|sorbet|fundae|scoop/i],
  ["soft_drink",  /pepsi|coke\b|coca[- ]cola|sprite|7\s*up|mirinda|fanta|\bdew\b|soda|lemonade|mojito|fizz|krush|iced tea|juice/i],
  ["hot_drink",   /\btea\b|coffee|latte|cappuccino|americano|espresso|mocha|hot chocolate/i],
  ["fries",       /fries|wedges|potato|hash brown/i],
  // Wraps before nuggets: "Roast Chicken Strips Wrap" is a wrap, not a strip.
  ["wrap_roll",   /wrap|roll\b|burrito|taco|shawarma|quesadilla/i],
  ["nuggets",     /nugget|popcorn|wing|strip|bite/i],
  ["fried_chicken", /\bhc\b|hot & crispy|hot and crispy|drum|leg\b|thigh|chicken piece|fried chicken|chizza|double down|krisper/i],
  ["pizza",       /pizza/i],
  ["sub",         /\bsub\b|6-inch|4-inch|footlong|hoagie/i],
  ["rice_bowl",   /rice ?bowl|ricebowl|\brice\b|biryani/i],
  ["salad",       /salad|apple slices|vegetable/i],
  ["burger",      /burger|zinger|baconator|sandwich|toast|melt|bap\b|panini|ciabatta|patty|longer/i],
  ["breakfast",   /breakfast|omelette|egg\b|sausage|bacon|pancake|waffle|porridge/i],
];

/**
 * Fallback pack sizes for items that carry no weight AND no calories to derive
 * one from — diet drinks, mostly. Deriving from energy density divides by zero.
 */
const NOMINAL_SERVING_G = {
  soft_drink: 330,
  zero_cal: 330,
  hot_drink: 250,
  shake: 300,
  sauce_dip: 15,
  salad: 150,
};

/**
 * Solid food a combo meal would contain. Used only to tell a drink apart from a
 * meal that happens to name its drink: KFC lists dozens of rows like
 * "Chicken Longer Meal (Chicken Longer, Reg. Fries & Reg Pepsi)", which match
 * the Pepsi pattern and would otherwise be priced at a soft drink's 0.5 kcal/g,
 * producing a 1.4 kg serving.
 */
const SOLID_TOKENS =
  /fries|burger|zinger|chicken|strip|wing|rice|roll|popcorn|nugget|chizza|longer|patty|bucket|\bbox\b|\bmeal\b|combo|krisper|\bhc\b|\bleg\b|snacker|dip\b/i;

export function foodKind(name, category = "") {
  const hay = `${name} ${category}`;
  for (const [kind, re] of KINDS) {
    if (!re.test(hay)) continue;
    // A "drink" whose own NAME also lists solid food is a combo meal. Tested on
    // the name alone — Wendy's category strings like "Sides, Kids Meal & Coffee"
    // mention meals for every side on the menu.
    if ((kind === "soft_drink" || kind === "hot_drink") && SOLID_TOKENS.test(name)) {
      return "combo";
    }
    return kind;
  }
  return "other";
}

/**
 * Densities for kinds the reference data cannot supply, because no source that
 * states a weight sells them. A combo is mostly drink by mass, so it is far
 * less energy-dense than any of its parts.
 */
const FALLBACK_DENSITY = {
  combo: 1.4,
  fried_chicken: 2.4,
};

// ── Nutrition helpers ───────────────────────────────────────────────────────

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Reads the macro trio out of whichever field naming a source happens to use. */
function macros(row) {
  const n = row.nutrition || row;
  return {
    kcal: num(n.energy_kcal ?? n.calories_kcal ?? row.enerc),
    protein: num(n.protein_g ?? row.protcnt),
    fat: num(n.total_fat_g ?? n.fat_g ?? row.fatce),
    carbs: num(n.carbohydrates_g ?? row.choavldf),
    fibre: num(n.fibre_g ?? n.fiber_g ?? row.fibtg),
  };
}

export function atwaterKcal(m) {
  if (m.protein == null && m.fat == null && m.carbs == null) return null;
  return 4 * (m.protein || 0) + 9 * (m.fat || 0) + 4 * (m.carbs || 0);
}

/**
 * True when stated energy and the macros tell the same story. Rows with no
 * macros at all pass (there is nothing to contradict); rows with a trivial
 * amount of everything pass too, since the relative test is meaningless there.
 */
export function atwaterAgrees(m, tolerance = ATWATER_TOLERANCE) {
  const at = atwaterKcal(m);
  if (at == null || m.kcal == null) return true;
  if (at < 20 && m.kcal < 20) return true;
  if (at === 0) return m.kcal < 20;
  return Math.abs(m.kcal - at) / at <= tolerance;
}

/**
 * Atwater catches energy that contradicts its own macros, but not macros that
 * are impossible for the food. KFC's "7up Krush Lime" claims 21 g of protein in
 * a lime soda; at 86 kcal against an Atwater 100 that is only 14% out, well
 * inside tolerance, so the arithmetic check waves it through.
 *
 * Only sugary and zero-calorie soft drinks are policed here. Shakes, lattes and
 * anything with milk in it legitimately carry protein and fat, so they are left
 * alone rather than risking a false positive on real food.
 */
export function plausibleForKind(kind, per100) {
  if (kind !== "soft_drink" && kind !== "zero_cal") return true;
  if ((per100.protein ?? 0) > 1.5) return false;
  if ((per100.fat ?? 0) > 1.5) return false;
  return true;
}

// ── KFC piece-row repair ────────────────────────────────────────────────────

/**
 * Rebuild "N Pc <thing>" from the trustworthy 1-piece row.
 * Returns a new array; rows that are not piece-rows pass through untouched.
 */
export function repairPieceRows(rows) {
  const unit = new Map();
  for (const r of rows) {
    const m = String(r.item || r.name || "").match(/^(\d+)\s*Pc\s+(.*)$/i);
    if (m && +m[1] === 1) unit.set(m[2].trim().toLowerCase(), r);
  }
  let repaired = 0;
  const out = rows.map((r) => {
    const label = String(r.item || r.name || "");
    const m = label.match(/^(\d+)\s*Pc\s+(.*)$/i);
    if (!m) return r;
    const n = +m[1];
    const base = unit.get(m[2].trim().toLowerCase());
    if (!base || n === 1) return r;
    repaired++;
    return {
      ...r,
      energy_kcal: base.energy_kcal == null ? null : +(base.energy_kcal * n).toFixed(1),
      protein_g: base.protein_g == null ? null : +(base.protein_g * n).toFixed(1),
      total_fat_g: base.total_fat_g == null ? null : +(base.total_fat_g * n).toFixed(1),
      carbohydrates_g: base.carbohydrates_g == null ? null : +(base.carbohydrates_g * n).toFixed(1),
      __repaired: true,
      __pieces: n,
    };
  });
  return { rows: out, repaired };
}

// ── Sources ─────────────────────────────────────────────────────────────────

const SOURCES = [
  { file: "mcdonald.json",         brand: "McDonald's" },
  { file: "subway.json",           brand: "Subway" },
  { file: "starbucks food.json",   brand: "Starbucks" },
  // Polar Bear states energy per serving but its MACROS are already per 100 g:
  // for every row, 4/9/4 over the macros equals the stated energy_per_100g_kcal
  // exactly. Scaling them like the other per-serving sources overstated them by
  // the pack weight and the Atwater check rejected 60 of 82 rows.
  { file: "polar bera.json",       brand: "Polar Bear", macrosPer100g: true },
  { file: "cafe coffee day.json",  brand: "Cafe Coffee Day" },
  { file: "dominos.json",          brand: "Domino's",  per100g: true },
  { file: "taco bell.json",        brand: "Taco Bell" },
  { file: "pizzahut.json",         brand: "Pizza Hut" },
  { file: "kfc.json",              brand: "KFC",       repairPieces: true },
  { file: "wendys.json",           brand: "Wendy's" },
];

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[s.length >> 1] : null;
};

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node scripts/build-restaurant-foods.mjs <extracted-data-dir>");
    process.exit(1);
  }

  // ── Load ──
  const loaded = [];
  for (const src of SOURCES) {
    const p = path.join(dir, src.file);
    if (!fs.existsSync(p)) { console.error(`missing: ${src.file}`); process.exit(1); }
    let rows = flatten(extractObjects(fs.readFileSync(p, "utf8")));
    let repaired = 0;
    if (src.repairPieces) ({ rows, repaired } = repairPieceRows(rows));
    loaded.push({ ...src, rows, repaired });
    if (repaired) console.log(`  ${src.brand}: rebuilt ${repaired} piece-rows from their 1-piece unit`);
  }

  // ── Pass 1: energy density per food kind, from rows that state a weight ──
  const densities = {};
  for (const { rows, per100g, macrosPer100g } of loaded) {
    if (per100g) continue;
    for (const r of rows) {
      const name = r.name || r.item;
      const g = parseGrams(r.serving_g ?? r.size ?? r.serving_size);
      const m = macros(r);
      if (!g || !m.kcal) continue;
      // A per-100 g source's macros cannot be checked against its per-serving
      // energy; compare them against its own per-100 g energy instead.
      const ok = macrosPer100g
        ? atwaterAgrees({ ...m, kcal: num(r.energy_per_100g_kcal) })
        : atwaterAgrees(m);
      if (!ok) continue;
      (densities[foodKind(name, r.category)] ||= []).push(m.kcal / g);
    }
  }
  const kindDensity = {};
  for (const [k, v] of Object.entries(densities)) if (v.length >= 3) kindDensity[k] = median(v);
  const globalDensity = median(Object.values(densities).flat()) || 2.2;

  console.log("\n  energy density by food kind (kcal/g, from rows with stated weights):");
  Object.entries(kindDensity).sort().forEach(([k, d]) =>
    console.log(`    ${k.padEnd(16)} ${d.toFixed(2)}  (n=${densities[k].length})`));

  // ── Pass 2: convert ──
  const out = [];
  const drops = {};
  const drop = (why) => { drops[why] = (drops[why] || 0) + 1; };
  let estimated = 0, seq = 0;

  for (const { rows, brand, per100g, macrosPer100g } of loaded) {
    for (const r of rows) {
      const rawName = r.name || r.item;
      if (!rawName || !String(rawName).trim()) { drop("no name"); continue; }
      const m = macros(r);
      if (m.kcal == null) { drop(`no energy (${brand})`); continue; }

      const kind = foodKind(rawName, r.category);
      const stated = parseGrams(r.serving_g ?? r.size ?? r.serving_size) ?? weightFromName(rawName);
      const per100Energy = num(r.energy_per_100g_kcal);

      // `macroScale` converts the source's macros to per 100 g; `energyKcal100`
      // is the per-100 g energy. The two are tracked separately because Polar
      // Bear publishes them on different bases.
      let macroScale, energyKcal100, servingG = null, isEst = false;

      if (per100g) {
        // Domino's already publishes per-100 g and states no pack weight.
        macroScale = 1;
        energyKcal100 = m.kcal;
      } else if (macrosPer100g) {
        if (!per100Energy || !stated) { drop(`per-100g source missing its basis (${brand})`); continue; }
        macroScale = 1;
        energyKcal100 = per100Energy;
        servingG = stated;
      } else {
        if (stated) {
          servingG = stated;
        } else if (m.kcal > 0) {
          servingG = +(m.kcal / (kindDensity[kind] ?? FALLBACK_DENSITY[kind] ?? globalDensity)).toFixed(0);
          isEst = true;
        } else {
          // Zero calories and no weight — a diet drink. There is no energy to
          // derive a size from, so fall back to a nominal pack for its kind
          // rather than dropping a food people genuinely log.
          servingG = NOMINAL_SERVING_G[kind] ?? null;
          if (!servingG) { drop(`zero-calorie, no weight, unknown kind (${brand})`); continue; }
          isEst = true;
        }
        if (!servingG || servingG <= 0) { drop(`unusable serving weight (${brand})`); continue; }
        macroScale = 100 / servingG;
        energyKcal100 = m.kcal * macroScale;
      }

      // Check the macros against the energy on the SAME basis, now that both
      // are per 100 g. A disagreement here is a scraping error, not a food.
      const per100 = {
        kcal: energyKcal100,
        protein: m.protein == null ? null : m.protein * macroScale,
        fat: m.fat == null ? null : m.fat * macroScale,
        carbs: m.carbs == null ? null : m.carbs * macroScale,
      };
      if (!atwaterAgrees(per100)) { drop(`energy contradicts macros (${brand})`); continue; }
      if (!plausibleForKind(kind, per100)) { drop(`macros implausible for a drink (${brand})`); continue; }

      if (isEst) estimated++;
      const sc = (v) => (v == null ? null : +(v * macroScale).toFixed(2));
      out.push({
        code: `Z${String(++seq).padStart(4, "0")}`,
        name: `${brand} ${String(rawName).trim()}`,
        scie: "",
        lang: brand,
        grup: `Restaurant — ${brand}`,
        enerc: +(energyKcal100 * KJ_PER_KCAL).toFixed(2),
        protcnt: sc(m.protein),
        fatce: sc(m.fat),
        choavldf: sc(m.carbs),
        fibtg: sc(m.fibre),
        ...(servingG ? { serving_g: servingG } : {}),
        ...(servingG ? { serving_label: isEst ? `1 serving (≈${servingG} g)` : `1 serving (${servingG} g)` } : {}),
        ...(isEst ? { serving_est: true } : {}),
      });
    }
  }

  const codes = new Set(out.map((r) => r.code));
  if (codes.size !== out.length) throw new Error("duplicate codes generated");

  fs.writeFileSync(OUT, JSON.stringify(out, null, 0) + "\n");

  const byBrand = {};
  out.forEach((r) => { byBrand[r.lang] = (byBrand[r.lang] || 0) + 1; });
  console.log(`\n  rows written: ${out.length}  (${estimated} with an estimated serving weight)`);
  console.log(`  per brand: ${Object.entries(byBrand).map(([b, n]) => `${b} ${n}`).join(", ")}`);
  if (Object.keys(drops).length) {
    console.log("  dropped:");
    Object.entries(drops).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`    ${k}: ${n}`));
  }
  console.log(`  -> ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("build-restaurant-foods.mjs")) {
  main();
}
