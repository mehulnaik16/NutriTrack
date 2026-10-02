# Task Tracker - Food Calorie Abuse Limiter

Full design doc: [docs/plans/2026-09-24-food-calorie-abuse-limiter.md](file:///C:/Users/Kausthub/hello%20world/nutritrack/docs/plans/2026-09-24-food-calorie-abuse-limiter.md)

| id | task | status | notes |
| :--- | :--- | :--- | :--- |
| task-1 | **Research existing food logging & database constraints** | done | Audited `FoodSearch.tsx`, `food.tsx`, `dashboard.tsx`, and `20260827104500_food_log_units.sql` |
| task-2 | **User requirements & limit parameters approval** | done | Approved: single item <= 4000 kcal, daily ceiling = min(10000, max(5000, 2*target)), soft warning > 1.25*target |
| task-3 | **Create implementation plan & design doc** | done | Saved to `docs/plans/2026-09-24-food-calorie-abuse-limiter.md` |
| task-4 | **TDD: Implement core validator module & test suite** | done | 10 tests pass. Lowering an entry never blocks; blocked edits report the net increase |
| task-5 | **Client UI: Integrate validation into FoodSearch** | done | Validation runs before the saving spinner starts, so a blocked log cannot leave it stuck |
| task-6 | **Client UI: Integrate validation into Food & Dashboard pages** | done | `currentDayCalories` in `food.tsx` is a plain value above the loading return (a hook there broke hook order) |
| task-7 | **Database: Create Supabase DB trigger migration** | done | Applied to production. `security invoker`, per user-day advisory lock, edits that lower calories always pass |
| task-8 | **Verification: Run tests, typecheck, and lint** | done | Tests, `tsc`, lint clean. Verified in browser while signed in: item cap, soft warning, ceiling on relog/edit/copy, edit down |

# Task Tracker - AI Resilience (503 / 429 / Timeout)

Full plan: [docs/plans/2026-09-24-ai-resilience.md](2026-09-24-ai-resilience.md)

| id | task | status | notes |
| :--- | :--- | :--- | :--- |
| task-1 | **Fallback chain runner** (`src/server/aiChain.ts`) | done | 13 self-checks. RPM 429 cools a model until its minute clears; RPD 429 until midnight Pacific. Key errors skip the provider. |
| task-2 | **Typed provider errors + abort signals** (`gemini.ts`, `groq.ts`) | done | Gemini 429s say which quota broke; a rejected Gemini key sends a critical alert. |
| task-3 | **Model chains** (`src/server/aiRoutes.ts`) + search on its chain | done | Only the primary search model's (gemini-3.7-flash) answers are cached. |
| task-4 | **Photo and voice on their chains; clients stop choosing models** | done | Meal builder moved off Groq for photo and voice. |
| task-5 | **Friendly errors and long-wait copy** | done | No raw provider errors reach users. Loading copy cycles after 2 s on photo, voice and both search boxes. |
| task-6 | **Live verification** | done | Tested during a real Gemini overload: 3.7-flash 503s took 1.8–5.2 s and lite took ~15 s. Found and fixed three budget bugs live. Groq and lite answers were served but produced 0 cache rows. Voice: Groq answered in 6.2 s. Photo: Qwen answered in 5.8 s. |

# Task Tracker - Health Log (Hypertension & Diabetes)

Full plan: [docs/plans/2026-09-28-health-log-profile-card.md](2026-09-28-health-log-profile-card.md)

| id | task | status | notes |
| :--- | :--- | :--- | :--- |
| task-1 | **Clinical Domain Logic & Validator** (`src/lib/healthVitals.ts`) | done | InSH 2023 classification, diabetes bands, input sanitization, 18 tests pass |
| task-2 | **Supabase Schema & Migration** (`supabase/migrations/...`) | done | Migration `20260928170000_health_logs.sql` & Database types added with full user CRUD |
| task-3 | **Health Log Sub-page UI** (`src/components/HealthLog.tsx`) | done | Segmented toggle, styled inputs, signal banner, history drawer with Edit/Delete |
| task-4 | **Profile Menu Grid Integration** (`src/routes/profile.tsx`) | done | Card in 2-column grid, vitals glyph, routing |
| task-5 | **Verification & Verification Suite** | done | 18 Node clinical tests pass, ESLint clean, Vite build & SSR build succeeded |

# Task Tracker - Workout Calorie Accuracy Audit & Fix

| id | task | status | notes |
| :--- | :--- | :--- | :--- |
| task-1 | **Audit Calorie Calculation Models** | done | Audited Cardio (Power, HR, Speed, METs) and Strength models across codebase |
| task-2 | **Execute Calorie Engine Test Suites** | done | 30 acceptance tests, 166 compendium tests, 16 modal verification tests pass |
| task-3 | **Fix Strength Sets Calorie Under/Overestimation** | done | Replaced `sets.length * 15` in `ExerciseLoggerModal` with `calculateCalories` (`STRENGTH_SETS`) |
| task-4 | **Verification & Lint/Build Check** | done | 30 unit tests, 166 compendium tests, 16 modal tests pass, build exit 0 |

# Task Tracker - Barcode Alcohol Calorie Accounting

| id | task | status | notes |
| :--- | :--- | :--- | :--- |
| task-1 | **Add alcohol field & 7 kcal/g to foodDb.ts** | done | Added `alcohol?: number | null`, Atwater fallback `+ 7 * alcohol` |
| task-2 | **Extract alcohol & reconcile energy in ScanFoodDialog.tsx** | done | Parse ABV %, convert with 0.789 g/mL, apply 7 kcal/g floor |
| task-3 | **Add curated alcoholic drinks to extraFoods.ts** | done | Added Beer (mild/strong), Vodka, Whiskey, Rum, Gin, Tequila, Brandy, Wine |
| task-4 | **Run unit tests & verify build** | done | Verified alcoholCalories tests; `npm run build` exited with code 0 |

# Task Tracker - Alcohol Serving Sizes & USDA Cross-Verification

# Task Tracker - Exercise Thumbnail Icons Generation & Integration (475 Exercises)

Full plan: [docs/plans/2026-09-29-exercise-thumbnail-icons.md](2026-09-29-exercise-thumbnail-icons.md)

| id | task | status | notes |
| :--- | :--- | :--- | :--- |
| task-1 | **Prototype sample icons with black weights & create plan** | done | Generated Bench Press & Squat with solid black iron plates; 475-exercise plan created |
| task-2 | **User approval of corrected black plate style & full plan** | done | Approved by user; solid black iron weights with neon orange #FF6A00 active highlights |
| task-3 | **Generate Phase 1 Batch 1 (Chest & Upper Back)** | in_progress | 23/24 deployed (T-Bar Row deployed; Chin-Up pending 2nd account handoff) |
| task-4 | **Generate Phase 1 Batch 2 (Legs & Lower Body)** | done | All 20 approved, compressed (6-9 KB), registered, and committed (100% complete) |
| task-5 | **Generate Phase 1 Batch 3 (Shoulders & Arms)** | pending | 25 exercises - handed off to 2nd AGY account due to image quota limit |
| task-6 | **Generate Phase 1 Batch 4 (Core & Athletic)** | pending | 19 exercises - handed off to 2nd AGY account |
| task-7 | **Integrate approved thumbnails into workout screens** | done | 42 images deployed in `public/exercises/`, registered in `exerciseImages.ts`, 100% test pass |
| task-8 | **Phase 2: Full Catalog Expansion (Batches 5–12)** | pending | Remaining 387 exercises across 8 batches |
| task-9 | **Verify build, responsive rendering & small-pixel compression** | done | HighQualityBicubic 200x200 px <10 KB, zero UI layout shift, `npm run build` clean (code 0) |

| id | task | status | notes |
| :--- | :--- | :--- | :--- |
| task-1 | **Hide BottomNav on /calorie-calculator** (`src/components/BottomNav.tsx`) | done | Added `/calorie-calculator` to `HIDDEN_ON` set |
| task-2 | **Fix sticky drawer position & scroll clearance** (`src/routes/calorie-calculator.tsx`) | done | Snapped sticky card to `bottom-0`, expanded container padding to `pb-72 sm:pb-80`, auto-scroll HR |
| task-3 | **Verification, Linter & Build Check** | done | ESLint clean (0 errors), all test suites pass, Vite + SSR build exit 0 |

# Task Tracker - Strength Progress Analytics Chart Rendering Fix

| id | task | status | notes |
| :--- | :--- | :--- | :--- |
| task-1 | **Unwrap Recharts Line Components & Update Domain** (`src/routes/workout.tsx`) | done | Removed React.Fragment, set `domain={[0, "auto"]}`, added unit to title |
| task-2 | **Verification, Linter & Build Check** | done | 30 engine tests, 166 compendium tests, 16 modal tests pass, build exit 0 |




