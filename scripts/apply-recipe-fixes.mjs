/**
 * Writes the calculated recipe fixes into src/data/ifct2017.json.
 *
 * Only two methods from suggest-recipe-fixes.mjs are applied:
 * remove_excess_oil (except crisp snacks, which also lose water the fix cannot
 * see) and ifct_measured. AI-estimated rows (scale_dilution) and crisp snacks
 * keep their old values until a sourced number replaces them. The old values
 * stay in docs/data/recipe-audit.csv and git history.
 *
 * Run once: node scripts/apply-recipe-fixes.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { suggest, targetFat } from "./suggest-recipe-fixes.mjs";
import { auditRow } from "./audit-recipe-macros.mjs";

const r3 = (v) => Math.round(v * 1000) / 1000;

/** Mutates `rows`; returns the codes it changed. */
export function applyFixes(rows) {
  const changed = [];
  for (const row of rows) {
    if (!auditRow(row).flags.length) continue;
    const s = suggest(row, rows);
    const crisp =
      s.method === "remove_excess_oil" && targetFat(row.name) === 30;
    if (!["remove_excess_oil", "ifct_measured"].includes(s.method) || crisp)
      continue;
    Object.assign(row, {
      enerc: r3(s.kcal * 4.184),
      protcnt: r3(s.p),
      fatce: r3(s.f),
      choavldf: r3(s.c),
      fibtg: r3(s.fib),
    });
    changed.push(row.code);
  }
  return changed;
}

function main() {
  const path = "src/data/ifct2017.json";
  const rows = JSON.parse(readFileSync(path, "utf8"));
  const changed = applyFixes(rows);
  writeFileSync(path, JSON.stringify(rows, null, 2) + "\n");
  console.log(`fixed ${changed.length} rows`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
