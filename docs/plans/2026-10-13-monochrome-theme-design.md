# Monochrome (Full Black & White) Theme Design

**Status:** Proposed  
**Date:** 2026-10-13  
**Theme ID:** `theme-mono`  
**Label:** Monochrome  

---

## 1. Goal & Aesthetic

Provide a clean, modern, high-contrast, pure black-and-white theme (`theme-mono`) across the entire Dombelz application.

Unlike `theme-cyber` (which imposes a 1980s retro CRT pixel font `VT323` and 0px boxy borders), `theme-mono` retains the modern typography, refined border-radii, and subtle gradients of Dombelz, stripping all color chroma down to pure grayscale and true OLED black.

---

## 2. Token Palette (`oklch`)

All tokens have chroma = 0:

- `--background`: `oklch(0 0 0)` (True pitch black `#000000`)
- `--foreground`: `oklch(0.98 0 0)` (Crisp white `#FAFAFA`)
- `--card`: `oklch(0.10 0 0)` (Matte charcoal surface `#141414`)
- `--card-foreground`: `oklch(0.98 0 0)`
- `--popover`: `oklch(0.10 0 0)`
- `--popover-foreground`: `oklch(0.98 0 0)`
- `--primary`: `oklch(0.98 0 0)` (Pure white interactive pill)
- `--primary-foreground`: `oklch(0 0 0)` (Deep black text)
- `--secondary`: `oklch(0.18 0 0)`
- `--secondary-foreground`: `oklch(0.98 0 0)`
- `--muted`: `oklch(0.15 0 0)`
- `--muted-foreground`: `oklch(0.65 0 0)` (Medium silver)
- `--accent`: `oklch(0.98 0 0)`
- `--accent-foreground`: `oklch(0 0 0)`
- `--destructive`: `oklch(0.65 0.22 25)` (Retained red safety for destructive prompts)
- `--destructive-foreground`: `oklch(0.98 0 0)`
- `--border`: `oklch(0.24 0 0)` (Subtle graphite divider)
- `--input`: `oklch(0.24 0 0)`
- `--ring`: `oklch(0.98 0 0)`
- `--energy`: `oklch(0.98 0 0)`
- `--warn`: `oklch(0.85 0 0)`
- `--fat`: `oklch(0.65 0 0)`
- `--macro-protein`: `oklch(0.95 0 0)`
- `--macro-carbs`: `oklch(0.75 0 0)`
- `--macro-fat`: `oklch(0.55 0 0)`
- `--macro-fiber`: `oklch(0.40 0 0)`

---

## 3. Architecture & Files Touched

1. `src/styles.css`: Add `:root.theme-mono` with all CSS variables.
2. `src/lib/theme.ts`:
   - Append `"theme-mono"` to `THEMES` array.
   - Add `"theme-mono": "oklch(0.98 0 0)"` to `ICON_FILL`.
3. `src/routes/__root.tsx`:
   - Add `'theme-mono'` to inline head script array `v` and class removal list.
4. `src/routes/profile.tsx`:
   - Import `Contrast` icon from `lucide-react`.
   - Add `theme-mono` entry to Appearance selection list in Theme page.
5. `supabase/migrations/20261013190000_theme_mono.sql`:
   - Update `user_profiles.theme` check constraint to include `'theme-mono'`.

---

## 4. Verification Plan

1. Lint & TypeScript typecheck: `npm run lint` / `npx tsc --noEmit`.
2. Browser/Vite check: Theme switcher in Profile displays Monochrome option, switches active root class to `.theme-mono`, applies pitch-black OLED background, updates favicon, persists in `localStorage` and Supabase.
