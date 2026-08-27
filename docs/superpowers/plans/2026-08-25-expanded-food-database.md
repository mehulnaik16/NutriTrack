# Restaurant Menu Food Data Plan

> **STATUS: IMPLEMENTED, 2026-08-26.**
> Shipped as `scripts/build-restaurant-foods.mjs` (+ `.test.mjs`, 25 checks) →
> `src/data/restaurantFoods.json`, spread into `ITEMS` in `src/lib/foodDb.ts`.
> **1001 rows, 238 KB raw / 29 KB gzipped.**
>
> Deviation from the plan below: KFC and Wendy's were **included**, not
> deferred, at the user's instruction to calculate the missing weights. Doing
> that turned up a second defect the plan had not seen — KFC's 77 "N Pc" rows
> are internally contradictory (3 Pc showing fewer calories than 2 Pc), so they
> are rebuilt as N x the trustworthy 1-piece row before conversion. See the
> "What shipped" section at the foot of this document for the full method and
> the residual risks.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add branded restaurant menu items — McDonald's, Subway, Domino's, Starbucks, Taco Bell, Pizza Hut, Cafe Coffee Day, Polar Bear — to the searchable food database, so logging "McVeggie Burger" stops falling through to the AI guess path. Along the way, give the food item shape a real notion of a *serving*, because a menu item is logged as "1 burger", not "168 grams of burger".

**Architecture:** `src/lib/foodDb.ts` builds one in-memory `ITEMS` array from `src/data/ifct2017.json` and `src/data/extraFoods.ts`, and `searchFoods()` linear-scans it. The restaurant data is small enough (measured below) that it simply becomes a third bundled JSON spread into `ITEMS` — no table, no RPC, no architecture change. The one non-trivial part is the item shape: every restaurant source publishes **per-serving** figures against a stated pack weight, while `IFCTItem` is strictly per-100 g and `FoodSearch` hardcodes `setQty("100")`. Converting to per-100 g and discarding the weight would be lossy in the way users actually feel — nobody knows what 40% of a Sub weighs. So `IFCTItem` gains two optional fields, `serving_g` and `serving_label`, which are `undefined` for every existing row and therefore change nothing for IFCT foods, and which let the quantity input default to one serving for the rows that have them.

**Tech Stack:** TypeScript/React (TanStack Start), a Node conversion script under `scripts/` following the existing `gen_exercises.cjs` precedent, no new dependency, no schema change.

**Spec:** This document. Source requirement: "ADD FOOD DATA THAT WAS SENT IN THE GROUP (FOOD DATA.TXT AND ZENIN-NUTRITION-SCRAPPER-MAIN.ZIP)".

---

## What the two sources actually contain (measured, 2026-08-25)

### `food data.txt` — already in the app; nothing to do

1004 objects, already in `IFCTItem` shape (plus `sugar_free`, `sodium`, `calcium`, `iron`), codes `FOOD001`–`FOOD1004`, energy in **kcal**.

**All 1004 rows are already present in `src/data/ifct2017.json`.** This was verified three ways, and all three agree:

| Check | Result |
|---|---|
| Rows matched by normalised name | **1004 / 1004** |
| Rows whose protein, fat and carbs match to within 0.02 | **1004 / 1004**, zero differing |
| Median energy ratio (`ifct2017.json` ÷ `food data.txt`) | **4.1736** — i.e. the kcal→kJ conversion has already been applied |

The reason this is easy to miss: `src/data/ifct2017.json` is **not** the IFCT 2017 dataset. It holds 1556 rows, of which only 542 are real IFCT (single-letter codes `A`–`T`, genuine IFCT group names). The other 1014 are a previously-merged manual corpus — 490 rows coded `ASC*` in group `asc_manual`, 376 coded `BFP*` in `bfp_manual`, and 148 coded `OSR*` in `open_source_recipes`. Those 1014 rows are `food data.txt` plus 13 extras.

**Action: none.** Re-importing this file would create 1004 duplicate entries in a search that already matches on substring. Task 4 records the finding so nobody re-runs this investigation.

