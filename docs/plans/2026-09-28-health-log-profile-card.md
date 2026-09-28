# Health Log (Hypertension & Diabetes) Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Create a new "Health Log" card on the Profile tab (matching the existing 2-column menu grid in Image 2) that opens a dedicated health logging screen matching the exact reference UI in Image 1 for Blood Pressure (Hypertension) and Blood Glucose (Diabetes) with real-time Indian clinical guidance (InSH 2023).

**Architecture:** A sub-page (`/profile?page=health-log`) opened from a new card in the Profile 2-column menu grid. A pure clinical evaluation engine (`src/lib/healthVitals.ts`) tested via Node ESM drives real-time validation and classification. The UI matches Image 1 with a pill segmented toggle, styled inputs with embedded units, a dynamic left-bordered signal banner, "Log Reading" action, 1.5s toast, and a "View History" bottom sheet.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Lucide React, Vaul (Drawer), Sonner, Supabase (with client-side offline fallback), Node.js `node:assert/strict`.

---

## Visual Reference & Placement Breakdown

1. **Card Placement on Profile (Image 2 Reference):**
   - **Where:** In the Profile tab (`src/routes/profile.tsx`), in the 2-column menu grid alongside `Plan & billing`, `Theme`, `Pricing`, `Settings`, `Body measurements`, etc. (This is client UI, not Supabase).
   - **Card Appearance:** Exactly matches the other cards in Image 2:
     - Rounded-2xl container (`bg-card`, border, card-lift hover)
     - Icon at top-left: Vitals glyph (Heart with Droplet badge or Activity pulse)
     - Title at bottom: **"Health Log"**
     - Chevron arrow `>` on the right.
   - **Action:** Tapping it navigates to the Health Log screen (`page === "health-log"`).

2. **Logging Page Design (Image 1 Reference):**
   - **Top Toggle:** Pill segmented control `[ Hypertension | Diabetes ]`.
     - Active segment: filled pill background (brand plum/primary), white text.
     - Inactive segment: transparent with muted text.
   - **Form Card:**
     - Hypertension: "Systolic" and "Diastolic" inputs with soft embedded unit label `"mmHg"`.
     - Diabetes: "Blood Glucose" input with soft embedded unit label `"mg/dL"`.
   - **Signal Banner (debounced 300ms):**
     - Tinted background matching status color.
     - 4px solid colored vertical indicator bar on the left edge.
     - Bold category title (e.g. **Grade 1 Hypertension**, **Normal**, **Prediabetes**).
     - Regular 13-14pt clinical explanation/recommendation text.
     - Pulsing effect on Grade 3 Hypertension and Severe/Extreme Hyperglycaemia.
   - **Action & History:**
     - "Log Reading" primary filled button (disabled when input is invalid).
     - "View History" centered subtle text link opening minimal Vaul bottom sheet with last 7 readings & colored status dots.
     - Auto-dismissing green toast: `"Logged (auto-dismiss 1.5s)"`.

---

### Task 1: Clinical Domain Logic & Validator (`src/lib/healthVitals.ts`)

**Files:**
- Create: `src/lib/healthVitals.ts`
- Test: `src/lib/healthVitals.test.mjs`

**Step 1: Write the failing test**

Create `src/lib/healthVitals.test.mjs` verifying:
- InSH 2023 BP classifications:
  - Low BP / Hypotension (<90 sys or <60 dia) -> Blue `#1565C0`
  - Optimal (<120 sys and <80 dia) -> Green `#2E7D32`
  - Normal (120–129 sys and 80–84 dia) -> Green `#2E7D32`
  - High-Normal (130–139 sys or 85–89 dia) -> Amber `#F9A825`
  - Grade 1 Hypertension (140–159 sys or 90–99 dia) -> Orange `#EF6C00`
  - Grade 2 Hypertension (160–179 sys or 100–109 dia) -> Red `#C62828`
  - Grade 3 Hypertension (≥180 sys or ≥110 dia) -> Red `#C62828` (pulse)
  - Higher category priority rule: 130/90 -> Grade 1 because diastolic 90 is Grade 1
- Hypertension validation limits:
  - Systolic 50–280, Diastolic 30–180
  - Cross-validation: `systolic > diastolic`
- Diabetes diagnostic thresholds (mg/dL):
  - 50–69: Hypoglycaemia (Low) -> Blue
  - 70–99: Normal -> Green
  - 100–125: Prediabetes -> Amber
  - 126–199: Diabetes -> Orange
  - 200–399: High Hyperglycaemia -> Red
  - 400–1799: Severe Hyperglycaemia -> Red (pulse)
  - 1800: Extreme (Capped) -> Red (pulse)
  - < 50: Blocked
  - > 1800: Capped to 1800

**Step 2: Run test to verify it fails**

Run: `node src/lib/healthVitals.test.mjs`
Expected: FAIL

