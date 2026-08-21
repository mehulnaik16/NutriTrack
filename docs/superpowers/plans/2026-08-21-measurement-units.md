# Measurement Units Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One place where the user picks weight (kg/lbs) and distance (km/mi) units, and every **workout and weight-logging** surface honours it immediately — inputs, labels, history rows, analytics numbers, chart axes and tooltips. The ad-hoc kg/lbs toggle inside the gym logging modal becomes a read-only reflection of that setting instead of a free-for-all.

**Architecture:** Store canonical, convert at the edges. Every weight stays in the database as kilograms and every distance as kilometres — which is already how the schema is built (`weight_kg`, `goal_weight_kg`, `bench_weight_kg`) and already how `quiz.tsx` partially behaves. Changing a unit therefore writes nothing to history: it changes only how stored numbers are rendered and how typed numbers are interpreted on the way in. A single `src/lib/units.ts` owns every conversion and label, and a `useUnits()` hook delivers the preference to the eight files that display measurements, so no component does its own arithmetic.

**Tech Stack:** React 19, TanStack Router, Supabase Postgres, Recharts.

**Spec:** None — direct feature request, scope narrowed by the user in conversation. Problem Statement below is the spec; every file:line reference was confirmed by reading the code.

## Scope

**In:** workout logging (gym weight, cardio distance) and body-weight logging, wherever they appear.

**Out, by explicit user decision:**

- **Height.** Stays in cm everywhere, untouched — it is a set-once profile fact, unrelated to logging. This means `profile.tsx`'s height input/display and `quiz.tsx`'s height slider are **not** modified.
- **Food and calories.** `src/lib/nutrition.ts` is not modified at all. That includes `LOSE_RATE_OPTIONS` / `GAIN_RATE_OPTIONS` ("0.25 kg / week"): those labels look like weight, but they select calorie multipliers via `GOAL_MULTIPLIERS` and their stored DB keys are literally `lose_0_25kg`, so they are a diet feature, not a logging one.
- **`bodymeasurement_unit` wiring.** The column is created for the future body-measurements feature, but nothing reads it yet and no cm/in conversion helpers are written until something needs them.

### The one deviation from the original request

The request was for stored history to be rewritten on a unit change. This plan does **not** do that, because it would silently corrupt derived values:

- `calcMacros(calories, goalKey, weightKg)` (`nutrition.ts:109-121`) sets protein and fat as grams **per kilogram** (2.2 g/kg, 0.8 g/kg, …).
- `calcWater(weightKg)` (`:124-126`) is 35 mL **per kilogram**.
- `calcBMR(weightKg, heightCm, …)` (`:25-34`) is Mifflin-St Jeor, defined for kg and cm.
- `calcBMI(weightKg, heightCm)` (`:9-13`) likewise.

All four read `user_profiles.weight_kg`. If a unit switch rewrote that column to pounds, none of them would know — they would keep multiplying, and protein, fat, water, BMR, TDEE and BMI would all silently inflate by ~2.2×. Rewriting also compounds rounding loss on every switch, and a partially-failed bulk UPDATE leaves rows in mixed units with nothing recording which converted.

Canonical storage gives the same user-visible outcome — flip to lbs and history, analytics and charts are all lbs on the next render — with no writes and no risk. The user confirmed this reading of it: history stored in one fixed unit, charts always drawn in the currently chosen one. **If this is ever reversed, the plan must be rewritten rather than patched: the storage model is its foundation.**

## Problem Statement

### Current state, confirmed

Storage is already canonical almost everywhere: `user_profiles.weight_kg / goal_weight_kg`, `weight_entries.weight_kg`, `workout_profile.bench_weight_kg / squat_weight_kg / deadlift_weight_kg`. `quiz.tsx:319,536` already converts for display only while its writes stay in kg.

The exception is `workout_logs.exercises_done`, where the gym logger stores whatever the user typed plus a per-set `unit` tag (`workout.tsx:1838`). Live data check: **40 sets tagged `kg`, 81 sets with no tag (older logs, implicitly kg), zero tagged `lbs`.** No mixed-unit data exists — the mechanism for creating it exists but has never been used. Normalising is therefore labelling, not converting.

