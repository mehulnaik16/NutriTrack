# Barcode Alcohol Calories Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Detect alcohol content (ABV % or grams) in barcode product lookups from Open Food Facts and compute calories accurately using 7 kcal/g, preventing undercounting of alcohol calories.

**Architecture:** Extend `IFCTItem` and `kcalOf()` in `src/lib/foodDb.ts` to support alcohol content and 7 kcal/g energy calculation. Update `lookupBarcode()` in `src/components/ScanFoodDialog.tsx` to extract alcohol data from Open Food Facts API, convert ABV to alcohol grams via ethanol density (0.789 g/mL), and reconcile energy when stated database energy is missing or erroneously excludes alcohol. Optionally display an alcohol disclosure indicator in `FoodSearch.tsx`.

**Tech Stack:** TypeScript, React, Vite, Open Food Facts REST API, Node.js assert test runner.

---

### Task 1: Core Nutrition Model & Alcohol Calorie Math (`src/lib/foodDb.ts`)

**Files:**
- Modify: `src/lib/foodDb.ts:10-30, 95-106`
- Test: `src/lib/alcoholCalories.test.ts`

**Step 1: Write the failing unit test**

Create `src/lib/alcoholCalories.test.ts`:
```ts
import assert from "node:assert";
import {
  kcalOf,
  KCAL_PER_G_ALCOHOL,
  ETHANOL_DENSITY,
  type IFCTItem,
} from "./foodDb.ts";

// Test 1: KCAL_PER_G_ALCOHOL constant
assert.strictEqual(KCAL_PER_G_ALCOHOL, 7, "alcohol must be 7 kcal/g");
assert.strictEqual(ETHANOL_DENSITY, 0.789, "ethanol density must be 0.789 g/mL");

// Test 2: Standard non-alcoholic food unchanged
const roti: IFCTItem = {
  code: "test_roti",
  name: "Roti",
  scie: "",
  lang: "",
  grup: "Bread",
  enerc: null,
  protcnt: 3,
  fatce: 1,
  choavldf: 20,
  fibtg: 2,
};
// 9*1 + 4*3 + 4*20 = 9 + 12 + 80 = 101 kcal
assert.strictEqual(kcalOf(roti), 101, "standard food kcalOf works");

// Test 3: Alcoholic beverage with missing enerc falls back to macros + alcohol
const beer: IFCTItem = {
  code: "test_beer",
  name: "Kingfisher Lager",
  scie: "",
  lang: "",
  grup: "Packaged",
  enerc: null,
  protcnt: 0.3,
  fatce: 0,
  choavldf: 3.6,
  fibtg: 0,
  alcohol: 3.79, // ~4.8% ABV * 0.789
  alcohol_abv: 4.8,
};
// Base macros: 4*0.3 + 4*3.6 = 1.2 + 14.4 = 15.6 kcal/100g
// Alcohol: 3.79 * 7 = 26.53 kcal/100g
// Total: 15.6 + 26.53 = 42.13 kcal/100g
const expectedKcal = 4 * 0.3 + 4 * 3.6 + 7 * 3.79;
assert(
  Math.abs(kcalOf(beer) - expectedKcal) < 0.01,
  `expected ${expectedKcal}, got ${kcalOf(beer)}`,
);

console.log("alcoholCalories.test.ts: all assertions passed");
```

**Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types src/lib/alcoholCalories.test.ts`
Expected: FAIL (missing exports `KCAL_PER_G_ALCOHOL`, `ETHANOL_DENSITY`, and alcohol calculation in `kcalOf`).

**Step 3: Implement minimal code in `src/lib/foodDb.ts`**

In `src/lib/foodDb.ts`:
1. Add `alcohol?: number | null;` (grams of pure ethanol per 100g) and `alcohol_abv?: number | null;` (ABV % for UI display) to `IFCTItem`.
2. Export `KCAL_PER_G_ALCOHOL = 7` and `ETHANOL_DENSITY = 0.789`.
3. Update `kcalOf(it: IFCTItem)`:
```ts
export const KCAL_PER_G_ALCOHOL = 7;
export const ETHANOL_DENSITY = 0.789;

export const kcalOf = (it: IFCTItem) => {
  if (it.enerc) {
    return it.enerc / KJ_PER_KCAL;
  }
  const base =
    9 * (it.fatce ?? 0) + 4 * (it.protcnt ?? 0) + 4 * (it.choavldf ?? 0);
  const alc = (it.alcohol ?? 0) * KCAL_PER_G_ALCOHOL;
  return base + alc;
};
```

**Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types src/lib/alcoholCalories.test.ts`
Expected: PASS (`alcoholCalories.test.ts: all assertions passed`).

**Step 5: Run existing tests to ensure no regressions**

Run:
- `node --experimental-strip-types src/lib/mealBuilder.test.ts`
- `node --experimental-strip-types src/lib/foodCache.test.ts`
Expected: All pass.

---

### Task 2: Open Food Facts Alcohol & Energy Parsing (`src/components/ScanFoodDialog.tsx`)

**Files:**
- Modify: `src/components/ScanFoodDialog.tsx:25-50`
- Test: `src/lib/alcoholCalories.test.ts`

**Step 1: Add parsing helper & test case in `src/lib/alcoholCalories.test.ts`**

