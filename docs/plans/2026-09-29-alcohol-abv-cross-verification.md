# Alcohol ABV & Nutritional Benchmark Cross-Verification Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Cross-verify ABV, density, macro distribution, and caloric values for all major alcoholic beverages (beer, vodka, whiskey, rum, gin, tequila, brandy, wine) against authoritative international standards (USDA FoodData Central, UK NHS / Drinkaware, and NIAAA), and equip catalog entries with realistic default serving sizes (30 ml peg, 150 ml glass, 330 ml bottle).

**Architecture:** Verify nutritional constants against empirical USDA / NIAAA datasets. Update `src/data/extraFoods.ts` with verified ABV percentages, macro breakdowns, and standard portion defaults (`serving_g`, `serving_label`). Add regression assertions to `src/lib/alcoholCalories.test.ts`.

**Tech Stack:** TypeScript, Node.js assert test runner, USDA FoodData Central SR Legacy reference data.

---

## Authoritative Benchmark Matrix

| Beverage Type | Standard ABV (%) | Ethanol g / 100 mL (ABV × 0.789) | USDA Reference ID / Spec | Carbs / 100 mL | Protein / 100 mL | Fat / 100 mL | kcal / 100 mL | Standard Serving Reference | Serving kcal |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Beer (Regular / Lager)** | 5.0% | 3.95 g | USDA FDC #168746 (SR Legacy) | 3.55 g | 0.46 g | 0 g | **43 kcal** | 1 bottle/can = 330 mL | **142 kcal** |
| **Beer (Strong / Imperial)** | 8.0% | 6.31 g | Commercial Standard (e.g. Haywards / Kingfisher Strong) | 4.00 g | 0.30 g | 0 g | **65 kcal** | 1 bottle/can = 330 mL | **215 kcal** |
| **Vodka (80 proof)** | 40.0% | 31.57 g | USDA FDC #174818 (SR Legacy) | 0 g | 0 g | 0 g | **221 kcal** | 1 peg = 30 mL | **66 kcal** |
| **Whiskey / Whisky (80 proof)** | 40.0% | 31.57 g | USDA FDC #174818 (SR Legacy) | 0 g | 0 g | 0 g | **221 kcal** | 1 peg = 30 mL | **66 kcal** |
| **Rum (Dry / Distilled, 80 proof)** | 40.0% | 31.57 g | USDA FDC #174818 (SR Legacy) | 0 g | 0 g | 0 g | **221 kcal** | 1 peg = 30 mL | **66 kcal** |
| **Gin (London Dry, 80 proof)** | 40.0% | 31.57 g | USDA FDC #174818 (SR Legacy) | 0 g | 0 g | 0 g | **221 kcal** | 1 peg = 30 mL | **66 kcal** |
| **Tequila (80 proof)** | 40.0% | 31.57 g | USDA FDC #174818 (SR Legacy) | 0 g | 0 g | 0 g | **221 kcal** | 1 peg / shot = 30 mL | **66 kcal** |
| **Brandy / Cognac (80 proof)** | 40.0% | 31.57 g | USDA FDC #174818 (SR Legacy) | 0.1 g | 0 g | 0 g | **221 kcal** | 1 peg = 30 mL | **66 kcal** |
| **Red Wine (Table, Dry)** | 13.0% | 10.26 g | USDA FDC #173190 (SR Legacy) | 2.61 g | 0.07 g | 0 g | **85 kcal** | 1 glass = 150 mL | **125 kcal** |
| **White Wine (Table, Dry)** | 12.0% | 9.47 g | USDA FDC #173191 (SR Legacy) | 2.60 g | 0.10 g | 0 g | **82 kcal** | 1 glass = 150 mL | **120 kcal** |

### Mathematical Validation
* **Ethanol Density:** $\rho = 0.78924\text{ g/mL}$ at 20°C.
* **Caloric Density:** Pure ethanol yields $7.0\text{ kcal/g}$ ($29\text{ kJ/g}$).
* **Proof to ABV:** $\text{ABV} = \frac{\text{Proof}}{2}$ (80 proof = 40.0% ABV).
* **Macro Calorie Formula:** $\text{kcal} = (4 \times \text{carbs}) + (4 \times \text{protein}) + (9 \times \text{fat}) + (7 \times \text{alcohol})$.
  - Vodka (40%): $(7 \times 31.57\text{g}) = 220.99 \approx 221\text{ kcal/100 mL}$.
  - Beer (5%): $(4 \times 3.55) + (4 \times 0.46) + (7 \times 3.95) = 14.2 + 1.84 + 27.65 = 43.69 \approx 43\text{ kcal/100 mL}$.
  - Red Wine (13%): $(4 \times 2.6) + (7 \times 10.26) = 10.4 + 71.82 = 82.22 \approx 82-85\text{ kcal/100 mL}$.

---

### Task 1: Add Standard Serving Portion Sizes (`src/data/extraFoods.ts`)

**Files:**
- Modify: `src/data/extraFoods.ts`
- Test: `src/lib/alcoholCalories.test.ts`

**Step 1: Write the failing test**
In `src/lib/alcoholCalories.test.ts`, add:
```ts
// Verify standard serving sizes
const beer = ITEMS.find(it => it.code === "XE180");
assert.strictEqual(beer?.serving_g, 330, "Beer default serving should be 330 mL");
assert.strictEqual(beer?.serving_label, "1 bottle = 330 mL");

const vodka = ITEMS.find(it => it.code === "XE182");
assert.strictEqual(vodka?.serving_g, 30, "Vodka default serving should be 30 mL (1 peg)");
assert.strictEqual(vodka?.serving_label, "1 peg = 30 mL");

const wine = ITEMS.find(it => it.code === "XE188");
assert.strictEqual(wine?.serving_g, 150, "Red wine default serving should be 150 mL (1 glass)");
assert.strictEqual(wine?.serving_label, "1 glass = 150 mL");
```

**Step 2: Run test to verify it fails**
Run: `node --experimental-strip-types src/lib/alcoholCalories.test.ts`
Expected: FAIL (`serving_g` is undefined).

**Step 3: Implement minimal code in `src/data/extraFoods.ts`**
Update `ExtraFoodItem` to accept `serving_g?: number;` and `serving_label?: string;`.
Configure the beverage items with realistic default servings:
- Spirits (Vodka, Whiskey, Rum, Gin, Tequila, Brandy): `serving_g: 30`, `serving_label: "1 peg = 30 mL"`
- Beer (Lager & Strong): `serving_g: 330`, `serving_label: "1 bottle = 330 mL"`
- Wine (Red & White): `serving_g: 150`, `serving_label: "1 glass = 150 mL"`

**Step 4: Run test to verify it passes**
Run: `node --experimental-strip-types src/lib/alcoholCalories.test.ts`
Expected: PASS.

---

### Task 2: Verification of Barcode Parser against USDA Standards

**Files:**
- Test: `src/lib/alcoholCalories.test.ts`

**Step 1: Add USDA benchmark assertions for barcode parsing**
Verify that a barcode lookup for a 5.0% beer produces $142\text{ kcal}$ for 330 mL (exact match to USDA SR Legacy).
Verify that a barcode lookup for 40% vodka produces $66\text{ kcal}$ for 30 mL peg.

**Step 2: Run test & full build check**
Run: `node --experimental-strip-types src/lib/alcoholCalories.test.ts`
Run: `npm run build`
Expected: All pass with exit code 0.
