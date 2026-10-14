# Recipe Macro Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the app from serving wrong macros from the 1,014 recipe rows in `src/data/ifct2017.json`, then replace the most-eaten ones with corrected, sourced values.

**Architecture:** Four stages: audit, quarantine, correct, guard. A read-only audit script flags implausible recipe rows. A quarantine list removes them from `ITEMS`, so search, `catalogFood` and the AI `<reference>` block never see them. Corrected values come from a recipe calculator (ingredient grams × IFCT 2017 raw rows, with an oil-uptake and cooked-yield factor), are cross-checked against a second source, are approved by a human, and are added as curated rows in `extraFoods.ts`. A self-check keeps any new row from breaking the plausibility rules.

**Tech Stack:** TypeScript, plain `node:assert` self-check scripts (`node file.test.ts`), Node `.mjs` scripts in `scripts/`.

**Spec:** this conversation (2026-10-14). The findings were:
- **Bug 1:** deep-frying oil counted as fully absorbed. 107 recipe rows have fat > 45 g/100 g (dahi vada 70.4 g, poori 726 kcal, pakoras 660–707).
- **Bug 2:** cooking water counted as food weight. Boiled egg 4.4 g protein/100 g, khaman 55 kcal, shrikhand 108, rabri 103.
- These rows have `grup` of `asc_manual` (490), `bfp_manual` (376) or `open_source_recipes` (148). The real IFCT 2017 rows (codes like `A001`) are fine.
- These rows are internally consistent, so an energy-vs-macros check does NOT catch them.

## Global Constraints

- Never delete rows from `src/data/ifct2017.json`. Quarantine them by code, so the change can be reversed and diffed.
- AI never writes a macro number into the DB. Every corrected value comes from the calculator or a cited source, and carries `source` text in a comment next to the row.
- No new dependencies.
- Energy stays in kJ in data files (`kcal × 4.184`), the same as the existing schema.
- A corrected row is added only after a human approves it in `docs/data/recipe-fixes.csv` (column `approved = yes`).
- Past `food_logs` rows store their own macro snapshot, so they are not rewritten. Only new logs get the fixed values.

## Review Focus

1. **A quarantined row that a feature still references by code** (an alias in `CATALOG_ALIASES` or a `PIECE_G` entry). The expected behaviour is that no code path returns a quarantined row. `CATALOG_ALIASES.murukku → OSR113` (587 kcal) is one today. Test in Task 2.
2. **A correct high-fat food wrongly quarantined** (mayonnaise, ghee, nuts, sev, dressings). It must stay searchable. Test in Task 1 (exempt list).
3. **A search for a quarantined dish with no replacement yet** ("poori"). It must fall through to curated rows or AI, never to an empty screen or a crash. Test in Task 2.
4. **A diluted row the fat rule cannot see** (boiled egg, rabri). It must be flagged by the protein-density or minimum-kcal rule. Test in Task 1.
5. **A new curated row that repeats the oil bug.** It must fail the guard. Test in Task 4.

---

### Task 1: Audit script

**Files:**
- Create: `scripts/audit-recipe-macros.mjs`
- Create: `scripts/audit-recipe-macros.test.mjs`
- Output: `docs/data/recipe-audit.csv` (generated, committed for review)

**Interfaces:**
- Produces: `auditRow(row) -> { code, name, kcal, flags: string[] }`, where an empty `flags` means the row passes.
- Produces: the CSV, with columns `code,name,grup,kcal,protein,fat,carbs,flags`.

The rules apply only to `grup` in `asc_manual`, `bfp_manual` and `open_source_recipes`:

