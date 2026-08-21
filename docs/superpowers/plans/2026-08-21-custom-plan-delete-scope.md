# Custom Plan Delete Scope Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deleting "My Custom Plan" should only remove that plan's `workout_plans` row and drop the user straight into building a new custom plan — not send them through the full 8-step `/workout-setup` questionnaire to re-answer questions already stored in `workout_profile`.

**Architecture:** No schema or data-flow change needed — `deletePlan()` in `src/routes/workout.tsx` already only deletes from `workout_plans` and never touches `workout_profile` (confirmed by reading the current code; see Problem Statement). The only real defect is a UX one: after a custom-plan delete, the page falls back to the generic "no plan" empty state, whose most prominent button is "Set up my training" → `/workout-setup` (the full questionnaire). This plan makes `deletePlan()` redirect straight to `/custom-plan` when the plan just deleted was a custom plan, so the user lands directly on the custom-plan builder instead of the questionnaire chooser screen.

**Tech Stack:** React 19, TanStack Router (`useNavigate`), existing `isCustomPlan()` helper from `src/lib/musclePlan.ts` (already imported in `workout.tsx`).

**Spec:** None — this is a direct bug-report-driven fix; the "spec" is the Problem Statement below, confirmed against the current code.

## Problem Statement (confirmed against current code, not assumed)

- `workout_profile` (fitness level, goal, lifts, training days, etc.) is a **separate table** from `workout_plans` (the generated/custom weekly schedule). This separation was built deliberately in the previous plan (`2026-08-21-workout-profile-table.md`) specifically so the questionnaire answers persist independently of any one plan and are editable from the Profile page's "Workout details" card.
- `deletePlan()` (`src/routes/workout.tsx:420-433`) already only runs `supabase.from("workout_plans").delete().eq("id", planId)`. It does **not** touch `workout_profile`, and no delete path in this codebase does. So the underlying data is not actually being wiped — verified by reading `deletePlan`, `custom-plan.tsx`'s `save()`, and grepping for every `.delete()` call in both files.
- The actual pain point is UX flow, not data loss: once `deletePlan()` succeeds, `setPlan(null)` makes `renderPlanCard()` fall into its "no plan" branch (`workout.tsx:478-506`), whose primary, most visually prominent element is a full-width card reading "Set up my training" that navigates to `/workout-setup` — the same 8-step questionnaire new users go through, covering fitness level, goal, lifts, training days, cardio, muscles/session, duration, and plan-type choice. `/workout-setup` does pre-fill every field from the existing `workout_profile` row (`workout-setup.tsx:164-186`), but the user still has to click "Continue" through all 8 steps to get back to a usable state. A second, much smaller text link ("or create a custom weekly plan →") already exists and goes straight to `/custom-plan`, skipping the questionnaire entirely — but it's easy to miss next to the large card above it, and the reported experience is "the whole thing starts from scratch."
- Fix scope: when the plan being deleted was specifically the *custom* plan (`isCustomPlan(plan)` true), skip the empty-state chooser altogether and navigate directly to `/custom-plan` after the delete succeeds. The AI-generated plan's delete button (a separate button, `workout.tsx:743-751`, on the "My Plan" card) is untouched — deleting an AI plan still lands on the chooser, which is correct there since regenerating an AI plan legitimately needs the questionnaire's plan-type/goal choice, and that card already has its own explicit "Redo setup & regenerate plan" button for that purpose.

## Global Constraints

- Do not touch `workout_profile` from any delete path — it must remain independent of `workout_plans` lifecycle, exactly as already implemented.
- Do not modify `/workout-setup` (`workout-setup.tsx`) or its pre-fill behavior — out of scope, not broken.
- Do not change the AI-generated plan's delete button (`workout.tsx:743-751`) or its surrounding card — only the custom-plan card's delete button (`workout.tsx:538-557`, calling the same `deletePlan()`) changes behavior, and only because `deletePlan()` itself becomes plan-type-aware.
- `isCustomPlan` is already imported in `workout.tsx` from `@/lib/musclePlan` — reuse it, don't reimplement.
- Keep the existing `toast.success("Plan removed")` call — the redirect is additive, not a replacement for user feedback.

