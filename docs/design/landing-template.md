# Landing Page Template

Source: hevyapp.com home page, read 2026-10-01 (computed styles, section order, screenshots).

We take Hevy's **layout, spacing, type scale and clean light style**. We keep the
**Dombelz brand**: logo, fonts, and the light-theme tokens from `src/styles.css` `:root`.
Do not use Hevy's copy text, screenshots, logo, or blue brand colour.

The landing page in `src/routes/index.tsx` is unchanged. Rebuilding it from this
template is a separate task.

---

## 1. Design tokens

| Token | Hevy (observed) | Dombelz template value |
|---|---|---|
| Page background | `#FFFFFF` | `--card` (white) for main sections |
| Tinted band | `#F7F9FB` / `#F3F4F7` | `--background` (`oklch(0.975 0.003 120)`) or `--muted` |
| Text | `#19191B` | `--foreground` |
| Muted body text | `#69727D` | `--muted-foreground` |
| Accent | blue `#267FE8` | `--accent`: lime `oklch(0.58 0.16 130)`, `--accent-foreground` (white) on top |
| Border | `#CCD6DF` | `--border` |
| Heading font | Inter 600 | `font-display` (Space Grotesk) |
| Body font | Inter 400, 15px | `font-sans` (Inter) |
| H1 (hero) | 64px / 600, 3 stacked lines, line 2 in accent | `text-4xl sm:text-6xl font-semibold`, same 3-line pattern |
| H2 (section) | 34px / 600 | `text-3xl sm:text-4xl font-semibold` |
| Subhead | 18px / 400 | `text-lg text-muted-foreground` |
| Checklist item | 17px, filled black check-circle icon | `text-base`, lucide `CheckCircle2` in `--foreground` |
| Container | 1140px | `max-w-6xl` |
| Section rhythm | about 500–600px per section, lots of whitespace, flat (no borders) | `py-20 lg:py-28`, flat sections |
| Buttons | 12px radius, 14px × 20px padding, 16px / 500 | `rounded-lg px-5 py-3.5 font-medium` (soft squares, not pills) |
| Review cards | light grey background, about 12px radius, no border or shadow | `bg-muted rounded-lg p-6` |

### Light-only rule

The landing page always uses the light `:root` tokens, even when the saved theme is
`dark` or a `theme-*` class. The inline script in `src/routes/__root.tsx` (line 98)
puts that class on `<html>`, so the landing page must override it. Suggested
approach: give the landing wrapper a class that re-declares the `:root` light
values. Decide the exact mechanism at build time.

---

## 2. Section blueprint (top to bottom)

### 1. Header
- Sticky glass bar, 72px tall: `bg-card/55`, `backdrop-blur-xl backdrop-saturate-150`, white hairline border, soft shadow. Soft accent, fat and warn colour blobs sit behind the hero so the glass has something to blur.
- Left: `BrandLogo` + "Dombelz".
- Centre: text nav: Features · How it works · Pricing · FAQ.
- Right: "Log in" text link and a "Start free" accent button.

### 2. Hero (2 columns)
Left column:
- 3-line stacked H1, line 2 in `--accent`. Example copy: "Log Meals / Train Smarter / Stay Consistent".
- Subhead, 1–2 lines.
- **App Store and Google Play badges** side by side, black, about 40px tall.
  **Not linked yet.** Render each as an `<img>` inside a `<div>` with
  `aria-label="Coming soon on the App Store"` (or Google Play).
- Thin divider, then a social-proof row. Use true claims only, for example
  "3,600+ Indian foods" and the free-trial note. No invented ratings or user counts.

Right column:
- Phone frame showing the real dashboard screenshot. It floats, and tilts toward the mouse (off for reduced motion).

### 3. Stats strip (in place of Hevy's "Featured on")
Hevy shows press logos. We have no press coverage, so we skip that strip. The
existing 4-stat strip takes its place as a plain white row.

### 4. Feature rows (Hevy's core pattern)
3–4 rows. Image and text swap sides on each row. Each row has:
- H2.
- 1-line subhead.
- A list of 4–6 items, each with a check-circle icon.
- A screenshot or mock on the other side.

Rows:
1. **Log food:** photo, voice, barcode, 3,600+ Indian foods.
2. **Train:** workout library, set logging and history, video tutorials.
3. **Measure progress:** weight trend, progress photos, streaks.
4. **AI coach:** weekly report, one tip per week. Not built yet: add it once a real weekly-report screenshot exists (it needs the Groq key, which is missing locally).

### 5. Tinted CTA band
Full-width `--background` band. One centred H2 ("The easiest way to stay
consistent") and the two store badges (not linked).

### 6. Reviews (hidden until real)
Centred H2, then a horizontal row of review cards (`bg-muted rounded-lg`), each with
stars, a title, the text and the reviewer's name. **Real reviews only.** Keep this section
hidden until we have real reviews, and never ship placeholder or invented reviews.

### 7. How it works
Keep the existing 3 steps (`STEPS`). Restyle them to the flat look.

### 8. Pricing
Hevy's home page has no pricing; this section is ours. Keep `PLANS` and `PLAN_FEATURES`.
Use flat cards with a 12px radius and an accent border on the popular plan.

### 9. FAQ (on a tinted band)
Hevy shows a "Need help?" block with tutorial cards. We keep the existing `FAQS`
accordion on a tinted band.

### 10. Footer (large footer)
- Top block: "Ready to get started?" and the two store badges.
- Link columns:
  - Product: Features, Pricing.
  - Company: Privacy, Terms.
  - Account: Log in, Start free.
- Bottom row: the © line.

### Hevy sections we skip
These sections don't apply to Dombelz yet:
- Apple Watch / Wear OS.
- Desktop web app.
- Guides / blog grid.
- Coach product.
- Social links.

Add each one if the matching feature or content exists later.

---

## 3. Assets

- Store badges: use the **official** artwork from Apple ("Download on the App
  Store") and Google ("Get it on Google Play"), following each company's badge
  guidelines. Store them in `public/badges/`. Do not copy Hevy's badge images.
- Feature-row visuals: real app screenshots in `public/landing/*.jpg`, captured from the demo account at a 375×586 phone viewport with the name shown as "Alex". Each row point is a button that switches the screenshot (crossfade). Rows auto-advance every 4s, pause on hover or focus, and fade up on first scroll into view.

---

## 4. Code to reuse at build time

| What | Where |
|---|---|
| `BrandLogo` | `src/components/BrandLogo.tsx` |
| `Button` | `src/components/ui/button.tsx` |
| `Accordion` and parts | `src/components/ui/accordion.tsx` |
| `PLANS`, `PLAN_FEATURES`, `PRICE_TAX_NOTE`, `monthlyRate`, `periodLabel` | `src/lib/plans.ts` |
| `BASE_TRIAL_DAYS` | `src/lib/trial.ts` |
| `FEATURES`, `STEPS`, `FAQS`, daily-ring mock, stats strip | `src/routes/index.tsx` |