| Flag | Rule |
|---|---|
| `fat_oil` | `fatce > 45` and the name does not match the exempt pattern `/oil\|ghee\|butter\|mayonnaise\|dressing\|nut\|seed\|sev\|masala\|powder\|baghar\|tadka/i` |
| `fried_range` | the name matches `/pakora\|pakoda\|vada\|bonda\|poori\|puri\|bhatura\|samosa\|kachori\|cutlet\|kebab\|kofta/i` and kcal is outside 180–480 |
| `diluted_protein` | the name matches `/egg\|anda\|paneer\|chicken\|mutton\|fish\|keema/i` and `protcnt < 8` (excluding names matching `/soup\|stock\|curry\|kheer\|pudding\|raita/i`) |
| `diluted_kcal` | the name matches `/shrikhand\|rabri\|basundi\|khoya\|dhokla\|khaman\|halwa\|burfi\|ladoo/i` and kcal < 150 |

- [ ] **Step 1: Write the failing test.** `audit-recipe-macros.test.mjs` asserts:
  - `auditRow` flags `ASC279` (dahi vada) with `fat_oil`.
  - It flags `ASC056` (boiled egg) with `diluted_protein`.
  - It flags `OSR025` (rabri) with `diluted_kcal`.
  - It flags `BFP439` (khaman) with `diluted_kcal`.
  - It returns no flags for mayonnaise and for `A001` (an IFCT row).
  - The total count of `fat_oil` rows is between 95 and 107.
- [ ] **Step 2:** Run `node scripts/audit-recipe-macros.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `auditRow` and a `main()` that reads `src/data/ifct2017.json` and writes the CSV.
- [ ] **Step 4:** Run the test. Expected: PASS. Run `node scripts/audit-recipe-macros.mjs`. Expected: it prints a count per flag and writes the CSV.
- [ ] **Step 5:** Commit: `feat(food-data): audit script for implausible recipe macros`.
- [ ] **Step 6 (human gate):** The user reviews `recipe-audit.csv` and marks false positives `keep`. The kept codes go into an `EXEMPT_CODES` array in the script, and the CSV is re-run.

### Task 2: Quarantine flagged rows

**Files:**
- Create: `src/data/quarantine.ts`
- Modify: `src/lib/foodDb.ts:81-84` (`ITEMS`)
- Modify: `src/lib/foodFuzzy.ts` (`CATALOG_ALIASES`: drop any alias whose code is quarantined)
- Test: `src/lib/foodFuzzy.test.ts`

**Interfaces:**
- Consumes: the approved flag list from Task 1.
- Produces: `export const QUARANTINED: ReadonlySet<string>` in `src/data/quarantine.ts`, with one code per line and a trailing `// flag` comment.
- Produces: `ITEMS` without any quarantined code.

- [ ] **Step 1: Write the failing test** in `foodFuzzy.test.ts`:
  - `ITEMS.some(it => QUARANTINED.has(it.code))` is false.
  - Every `CATALOG_ALIASES` code is not in `QUARANTINED`.
  - `catalogFood("dahi vada")?.code !== "ASC279"`.
  - `searchFoods("poori", 5)` contains no quarantined code and does not throw.
- [ ] **Step 2:** Run `node src/lib/foodFuzzy.test.ts`. Expected: FAIL, import missing.
- [ ] **Step 3:** Create `quarantine.ts` from the approved CSV. Filter `ITEMS` with `!QUARANTINED.has(it.code)`. Remove the `murukku` alias and any other alias that points at a quarantined code.
- [ ] **Step 4:** Run `foodFuzzy.test.ts`, `foodCache.test.ts` and `ai.test.ts`. Expected: all PASS.
- [ ] **Step 5:** Run the app. Search "poori", "dahi vada" and "aloo bonda" and confirm no 600–800 kcal row appears and the AI fallback still answers.
- [ ] **Step 6:** Commit: `fix(food-data): quarantine recipe rows with implausible macros`.

### Task 3: Recipe calculator and corrected rows

