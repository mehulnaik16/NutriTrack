import { supabase } from "@/integrations/client";
import { serverLinkGym } from "@/lib/gym-link";
import {
  clearQuizDraft,
  REF_STORAGE_KEY,
  type QuizDraft,
} from "@/lib/quizDraft";
import { quizProfileRow } from "@/lib/signupRules";

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
  const { error } = await supabase
    .from("user_profiles")
    .upsert(quizProfileRow(userId, fullName, marketingOptIn, draft));
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
