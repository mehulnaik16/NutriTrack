/**
 * Cycle-math checks for the custom workout plan.
 *
 * No test framework in this repo, so this is a plain Node script over the
 * COMPILED lib modules (not a copy of the logic). Run it with:
 *
 *   npx tsc --outDir /tmp/cyclebuild --target es2020 --module es2020 \
 *     --moduleResolution bundler --skipLibCheck --ignoreConfig \
 *     src/lib/dates.ts src/lib/musclePlan.ts
 *   # bare Node ESM needs explicit extensions; Vite does not, so the source
 *   # stays extensionless and only the build output is patched:
 *   sed -i 's|from "./dates"|from "./dates.js"|' /tmp/cyclebuild/musclePlan.js
 *   cp src/lib/__cycle.test.mjs /tmp/cyclebuild/ && node /tmp/cyclebuild/__cycle.test.mjs
 *
 * Exits non-zero on the first failure.
 */
import { daysBetweenLocal } from "./dates.js";
import { cycleDayIndex, buildCustomPlan, updatePlanDay } from "./musclePlan.js";

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  →  got ${actual}, expected ${expected}`);
}

console.log("\n--- daysBetweenLocal ---");
check("same day", daysBetweenLocal("2026-08-21", "2026-08-21"), 0);
check("next day", daysBetweenLocal("2026-08-21", "2026-08-22"), 1);
check("previous day", daysBetweenLocal("2026-08-22", "2026-08-21"), -1);
check("one week", daysBetweenLocal("2026-08-21", "2026-08-28"), 7);
check("across month end", daysBetweenLocal("2026-08-30", "2026-09-02"), 3);
check("across year end", daysBetweenLocal("2026-12-30", "2027-01-02"), 3);
check("leap day 2028", daysBetweenLocal("2028-02-28", "2028-03-01"), 2);
check("non-leap 2027", daysBetweenLocal("2027-02-28", "2027-03-01"), 1);
// DST: US spring-forward 2026-03-08 (23h day), fall-back 2026-11-01 (25h day).
check("spans spring-forward", daysBetweenLocal("2026-03-07", "2026-03-09"), 2);
check("spans fall-back", daysBetweenLocal("2026-10-31", "2026-11-02"), 2);
check("garbage input is 0", daysBetweenLocal("not-a-date", "2026-08-21"), 0);

console.log("\n--- cycleDayIndex: the day the user picked is today ---");
check("picked Day 4 (idx 3), same day", cycleDayIndex(3, "2026-08-21", "2026-08-21", 7), 3);
check("picked Day 1 (idx 0), same day", cycleDayIndex(0, "2026-08-21", "2026-08-21", 7), 0);

console.log("\n--- cycleDayIndex: rolls forward one per day ---");
check("Day 4 + 1 day = Day 5", cycleDayIndex(3, "2026-08-21", "2026-08-22", 7), 4);
check("Day 4 + 2 days = Day 6", cycleDayIndex(3, "2026-08-21", "2026-08-23", 7), 5);
check("Day 4 + 3 days = Day 7", cycleDayIndex(3, "2026-08-21", "2026-08-24", 7), 6);

console.log("\n--- cycleDayIndex: wraps past the end, no break in the flow ---");
check("Day 4 + 4 days wraps to Day 1", cycleDayIndex(3, "2026-08-21", "2026-08-25", 7), 0);
check("Day 4 + 5 days = Day 2", cycleDayIndex(3, "2026-08-21", "2026-08-26", 7), 1);
check("Day 4 + 7 days = Day 4 again", cycleDayIndex(3, "2026-08-21", "2026-08-28", 7), 3);
check("Day 4 + 70 days = Day 4 again", cycleDayIndex(3, "2026-08-21", "2026-10-30", 7), 3);
check("Day 1 + 365 days stays in range", cycleDayIndex(0, "2026-08-21", "2027-08-21", 7), 1);

console.log("\n--- cycleDayIndex: every day of a full cycle is reachable ---");
{
  const seen = new Set();
  for (let d = 0; d < 7; d++) {
    const today = new Date(Date.UTC(2026, 7, 21 + d)).toISOString().slice(0, 10);
    seen.add(cycleDayIndex(3, "2026-08-21", today, 7));
  }
  check("7 consecutive days hit 7 distinct indices", seen.size, 7);
  check("all indices within 0..6", [...seen].every((i) => i >= 0 && i < 7), true);
}

console.log("\n--- cycleDayIndex: edge cases that must not crash or go negative ---");
check("null anchor falls back to stored index", cycleDayIndex(3, null, "2026-08-21", 7), 3);
check("null anchor, index unchanged after time", cycleDayIndex(3, null, "2027-01-01", 7), 3);
check("clock behind anchor stays in range (-1 day)", cycleDayIndex(0, "2026-08-21", "2026-08-20", 7), 6);
check("clock behind anchor stays in range (-10 days)", cycleDayIndex(0, "2026-08-21", "2026-08-11", 7), 4);
check("dayCount 0 returns 0, no divide-by-zero", cycleDayIndex(3, "2026-08-21", "2026-08-25", 0), 0);
check("dayCount 1 always returns 0", cycleDayIndex(0, "2026-08-21", "2026-09-15", 1), 0);
check("stored index >= dayCount is clamped into range", cycleDayIndex(9, "2026-08-21", "2026-08-21", 7), 2);

console.log("\n--- cycleDayIndex: non-7-day plans (AI plans vary in length) ---");
check("3-day plan wraps correctly", cycleDayIndex(2, "2026-08-21", "2026-08-22", 3), 0);
check("5-day plan rolls forward", cycleDayIndex(1, "2026-08-21", "2026-08-23", 5), 3);
check("5-day plan wraps", cycleDayIndex(4, "2026-08-21", "2026-08-22", 5), 0);

console.log("\n--- updatePlanDay: single-day edits leave the rest of the week alone ---");
{
  const base = buildCustomPlan([
    ["Chest"],
    ["Back", "Biceps"],
    [],
    ["Legs"],
    [],
    ["Shoulder"],
    [],
  ]);
  check("baseline days_per_week", base.days_per_week, 4);

  const edited = updatePlanDay(base, 2, ["Core", "Triceps"]);
  check("edited day gets the new muscles", edited.days[2].muscles.join(","), "Core,Triceps");
  check("edited day keeps its label", edited.days[2].day, "Day 3");
  check("edited day name recomputed", edited.days[2].name, "Core · Triceps");
  check("days_per_week recounted after rest -> training", edited.days_per_week, 5);
  check("day count unchanged", edited.days.length, 7);
  check(
    "other six days untouched",
    edited.days.every((d, i) => i === 2 || d === base.days[i]),
    true,
  );
  check("original plan not mutated", base.days[2].name, "Rest Day");

  const toRest = updatePlanDay(edited, 0, []);
  check("empty selection becomes a rest day", toRest.days[0].muscles.join(","), "Rest Day");
  check("days_per_week recounted after training -> rest", toRest.days_per_week, 4);

  const explicitRest = updatePlanDay(edited, 1, ["Rest Day"]);
  check("explicit Rest Day clears the muscles", explicitRest.days[1].muscles.join(","), "Rest Day");
}

console.log(
  failures === 0
    ? "\n✅ all checks passed\n"
    : `\n❌ ${failures} check(s) failed\n`,
);
process.exit(failures === 0 ? 0 : 1);