**Files:**
- Create: `scripts/recipe-calc.mjs`
- Create: `scripts/recipe-calc.test.mjs`
- Create: `docs/data/recipes/*.json` (one per dish, human-readable)
- Output: `docs/data/recipe-fixes.csv` (`code,name,kcal,p,f,c,fib,second_source,second_kcal,diff_pct,approved`)
- Modify: `src/data/extraFoods.ts` (add approved rows with the `f()` helper and a `// source:` comment)

**Interfaces:**
- Produces: `calcRecipe(recipe) -> { kcal, protcnt, fatce, choavldf, fibtg }` per 100 g cooked.
- The recipe JSON has this shape: `{ name, ingredients: [{ ifct: "A001", g: 100 }], oil_uptake_pct?: number, cooked_yield_g: number }`.
- The IFCT lookup is restricted to raw IFCT rows. A recipe-row code passed as an ingredient throws.

Pinned values:
- **Oil uptake for deep-fried food:** batter-coated items (pakora, bonda, bajji) 15%; dough items (poori, bhatura, kachori) 12%; dal vadas 18%; cutlets 10%. These are percentages of the fried food's final weight. Each recipe file states the figure it uses.
- **Boiled egg:** use IFCT whole egg directly. Boiling adds no water.

Steps:
- [ ] **Step 1: Write the failing test.**
  - A recipe of 100 g IFCT whole egg with `cooked_yield_g: 100` returns `protcnt` within 0.5 of IFCT's own egg value.
  - A pakora recipe with `oil_uptake_pct: 15` returns fat that equals the batter's fat plus 15 g, within ±1.
  - A recipe-row code passed as an ingredient throws.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement `calcRecipe` and a `main()` that reads every recipe file and writes `recipe-fixes.csv`. Leave the `second_source` columns blank for a human to fill.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** Write recipe files for the first batch of 25 most-eaten dishes:
  - The 11 from the audit table: dahi vada, medu vada, masala vada, aloo bonda, bread pakora, chicken kebab, boondi raita, boiled egg, khaman, shrikhand, rabri.
  - Plus: poori, bhatura, samosa, kachori, onion pakoda, veg cutlet, gulab jamun, dum aloo, malai kofta, chilli paneer, paneer pakora, fish fry, banana chips, mal pua.
- [ ] **Step 6 (human gate):** For each row, the user fills in `second_source` (INDB, USDA FDC or a pack label) and `second_kcal`. Rows with `diff_pct > 15` are investigated, not approved. The user marks the rest `approved = yes`.
- [ ] **Step 7:** Add the approved rows to `extraFoods.ts`, each with a `// source: recipe-calc + <second source>` comment. Re-add the aliases that Task 2 removed, pointing at the new `X…` codes.
- [ ] **Step 8:** Run all three self-checks plus `scripts/recipe-calc.test.mjs`. Expected: PASS.
- [ ] **Step 9:** Commit: `feat(food-data): corrected recipe rows, batch 1`.

### Task 4: Guard

**Files:**
- Modify: `scripts/audit-recipe-macros.mjs` (apply the same rules to `EXTRA_FOODS` rows)
- Test: `scripts/audit-recipe-macros.test.mjs`

**Interfaces:**
- Consumes: `auditRow` from Task 1. The exempt pattern and `EXEMPT_CODES` still apply.

- [ ] **Step 1: Write the failing test.**
  - Every non-quarantined row in `ITEMS` (IFCT recipe rows and `EXTRA_FOODS`) returns no flags.
  - A synthetic row `{ name: "Test pakora", fatce: 70 }` is flagged.
- [ ] **Step 2:** Run it. Expected: FAIL until the audit reads `EXTRA_FOODS` too.
- [ ] **Step 3:** Extend `main()` and `auditRow` to read `EXTRA_FOODS`. Fix or exempt any curated row it flags, with the reason in a comment.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit: `test(food-data): guard against implausible macros in the catalog`.

## Later batches (not in this plan)

The remaining flagged rows, and the 110 missing common dishes from the coverage check, use the same Task 3 loop in batches of 25. Each batch is a new commit with its own human gate.