Extract the parsing logic into a testable pure function `parseOpenFoodFactsNutriments(nutriments, barcode, productName)` or test it directly:
- Extracts alcohol from `alcohol_100g`, `alcohol`, or `alcohol_value`.
- Checks unit: if `g` or `g/100g`, uses as-is; otherwise treats as `% ABV` and converts to grams: `grams = +(abv * ETHANOL_DENSITY).toFixed(2)`.
- Checks `energy-kcal_100g` and `energy_100g` (kJ).
- Reconciles energy: If alcohol is present, calculates `expectedMinKcal = 4 * prot + 4 * carbs + 9 * fat + 7 * alcG`. If stated energy is missing, 0, or `< expectedMinKcal * 0.8` (indicating the label/entry omitted alcohol from energy), sets `enerc = expectedMinKcal * KJ_PER_KCAL`.

**Step 2: Update `lookupBarcode` in `src/components/ScanFoodDialog.tsx`**

```ts
// ── Barcode lookup via Open Food Facts ───────────────────────────────────────
export function parseOpenFoodFactsProduct(
  data: any,
  barcode: string,
): IFCTItem | null {
  if (data.status !== 1 || !data.product) return null;
  const n = data.product.nutriments ?? {};

  const prot = n.proteins_100g ?? 0;
  const fat = n.fat_100g ?? 0;
  const carbs = n.carbohydrates_100g ?? 0;
  const fib = n.fiber_100g ?? 0;

  // 1. Extract Alcohol (ABV % or grams)
  const rawAlc = n.alcohol_100g ?? n.alcohol ?? n.alcohol_value ?? null;
  let alcoholG: number | null = null;
  let alcoholAbv: number | null = null;
  if (rawAlc != null && !isNaN(Number(rawAlc)) && Number(rawAlc) > 0) {
    const val = Number(rawAlc);
    const unit = (n.alcohol_unit ?? "").toLowerCase().trim();
    if (unit === "g" || unit === "g/100g") {
      alcoholG = val;
      alcoholAbv = +(val / ETHANOL_DENSITY).toFixed(1);
    } else {
      alcoholAbv = val;
      alcoholG = +(val * ETHANOL_DENSITY).toFixed(2);
    }
  }

  // 2. Extract Energy (kcal or kJ)
  const rawKcal = n["energy-kcal_100g"] ?? n["energy-kcal"] ?? n["energy-kcal_value"];
  const rawKj = n["energy_100g"] ?? n["energy-kj_100g"] ?? n["energy"];
  const statedKcal =
    rawKcal != null && !isNaN(Number(rawKcal)) && Number(rawKcal) > 0
      ? Number(rawKcal)
      : rawKj != null && !isNaN(Number(rawKj)) && Number(rawKj) > 0
        ? Number(rawKj) / KJ_PER_KCAL
        : null;

  // 3. Reconcile Energy if alcohol is present
  const alcCalories = (alcoholG ?? 0) * KCAL_PER_G_ALCOHOL;
  const macroCalories = 4 * prot + 4 * carbs + 9 * fat;
  const minExpectedKcal = macroCalories + alcCalories;

  let finalEnerc: number | null = null;
  if (statedKcal != null && statedKcal >= minExpectedKcal * 0.8) {
    // Stated energy is reliable and accounts for alcohol
    finalEnerc = statedKcal * KJ_PER_KCAL;
  } else if (minExpectedKcal > 0) {
    // Missing or underreported energy (common for alcoholic beverages)
    finalEnerc = minExpectedKcal * KJ_PER_KCAL;
  }

  return {
    code: barcode,
    name: data.product.product_name ?? "Unknown product",
    scie: "",
    lang: "",
    grup: alcoholG ? "Beverages" : "Packaged",
    enerc: finalEnerc,
    protcnt: prot,
    fatce: fat,
    choavldf: carbs,
    fibtg: fib,
    alcohol: alcoholG,
    alcohol_abv: alcoholAbv,
  };
}
```

**Step 3: Run tests to verify**

Run: `node --experimental-strip-types src/lib/alcoholCalories.test.ts`
Expected: PASS.

---

### Task 3: UI Transparency in Quantity Dialog (`src/components/FoodSearch.tsx`)

**Files:**
- Modify: `src/components/FoodSearch.tsx`

**Step 1: Add alcohol info hint when `selected.alcohol` is present**

Under the title or macros in the modal (around line 1280), if `selected.alcohol` or `selected.alcohol_abv` exists, show:
```tsx
{selected.alcohol != null && selected.alcohol > 0 && (
  <div className="flex items-center gap-1.5 text-xs text-amber-500/90 font-mono bg-amber-500/10 px-2.5 py-1 rounded">
    <span>🍷 {selected.alcohol_abv ? `${selected.alcohol_abv}% ABV` : "Contains alcohol"}</span>
    <span className="text-muted-foreground">·</span>
    <span className="text-muted-foreground">
      Includes ~{Math.round(KCAL_PER_G_ALCOHOL * (selected.alcohol * grams) / 100)} kcal from alcohol
    </span>
  </div>
)}
```

**Step 2: Verify build and types**

Run: `npm run build`
Expected: Build succeeds with 0 errors.
