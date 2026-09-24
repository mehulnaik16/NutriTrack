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
