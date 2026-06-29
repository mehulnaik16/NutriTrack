# NutriTrack — Project Structure

> A full-stack fitness & nutrition tracking web app built with **TanStack Start** (React SSR framework), **Supabase** (database + auth), and **Groq AI** (LLM features). Styled with **TailwindCSS v4** and **shadcn/ui** component library.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Root-Level Files](#root-level-files)
4. [Directory Structure](#directory-structure)
5. [Source Code (`src/`)](#source-code-src)
   - [Entry Points](#entry-points)
   - [Routes (Pages)](#routes-pages)
   - [Components](#components)
   - [Library Utilities (`lib/`)](#library-utilities-lib)
   - [Supabase Integration (`integrations/`)](#supabase-integration-integrations)
   - [Static Data (`data/`)](#static-data-data)
   - [Styles](#styles)
6. [Supabase Backend](#supabase-backend)
7. [Data & Reference Files](#data--reference-files)
8. [Scripts](#scripts)
9. [Database Schema](#database-schema)
10. [Key Features & How They Work](#key-features--how-they-work)

---

## Project Overview

NutriTrack is a mobile-first web application that helps users:
- Log daily food intake with calorie & macro tracking
- Generate personalised AI workout plans (via Groq / LLaMA 3)
- Track body weight over time with photo progress
- Monitor water intake streaks
- View AI-generated weekly fitness reports

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [TanStack Start](https://tanstack.com/start) — React SSR / file-based routing |
| UI Components | [shadcn/ui](https://ui.shadcn.com/) (Radix UI primitives) + Lucide icons |
| Styling | TailwindCSS v4 |
| Database & Auth | [Supabase](https://supabase.com/) (PostgreSQL + Row-Level Security) |
| AI / LLM | [Groq API](https://groq.com/) — LLaMA 3.3 70B, LLaMA 4 Scout (vision), Whisper (speech) |
| Charts | [Recharts](https://recharts.org/) |
| Forms | react-hook-form + Zod |
| QR / Barcode | @zxing/browser + jsqr |
| Deployment | Vercel (via `@cloudflare/vite-plugin` / Nitro) |
| Node version | ≥ 18 (see `.nvmrc`) |

---

## Root-Level Files

```
NutriTrack/
├── package.json               ← NPM metadata, scripts, all dependencies
├── package-lock.json          ← Exact locked dependency tree (auto-generated)
├── tsconfig.json              ← TypeScript compiler configuration
├── vite.config.ts             ← Vite bundler configuration
├── eslint.config.js           ← ESLint linting rules
├── prettierrc                 ← Prettier code formatter config
├── prettierignore             ← Files/dirs excluded from Prettier
├── components.json            ← shadcn/ui component registry config (paths, aliases)
├── .env.example               ← Template showing required environment variables
├── .nvmrc                     ← Node version specifier (for nvm users)
├── .gitignore                 ← Git ignore rules
├── SETUP.md                   ← Developer setup / onboarding guide
├── PROJECT_STRUCTURE.md       ← This file
├── project.zip                ← Archived snapshot of the project (not in active use)
│
│── convert_indb_to_ifct.js    ← One-off data migration script (see below)
├── read_excel_headers.js      ← Utility script to inspect Excel column names
├── test_search.js             ← CLI script to test food search logic locally
```

### Key Root Files Explained

#### `package.json`
Defines the project name, Node engine requirement (`>=18`), and all npm scripts:
- `npm run dev` — starts the Vite development server with HMR
- `npm run build` — bundles the production app; automatically runs `postbuild` (Vercel prep)
- `npm run preview` — serves the production build locally for testing
- `npm run lint` — runs ESLint across the entire codebase
- `npm run format` — auto-formats all files with Prettier

#### `vite.config.ts`
Configures the Vite bundler used by TanStack Start. Enables the TanStack router plugin (which auto-generates `routeTree.gen.ts`), TailwindCSS v4 via its Vite plugin, and TypeScript path aliases (`@/` maps to `src/`).

#### `tsconfig.json`
TypeScript configuration. Sets strict mode, enables ESNext module resolution, and configures the `@/` path alias.

#### `components.json`
Used by the `shadcn` CLI to know where to install UI components (`src/components/ui/`), which CSS variable style to use, and what TypeScript path alias to use (`@/`).

#### `.env.example`
Documents the required environment variables. **Copy this to `.env` and fill in your values before running the app.** Required variables:
- `VITE_SUPABASE_URL` — your Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase anon/public key
- `VITE_GROQ_KEY_1` (up to `VITE_GROQ_KEY_20`) — Groq API keys for AI features

---

## Directory Structure

```
NutriTrack/
├── src/                    ← All application source code
│   ├── routes/             ← Page components (file-based routing)
│   ├── components/         ← Reusable UI components
│   │   └── ui/             ← shadcn/ui primitive components
│   ├── lib/                ← Utility functions and service clients
│   ├── integrations/       ← Supabase client, types, middleware
│   ├── data/               ← Static JSON data (food database)
│   ├── router.tsx          ← App router factory
│   ├── start.ts            ← TanStack Start server entry (request middleware)
│   ├── server.ts           ← Cloudflare Worker / Vercel edge handler
│   ├── routeTree.gen.ts    ← Auto-generated route tree (DO NOT edit manually)
│   └── styles.css          ← Global CSS + Tailwind + theme variables
│
├── supabase/               ← Supabase local config and DB migrations
│   ├── config.toml         ← Supabase CLI configuration
│   └── migrations/         ← SQL migration files
│
├── data/                   ← Reference/source data files (not shipped to browser)
│   ├── Anuvaad_INDB_2024.11.xlsx   ← Indian National Database Excel source
│   ├── IFCT2017.pdf                ← Indian Food Composition Tables 2017 (reference)
│   └── 11Compendium*.pdf           ← Physical activity compendium (reference)
│
├── scripts/                ← Build and deployment helper scripts
│   └── vercel-prepare.mjs  ← Post-build script for Vercel deployment
│
├── dist/                   ← Build output (auto-generated, not committed)
└── node_modules/           ← Installed dependencies (auto-generated, not committed)
```

---

## Source Code (`src/`)

### Entry Points

#### `src/start.ts`
**Purpose:** The TanStack Start server bootstrap file. Creates the server instance with global error-handling middleware. If any unhandled exception escapes a route handler, it catches it and returns a styled 500 error HTML page instead of a raw crash.

#### `src/server.ts`
**Purpose:** The Cloudflare Worker / Vercel edge runtime handler. This is what runs on the server in production. It:
1. Lazily loads the TanStack Start server entry
2. Passes all HTTP requests to it
3. Intercepts catastrophic SSR errors that h3 (the underlying HTTP layer) may swallow silently and replaces them with a branded error page.

#### `src/router.tsx`
**Purpose:** Factory function that creates the TanStack Router instance. Creates a `QueryClient` (for React Query server-side data fetching), wires it into the router context so all routes can access it, and enables scroll restoration between navigations.

#### `src/routeTree.gen.ts`
**Purpose:** **Auto-generated file — do not edit.** The TanStack Router Vite plugin scans the `src/routes/` folder and generates this file automatically. It contains the complete type-safe route tree used by the router.

---

### Routes (Pages)

Every file in `src/routes/` is a page. TanStack Start uses **file-based routing** — the filename becomes the URL path.

#### `src/routes/__root.tsx`
**URL:** (wraps all routes)
**Purpose:** The root layout component that wraps every page. It:
- Sets the HTML `<head>` metadata (title: "FitTrack — Fitness & Nutrition", viewport, charset)
- Injects a theme-detection script in `<head>` so the correct theme loads before paint (prevents flash of wrong theme)
- Provides `QueryClientProvider` (React Query) and `AuthProvider` (auth state) to the entire app
- Renders the `BottomNav` (mobile navigation bar) globally
- Renders the `Toaster` (global toast notifications)
- Defines a 404 `NotFoundComponent`

#### `src/routes/index.tsx`
**URL:** `/`
**Purpose:** The root redirect. Immediately redirects unauthenticated users to `/login` and authenticated users to `/dashboard`. Acts as a smart landing gate.

#### `src/routes/login.tsx`
**URL:** `/login`
**Purpose:** The authentication page. Provides:
- Email + password login via Supabase Auth
- Links to the signup quiz and password reset
- Redirects to `/dashboard` on successful login

#### `src/routes/quiz.tsx`
**URL:** `/quiz`
**Purpose:** The multi-step onboarding quiz for new users. 5 steps:
1. **Personal info** — name, email, password, age, gender
2. **Body metrics** — height, weight (live BMI preview)
3. **Activity level** — with live BMR & TDEE calculation
4. **Goal** — Lose Weight / Maintain Weight / Gain Muscle (live calorie target preview)
5. **Review & confirm** — summary of all inputs

On submit: creates a Supabase Auth user, then upserts a `user_profiles` row with all calculated metrics (BMI, BMR, TDEE, daily calorie target, macro targets). Redirects to `/plans`.

#### `src/routes/plans.tsx`
**URL:** `/plans`
**Purpose:** Subscription/plan selection page shown after signup. Lets users pick a plan tier. Designed as the post-onboarding step before reaching the dashboard.

#### `src/routes/dashboard.tsx`
**URL:** `/dashboard`
**Purpose:** The main home screen and the most feature-rich page. Contains:
- **Daily Overview card** — calorie donut ring, macro progress bars (Protein, Carbs, Fat), date navigator (browse past days)
- **Food logging** — embedded `FoodSearch` component + meal-grouped log list with delete
- **Water tracker** — embedded `WaterStreak` component
- **Workout preview** — shows today's first workout day from the AI plan; link to full workout page
- **Quick weight log** — weight input with optional photo upload to Supabase Storage
- **AI Weekly Report** — embedded `WeeklyReport` component
- **30-day Nutrition trend chart** — Recharts line chart, switchable between calories/protein/carbs/fat
- **Weight trend chart** — Recharts line chart with goal weight reference line
- **Logging streak** — computed from food log history

#### `src/routes/food.tsx`
**URL:** `/food`
**Purpose:** Dedicated full-page food logging interface. Contains the `FoodSearch` component and a date-navigable food log grouped by meal type (Breakfast, Lunch, Dinner, Snack). Effectively a focused version of the food section found on the dashboard.

#### `src/routes/workout.tsx`
**URL:** `/workout`
**Purpose:** The AI-powered workout planner. Features:
- **Generate/Regenerate plan button** — calls Groq (LLaMA 3.3 70B) to create a personalised multi-day workout plan based on goal, weight, and activity level
- **Workout plan view** — day tabs, exercise cards with sets/reps/rest, tips, YouTube video embed, and alternative exercise swap
- **Exercise done toggle** — mark exercises complete; shows live % progress and estimated calories burned
- **Log workout button** — saves completed workout to `workout_logs` table
- **Quick workout mode** — log common cardio activities (running, cycling, etc.) by duration with estimated calories
- Falls back to a built-in sample plan if Groq is unavailable
- Saves plans to `workout_plans` table in Supabase

#### `src/routes/weight.tsx`
**URL:** `/weight`
**Purpose:** Dedicated weight tracking page. Features:
- Summary cards (current weight, total change, distance to goal)
- AI motivation message (via Groq, personalised to user's progress)
- Weight logging form with optional note and progress photo upload
- Goal weight setting
- Progress chart (Recharts line chart with goal weight reference line)
- Photo comparison slider (side-by-side before/after photos)
- Entry history list (last 20 entries, colour-coded by trend)

#### `src/routes/profile.tsx`
**URL:** `/profile`
**Purpose:** User settings and profile management. Features:
- **Appearance section** — theme switcher with 5 themes: Light, Dark, Ocean, Sunset, Forest (persisted to `localStorage`)
- **Account section** — view/edit name, email, User ID, plan info
- **Metrics section** — view/edit age, gender, height, weight, activity level, goal; automatically recalculates BMI, BMR, TDEE, calorie target, and macros on save

#### `src/routes/reset-password.tsx`
**URL:** `/reset-password`
**Purpose:** Password reset page. Handles the Supabase magic link flow — user arrives here from a reset email, enters a new password, and it's updated via `supabase.auth.updateUser`.

---

### Components

#### `src/components/BottomNav.tsx`
**Purpose:** Fixed mobile navigation bar at the bottom of the screen (hidden on desktop via `md:hidden`). Shows 4 nav items: Home (Dashboard), Food, Workout, Weight. Only renders when the user is authenticated. Active route is highlighted with the accent colour via TanStack Router's `[&.active]` CSS class.

#### `src/components/Header.tsx`
**Purpose:** Sticky top navigation bar. Shows:
- App logo ("FitTrack") linking to dashboard
- Desktop nav links (Dashboard, Food, Workout, Weight) — hidden on mobile (handled by BottomNav)
- User's first name + today's date (desktop only)
- Profile icon button → navigates to `/profile`
- Logout button → signs out via Supabase and redirects to `/login`
Only shows nav/logout when user is authenticated.

#### `src/components/FoodSearch.tsx`
**Purpose:** The core food logging component — the most complex in the project. Features:
- **Text search** — fuzzy/keyword search against the local IFCT 2017 JSON database (~12,000 Indian foods)
- **AI food description** — type a meal description in natural language; Groq (LLaMA 3.3 70B) parses it into structured nutritional data
- **Barcode/QR scanner** — uses device camera (@zxing/browser) to scan product barcodes; looks up the product
- **Photo scan** — takes a photo of food; Groq Vision (LLaMA 4 Scout) identifies the food and estimates calories/macros
- **Voice input** — records audio via the browser microphone; Groq Whisper transcribes it to text then processes as AI food description
- Allows selecting meal type (Breakfast/Lunch/Dinner/Snack) and quantity (grams)
- Logs entries to Supabase `food_logs` table
- Accepts `userId`, `date`, and `onLogged` callback as props

#### `src/components/WaterStreak.tsx`
**Purpose:** Water intake tracker widget. Shows:
- Daily water goal progress with an animated fill bar
- Quick-add buttons (+250ml, +500ml, +750ml, Custom)
- Current intake in ml
- Logging streak badge (consecutive days of logging)
Reads/writes to Supabase `water_logs` table. Accepts `userId` and `streak` (food log streak) as props.

#### `src/components/WeeklyReport.tsx`
**Purpose:** AI-generated weekly fitness summary card. On Sundays, auto-loads. Has a "Generate" button at any time. Fetches the past 7 days of food logs, workout logs, and weight entries from Supabase, computes aggregated stats (avg calories, days logged, workout days, weight change), then calls Groq (LLaMA 3.3 70B) with a detailed prompt to generate a personalised 3-4 sentence coaching summary. Displays stats grid + AI report text.

#### `src/components/ui/` (46 files)
**Purpose:** The shadcn/ui component library — pre-built, accessible, styled UI primitives built on Radix UI. These are **not external library imports** but copied-in source files that can be customised.

Key components include:

| File | Component | Used For |
|---|---|---|
| `button.tsx` | `Button` | All interactive buttons |
| `card.tsx` | `Card`, `CardHeader`, `CardContent`, `CardTitle` | All content panels |
| `input.tsx` | `Input` | All text/number inputs |
| `label.tsx` | `Label` | Form field labels |
| `tabs.tsx` | `Tabs`, `TabsList`, `TabsTrigger` | Chart metric switcher, workout day tabs |
| `dialog.tsx` | `Dialog` | Modals (e.g., workout video player) |
| `select.tsx` | `Select` | Dropdowns (activity level, goal, gender) |
| `progress.tsx` | `Progress` | Macro progress bars, onboarding progress |
| `badge.tsx` | `Badge` | Workout goal labels |
| `chart.tsx` | `ChartContainer` | Recharts wrapper with themed colours |
| `sonner.tsx` | `Toaster` | Toast notification system |
| `radio-group.tsx` | `RadioGroup` | Goal selection in quiz |
| `calendar.tsx` | `Calendar` | Date picker (if used) |
| `scroll-area.tsx` | `ScrollArea` | Scrollable containers |
| `skeleton.tsx` | `Skeleton` | Loading placeholder animations |
| `sidebar.tsx` | `Sidebar` | Full sidebar component (available but not active) |
| `tooltip.tsx` | `Tooltip` | Hover tooltips |
| `avatar.tsx` | `Avatar` | User profile picture |
| `slider.tsx` | `Slider` | Range sliders |
| `switch.tsx` | `Switch` | Toggle switches |

---

### Library Utilities (`lib/`)

#### `src/lib/auth.tsx`
**Purpose:** React authentication context and hook. Wraps the entire app with `AuthProvider`, which:
- Subscribes to Supabase auth state changes via `supabase.auth.onAuthStateChange`
- Fetches the current session on mount
- Exposes `user`, `session`, `loading`, and `signOut` via `useAuth()` hook
- Any component can call `const { user, signOut } = useAuth()` to access auth state

#### `src/lib/groq.ts`
**Purpose:** Groq AI API client with automatic key rotation. Supports up to 20 API keys (`VITE_GROQ_KEY_1` … `VITE_GROQ_KEY_20`). Implements:
- **Rate limit handling** — if a key hits 429, marks it rate-limited and tries the next key
- **Server error retry** — on 5xx errors, briefly backs off and tries next key
- **`groqChat()`** — text/chat completions using LLaMA 3.3 70B (or any model)
- **`groqVision()`** — multimodal image analysis using LLaMA 4 Scout (pass base64 image)
- **`groqTranscribe()`** — speech-to-text using Whisper Large v3 Turbo
- **`groqStatus()`** — debug utility showing key availability

#### `src/lib/nutrition.ts`
**Purpose:** Pure functions for nutrition calculations. Used during onboarding (quiz) and profile updates.
- `calcBMI(weightKg, heightCm)` — Body Mass Index
- `bmiCategory(bmi)` — "Underweight" / "Normal" / "Overweight" / "Obese"
- `calcBMR(weightKg, heightCm, age, gender)` — Basal Metabolic Rate (Mifflin-St Jeor formula)
- `calcTDEE(bmr, activity)` — Total Daily Energy Expenditure (BMR × activity multiplier)
- `calcCalorieTarget(tdee, goal)` — Adjusts TDEE by goal: −500 kcal (lose), +300 kcal (gain), 0 (maintain)
- `calcMacros(calories)` — Splits calories into protein (30%), carbs (40%), fat (30%)
- `activityMultipliers` — Map from activity level string to Harris-Benedict multiplier

#### `src/lib/utils.ts`
**Purpose:** Tiny utility re-export. Exports the `cn()` function (from `clsx` + `tailwind-merge`) used throughout shadcn/ui components to merge Tailwind class names conditionally.

#### `src/lib/error-capture.ts`
**Purpose:** Global unhandled exception capture for SSR. Stores the last thrown error so it can be retrieved later when h3 swallows exceptions into opaque 500 responses.

#### `src/lib/error-page.ts`
**Purpose:** Generates the HTML string for the branded 500 error page shown when the SSR layer crashes catastrophically.

---

### Supabase Integration (`integrations/`)

#### `src/integrations/client.ts`
**Purpose:** Creates and exports the Supabase browser client singleton (`supabase`). Uses a `Proxy` for lazy initialisation (the client is only created on first use). Reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from env, with SSR fallback to `process.env`. Configures auth to use `localStorage` for session persistence.

#### `src/integrations/client.server.ts`
**Purpose:** Server-side Supabase client (used in SSR server functions). Similar to `client.ts` but reads from `process.env` instead of `import.meta.env`.

#### `src/integrations/auth-attacher.ts`
**Purpose:** Middleware helper that attaches the user's JWT from the `Authorization` header to outgoing Supabase requests, enabling Row-Level Security on server-side calls.

#### `src/integrations/auth-middleware.ts`
**Purpose:** TanStack Start server middleware that validates the Bearer JWT token on protected server functions. Extracts `userId` and `claims` from the token, makes them available in the route context. Throws a typed `Unauthorized` error if the token is missing or invalid.

#### `src/integrations/types.ts`
**Purpose:** TypeScript types auto-generated from the Supabase database schema. Defines the exact shape of every table (Row, Insert, Update types) used throughout the app for full type safety. Tables defined:
- `food_logs` — daily food entries per user
- `user_profiles` — user health metrics and targets
- `water_logs` — daily water intake per user
- `weight_entries` — weight log with optional photo
- `workout_logs` — completed workout sessions
- `workout_plans` — AI-generated workout plan JSON

Also exports generic helpers: `Tables<T>`, `TablesInsert<T>`, `TablesUpdate<T>`, `Enums<T>`.

---

### Static Data (`data/`)

#### `src/data/ifct2017.json`
**Purpose:** The local food database (~534 KB, ~12,000+ items). Sourced from the **Indian Food Composition Tables 2017** (IFCT), extended with data from the **Anuvaad INDB 2024** dataset (via `convert_indb_to_ifct.js`). Each entry has:
```json
{
  "code": "A001",
  "name": "Bajra, grain",
  "enerc": 1456,      ← energy in kJ
  "protcnt": 11.6,    ← protein in g per 100g
  "fatce": 5.0,       ← fat in g per 100g
  "choavldf": 67.5,   ← carbohydrates in g per 100g
  "fibtg": 1.2        ← dietary fibre in g per 100g
}
```
This file is bundled with the app and queried entirely client-side — **no API call needed** for food search.

---

### Styles

#### `src/styles.css`
**Purpose:** Global CSS file. Contains:
- **TailwindCSS v4 import** (`@import "tailwindcss"`)
- **CSS custom properties (variables)** for the design system's colour tokens:
  - Base colours: `--background`, `--foreground`, `--card`, `--border`, `--muted`, `--accent`
  - Semantic fitness colours: `--energy` (green), `--warn` (amber), `--fat` (blue), `--navy`
  - Dark mode overrides under `.dark` class
  - **Theme variants**: `theme-ocean`, `theme-sunset`, `theme-forest`
- **`pb-safe`** utility class for iOS safe area bottom padding (for BottomNav)
- Recharts tooltip override styles

---

## Supabase Backend

### `supabase/config.toml`
Local Supabase CLI configuration for running Supabase locally during development.

### `supabase/migrations/`
SQL migration files that define the database schema. Applied in chronological order.

#### `20260517071940_517b1140-...sql`
**Purpose:** Initial schema migration. Creates the core tables:
- `user_profiles` — user health data, goals, and computed targets
- `food_logs` — per-day, per-meal food entries with nutritional data
- `water_logs` — daily water tracking
- `weight_entries` — weight log with optional photo URL and notes
- `workout_logs` — workout session records
- `workout_plans` — stored AI-generated workout plan JSON

Also sets up **Row-Level Security (RLS)** policies so users can only read/write their own data.

#### `20260602_new_features.sql`
**Purpose:** Adds new columns and features added after the initial release:
- `goal_weight_kg` column to `user_profiles` — allows users to set a target weight
- Additional RLS policies or table adjustments for newer features

---

## Data & Reference Files

### `data/Anuvaad_INDB_2024.11.xlsx`
**Purpose:** Source spreadsheet of the Indian National Database for Food Composition (INDB) 2024. Used as input for `convert_indb_to_ifct.js` to add more Indian foods to the local database. **Not shipped to the browser.**

### `data/IFCT2017.pdf`
**Purpose:** The official PDF of Indian Food Composition Tables 2017 — the primary reference used to build `src/data/ifct2017.json`. Kept for reference only.

### `data/11Compendium...pdf`
**Purpose:** Physical activity compendium PDF — reference document for MET values and calorie burn estimates used in workout calorie calculations.

---

## Scripts

### `scripts/vercel-prepare.mjs`
**Purpose:** Post-build script (runs automatically after `npm run build` as the `postbuild` npm hook). Prepares the build output for Vercel deployment by restructuring the dist folder, creating the `vercel.json` routing config, and ensuring server-side functions are correctly placed for the Vercel serverless runtime.

### `convert_indb_to_ifct.js`
**Purpose:** One-off data migration utility (not part of the app runtime). Reads `data/Anuvaad_INDB_2024.11.xlsx`, parses each food item, converts energy from kJ, and appends the new items to `src/data/ifct2017.json`. Run manually with `node convert_indb_to_ifct.js` when you want to refresh the food database.

### `read_excel_headers.js`
**Purpose:** Quick utility to print the column headers of the INDB Excel file to the console. Used during development to figure out the correct column names when building `convert_indb_to_ifct.js`.

### `test_search.js`
**Purpose:** Command-line script to test the food search logic locally without starting the full app. Loads `src/data/ifct2017.json` and runs test queries to verify search ranking and result quality.

---

## Database Schema

```
user_profiles
  id (uuid, PK, FK → auth.users)
  full_name, age, gender, height_cm, weight_kg
  activity_level, goal, goal_weight_kg
  bmi, bmr, tdee
  daily_calorie_target, protein_target_g, carbs_target_g, fat_target_g
  selected_plan, trial_start_date
  created_at

food_logs
  id (uuid, PK)
  user_id (FK → auth.users)
  date (YYYY-MM-DD), meal_type, food_name
  quantity_g, calories, protein_g, carbs_g, fat_g
  logged_at

water_logs
  id (uuid, PK)
  user_id (FK → auth.users)
  date, amount_ml, updated_at

weight_entries
  id (uuid, PK)
  user_id (FK → auth.users)
  date, weight_kg, photo_url, note
  created_at

workout_logs
  id (uuid, PK)
  user_id (FK → auth.users)
  date, workout_name, exercises_done (JSON)
  duration_min, calories_burned, logged_at

workout_plans
  id (uuid, PK)
  user_id (FK → auth.users)
  goal, plan_json (JSON — full AI-generated plan)
  created_at
```

---

## Key Features & How They Work

### Authentication Flow
1. New user → `/quiz` → enters details → Supabase `signUp` → profile created → `/plans` → `/dashboard`
2. Returning user → `/login` → Supabase `signInWithPassword` → `/dashboard`
3. Auth state is globally available via `useAuth()` hook (from `src/lib/auth.tsx`)
4. All database tables are protected by Row-Level Security — users only see their own data

### AI Workout Plan Generation
1. User clicks "Generate My Plan" on `/workout`
2. App reads `profile.goal`, `profile.weight_kg`, `profile.activity_level` from Supabase
3. Sends a structured prompt to Groq (LLaMA 3.3 70B) requesting a JSON workout plan
4. Response is parsed, validated, YouTube IDs are patched from a curated map
5. Plan is saved to `workout_plans` table and displayed immediately

### Food Logging (multiple input methods)
- **Search**: Fuzzy search against local 12,000-item Indian food database
- **AI Text**: Natural language → Groq (LLaMA 3.3 70B) → structured nutrition data
- **Barcode**: Camera → @zxing/browser QR decoder → product lookup
- **Photo**: Camera → base64 image → Groq Vision (LLaMA 4 Scout) → identified food + macros
- **Voice**: Microphone → Web Audio API → Groq Whisper → transcribed text → AI food parsing

### Multi-Key Groq Rotation
The Groq client (`src/lib/groq.ts`) supports up to 20 API keys. When one key hits its rate limit (HTTP 429), the client automatically tries the next available key. This allows the app to handle high traffic without being blocked by a single key's rate limits.

### Theme System
5 themes are available (Light, Dark, Ocean, Sunset, Forest). The chosen theme is saved to `localStorage`. The root layout injects a tiny inline script in `<head>` that applies the theme class before the page renders, preventing a flash of the wrong theme on page load.