### `zenin-nutrition-scraper-main.zip` — the genuinely new data

The 34 MB zip is almost entirely the scraper's own `node_modules`. The payload is 10 JSON files under `data/`, ~279 KB, in **four different shapes**, none of which parse with a plain `JSON.parse` — they are concatenated chunks glued with `]{` and `}[` seams and need a brace-matching extractor.

| File | Brand | Raw rows | Convertible | Shape |
|---|---|---|---|---|
| `mcdonald.json` | McDonald's | 105 | **105** | flat, `size: "168 g"`, full macros |
| `subway.json` | Subway | 183 | **182** | nested `{category, items[{name, serving_g, nutrition{}}]}` |
| `starbucks food.json` | Starbucks | 94 | **93** | flat, `serving_size`, `salt_g` not sodium |
| `polar bera.json` | Polar Bear | 82 | **82** | flat, ships an explicit `energy_per_100g_kcal` |
| `dominos.json` | Domino's | 67 | **67** | already `IFCTItem`-shaped and already per-100 g |
| `cafe coffee day.json` | Cafe Coffee Day | 68 | **68** | flat, **energy only, no macros** |
| `taco bell.json` | Taco Bell | 57 | **57** | flat, `size` sometimes in ml |
| `pizzahut.json` | Pizza Hut | 10 | **10** | flat, full macros + allergens |
| `kfc.json` | KFC | 229 | **0** | per-serving macros, **no serving weight** |
| `wendys.json` | Wendy's | 139 | **0** | nested, **no serving weight** |
| | **Total** | **1034** | **664** | |

Measured output for the 664 convertible rows: **134 KB compact JSON, 18 KB gzipped** — against the 111 KB gzipped that `ifct2017.json` already costs. A 16% increase in the food bundle for a 43% increase in row count. The bundled path is correct and there is no case for a `foods` table here.

**Every source is in kcal and must be multiplied by 4.184**, because `foodDb.ts` stores kJ and `kcal()` divides by `KJ_PER_KCAL` on read. Getting this wrong understates every restaurant calorie by a factor of four.

---

## Global Constraints

- **Do not import `food data.txt`.** It is already merged. See the evidence table above.
- **Energy is stored in kilojoules.** Multiply every kcal figure by 4.184 exactly once, in the conversion script, never at read time.
- **Never invent a serving weight.** KFC's 229 rows and Wendy's 139 rows publish per-serving macros with no gram weight. There is no arithmetic that recovers per-100 g values from them, and guessing would silently corrupt the calorie maths for 368 foods. They are excluded from this plan and tracked in Task 5.
- `serving_g` and `serving_label` must be **optional** on `IFCTItem`. Every existing row omits them and every existing consumer must keep compiling and behaving identically.
- `code` stays globally unique. Restaurant rows take a reserved `Z` prefix; nothing else in `ITEMS` uses it (existing prefixes are `A`–`T`, `ASC`, `BFP`, `OSR`).
- The conversion script is a committed one-off under `scripts/`. The app must never parse the raw sources at runtime, and the 34 MB zip must never be committed — extract to a scratch directory.
- No automated test runner exists (`package.json` has no vitest/jest). Logic tests follow the runnable-`node` convention of `src/lib/__cycle.test.mjs` and `src/lib/referral.test.ts`.

---

## Task 1: The conversion script

**Files:**
- Create: `scripts/build-restaurant-foods.mjs`
- Create: `scripts/build-restaurant-foods.test.mjs`

**Interfaces:**
- Produces: `extractObjects(text)`, `parseGrams(value)`, `toPer100g(row, brand)`, and a CLI that writes `src/data/restaurantFoods.json`.

- [ ] **Step 1: Write the brace-matching extractor.** None of these files is valid JSON. Walk the text tracking brace depth, skipping over string literals (so a `{` inside a name never shifts the depth), and collect every top-level `{...}` span. This handles all four seam styles uniformly and is the only parsing strategy that works across all ten files.

