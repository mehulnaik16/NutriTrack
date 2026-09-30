/**
 * The signup wizard's answers, mirrored to localStorage.
 *
 * The quiz used to keep everything in component state, so leaving it by any
 * route — a back swipe, a closed tab, a guard redirect — discarded every answer
 * while the `?step=` in the URL survived. Re-entering the review step then
 * submitted the form's *defaults* over an already-saved profile (age 0, 170 cm,
 * 70 kg, Sedentary) with no error shown.
 *
 * The password is deliberately not part of what is stored: a resumed signup
 * re-enters it on the account step rather than leaving a credential on disk.
 */
import type { PartnerKind } from "@/lib/gym";

export interface QuizFormData {
  fullName: string;
  email: string;
  password: string;
  repeatPassword: string;
  age: number;
  gender: string;
  heightCm: number;
  weightKg: number;
  activity: string;
  goal: string;
}

export interface QuizDraft {
  step: number;
  d: QuizFormData;
  loseRate: string;
  unit: "kg" | "lb";
  applied: string | null;
  appliedKind: "friend" | PartnerKind | null;
}

export const QUIZ_DRAFT_KEY = "dombelz.quizDraft";

export const DEFAULT_QUIZ_FORM: QuizFormData = {
  fullName: "",
  email: "",
  password: "",
  repeatPassword: "",
  age: 0,
  gender: "Male",
  heightCm: 170,
  weightKg: 70,
  activity: "Sedentary",
  goal: "maintain",
};

/** Whatever was saved, or an empty object — a corrupt value must never throw
 *  the wizard, it just means there is nothing to resume. */
export function loadQuizDraft(): Partial<QuizDraft> {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(QUIZ_DRAFT_KEY) ?? "null");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Partial<QuizDraft>)
      : {};
  } catch {
    return {};
  }
}

export function saveQuizDraft(draft: QuizDraft): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      QUIZ_DRAFT_KEY,
      JSON.stringify({
        ...draft,
        d: { ...draft.d, password: "", repeatPassword: "" },
      } satisfies QuizDraft),
    );
  } catch {
    /* private mode — the quiz still works, it just can't be resumed */
  }
}

export function clearQuizDraft(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(QUIZ_DRAFT_KEY);
  } catch {
    /* nothing persisted, nothing to clean up */
  }
}
