/**
 * Acceptance checks for the sign-up flow's rules (quiz -> intro -> account ->
 * final question). Plain node:assert script, same convention as
 * foodFuzzy.test.ts.
 * Run:  node src/lib/signupRules.test.ts
 */
import assert from "node:assert";
import { readFileSync } from "node:fs";
import {
  HEARD_ABOUT,
  isIndianMobile,
  phoneDigits,
  quizProfileRow,
  referIntroDue,
} from "./signupRules.ts";
import {
  calcBMI,
  calcBMR,
  calcCalorieTarget,
  calcMacros,
  calcTDEE,
} from "./nutrition.ts";
import { DEFAULT_QUIZ_FORM, type QuizDraft } from "./quizDraft.ts";
import { isLightOnlyPath } from "./theme.ts";

// S1: the profile row is built from the draft exactly as the quiz shows it.
{
  const draft: Partial<QuizDraft> = {
    d: {
      ...DEFAULT_QUIZ_FORM,
      age: 26,
      gender: "Female",
      heightCm: 162,
      weightKg: 68,
      activity: "Lightly Active",
      goal: "lose",
    },
    loseRate: "lose_0_5kg",
  };
  const row = quizProfileRow("u1", "Asha", true, draft);
  const bmr = calcBMR(68, 162, 26, "Female");
  const tdee = calcTDEE(bmr, "Lightly Active");
  const target = calcCalorieTarget(tdee, "lose_0_5kg", "Female");
  const macros = calcMacros(target, "lose_0_5kg", 68);
  assert.deepStrictEqual(row, {
    id: "u1",
    full_name: "Asha",
    age: 26,
    gender: "Female",
    height_cm: 162,
    weight_kg: 68,
    activity_level: "Lightly Active",
    goal: "lose_0_5kg",
    bmi: calcBMI(68, 162),
    bmr,
    tdee,
    daily_calorie_target: target,
    protein_target_g: macros.protein,
    carbs_target_g: macros.carbs,
    fat_target_g: macros.fat,
    fiber_target_g: macros.fiber,
    marketing_opt_in: true,
  });
  assert.ok(target < tdee, "a lose goal targets below maintenance");
  console.log("✓ S1 profile row matches the quiz's own numbers");
}

// S2: an empty draft (every quiz page skipped) still makes a valid row.
{
  const row = quizProfileRow("u2", "", false, {});
  assert.strictEqual(row.age, null, "unanswered age is null, not 0 (DB check)");
  assert.strictEqual(row.gender, DEFAULT_QUIZ_FORM.gender);
  assert.strictEqual(row.goal, "maintain");
  assert.strictEqual(row.marketing_opt_in, false);
  assert.ok(row.daily_calorie_target > 0, "a calorie target is still set");
  console.log("✓ S2 skipped quiz still saves a usable profile");
}

// S3: phone rule (after the fixed +91).
{
  for (const ok of ["9876543210", "6000000000", "7123456789", "8999999999"])
    assert.ok(isIndianMobile(ok), ok);
  for (const bad of [
    "",
    "98765",
    "98765432101",
    "5876543210",
    "0987654321",
    "98765 4321",
    "+919876543210",
  ])
    assert.ok(!isIndianMobile(bad), bad);
  // What the box keeps from typed or pasted text.
  for (const [typed, kept] of [
    ["+91 98765-43210", "9876543210"],
    ["+919876543210", "9876543210"],
    ["919876543210", "9876543210"],
    ["09876543210", "9876543210"],
    ["98765 43210", "9876543210"],
    ["9876", "9876"],
    ["9198765432", "9198765432"], // 10 digits that start 91 are left alone
  ])
    assert.strictEqual(phoneDigits(typed), kept, typed);
  console.log("✓ S3 phone accepts 10-digit 6-9 numbers; strips +91 and 0");
}

// S4: the dropdown keys are exactly what the database accepts.
{
  const sql = readFileSync(
    new URL(
      "../../supabase/migrations/20261009200000_phone_and_heard_about.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const allowed = [...sql.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepStrictEqual(HEARD_ABOUT.map(([k]) => k).sort(), allowed);
  // The phone the page stores must pass the DB format check too.
  const dbPhone = new RegExp(/phone ~ '([^']+)'/.exec(sql)![1]);
  assert.ok(dbPhone.test(`+91${"9876543210"}`));
  console.log("✓ S4 dropdown keys and stored phone match the DB checks");
}

// S5: Refer & Earn shows from day 6 (sign-up day is day 1), never before.
{
  const created = "2026-10-01T10:00:00";
  const due = (today: string) => referIntroDue(created, today);
  for (const d of ["2026-10-01", "2026-10-03", "2026-10-05"])
    assert.ok(!due(d), `not on ${d}`);
  assert.ok(due("2026-10-06"), "day 6");
  assert.ok(due("2026-10-20"), "a later first visit still shows it");
  assert.ok(!referIntroDue(null, "2026-10-20"), "unknown age never forces it");
  console.log("✓ S5 Refer & Earn waits for day 6");
}

// S6: every sign-up page renders light; app pages keep the user's theme.
{
  for (const p of ["/", "/quiz", "/welcome", "/signup", "/signup-details"])
    assert.ok(isLightOnlyPath(p), p);
  for (const p of ["/login", "/dashboard", "/plans", "/signup/x", "/quizzes"])
    assert.ok(!isLightOnlyPath(p), p);
  console.log("✓ S6 light theme on exactly the sign-up pages");
}

console.log("\n✅ All sign-up rule tests passed.");
