# Theme Alignment & Contrast Fix Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Remove all hardcoded purple (`#7A3E5C`) and jarring white background banner styles from `HealthLog.tsx`, replacing them with DOMBELZ design system tokens (`bg-accent`, `text-accent-foreground`, `bg-card`, `border-border`) so it dynamically and seamlessly matches whichever theme is active (Ocean cyan, Volt green, Sunset orange, Cyber, etc.) with high contrast legibility.

**Architecture:** Use CSS theme variables directly on the toggle, action buttons, and signal banner. Update the signal banner to sit on a dark `bg-card` surface with a 4px clinical status bar on the left, high-contrast colored titles (`style={{ color: inference.color }}`), and readable muted-foreground description text.

**Tech Stack:** React 19, Tailwind CSS v4, DOMBELZ Design System (`--accent`, `--accent-foreground`, `--card`, `--border`).

---

### Task 1: Update Signal Banner & Colors (`src/lib/healthVitals.ts`)

**Files:**
- Modify: `src/lib/healthVitals.ts`

**Step 1: Replace hardcoded light-mode background classes with theme-adaptive classes**
- Remove all `bg-red-50`, `bg-amber-50`, `bg-yellow-50`, `bg-emerald-50`, `bg-blue-50`.
- In `VitalsInference`, specify subtle translucent badges or surface styling:
  - `bgClass: "bg-card border-border"` with subtle ambient color or clean card background.
  - High-contrast text colors for category titles: `#2E7D32` (Optimal/Normal), `#F9A825` (High-Normal/Prediabetes), `#EF6C00` (Grade 1/Diabetes), `#E53935` (Grade 2/Grade 3/Hyperglycaemia), `#1E88E5` (Hypotension/Hypoglycaemia).

**Step 2: Run test suite**
Run: `node src/lib/healthVitals.test.mjs`
Expected: PASS

---

### Task 2: Align `HealthLog.tsx` with DOMBELZ Active Theme

**Files:**
- Modify: `src/components/HealthLog.tsx`

**Step 1: Replace Purple with DOMBELZ Accent**
- **Segmented Toggle**:
  - Active button: `border-accent bg-accent text-accent-foreground shadow-sm font-semibold`
  - Inactive button: `text-muted-foreground hover:text-foreground`
- **Log Reading Button**:
  - Primary button: `h-13 w-full rounded-xl bg-accent text-accent-foreground font-bold hover:bg-accent/90 disabled:opacity-40 transition-all text-base glow-accent-sm`
- **Signal Banner**:
  - Container: `relative overflow-hidden rounded-xl border border-border bg-card p-4 transition-all duration-300`
  - 4px left color bar: `style={{ backgroundColor: debouncedInference ? debouncedInference.color : "#757575" }}`
  - Title: Bold font-display rendered in its clinical color (`style={{ color: debouncedInference.color }}`) for razor-sharp legibility against dark surfaces.
  - Explanation: `text-xs sm:text-sm text-muted-foreground leading-relaxed`.
- **View History Link**:
  - Styled with `text-accent hover:text-accent/80 font-medium`.

**Step 2: Lint and Build Verification**
Run: `npx eslint src/components/HealthLog.tsx src/lib/healthVitals.ts`
Run: `npm run build`

---

## Verification Plan

### Automated Verification
1. `node src/lib/healthVitals.test.mjs` (All 18 clinical tests pass)
2. `npx eslint src/components/HealthLog.tsx src/lib/healthVitals.ts` (0 errors)
3. `npm run build` (Clean build for client and SSR)

### Manual Verification
1. Open Health Log screen in the app.
2. Verify active toggle and "Log Reading" button match the user's active theme (Cyan / Accent) instead of purple.
3. Verify Signal Banner has a clean dark background matching the card with vivid, razor-sharp colored titles and easily readable explanation text.