---

## Task 1: Make `deletePlan` redirect to `/custom-plan` for custom-plan deletes

**Files:**
- Modify: `src/routes/workout.tsx:420-433` (the `deletePlan` function)

**Interfaces:**
- Consumes: existing `plan` state (`WorkoutPlan | null`), existing `isCustomPlan(plan): boolean` from `@/lib/musclePlan` (already imported at the top of `workout.tsx`), existing `navigate` from `useNavigate()` (already in scope — used elsewhere in this same component, e.g. line 482).
- Produces: `deletePlan` keeps its exact existing signature (`async (): Promise<void>`, no params) — both call sites (`workout.tsx:553` and `workout.tsx:748`) keep working unchanged, since the new redirect only fires conditionally inside the function.

- [ ] **Step 1: Capture whether the plan being deleted is a custom plan, before it's cleared**

Read `plan` (the current state, still populated at the top of the function, before any `setPlan(null)`) and record whether it's a custom plan. Replace the current function body:

```ts
  const deletePlan = async () => {
    if (!planId) return;
    const { error } = await supabase
      .from("workout_plans")
      .delete()
      .eq("id", planId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPlan(null);
    setPlanId(null);
    toast.success("Plan removed");
  };
```

with:

```ts
  const deletePlan = async () => {
    if (!planId) return;
    const wasCustom = isCustomPlan(plan);
    const { error } = await supabase
      .from("workout_plans")
      .delete()
      .eq("id", planId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPlan(null);
    setPlanId(null);
    toast.success("Plan removed");
    // Deleting the custom plan should drop the user straight back into
    // building a new one, not the full re-setup questionnaire — their
    // workout_profile answers are untouched and live on independently
    // (editable from Profile → Workout details).
    if (wasCustom) {
      navigate({ to: "/custom-plan" });
    }
  };
```

Note: `isCustomPlan` already safely handles `null`/non-custom input (it's used elsewhere in this file as `isCustomPlan(plan)` inside JSX render branches where `plan` can be null before the null-check narrows it — e.g. `workout.tsx:510`), so no extra null-guard is needed before calling it here.

- [ ] **Step 2: Manual verification (no automated test runner in this repo)**

This repo has no test runner (`npm test` is not defined in `package.json` — confirmed by reading it), so verification is a manual click-through:

1. As a user who has both a saved `workout_profile` row and a custom plan, open `/workout`, confirm the "My Custom Plan" card is showing.
2. Click the trash icon in that card's header ("Delete plan").
3. Expected: toast "Plan removed", then the app navigates straight to `/custom-plan` (Day 1 of 7, empty selections — since the plan row is gone, `custom-plan.tsx`'s pre-fill effect finds no `workout_plans` rows and leaves `week` at its empty default). The 8-step `/workout-setup` questionnaire is never shown.
4. Separately, confirm the AI-generated "My Plan" card's delete button is unaffected: delete an AI-generated plan and confirm it still lands on the "no plan" chooser screen (both the "Set up my training" and "or create a custom weekly plan →" options visible), not an automatic redirect.
5. Open Profile → Workout details and confirm the previously-saved fitness level/goal/lifts/etc. are still present after both deletes above — proving `workout_profile` was never touched.

- [ ] **Step 3: Commit**

```bash
git add src/routes/workout.tsx
git commit -m "fix: deleting the custom plan goes straight to /custom-plan instead of the full re-setup questionnaire"
```

---

## Self-Review

**Spec coverage:** The Problem Statement's one requirement — delete the custom plan without disturbing `workout_profile` or forcing the questionnaire — is fully covered by Task 1's single change. No other requirement exists.

**Placeholder scan:** No TBD/TODO markers; Step 1 shows the exact before/after code; Step 2 is a concrete manual click-through (no automated suite exists in this repo, consistent with how prior plans in this codebase handled verification).

**Type consistency:** `deletePlan`'s signature (`() => Promise<void>`) is unchanged, so both existing call sites (`onClick={deletePlan}` at lines 553 and 748) need no changes. `isCustomPlan` and `navigate` are both already-imported, already-used identifiers in this file — no new names introduced that could drift.
