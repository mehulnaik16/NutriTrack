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
