/* Runnable self-check for the signup wizard's saved draft. No test framework in
   this repo, so this is a plain assert script — same convention as
   authErrors.test.ts.

   Build and run:
     npx tsc --outDir <tmp> --target es2020 --module es2020 \
       --moduleResolution bundler --skipLibCheck \
       src/lib/quizDraft.ts src/lib/quizDraft.test.ts
     sed -i 's|from "@/lib/gym"|from "./gym.js"|' <tmp>/*.js
     sed -i 's|from "./quizDraft"|from "./quizDraft.js"|' <tmp>/*.js
     node <tmp>/quizDraft.test.js
*/
import assert from "node:assert/strict";
import {
  clearQuizDraft,
  DEFAULT_QUIZ_FORM,
  loadQuizDraft,
  QUIZ_DRAFT_KEY,
  saveQuizDraft,
  type QuizDraft,
} from "./quizDraft";

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const draft: QuizDraft = {
  step: 4,
  d: {
    ...DEFAULT_QUIZ_FORM,
    fullName: "Asha",
    email: "asha@example.com",
    password: "hunter2hunter2",
    repeatPassword: "hunter2hunter2",
    age: 31,
    heightCm: 162,
    weightKg: 58,
    activity: "Moderate",
    goal: "lose",
  },
  loseRate: "lose_0_5kg",
  unit: "kg",
  applied: "RAH38291",
  appliedKind: "friend",
};

// The whole point of the module: progress survives, the credential does not.
saveQuizDraft(draft);
const raw = store.get(QUIZ_DRAFT_KEY) ?? "";
assert.ok(!raw.includes("hunter2hunter2"), "password must never be persisted");

const back = loadQuizDraft();
assert.equal(back.step, 4);
assert.equal(back.d?.fullName, "Asha");
assert.equal(back.d?.weightKg, 58);
assert.equal(back.d?.activity, "Moderate");
assert.equal(back.loseRate, "lose_0_5kg");
assert.equal(back.applied, "RAH38291");
assert.equal(back.d?.password, "", "password comes back empty, not undefined");
assert.equal(back.d?.repeatPassword, "");

// A corrupt or foreign value must read as "nothing to resume", never throw —
// otherwise one bad key bricks the signup screen.
store.set(QUIZ_DRAFT_KEY, "{not json");
assert.deepEqual(loadQuizDraft(), {});
store.set(QUIZ_DRAFT_KEY, "[1,2,3]");
assert.deepEqual(loadQuizDraft(), {});
store.set(QUIZ_DRAFT_KEY, "null");
assert.deepEqual(loadQuizDraft(), {});

clearQuizDraft();
assert.deepEqual(loadQuizDraft(), {}, "cleared draft leaves nothing behind");

console.log("quizDraft self-check passed");