- [ ] **Step 2: Flatten the nested shapes.** `subway.json` and `wendys.json` are `{category, items: [...]}`; lift each `items` entry to a top-level row carrying its `category` down.

- [ ] **Step 3: Write `parseGrams`.** Accepts a number (`serving_g: 238`) or a string (`"168 g"`, `"330 ml"`). Treat ml as g — every ml row here is a beverage, where the density error is under 5% and far smaller than the menu-variance error. Return null when no number is present; the caller drops the row.

- [ ] **Step 4: Write the per-100 g conversion,** with one branch per source shape and the branches applied in this order:
  1. `dominos.json` — already per-100 g. Scale factor 1, no serving weight.
  2. An explicit `energy_per_100g_kcal` (Polar Bear) — use it for energy directly; scale the macros by `100 / serving_g`.
  3. A serving weight plus per-serving values — scale everything by `100 / serving_g`.
  4. No serving weight — **drop**, and count it by brand.

- [ ] **Step 5: Convert energy to kJ** — `enerc = kcal * 4.184` — as the last step, after scaling, and round to 2 decimals.

- [ ] **Step 6: Name for searchability.** `name` becomes `"<Brand> <Item>"` (`"McDonald's McVeggie Burger"`) so a search for "mcdonald" or for "mcveggie" both hit; set `lang` to the bare brand, which `rank()` already scores at tier 3, so a brand-only search still surfaces the whole menu. Set `grup` to `"Restaurant — <Brand>"`.

- [ ] **Step 7: Assign codes** `Z0001`… in a stable order (brand, then source order) and assert uniqueness before writing, so a re-run produces a byte-identical file and the diff stays reviewable.

- [ ] **Step 8: Map the leftover fields.** Starbucks gives `salt_g`, not sodium — if sodium is ever carried, convert with `sodium_mg = salt_g * 400`. `fibre_g` maps to `fibtg`. Drop `allergens`, `cholesterol_mg`, `trans_fat_g` and the sugar splits: no consumer reads them today, and 134 KB is the budget precisely because the output stays narrow.

- [ ] **Step 9: Print a summary** — rows in, rows out, drops by brand and reason. The KFC and Wendy's drops must be visible on every run, not silent.

- [ ] **Step 10: Write the tests** covering: `parseGrams` on `"168 g"` / `"330 ml"` / `238` / `"Regular"` / missing; per-serving→per-100 g scaling; kcal→kJ; the Domino's already-per-100 g branch; the Polar Bear explicit-per-100 g branch; code uniqueness; and the no-weight drop.

