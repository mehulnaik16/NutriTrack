# Workout Page Gate Plan

> **STATUS: IMPLEMENTED, 2026-08-26.**
> Shipped as `src/hooks/useWorkoutPrefsGate.ts` and
> `src/components/WorkoutGate.tsx`, wrapping `/workout`, `/custom-plan` and
> `/custom-plan-edit`. One deviation from the plan below: the gate also passes
> the prefs it loaded down through `GatedPrefsCtx`, so `workout.tsx` no longer
> runs its own duplicate `loadWorkoutPrefs` — that second read could resolve
> after the gate's and briefly re-render the empty state the gate had just
> ruled out. The now-unreachable "Set up my training" branch of
> `renderPlanCard()` was removed as planned.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock `/workout` and its sub-routes behind the training questionnaire, so a user who has never filled `/workout-setup` sees a single clear "set up my training" gate instead of a fully working workout page that quietly lacks the preferences the rest of the feature is tuned by.

**Architecture:** Today `/workout` has no gate at all. `workout.tsx:273` loads `workout_profile` through `getCachedWorkoutPrefs()` / `loadWorkoutPrefs()` and uses the result only to *decorate* — `renderPlanCard()` (line 435) shows a "Set up my training" card when `prefs` is null, and `prefs` also feeds cardio recommendations (line 956) and default lift weights (line 1500). Everything else on the page — the exercise library, the gym logger, history — works fine without it. The change introduces one shared gate, `src/components/WorkoutGate.tsx`, backed by a `useWorkoutPrefsGate()` hook that returns a three-state answer (`loading` | `missing` | `ready`) rather than a boolean, because the two-state version is what produces the classic bug: a returning user with a profile sees the lock card flash before the DB read resolves. `loadWorkoutPrefs()` already reads localStorage first, so the cached path answers `ready` synchronously on the second visit and only a genuinely new device pays the round trip. The gate wraps `/workout`, `/custom-plan`, and `/custom-plan-edit`, because gating only `/workout` would be theatre — `dashboard.tsx` and `profile.tsx` both link straight into the sub-routes.

**Tech Stack:** React 19, TanStack Router (`useNavigate`, in-component redirect pattern — matching how `auth` gating is already done at `workout.tsx:294`), existing `src/lib/workoutPrefs.ts`, Tailwind v4.

**Spec:** This document. Source requirement: "WORKOUT PAGE MUST BE LOCKED UNTIL USERS CHOOSE TO FILL THE WORKOUT FORM".

## Global Constraints

- **A `preferred_training_plan` of `'skip'` counts as filled.** The `20260821115437_workout_profile_add_skip_plan.sql` migration added `'skip'` for the "Skip & Save" option on `/workout-setup` step 8. The requirement is that the *form* is filled, not that a plan was chosen — a user who answered every question and skipped plan selection must not be locked out. The gate's only question is "does a `workout_profile` row exist".
- **Never flash the lock to a user who has a profile.** The hook must distinguish "still checking" from "checked, and genuinely absent" — the same three-state discipline `useAuth().hasProfile` already uses in `src/lib/auth.tsx` (`null` = undetermined, `false` = confirmed absent). On a read *error*, resolve to `ready`, not `missing`: a transient network failure must never lock a paying user out of their own workout page.
- The gate composes with, and runs after, the existing auth gate. A signed-out user still goes to `/login` (`workout.tsx:294`); the workout gate only applies to a signed-in user.
- `/workout-setup` itself must **not** be gated, or the gate becomes a trap with no exit.
- Do not delete the existing "Set up my training" card in `renderPlanCard()`'s null branch (line 465) as part of this task — once the gate is in place that branch is unreachable for a profile-less user, so remove it in the dedicated cleanup task, with the `prefs`-present branch preserved.
- No new dependency, no new route, no schema change. Everything needed already exists.
- No automated test runner exists in this repo; verification is a manual walkthrough plus a direct SQL check that the row is or is not present.

---

## Task 1: The gate hook

**Files:**
- Create: `src/hooks/useWorkoutPrefsGate.ts`

**Interfaces:**
- Produces: `useWorkoutPrefsGate(): { state: "loading" | "missing" | "ready"; prefs: WorkoutPrefs | null }`.
- Consumes: `useAuth()` from `src/lib/auth.tsx`, `getCachedWorkoutPrefs` / `loadWorkoutPrefs` from `src/lib/workoutPrefs.ts`.

- [ ] **Step 1: Seed from the synchronous cache.** Initialise state from `getCachedWorkoutPrefs(user.id)` in the `useState` initialiser. A cache hit means `state` starts at `ready` and the gate never renders at all for a returning user — this is what makes the no-flash guarantee cheap.

- [ ] **Step 2: Confirm against the database.** In an effect, call `loadWorkoutPrefs(user.id)`. A non-null result sets `ready` and stores `prefs`; a null result sets `missing`.