Cardio distance (`exercises_done.distance`) carries no unit tag at all; km is assumed.

### Existing bugs this fixes

Each is an instance of the exact defect the feature removes:

1. **`toggleUnit` is lossy** (`workout.tsx:1708-1716`): converts with the imprecise factor `2.2` and `Math.round`s, so kg→lbs→kg drifts on every toggle (22.5 → 50 → 23).
2. **Weight is saved in whatever unit was toggled** (`:1838`), unnormalised — this is what would create mixed-unit history the moment anyone pressed lbs.
3. **Est. 1RM is always labelled "kg"** (`:1945`) regardless of `currentUnit` — already wrong today in lbs mode.
4. **Analytics charts label historical data with today's toggle** (`:2098,2117,2137,2148,2159`): the axis, tooltip and peak-1RM use `currentUnit`, but the plotted points come from logs carrying their own `unit`. Raw kg and lbs numbers would share one axis under one label.
5. **Prefill unit mismatch**: `defaultLiftForExercise` (`workoutPrefs.ts:189-212`) returns a kg value that seeds the form (`:1798`) even in lbs mode — silently reinterpreted as pounds.
6. **`quiz.tsx` weight slider is half-converted**: the readout converts (`:319`) but the slider itself and its min/max labels (`:325-332`) stay in kg.

### Every surface in scope

**Weight** — `workout.tsx` (set inputs `:1871+`, unit toggle `:1878-1891`, 1RM readout `:1945`, history rows `:2010,2027,2032,2048`, analytics + charts `:2098-2159`, bodyweight kcal helper `:1601`, default set weight `:1798`); `weight.tsx` (summary cards `:371,391,401,424`, inputs `:489,499`, chart + goal ReferenceLine `:602-621`, history list `:670-711`, edit modal `:931`, writes at `:181,197,239-245,293`); `dashboard.tsx` (weight tracker card `:1005-1021`, quick-add + `saveWeight` `:347-373,1044-1054`, weight chart + goal line `:1217-1281`, photo overlay `:1303-1305`); `profile.tsx` (weight input `:694-699` and display `:796-798` — **weight only, not the adjacent height**; strongest-lift inputs `:1002-1023` and display `:1029-1040`); `quiz.tsx` (**weight slider only** `:304-332,536`); `workout-setup.tsx` (lift input label `:108`); `WorkoutLogHistory.tsx` (`:250-251,296,305`, charts `:483-543`).

**Distance** — `workout.tsx` (cardio distance input `:1564-1573`, write `:1488-1495`, pace `:1592`, history `:1621-1631,1663,1675`); `CardioPaceChart.tsx` (pace math `:42-51`, axis label `:87-88`, tooltip `:90-117`); `WorkoutLogHistory.tsx` (`computePace` `:83-86`, display `:360,414,428`).

## Global Constraints

- **Storage is always canonical: kg and km.** No component may write a converted value to Supabase. Conversion happens only when rendering a stored number, or when parsing a number the user typed.
- **All conversion and label logic lives in `src/lib/units.ts`.** No component may contain a literal `2.2`, `2.20462`, `0.621371`, or a hardcoded `"kg"`/`"km"` in user-facing text. This is what stops the feature rotting.
- Factors are the exact definitional ones: `1 lb = 0.45359237 kg`, `1 mi = 1.609344 km`. The existing `2.2` is wrong by 0.2% and must not be carried forward.
- Rounding is a **display** concern only, never applied to a stored value: weights to 1 decimal, distances to 2.
- The `unit` field written into `exercises_done` is retired for new logs. Existing values are left in place (harmless) and read as "kg if absent or 'kg'". No historical payload is rewritten.
- **`src/lib/nutrition.ts` is not modified.** Not one line.
- **Height is not modified.** No file's height input, display, slider or label changes.
- Defaults are kg / km, applied when the user has no row or a null column.
- No automated test runner in this repo. Conversion is pure logic, so it gets a real test file in the style of `src/lib/__cycle.test.mjs` (compiled with `tsc`, run under plain Node, asserts only).
- Type-check command: `npx tsc --noEmit --ignoreConfig --jsx react-jsx --esModuleInterop --skipLibCheck --target es2020 --moduleResolution bundler <files>`. `--ignoreConfig` is mandatory. Compare against a `git stash` baseline; ignore `TS2307`/`TS2875` (no `node_modules` in the sandbox).

