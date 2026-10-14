/**
 * Flags recipe rows in src/data/ifct2017.json whose macros cannot be right for
 * the dish, and writes them to docs/data/recipe-audit.csv for a human to review.
 *
 * Only the three recipe groups are audited. Their numbers are calculated, not
 * measured, and two bugs run through them: deep-frying oil counted as if all of
 * it were eaten (dahi vada at 70 g fat per 100 g), and cooking water counted as
 * food weight (boiled egg at 4.4 g protein). Both kinds stay internally
 * consistent — energy matches the macros — so an Atwater check cannot see them;
 * these rules look at the dish instead.
 *
 * Run: node scripts/audit-recipe-macros.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RECIPE_GROUPS = new Set([
  "asc_manual",
  "bfp_manual",
  "open_source_recipes",
]);

/** Fat-dense by nature, so the fat rule does not apply. */
const FAT_EXEMPT =
  /\boil\b|ghee|butter|mayonnaise|dressing|nuts?\b|seed|\bsev\b|masala|powder|baghar|tadka/i;
const FRIED =
  /pakora|pakoda|vada|bonda|poori|puri|bhatura|samosa|kachori|cutlet|kebab|kofta/i;
const PROTEIN_DISH = /\begg|\banda\b|paneer|chicken|mutton|fish|keema/i;
/** Watery or mixed with a starch: low protein is real, not dilution. */
const WATERY_DISH =
  /soup|stock|curry|kheer|pudding|raita|biryani|pulao|rice|bhat|noodle|chowmein|sandwich|roll|paratha|parantha|poori|salad|cake|eggless|ice cream|nog|halwa|sauce|spaghetti|towers|stew/i;
const DENSE_SWEET =
  /shrikhand|rabri|basundi|khoya|dhokla|khaman|halwa|burfi|ladoo/i;

/** Codes a human reviewed and kept although a rule flags them. */
export const EXEMPT_CODES = new Set([]);

export function auditRow(row) {
  const kcal = Math.round((row.enerc ?? 0) / 4.184);
  const out = { code: row.code, name: row.name, kcal, flags: [] };
  if (!RECIPE_GROUPS.has(row.grup) || EXEMPT_CODES.has(row.code)) return out;
  const { name } = row;
  if (row.fatce > 45 && !FAT_EXEMPT.test(name)) out.flags.push("fat_oil");
  if (FRIED.test(name) && (kcal < 180 || kcal > 480))
    out.flags.push("fried_range");
  if (
    PROTEIN_DISH.test(name) &&
    !WATERY_DISH.test(name) &&
    !FAT_EXEMPT.test(name) &&
    row.protcnt < 8
  )
    out.flags.push("diluted_protein");
  if (DENSE_SWEET.test(name) && kcal < 150) out.flags.push("diluted_kcal");
  return out;
}

function main() {
  const rows = JSON.parse(readFileSync("src/data/ifct2017.json", "utf8"));
  const csv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = ["code,name,grup,kcal,protein,fat,carbs,flags,decision"];
  const counts = {};
  for (const r of rows) {
    const a = auditRow(r);
    if (!a.flags.length) continue;
    for (const f of a.flags) counts[f] = (counts[f] ?? 0) + 1;
    lines.push(
      [
        r.code,
        r.name,
        r.grup,
        a.kcal,
        r.protcnt?.toFixed(3),
        r.fatce?.toFixed(3),
        r.choavldf?.toFixed(3),
        a.flags.join("|"),
        "",
      ]
        .map(csv)
        .join(","),
    );
  }
  writeFileSync("docs/data/recipe-audit.csv", lines.join("\n") + "\n");
  console.log(`flagged ${lines.length - 1} rows`, counts);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