**Verification:**
- [ ] `node scripts/build-restaurant-foods.test.mjs` passes.
- [ ] A real run reports **664 rows out and 370 dropped** (KFC 229, Wendy's 139, Starbucks 1, Subway 1). A materially different count means a parsing regression.
- [ ] Spot-check three rows against the source PDFs' own per-100 g figures where the brand publishes them.

---

## Task 2: Serving-aware item shape

**Files:**
- Modify: `src/lib/foodDb.ts`
- Modify: `src/components/FoodSearch.tsx`
- Modify: `src/routes/meal-builder.tsx`

**Interfaces:**
- Modifies: `IFCTItem` gains `serving_g?: number` and `serving_label?: string`. Both optional — existing rows and existing call sites are untouched.

- [ ] **Step 1: Extend the interface** at `src/lib/foodDb.ts:10` with the two optional fields and a comment explaining that per-100 g remains the storage basis and a serving is only a *default quantity*, never a second set of numbers. Two sets of numbers would drift; one set plus a multiplier cannot.

- [ ] **Step 2: Default the quantity to one serving.** Add `defaultQtyFor(item) => item.serving_g ?? 100` to `foodDb.ts` and apply it at the three places that hardcode 100 today: the `useState("100")` initialiser at `FoodSearch.tsx:199`, the barcode path's `setQty("100")` at `FoodSearch.tsx:590`, and `addItem(item, grams = 100)` at `meal-builder.tsx:111` (called with an explicit `100` at lines 317 and 434). Leave the edit-an-existing-log path at `FoodSearch.tsx:293` alone — it restores the quantity the user already chose, and must not be overridden by a default. This is the change that makes a menu item feel logged rather than weighed.

- [ ] **Step 3: Label the quantity input.** When `serving_g` is present, show "1 serving = 168 g" next to the input and offer a one-tap "1 serving" chip. Keep grams as the unit the field actually holds — introducing a second unit into the field is where this kind of feature usually goes wrong.

- [ ] **Step 4: Show the per-serving totals, not just per-100 g.** `meal-builder.tsx:330` renders `kcal/100g` on every row. For a row with a serving weight, show the serving's calories with the weight beside it — "402 kcal · 168 g" — since that is the number the user is deciding with.

**Verification:**
- [ ] An IFCT row still opens at 100 g with no serving hint, exactly as today.
- [ ] A McDonald's row opens at its pack weight and shows the serving line.
- [ ] `npm run build` passes with no type error at any `IFCTItem` construction site.

---

## Task 3: Bundle the data

**Files:**
- Create: `src/data/restaurantFoods.json`
- Modify: `src/lib/foodDb.ts`

- [ ] **Step 1: Generate and commit `src/data/restaurantFoods.json`** from Task 1.

- [ ] **Step 2: Spread it into `ITEMS`** at `src/lib/foodDb.ts:26`, after `ifctData` and `EXTRA_FOODS` so those keep ranking precedence on a tie.

- [ ] **Step 3: Handle the 68 macro-less Cafe Coffee Day rows.** They carry energy but no protein, fat or carbs. `IFCTItem` already types every macro as `number | null` and `kcal()` already handles null, so they are safe to include — a user logging a Cheese Chilli Toast gets correct calories and zero macros. Show a small "calories only" note on such a row rather than rendering three silent zeroes, which would read as measured values.

- [ ] **Step 4: Re-check search latency.** `ITEMS` goes from ~1674 to ~2338 rows. Time `searchFoods("chi")` over 100 calls; if one call exceeds ~15 ms, add a lazily-built lowercased index (`{ name, lang, item }[]`) so `rank()` stops re-lowercasing every row on every keystroke. Measure before optimising — at this size it may well not be needed.

**Verification:**
- [ ] Searching "mcveggie", "subway", "starbucks", "domino" each return the expected rows locally, without the AI fallback firing.
- [ ] Logging a McVeggie Burger at its default serving yields ~402 kcal, matching the source.
- [ ] The `npm run build` bundle grows by roughly 18 KB gzipped.

---

## Task 4: Record the findings

**Files:**
- Modify: `PROJECT_STRUCTURE.md`

- [ ] **Step 1: Document what `src/data/ifct2017.json` really is** — 1556 rows, of which 542 are IFCT 2017 and 1014 are the previously-merged manual corpus (`asc_manual`, `bfp_manual`, `open_source_recipes`). The filename actively misleads, and the next person to receive a "new" food dump will otherwise repeat this whole investigation.

- [ ] **Step 2: Record that `food data.txt` is already merged,** with the three checks that establish it, so the file can be archived rather than re-imported.

- [ ] **Step 3: Document the restaurant pipeline** — where the zip lives, that only its `data/` directory matters, which script converts it, and how to re-run when a newer scrape arrives.

- [ ] **Step 4: Note the energy-conversion anomaly.** Across the already-merged rows the `ifct2017.json`-to-`food data.txt` energy ratio has a median of 4.1736 but ranges from 3.401 to 4.292, so a handful of existing rows carry a slightly inconsistent kJ conversion. Not blocking and not in scope here, but it is a real data-quality debt and should be written down rather than rediscovered.

---

## Task 5: KFC and Wendy's — deferred, not forgotten

**Files:**
- Create: `docs/superpowers/plans/notes/2026-08-25-missing-serving-weights.md`

- [ ] **Step 1: List the 368 excluded items** (KFC 229, Wendy's 139) with the per-serving figures the sources do give.

- [ ] **Step 2: State the two ways they can ship,** and that neither is a code change: obtain the serving weights from the brands' published nutrition sheets, or model per-serving items as a first-class kind (`basis: "serving"`) that is never converted to per-100 g. The second is the more honest data model and the larger change; recommend it only if more per-serving-only sources arrive.

- [ ] **Step 3: Record explicitly that estimating the weights in code was rejected,** and why — a plausible-looking wrong weight is worse than an absent food, because the user cannot tell it is wrong.


---

# What shipped (2026-08-26)

## Counts

**1001 rows**, 238 KB raw, **29 KB gzipped**. `ITEMS` goes from ~1674 to ~2675.

| Brand | Rows | Weights |
|---|---|---|
| Subway | 175 | published |
| KFC | 208 | **estimated** |
| Wendy's | 138 | **estimated** |
| McDonald's | 105 | published |
| Starbucks | 93 | published |
| Polar Bear | 82 | published |
| Cafe Coffee Day | 68 | published |
| Domino's | 66 | n/a (already per-100 g) |
| Taco Bell | 56 | published |
| Pizza Hut | 10 | published |

331 rows carry an estimated serving weight and are flagged `serving_est: true`.
32 rows were dropped, every one for a demonstrable data defect.

## How the missing weights were derived

KFC and Wendy's publish per-serving macros and no pack weight. Rather than
guessing, energy density (kcal/g) was measured on the 590 rows that **do**
state a weight, grouped by a food-kind classifier applied identically to both
sides — so a KFC burger borrows the density of the McDonald's and Subway
burgers that state theirs. The script prints the derived table on every run.

**Why an imperfect estimate is nonetheless safe:** the per-100 g values stored
are derived from the same estimate that `serving_g` is set to. Logging one
serving multiplies back by exactly the factor that was divided out, so the
source's own per-serving figures are reproduced **exactly**, whatever weight was
picked. The estimate only moves two secondary things — the "per 100 g" number
shown on the row, and hand-edited quantities. Spot checks against reality:
Wendy's Dave's Single derived 215 g (actual ~218 g), KFC regular fries 95 g
(actual ~85 g), KFC regular Pepsi 286 ml (actual 300 ml).

## Data defects found and handled

1. **KFC piece-rows are corrupt.** 0 of 10 piece-groups scale linearly; 3 Pc
   often shows fewer calories than 2 Pc. But `2 Pc = 2 x 1 Pc` holds in every
   group, so the 1-piece row is the trustworthy unit and 52 rows are rebuilt as
   `N x unit` — arithmetic from the definition of "N pieces", not an estimate.
2. **Polar Bear mixes bases.** Its energy is per serving but its macros are
   already per 100 g — for every row, 4/9/4 over the macros equals its stated
   `energy_per_100g_kcal` exactly. Treating it like the other per-serving
   sources overstated macros by the pack weight; the Atwater check caught it.
3. **`/cola/` matched "choCOLAte".** Brownies and croissants were landing in the
   soft-drink density bucket, pushing it from 0.50 to 2.47 kcal/g.
4. **Combo meals were read as drinks.** KFC rows like "Chicken Longer Meal
   (... Reg Pepsi)" matched the Pepsi pattern, drew a drink's 0.5 kcal/g, and
   derived a 1.4 kg serving. A drink whose name also names solid food is now
   classified `combo`.
5. **Atwater cannot catch everything.** "7up Krush Lime" claims 21 g protein in
   a lime soda, but at 86 kcal against an Atwater 100 it is only 14% out — well
   inside tolerance. A kind-specific plausibility rule rejects sugary and
   zero-calorie drinks carrying protein or fat, and deliberately leaves shakes
   and lattes alone.

## Residual risks

- The 331 estimated weights are wrong to some degree by construction. They are
  marked `serving_est` and shown with "≈"; the logged-serving path is unaffected.
- KFC's non-piece rows were taken at face value where Atwater agrees. The source
  is a PDF scrape and no external cross-check was performed.
- Wendy's category strings are themselves merged headers ("Sides, Kids Meal &
  Coffee"), so `grup` for those rows is only as good as the scrape.