---

## Task 1: Create the `measurements` table

**Files:**
- Create: `supabase/migrations/<assigned-version>_measurements.sql`

**Interfaces:**
- Produces: table `public.measurements`, one row per user, consumed by Task 2.

- [ ] **Step 1: Apply the migration**

Controller-run against the live database (a security-sensitive action per this session's standing ruling), via `mcp__Supabase__apply_migration`. All three columns are created, including `bodymeasurement_unit`, which is stored but not yet read anywhere:

```sql
create table public.measurements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weight_unit text not null default 'kg'
    check (weight_unit in ('kg','lbs')),
  distance_unit text not null default 'km'
    check (distance_unit in ('km','mi')),
  bodymeasurement_unit text not null default 'cm'
    check (bodymeasurement_unit in ('cm','in')),
  updated_at timestamptz not null default now()
);

alter table public.measurements enable row level security;

create policy "Users manage own measurement units"
  on public.measurements
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.measurements is
  'Display-unit preferences only. All measurements are STORED canonically
   (kg, km) everywhere in this database — these columns control how stored
   values are rendered and how typed input is interpreted. Changing a unit
   here must never trigger a rewrite of stored values: nutrition math in
   src/lib/nutrition.ts (macros per kg, water per kg, Mifflin-St Jeor BMR)
   depends on weight_kg genuinely being kilograms.';

comment on column public.measurements.bodymeasurement_unit is
  'Reserved for the future body-measurements feature (bicep, waist, chest).
   Saved by the settings UI but read by nothing yet. Height is deliberately
   NOT governed by this column — it stays in cm.';
```

- [ ] **Step 2: Verify**

```sql
select column_name, data_type, column_default
from information_schema.columns
where table_schema='public' and table_name='measurements'
order by ordinal_position;

select policyname from pg_policies
where schemaname='public' and tablename='measurements';
```

Expected: four columns with defaults `'kg'`, `'km'`, `'cm'`; one policy named `Users manage own measurement units`. (`pg_policies` uses `policyname`, not `polname` — getting this wrong wasted a round earlier this session.)

- [ ] **Step 3: Save the migration file under the assigned version**

Read the assigned version (`select version, name from supabase_migrations.schema_migrations order by version desc limit 1;`), write the SQL to `supabase/migrations/<version>_measurements.sql`, and sync it to the user's machine.

---

## Task 2: Build the units module and the `useUnits` hook

**Files:**
- Create: `src/lib/units.ts`
- Create: `src/lib/__units.test.mjs`

**Interfaces:**
- Produces, consumed by every later task:
  - `type WeightUnit = "kg" | "lbs"`, `type DistanceUnit = "km" | "mi"`
  - `type BodyUnit = "cm" | "in"` (type only — the value is persisted, but no conversion helpers exist yet)
  - `interface UnitPrefs { weight: WeightUnit; distance: DistanceUnit; body: BodyUnit }`
  - `DEFAULT_UNITS: UnitPrefs`
  - `fromKg(kg, unit): number` / `toKg(value, unit): number`
  - `fromKm(km, unit): number` / `toKm(value, unit): number`
  - `formatWeight(kg, unit, opts?): string` — `"70 kg"` / `"154.3 lbs"`; `opts.withUnit === false` returns the number only
  - `formatDistance(km, unit, opts?): string`
  - `paceLabel(unit): string` — `"min/km"` or `"min/mi"`
  - `useUnits(userId: string | null): UnitPrefs` — returns `DEFAULT_UNITS` synchronously, then the user's row once loaded
  - `getCachedUnits(userId): UnitPrefs` — localStorage read-through
  - `saveUnits(userId, prefs): Promise<{ dbSaved: boolean }>`

No `fromCm`/`toCm`/`formatBody`. They are deliberately omitted: nothing reads `bodymeasurement_unit` yet, and writing untested helpers for a feature that does not exist invites them to drift. Add them alongside the body-measurements feature.

- [ ] **Step 1: Write the conversion core**

Exact factors, and conversions that never round (rounding belongs to formatting):

```ts
const KG_PER_LB = 0.45359237; // exact by definition
const KM_PER_MI = 1.609344;   // exact by definition

export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === "kg" ? kg : kg / KG_PER_LB;
}
export function toKg(value: number, unit: WeightUnit): number {
  return unit === "kg" ? value : value * KG_PER_LB;
}
```

…and the same shape for `fromKm`/`toKm` (÷ / × `KM_PER_MI`). Using exact definitional factors and dividing rather than multiplying by a rounded reciprocal is what makes `toKg(fromKg(x))` round-trip cleanly.

- [ ] **Step 2: Write the formatters**

```ts
export function formatWeight(
  kg: number,
  unit: WeightUnit,
  opts: { withUnit?: boolean; decimals?: number } = {},
): string {
  const { withUnit = true, decimals = 1 } = opts;
  const n = Number(fromKg(kg, unit).toFixed(decimals));
  return withUnit ? `${n} ${unit}` : String(n);
}
```

`formatDistance` mirrors it with `decimals = 2`. `paceLabel` returns `` `min/${unit}` ``.

- [ ] **Step 3: Write the persistence layer**

Mirror `workoutPrefs.ts` exactly — the codebase's established pattern for a per-user preference row with a localStorage cache:

- `getCachedUnits(userId)` reads `localStorage["measurement_units_" + userId]` in a try/catch, returning `DEFAULT_UNITS` on any failure.
- `saveUnits(userId, prefs)` writes the cache first, then upserts `{ user_id, weight_unit, distance_unit, bodymeasurement_unit, updated_at }` to `.from("measurements" as any)` with `{ onConflict: "user_id" }`. The `as any` is required because the generated `Database` type has no `measurements` table; precedent at `RankPage.tsx:58` and `workoutPrefs.ts`.
- `useUnits(userId)` seeds state synchronously from `getCachedUnits` so nothing flashes kg before showing lbs — the same class of bug fixed in `profile.tsx` earlier this session — then loads the row and updates.

- [ ] **Step 4: Write the test file**

Create `src/lib/__units.test.mjs` following `src/lib/__cycle.test.mjs`'s pattern — plain Node over the compiled module, `check(label, actual, expected)`, non-zero exit on failure, compile-and-run commands in the header comment. Cover at minimum:

- Identity: `fromKg(70,"kg") === 70`, `fromKm(5,"km") === 5`.
- Known values with a tolerance helper (`Math.abs(a-b) < 1e-3`), not `===`: `fromKg(100,"lbs") ≈ 220.462`, `toKg(220.462,"lbs") ≈ 100`, `fromKm(5,"mi") ≈ 3.107`, `toKm(3.107,"mi") ≈ 5`.
- **Round-trip stability — the bug that motivates this task:** `toKg(fromKg(x,"lbs"),"lbs")` returns `x` within 1e-9 for x in `[20, 22.5, 70, 100.7]`, and repeating it ten times still returns `x`. This is what the old `×2.2` + round toggle got wrong.
- Zero and negative inputs do not throw.
- `formatWeight(70,"kg") === "70 kg"`, `formatWeight(100,"lbs") === "220.5 lbs"`, `formatWeight(70,"kg",{withUnit:false}) === "70"`.
- `formatDistance(5,"km") === "5 km"`, `formatDistance(5,"mi") === "3.11 mi"`.
- `paceLabel("km") === "min/km"`, `paceLabel("mi") === "min/mi"`.

- [ ] **Step 5: Run the tests and type-check**

Compile and run per the header instructions; every check must pass. Type-check `src/lib/units.ts` against a stashed baseline, expecting zero new errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/units.ts src/lib/__units.test.mjs
git commit -m "feat: units module — canonical kg/km storage with display conversion"
```

---

## Task 3: Add the Measurement units box to the Workout details card

**Files:**
- Modify: `src/routes/profile.tsx`

**Interfaces:**
- Consumes: `useUnits`, `saveUnits`, `UnitPrefs` from Task 2.
- Produces: no exports; a new section inside the existing `page === "workout-details"` block.

- [ ] **Step 1: Add the section**

Insert a third `<section>` immediately after the "Strongest lifts" section closes (around `:1040`), matching the existing two section-for-section: same `<p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">` heading, same `rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border` container, same `isEditingWp ? (grid of Selects) : (InfoRow list)` split.

Heading: `Measurement units`. Three rows:

| Label | Edit control | View row |
|---|---|---|
| Weight | `Select`: Kilograms (kg) / Pounds (lbs) | `InfoRow label="Weight"` |
| Distance | `Select`: Kilometres (km) / Miles (mi) | `InfoRow label="Distance"` |
| Body measurements | `Select`: Centimetres (cm) / Inches (in) | `InfoRow label="Body measurements"` |

Add three state variables next to the existing `wp*` block (`:237-250`), seeded from `useUnits` the way the `wp*` fields are seeded from `wpInit`, so the card never renders a default the user has overridden.

- [ ] **Step 2: Label the body row honestly**

`bodymeasurement_unit` saves but changes nothing on screen yet. A dropdown that silently does nothing reads as broken, so add a muted note under that one select:

> Saved for upcoming body measurements (bicep, waist, chest). Doesn't affect anything yet.

- [ ] **Step 3: Save alongside the existing workout profile**

Extend `updateWorkoutProfile` so the same Save button persists both — it already calls `saveWorkoutPrefs`; add `saveUnits(user.id, { weight, distance, body })`. Two writes, one button; the card already presents as one unit to the user.

Add a muted hint under the weight/distance selects, matching the existing plan-drift hint's styling (`:942-945`):

> Changes how measurements are shown everywhere. Your saved history isn't altered — the same workouts are simply displayed in the new unit.

Worth stating in the UI, because the original expectation was that history gets rewritten; the hint makes the actual behaviour visible rather than surprising.

- [ ] **Step 4: Type-check and commit**

Type-check against baseline (zero new errors). Commit as `feat: measurement units box on the workout details card`.

---

## Task 4: Wire weight through every in-scope surface

**Files:**
- Modify: `src/routes/workout.tsx`, `src/routes/weight.tsx`, `src/routes/dashboard.tsx`, `src/routes/profile.tsx`, `src/routes/quiz.tsx`, `src/routes/workout-setup.tsx`, `src/components/WorkoutLogHistory.tsx`

**Interfaces:**
- Consumes: `useUnits`, `formatWeight`, `fromKg`, `toKg`. No new exports.

The pattern is identical everywhere and should be applied mechanically:

- **Displaying** a stored weight → `formatWeight(kg, units.weight)` instead of `` `${kg} kg` ``.
- **An input** → its label becomes `` `Weight (${units.weight})` ``, its displayed value is `fromKg(stored, units.weight)`, and on save the typed number goes through `toKg(typed, units.weight)` before being written. **This is the step that must not be missed** — forgetting it writes pounds into a column named `weight_kg`.
- **A chart** → the series is mapped through `fromKg` before reaching Recharts, and the axis label / tooltip formatter uses `units.weight`. Reference lines (e.g. the goal-weight line) convert too.

- [ ] **Step 1: `workout.tsx` — the gym logger, including the bugs it carries**

- Replace the interactive unit toggle (`:1878-1891`) with a static label showing `units.weight`, styled like the current active pill but not a button. Delete `toggleUnit` (`:1708-1716`) and the `currentUnit` state — the unit is global now, not per-modal. **This is the "should be blocked" requirement.**
- Set inputs display `fromKg(storedKg, units.weight)`; `handleLog` (`:1829`) converts each typed weight with `toKg` before insert, and **stops writing the per-set `unit` field** — storage is canonical, so the tag is meaningless.
- Fix the 1RM label (`:1945`) to use `units.weight`, computing the displayed figure from converted values (bug 3).
- Fix history rows (`:2010,2027,2032,2048`) to render via `formatWeight` from the stored kg, ignoring each log's legacy `unit` tag (all existing tags are `kg` or absent).
- Fix analytics and charts (`:2098-2159`) to convert every plotted point through `fromKg` and label with `units.weight` (bug 4) — this is what stops kg and lbs sharing an axis.
- The default set weight (`:1798`) becomes a single canonical `20` kg converted for display, not the hardcoded `"45"`/`"20"` pair.
- The bodyweight kcal helper (`:1601`) renders via `formatWeight`.
- The `defaultLiftForExercise` prefill (bug 5) converts at the point it seeds the form.

- [ ] **Step 2: `weight.tsx` — bodyweight tracking**

Summary cards (`:371,391,401,424`), inputs (`:489,499`), history list (`:670-711`), edit modal (`:931`), chart and goal `ReferenceLine` (`:602-621`). `logWeight` (`:181,197`), the entry edit (`:239-245`) and `saveGoalWeight` (`:293`) convert typed input with `toKg` before writing.

The BMI card (`:322-339,408-451`) keeps computing from raw kg and cm and its **height display is not touched**; only the weight string within it changes.

- [ ] **Step 3: `dashboard.tsx`**

Weight tracker card (`:1005-1021`), quick-add input and its `saveWeight` write (`:347-373`, `:1044-1054`), weight chart and goal line (`:1217-1281`), progress-photo overlay (`:1303-1305`). The BMI/BMR/TDEE self-heal block (`:314-336`) is **not** touched — it operates on canonical kg and must continue to.

- [ ] **Step 4: `profile.tsx`, `quiz.tsx`, `workout-setup.tsx`**

- `profile.tsx`: the weight input (`:694-699`) and weight display (`:796-798`) — **the adjacent height input and display stay exactly as they are.** Also the three strongest-lift inputs and displays (`:1002-1040`), with `toKg` applied before `updateProfile` / `saveWorkoutPrefs` write.
- `quiz.tsx`: replace the local `unit` state with `useUnits`, and fix bug 6 — the **weight** slider must operate in the displayed unit with converted min/max bounds and labels, not stay in kg while only the readout converts. Its write still stores kg. **The height slider (`:338-348`) is not modified.**
- `workout-setup.tsx`: the lift input label (`:108`) and conversion on save. The AI prompt (`:217-220`) keeps sending kg — it is machine-facing, and the model should receive a consistent unit.

- [ ] **Step 5: `WorkoutLogHistory.tsx`**

`:250-251,296,305` stop reading the per-log `unit` tag and render from canonical kg; the two charts (`:483-543`) convert their series and gain unit-aware tooltips.

- [ ] **Step 6: Verify and commit**

Type-check every modified file against a stashed baseline (zero new errors), then grep for leftovers:

```bash
grep -rn '"kg"\|>kg<\|(kg)\| kg`\|2\.2\b' src/ --include=*.tsx --include=*.ts \
  | grep -v units.ts | grep -v nutrition.ts | grep -v _kg
```

Every hit must be a canonical column name or already converted. `nutrition.ts` is excluded because it is deliberately untouched.

Commit as `feat: weight units applied across logging, history, analytics and charts`.

---

## Task 5: Wire distance

**Files:**
- Modify: `src/routes/workout.tsx`, `src/components/CardioPaceChart.tsx`, `src/components/WorkoutLogHistory.tsx`

**Interfaces:**
- Consumes: `useUnits`, `formatDistance`, `fromKm`, `toKm`, `paceLabel`.

- [ ] **Step 1: `workout.tsx` cardio**

The distance input and its label (`:1564-1573`) — typed values convert with `toKm` before the `exercises_done.distance` write (`:1488-1495`); the pace readout (`:1592`) and history rows (`:1621-1631,1663,1675`) use `formatDistance` and `paceLabel`.

- [ ] **Step 2: `CardioPaceChart.tsx`**

Pace is `duration_min / distance`, so the **distance must be converted before the division** (`:42-51`) or the pace is silently wrong — converting the resulting pace number instead would invert the relationship. The axis label (`:87-88`) and tooltip (`:90-117`) use `paceLabel`.

- [ ] **Step 3: `WorkoutLogHistory.tsx`**

`computePace` (`:83-86`) takes the same care, plus the displays at `:360,414,428`.

- [ ] **Step 4: Verify and commit**

Type-check against baseline; grep for leftovers:

```bash
grep -rn 'min/km\|(km)\| km`\|>km<' src/ --include=*.tsx --include=*.ts | grep -v units.ts
```

Commit as `feat: distance units applied to cardio logging, history and pace charts`.

---

## Task 6: End-to-end verification

- [ ] **Step 1: Re-run both logic test suites**

`src/lib/__units.test.mjs` and the existing `src/lib/__cycle.test.mjs` must both pass — the latter confirms this change did not disturb the day-cycle work.

- [ ] **Step 2: Manual walkthrough**

With a user who has existing weight entries and gym logs:

1. Profile → Workout details → Measurement units shows kg / km / cm. Switch weight to **lbs**, save.
2. Without reloading, check the Weight page cards, chart, goal line, history list and input, plus the dashboard weight card, quick-add and chart — all in lbs, all showing the *same* readings converted, none missing.
3. Open a gym exercise: the unit indicator reads **lbs and cannot be clicked**. Previous sets appear converted. Log a set of 100 lbs.
4. **Confirm canonical storage held.** The critical check:
   ```sql
   select exercises_done from public.workout_logs order by logged_at desc limit 1;
   ```
   Expected: roughly `45.36`, not `100`. If it shows `100`, a `toKg` call was missed and the data is now corrupt.
5. History and Analytics for that exercise show the new set as 100 lbs and older sets converted, on one consistent axis.
6. Switch back to kg — the set from step 3 reads ~45.4 kg. Switch back and forth several times: the number must not drift (what the old `×2.2` toggle got wrong).
7. Log a cardio session in miles; confirm the stored `distance` is kilometres and that pace reads min/mi and is sensible (a 10 min/km pace is ~16.1 min/mi, not 6.2).
8. **Confirm the out-of-scope areas are genuinely untouched:** height still reads in cm on Profile and in the quiz; calories, protein and water targets are **identical** before and after every unit switch. Any change to those means canonical storage was violated somewhere.

- [ ] **Step 3: Commit**

```bash
git commit -m "test: verify units end to end across weight and distance"
```

---

## Self-Review

**Spec coverage:** New `measurements` table with the three named columns and kg/km/cm defaults → Task 1. Units applied across workout and weight-logging surfaces including history, analytics and charts → Tasks 4 and 5, driven by the file:line inventory. The gym toggle reflecting the setting and no longer freely switchable → Task 4 Step 1. Text stating the unit in use → Task 2's formatters applied throughout. The editable dropdown box below Strongest lifts → Task 3. The six existing bugs → Task 4 Steps 1 and 4. The user's exclusions — height, food, and body-unit wiring — are enforced by the Scope section and restated as Global Constraints, with Task 6 Step 2.8 verifying they held.

**Placeholder scan:** No TBD/TODO. Tasks 4 and 5 describe a mechanical pattern applied to an explicit file:line list rather than quoting every edit; the list is exhaustive and was built by reading the code. The two steps easiest to get subtly wrong are called out with their failure modes: the pace division in Task 5 Step 2, and the `toKg`-before-write rule in Task 4's preamble.

**Type consistency:** Every symbol Tasks 3-5 consume is defined in Task 2's Interfaces block with its exact signature. `useUnits(userId: string | null)` tolerates the null user each page briefly has during auth load. `BodyUnit` is exported as a type and persisted, but has no conversion helpers by design — noted in Task 2 so a later reader does not mistake it for an omission. The `measurements` table is absent from the generated `Database` type, so its query needs `.from("measurements" as any)`, with the two existing precedents named.
