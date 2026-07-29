# NutriTrack — Setup Guide

## Prerequisites

- Node.js ≥ 18
- A [Supabase](https://supabase.com) project
- A [Groq](https://console.groq.com) API key (for AI food search)

---

## 1. Clone & Install

```bash
git clone <repo-url>
cd nutritrack
npm install
```

---

## 2. Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables (see `.env.example` for all):

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `GROQ_API_KEY` | Groq API key for AI food search |

---

## 3. Supabase Setup

### Database Schema

Run the migrations in order from `supabase/migrations/`:

```
20260517071940_517b1140-...sql        → core tables (user_profiles, food_logs)
20260602_new_features.sql              → water_logs, weight_entries, workout_plans, workout_logs
20260708_add_leaderboard_rpc.sql       → get_leaderboard_stats() function
20260708_add_onboarding_fields.sql     → whatsapp_no, supplements_used columns
20260708_add_saved_meals_and_streaks.sql → saved_meals table, streak columns
20260708_add_saved_meals_rls.sql       → RLS for saved_meals
20260729152300_add_storage_rls.sql     → Storage RLS policies for weight-photos
20260729170000_fix_storage_select.sql  → no-op (duplicate guard)
20260729_fix_goal_values.sql           → goal value remapping + macro backfill
20260729190000_sync_from_db.sql        → get_leaderboard_stats(date) overload
20260729190001_rename_rls_policies.sql → RLS policy name alignment
```

Either paste them into the Supabase SQL Editor in order, or use the CLI:

```bash
supabase db push
```

### Storage Bucket

Create a public bucket named **`weight-photos`** in Supabase Dashboard → Storage → New bucket.
_(Cannot be done via SQL migration — must be done once manually.)_

The RLS policies for this bucket are already in `20260729152300_add_storage_rls.sql`.

---

## 4. Run Locally

```bash
npm run dev
```

App runs at `http://localhost:3000`.

---

## 5. Deploy to Vercel

The project uses TanStack Start with the Vercel preset (`preset: "vercel"` in `vite.config.ts`).

```bash
npm run build   # produces dist/ ready for Vercel
```

Push to GitHub and connect to Vercel, or use the Vercel CLI:

```bash
npx vercel deploy
```

No special build commands needed — Vercel picks up `npm run build` automatically via the preset.

---

## 6. Key Libraries

| Package | Purpose |
|---------|---------|
| `@tanstack/react-start` | Full-stack SSR framework |
| `@supabase/supabase-js` | Database + Auth + Storage |
| `recharts` | Charts on dashboard |
| `@zxing/browser` + `@zxing/library` | Barcode scanning |
| `react-webcam` | Camera capture for food/weight photos |
| `sonner` | Toast notifications |
| `lucide-react` | Icons |
| `date-fns` | Date utilities |
| `tailwindcss` | Styling |
| `shadcn/ui` (partial) | UI primitives (14 components kept) |
