/**
 * The sign-up flow's rules, kept free of Supabase and React so they can be
 * checked by src/lib/signupRules.test.ts.
 */
import { daysBetweenLocal, toLocalISO } from "./dates.ts";
import {
  calcBMI,
  calcBMR,
  calcCalorieTarget,
  calcMacros,
  calcTDEE,
  resolveGoalKey,
} from "./nutrition.ts";
import { DEFAULT_QUIZ_FORM, type QuizDraft } from "./quizDraft.ts";

/** The user_profiles row the quiz answers become once the account exists. */
export function quizProfileRow(
  userId: string,
  fullName: string,
  marketingOptIn: boolean,
  draft: Partial<QuizDraft>,
) {
  const d = { ...DEFAULT_QUIZ_FORM, ...draft.d };
  const goalKey = resolveGoalKey(d.goal, draft.loseRate ?? "lose_0_25kg");
  const bmr = calcBMR(d.weightKg, d.heightCm, d.age, d.gender);
  const tdee = calcTDEE(bmr, d.activity);
  const target = calcCalorieTarget(tdee, goalKey, d.gender);
  const macros = calcMacros(target, goalKey, d.weightKg);
  return {
    id: userId,
    full_name: fullName,
    // 0 means unanswered; the DB check allows null or 18-100.
    age: d.age || null,
    // Unanswered (no pre-selection) is stored as null, not "".
    gender: d.gender || null,
    height_cm: d.heightCm,
    weight_kg: d.weightKg,
    activity_level: d.activity,
    goal: goalKey,
    bmi: calcBMI(d.weightKg, d.heightCm),
    bmr,
    tdee,
    daily_calorie_target: target,
    protein_target_g: macros.protein,
    carbs_target_g: macros.carbs,
    fat_target_g: macros.fat,
    fiber_target_g: macros.fiber,
    marketing_opt_in: marketingOptIn,
  };
}

/** Indian mobile number, as typed after the fixed +91: 10 digits from 6-9. */
export const isIndianMobile = (digits: string) => /^[6-9]\d{9}$/.test(digits);

/**
 * What the phone box keeps from typed or pasted text: digits only, with a
 * leading +91 / 91 or trunk 0 dropped, so "+91 98765-43210" is 9876543210
 * and not the first ten digits "9198765432".
 */
export function phoneDigits(input: string): string {
  let d = input.replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("91")) d = d.slice(2);
  else if (d.length > 10 && d.startsWith("0")) d = d.slice(1);
  return d.slice(0, 10);
}

/** Stored key -> label. Keys match the heard_about check in the migration. */
export const HEARD_ABOUT: [string, string][] = [
  ["instagram", "Instagram"],
  ["youtube", "YouTube"],
  ["google", "Google search"],
  ["friend", "Friend or family"],
  ["gym", "Gym or trainer"],
  ["facebook", "Facebook"],
  ["x", "X (Twitter)"],
  ["app_store", "App Store / Play Store"],
  ["other", "Other"],
];

/**
 * Refer & Earn waits for day 6 of the account (sign-up day is day 1); any
 * first visit on or after day 6 shows it. `today` is a local YYYY-MM-DD.
 */
export function referIntroDue(createdAt: string | null, today: string) {
  if (!createdAt) return false;
  return daysBetweenLocal(toLocalISO(new Date(createdAt)), today) + 1 >= 6;
}

/**
 * Words for the commitment page, from the saved goal. The goal is the first
 * four weeks at the chosen rate, a milestone that feels close enough to keep.
 */
export function commitCopy(
  goal: string | null,
  weightKg: number | null,
  fullName: string | null,
  today = new Date(),
) {
  const first = fullName?.trim().split(/\s+/)[0];
  const title = first ? `${first}, make it official` : "Make it official";
  const caption = first ? `${first}, it's official.` : "It's official.";
  const m = /^(lose|gain)_(\d)_(\d+)kg$/.exec(goal ?? "");
  const kind = m?.[1] ?? (goal === "gain_muscle" ? "gain" : "maintain");
  if (kind === "maintain")
    return {
      title,
      caption,
      goal: weightKg
        ? `staying around ${Math.round(weightKg)} kg and feeling strong in it`
        : "staying where I am and feeling strong in it",
      pledge:
        "I'll keep doing the small things: logging my meals, moving most days, and not letting one busy week turn into a lost month.",
    };
  const kg = (m ? Number(`${m[2]}.${m[3]}`) : 0.25) * 4;
  const by = new Date(today.getTime() + 28 * 864e5).toLocaleDateString(
    "en-IN",
    { day: "numeric", month: "short" },
  );
  const amount = kg === 1 ? "first kilo" : `first ${kg} kg`;
  return kind === "lose"
    ? {
        title,
        caption,
        goal: `losing my ${amount} by ${by}`,
        pledge:
          "I'll log my meals honestly, even the ones I'm not proud of. A bad day is just one day, and I'll show up again the next morning.",
      }
    : {
        title,
        caption,
        goal: `putting on my ${amount} by ${by}`,
        pledge:
          "I'll eat enough even when I'm not hungry, train with intent, and remember that slow, steady weight is the kind that stays.",
      };
}
