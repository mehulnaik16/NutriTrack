import { supabase } from "@/integrations/client";
import { serverLinkGym } from "@/lib/gym-link";
import {
  calcBMI,
  calcBMR,
  calcCalorieTarget,
  calcMacros,
  calcTDEE,
  resolveGoalKey,
} from "@/lib/nutrition";
import {
  clearQuizDraft,
  DEFAULT_QUIZ_FORM,
  REF_STORAGE_KEY,
  type QuizDraft,
} from "@/lib/quizDraft";

/**
 * Write the quiz answers to the signed-in user's profile, claim any invite
 * code, then clear the draft. Shared by the quiz and the "Save your plan"
 * sign-up page, which runs after the quiz once an account exists.
 */
export async function saveQuizProfile(
  userId: string,
  fullName: string,
  marketingOptIn: boolean,
  draft: Partial<QuizDraft>,
): Promise<void> {
  const d = { ...DEFAULT_QUIZ_FORM, ...draft.d };
  const goalKey = resolveGoalKey(d.goal, draft.loseRate ?? "lose_0_25kg");
  const bmi = calcBMI(d.weightKg, d.heightCm);
  const bmr = calcBMR(d.weightKg, d.heightCm, d.age, d.gender);
  const tdee = calcTDEE(bmr, d.activity);
  const target = calcCalorieTarget(tdee, goalKey, d.gender);
  const macros = calcMacros(target, goalKey, d.weightKg);

  const { error } = await supabase.from("user_profiles").upsert({
    id: userId,
    full_name: fullName,
    // 0 means unanswered; the DB check allows null or 18-100.
    age: d.age || null,
    gender: d.gender,
    height_cm: d.heightCm,
    weight_kg: d.weightKg,
    activity_level: d.activity,
    goal: goalKey,
    bmi,
    bmr,
    tdee,
    daily_calorie_target: target,
    protein_target_g: macros.protein,
    carbs_target_g: macros.carbs,
    fat_target_g: macros.fat,
    fiber_target_g: macros.fiber,
    marketing_opt_in: marketingOptIn,
  });
  if (error) throw error;

  // The intro was shown before sign-up, so the dashboard must not force it
  // again. A separate update: the column is outside the INSERT allowlist.
  await supabase
    .from("user_profiles")
    .update({ has_seen_benefits_features_page: true })
    .eq("id", userId);

  // Attribution is best-effort by design: an unknown code, a self-referral or a
  // second attempt all come back false, and none of them may block an account
  // that has already been created. Whether it earns anything is decided
  // server-side (claim_referral / link_gym), never by what is sent from here.
  if (draft.applied) {
    try {
      if (draft.appliedKind && draft.appliedKind !== "friend") {
        await serverLinkGym({ data: { code: draft.applied } });
      } else {
        await supabase.rpc("claim_referral", { code: draft.applied });
      }
      sessionStorage.removeItem(REF_STORAGE_KEY);
    } catch (refErr) {
      console.warn("[referral] could not claim code", refErr);
    }
  }

  clearQuizDraft();
}