- [ ] **Step 3: Handle auth's own loading window.** While `useAuth().loading` is true, or `user` is null, return `loading` — never `missing`. The auth redirect owns the signed-out case.

- [ ] **Step 4: Fail open on error.** `loadWorkoutPrefs` swallows errors and returns the localStorage value, so a null return is ambiguous between "no row" and "read failed with no cache". Add an explicit distinction: if the effect throws or the Supabase call errors, resolve `ready`. Locking someone out because their connection blipped is the worse failure by a wide margin.

- [ ] **Step 5: Guard against a stale write.** If the user id changes mid-flight, discard the resolved result — the standard cancelled-effect flag.

**Verification:**
- [ ] A user with a row resolves `ready` without ever passing through `missing`.
- [ ] A user without a row resolves `missing`.
- [ ] Signing out and in as a different user re-evaluates rather than reusing the first user's answer.

---

## Task 2: The gate component

**Files:**
- Create: `src/components/WorkoutGate.tsx`

**Interfaces:**
- Produces: `<WorkoutGate>{children}</WorkoutGate>` — renders `children` when `ready`, a spinner when `loading`, and the lock screen when `missing`.

- [ ] **Step 1: Build the lock screen.** A centred card: a lock icon in the accent circle the app uses elsewhere, a heading ("Set up your training first"), one short line of copy explaining *why* — the plans, the recommended cardio, and the suggested weights all come from those answers — and a primary button to `/workout-setup`.

- [ ] **Step 2: Blur the page behind it,** rather than showing an empty screen. Render `children` inside a `pointer-events-none blur-sm opacity-40` wrapper with the lock card layered over it, `aria-hidden` on the blurred layer. Showing the user what they are unlocking is what makes a gate feel like an invitation instead of a wall.

- [ ] **Step 3: Match the loading state to the rest of the app** — reuse whatever spinner treatment `workout.tsx` already renders during its own load rather than introducing a new one.

- [ ] **Step 4: Keep the bottom nav visible.** The gate covers the page body only. Trapping the user with no way to reach the dashboard would be a worse bug than the one being fixed. Confirm against the nav-hiding logic added in `65a3721 fix(nav): hide bottom nav until onboarding is complete` so the two gates do not compound into a dead end.

**Verification:**
- [ ] The lock card renders over a blurred workout page and nothing behind it is clickable or tab-focusable.
- [ ] The bottom nav still works from the locked state.
- [ ] The "Set up my training" button lands on `/workout-setup`.

---

## Task 3: Apply the gate

**Files:**
- Modify: `src/routes/workout.tsx`
- Modify: `src/routes/custom-plan.tsx`
- Modify: `src/routes/custom-plan-edit.tsx`

- [ ] **Step 1: Wrap `/workout`'s rendered tree** in `<WorkoutGate>`, inside the existing auth check so the signed-out redirect still wins.

- [ ] **Step 2: Wrap `/custom-plan` and `/custom-plan-edit` too.** Both are reachable directly — `workout.tsx:443`, `:483`, `:530` and the dashboard link at `dashboard.tsx:991` — so leaving them open leaves the gate trivially bypassable.

- [ ] **Step 3: Reuse the prefs the gate already loaded.** `workout.tsx` currently does its own `loadWorkoutPrefs` at line 273. Have the gate expose its resolved `prefs` through context so the page does not issue a second identical read on every mount.

- [ ] **Step 4: Confirm the round trip.** After `/workout-setup` saves, `saveWorkoutPrefs` writes localStorage before the DB, so navigating back to `/workout` must land on `ready` immediately even if the DB write is still in flight.

**Verification:**
- [ ] With the `workout_profile` row deleted via SQL and localStorage cleared, `/workout`, `/custom-plan`, and `/custom-plan-edit` all show the lock.
- [ ] Completing `/workout-setup` — including via the "Skip & Save" path that writes `preferred_training_plan = 'skip'` — unlocks all three immediately.
- [ ] `/workout-setup` itself is never gated.

---

## Task 4: Clean up the now-unreachable branch

**Files:**
- Modify: `src/routes/workout.tsx`

- [ ] **Step 1: Remove the profile-less branch of `renderPlanCard()`** (the "Set up my training" card and the "or create a custom weekly plan" link, `workout.tsx:461`–`:491`). With the gate in place a profile-less user never reaches this render.

- [ ] **Step 2: Keep the `prefs`-present branch** (the "Create a custom weekly plan" card at line 440) exactly as it is — that is the live path now.

- [ ] **Step 3: Update the comment at line 435,** which currently explains the two-branch reasoning that no longer exists.

**Verification:**
- [ ] `npm run lint` and `npm run build` both pass with no unused-import or unused-variable warnings from the deletion.
- [ ] A user with a profile and no plan still sees the "Create a custom weekly plan" card.