**Step 3: Implement `src/lib/healthVitals.ts`**

Export:
- `evaluateHypertension(sys, dia)`
- `evaluateDiabetes(glucose)`
- `sanitizeNumericInput(raw)`
- Color constants, types, and guidance strings.

**Step 4: Run test to verify it passes**

Run: `node src/lib/healthVitals.test.mjs`
Expected: PASS (all tests pass)

**Step 5: Commit**

```bash
git add src/lib/healthVitals.ts src/lib/healthVitals.test.mjs
git commit -m "feat(health): add clinical rules engine and tests"
```

---

### Task 2: Supabase Schema & Database Types

**Files:**
- Create: `supabase/migrations/20260928170000_health_logs.sql`
- Modify: `src/integrations/types.ts`

**Step 1: Write migration SQL**

Create `public.health_logs`:
- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `condition text not null check (condition in ('hypertension', 'diabetes'))`
- `systolic integer check (systolic is null or (systolic >= 50 and systolic <= 280))`
- `diastolic integer check (diastolic is null or (diastolic >= 30 and diastolic <= 180))`
- `glucose integer check (glucose is null or (glucose >= 50 and glucose <= 1800))`
- `logged_at timestamptz not null default now()`
- `created_at timestamptz not null default now()`
- RLS policies for authenticated owners.
- Index on `(user_id, logged_at desc)`.

**Step 2: Update `src/integrations/types.ts`**

Add `health_logs` table types.

**Step 3: Commit**

```bash
git add supabase/migrations/20260928170000_health_logs.sql src/integrations/types.ts
git commit -m "feat(db): add health_logs schema migration and types"
```

---

### Task 3: Health Log Component (`src/components/HealthLog.tsx`)

**Files:**
- Create: `src/components/HealthLog.tsx`

**Step 1: Implement Component matching Image 1 Reference**
- SubHeader with back navigation and title "Health Log".
- Segmented toggle at top:
  - Pill shape, `aria-pressed`, active filled segment, smooth slide transition.
  - Remembers condition in `localStorage`. Discards unsaved draft on condition switch.
- Condition Forms:
  - Hypertension: "Systolic" & "Diastolic" inputs with embedded `"mmHg"` labels.
  - Diabetes: "Blood Glucose" input with embedded `"mg/dL"` label.
  - Micro-text inline errors (amber border for `diastolic >= systolic`, red for out of bounds).
- Real-Time Signal Banner:
  - Debounced 300ms.
  - Exact Image 1 styling: 4px left color bar, tinted background, bold category name, muted clinical advice.
  - Pulse animation on Grade 3 & Severe/Extreme.
  - Haptics (`navigator.vibrate?.(15)`) on category change.
  - Empty state when incomplete.
- Action & Feedback:
  - "Log Reading" button. Saves to Supabase (with localStorage fallback).
  - Clears inputs.
  - Displays green toast: `"Logged (auto-dismiss 1.5s)"`.
- History Drawer:
  - "View History" link.
  - Vaul drawer showing last 7 readings with color dots, dates, and values.

**Step 2: Commit**

```bash
git add src/components/HealthLog.tsx
git commit -m "feat(ui): add HealthLog component matching reference design"
```

---

### Task 4: Profile Page Card Integration (`src/routes/profile.tsx`)

**Files:**
- Modify: `src/routes/profile.tsx`

**Step 1: Add Health Log Card to Profile Menu Grid**
- Add `"health-log"` to `type Page`.
- Add combined vitals icon (Heart + Droplet badge).
- Add `{ id: "health-log", label: "Health Log", icon: <VitalsIcon ... /> }` into `MENU_ITEMS` (positioned logically next to `measurements`).
- Render `<HealthLogPage userId={user.id} onBack={goBack} />` when `page === "health-log"`.

**Step 2: Verify Lint and Typecheck**

Run: `npx tsc --noEmit`
Run: `npm run lint`

**Step 3: Commit**

```bash
git add src/routes/profile.tsx
git commit -m "feat(profile): add Health Log card to 2-column menu grid"
```

---

## Verification Plan

### Automated Verification
1. `node src/lib/healthVitals.test.mjs` (All clinical cases pass)
2. `npx tsc --noEmit` (0 type errors)
3. `npm run lint` (0 lint errors)

### Manual / Browser Verification
1. Open Profile tab -> observe the new "Health Log" card in the 2-column grid alongside other cards with matching border, font, icon, and chevron.
2. Tap "Health Log" card -> opens the logging screen matching Image 1.
3. Verify toggle switches between "Hypertension" and "Diabetes".
4. Enter `130` / `90` -> verify signal banner matches Image 1: orange left bar, tinted background, "Grade 1 Hypertension".
5. Tap "Log Reading" -> verify green toast `"Logged (auto-dismiss 1.5s)"` appears and inputs reset.
6. Tap "View History" -> verify bottom sheet opens displaying recent readings.
