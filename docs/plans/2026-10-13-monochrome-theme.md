# Monochrome Theme Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Add a clean, OLED pitch-black and stark-white theme (`theme-mono`) across Dombelz without retro font distortions.

**Architecture:** Pure CSS custom properties reskin applied via `.theme-mono` class on `document.documentElement`. Registered in client theme store, SSR head hydration script, Profile theme settings, and Supabase database check constraint.

**Tech Stack:** React 19, Tailwind CSS v4 / OKLCH CSS variables, TanStack Router, Supabase PostgreSQL, Lucide React.

---

### Task 1: Add `:root.theme-mono` CSS Variables in `src/styles.css`

**Files:**
- Modify: `src/styles.css:215-217`

**Step 1: Write CSS variables for theme-mono**

Add `:root.theme-mono` block right before `:root.theme-cyberdeck` in `src/styles.css`:

```css
:root.theme-mono {
  --background: oklch(0 0 0);
  --foreground: oklch(0.98 0 0);
  --card: oklch(0.1 0 0);
  --card-foreground: oklch(0.98 0 0);
  --popover: oklch(0.1 0 0);
  --popover-foreground: oklch(0.98 0 0);
  --primary: oklch(0.98 0 0);
  --primary-foreground: oklch(0 0 0);
  --secondary: oklch(0.18 0 0);
  --secondary-foreground: oklch(0.98 0 0);
  --muted: oklch(0.15 0 0);
  --muted-foreground: oklch(0.65 0 0);
  --accent: oklch(0.98 0 0);
  --accent-foreground: oklch(0 0 0);
  --destructive: oklch(0.65 0.22 25);
  --destructive-foreground: oklch(0.98 0 0);
  --border: oklch(0.24 0 0);
  --input: oklch(0.24 0 0);
  --ring: oklch(0.98 0 0);
  --energy: oklch(0.98 0 0);
  --warn: oklch(0.85 0 0);
  --fat: oklch(0.65 0 0);
  --macro-protein: oklch(0.95 0 0);
  --macro-carbs: oklch(0.75 0 0);
  --macro-fat: oklch(0.55 0 0);
  --macro-fiber: oklch(0.4 0 0);
}
```

**Step 2: Verify CSS syntax**

Run: `git diff src/styles.css`  
Expected: Clean addition of `:root.theme-mono` block.

**Step 3: Commit**

```bash
git add src/styles.css
git commit -m "style: define oklch tokens for theme-mono"
```

---

### Task 2: Register Theme in `src/lib/theme.ts` and `src/routes/__root.tsx`

**Files:**
- Modify: `src/lib/theme.ts:5-34`
- Modify: `src/routes/__root.tsx:28`

**Step 1: Update `src/lib/theme.ts`**

Add `"theme-mono"` to `THEMES` list and `ICON_FILL` dictionary:

```ts
export const THEMES = [
  "dark",
  "light",
  "theme-ocean",
  "theme-sunset",
  "theme-forest",
  "theme-cyber",
  "theme-cyberdeck",
  "theme-isro",
  "theme-mono",
];

const ICON_FILL: Record<string, string> = {
  "theme-ocean": "oklch(0.78 0.14 200)",
  "theme-sunset": "oklch(0.72 0.19 45)",
  "theme-forest": "oklch(0.76 0.16 145)",
  "theme-cyber": "oklch(1 0 0)",
  "theme-cyberdeck": "oklch(0.85 0.19 210)",
  "theme-isro": "oklch(0.68 0.22 42)",
  "theme-mono": "oklch(0.98 0 0)",
};
```

**Step 2: Update `src/routes/__root.tsx` head boot script**

In the inline script string inside `src/routes/__root.tsx`, update valid list `v` and class removal:
- Add `'theme-mono'` to `v` array: `['dark','light','theme-ocean','theme-sunset','theme-forest','theme-cyber','theme-cyberdeck','theme-isro','theme-mono']`
- Add `'theme-mono'` to `c.remove(...)`.

**Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`  
Expected: 0 type errors.

**Step 4: Commit**

```bash
git add src/lib/theme.ts src/routes/__root.tsx
git commit -m "feat(theme): register theme-mono in theme list and boot script"
```

---

### Task 3: Add Monochrome Selection Option to `src/routes/profile.tsx`

**Files:**
- Modify: `src/routes/profile.tsx:700-745`

**Step 1: Import `Contrast` icon in `src/routes/profile.tsx`**

Ensure `Contrast` is imported from `lucide-react`:
```tsx
import { Contrast, ... } from "lucide-react";
```

**Step 2: Add Monochrome to the theme list in Theme Subpage**

Add option item to the theme mapping list:
```tsx
{
  id: "theme-mono",
  label: "Monochrome (B&W)",
  icon: <Contrast className="h-5 w-5 text-white" />,
},
```

**Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`  
Expected: 0 type errors.

**Step 4: Commit**

```bash
git add src/routes/profile.tsx
git commit -m "feat(profile): add Monochrome option to theme selector"
```

---

### Task 4: Create Supabase DB Migration for Theme Check Constraint

**Files:**
- Create: `supabase/migrations/20261013190000_theme_mono.sql`

**Step 1: Write migration SQL**

```sql
-- Update theme check constraint on public.user_profiles to allow 'theme-mono'

alter table public.user_profiles
  drop constraint if exists user_profiles_theme_check;

alter table public.user_profiles
  add constraint user_profiles_theme_check
    check (theme in ('dark','light','theme-ocean','theme-sunset','theme-forest',
                     'theme-cyber','theme-cyberdeck','theme-isro','theme-mono'));
```

**Step 2: Commit**

```bash
git add supabase/migrations/20261013190000_theme_mono.sql
git commit -m "chore(db): update user_profiles theme check constraint for theme-mono"
```

---

### Task 5: Verification & Build Check

**Files:**
- None (verification run)

**Step 1: Run typecheck and production build**

Run: `npm run build`  
Expected: Vite build succeeds with exit code 0.

**Step 2: Verify git status and clean diff**

Run: `git status`  
Expected: Working tree clean, all commits recorded.
