# Skip Plan Choice + No Delete Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Deleting the custom weekly plan no longer redirects anywhere — the user stays on `/workout` exactly where they were. (2) Step 8 of `/workout-setup` ("Pick your path") gets a fourth option, "Skip & save," that saves the questionnaire answers and drops the user straight onto `/workout` (Gym tab, the default) without generating a plan, browsing the library, or opening the custom-plan builder.

**Architecture:** Both changes remove forced navigation, they don't add any. (1) is a one-line revert in `workout.tsx`'s `deletePlan()` — a prior fix added an auto-navigate-to-`/custom-plan` on custom-plan delete; the empty state on `/workout` was since upgraded to show a proper "Create a custom weekly plan" card when `workout_profile` exists, which makes the auto-navigate redundant and, per this request, unwanted — the card is the invitation, not an automatic jump. (2) extends `preferredTrainingPlan` — currently a closed 3-value DB enum (`ai_generated` / `library` / `custom`) — with a 4th value, `skip`, threaded through the DB check constraint, the `WorkoutPrefs` TS type, the Step-8 option list, `finish()`'s branch logic, and the two places Profile's "Workout details" card reads/writes that field.

**Tech Stack:** React 19, TanStack Router (`useNavigate`), Supabase Postgres (check constraint), existing `WorkoutPrefs` type in `src/lib/workoutPrefs.ts`.

**Spec:** None — direct feature request from conversation; Problem Statement below is the spec, confirmed against current code (all six `preferredTrainingPlan`/`preferred_training_plan` usages in the repo were located and read before writing this plan — see the grep list under Global Constraints).

## Problem Statement (confirmed against current code)

- `deletePlan()` in `src/routes/workout.tsx` (lines ~420-434, added in a prior fix this session) currently does: capture `wasCustom = isCustomPlan(plan)` → delete the `workout_plans` row → `if (wasCustom) navigate({ to: "/custom-plan" })`. The user wants this navigate removed entirely — after delete, stay on `/workout`. Since a separate, already-shipped change makes the `/workout` empty state show a dedicated "Create a custom weekly plan" card whenever `workout_profile` exists (instead of the old full re-setup card), removing the auto-navigate doesn't strand the user — they land on that card and can tap it when *they* choose to.
- `/workout-setup` step 8 (`src/routes/workout-setup.tsx:621-666`) offers exactly 3 `OptionCard`s bound to `planChoice: WorkoutPrefs["preferredTrainingPlan"]` (`"ai_generated" | "library" | "custom"`, `workoutPrefs.ts:31`). `finish()` (`workout-setup.tsx:284-308`) always does one of: generate an AI plan, flag the library tab, or route to `/custom-plan` — there's no path that just saves and returns to `/workout` untouched. `preferredTrainingPlan` is written to the DB column `workout_profile.preferred_training_plan`, which has a `check (... in ('ai_generated','library','custom'))` constraint (`supabase/migrations/20260821100955_create_workout_profile.sql`) — a 4th value needs that constraint (and the TS union) widened, not worked around with a fake existing value, so the stored data honestly reflects what the user chose.
- Every other place that reads `preferredTrainingPlan` was located by grep (6 total call sites across 3 files) so the new value doesn't silently mislabel in the UI:
  - `workoutPrefs.ts:96,117` — `toRow`/`fromRow`, pass the value through verbatim, need no change.
  - `workout-setup.tsx:158,175,205` — local `planChoice` state, its DB-prefill default, and `buildPrefs()`'s pass-through — no change beyond the new option/branch (Task 3).
  - `profile.tsx:114,273,451` — `wpInit`/`wpPlanChoice` state and the save payload — pass-through, no change.
  - `profile.tsx:933` — the "Preferred plan type" edit-mode `<Select>` on the Workout details card — currently 3 `SelectItem`s; needs a 4th so a user who picked "Skip" can see/change it later without the dropdown silently showing nothing selected.
  - `profile.tsx:977-981` — the read-only "Plan type" label ternary (`ai_generated` → one label, `library` → another, **else** → "Build my own") — today the `else` is safe because `custom` is the only remaining value; once `skip` exists this `else` would wrongly label a skip as "Build my own", so it needs a real branch.

## Global Constraints

- `deletePlan()`'s signature and its two existing `onClick={deletePlan}` call sites (`workout.tsx:553` custom-plan card, `:748` AI-plan card) are unchanged — only the function body loses its trailing navigate.
- The AI-plan card's separate "Redo setup & regenerate plan" button (`workout.tsx:739`, routes to `/workout-setup`) is untouched — out of scope, not part of this request.
- New enum value is the string `"skip"` — matches the existing lowercase-snake style of `ai_generated`/`library`/`custom` (single word, no separator needed).
- Do not touch `RLS`, `user_id`, or any other `workout_profile` column — only the one check constraint changes.
- `finish()`'s existing three branches (ai_generated/library/custom) keep their exact current behavior — the change only adds a 4th branch and reorders the `if/else` chain so `skip` is checked explicitly rather than falling into the `custom` catch-all `else`.
- The footer button label logic (`workout-setup.tsx:686-701`) already resolves to "Finish" for anything that isn't `ai_generated` — `skip` needs no label change there.
- No automated test runner in this repo (`package.json` has no `test` script) — verification is manual click-through, consistent with every other plan executed this session.
- `npx tsc --noEmit --ignoreConfig --jsx react-jsx --esModuleInterop --skipLibCheck --target es2020 --moduleResolution bundler <file>` is the project's type-check command in this sandbox — remember `--ignoreConfig`, its omission silently no-ops (`TS5112`) instead of erroring, a bug hit and fixed earlier this session. This sandbox itself has no `node_modules` (network-blocked `npm install`), so treat any `TS2307`/`TS2875` "cannot find module" noise as environment noise, not a real signal — compare error counts before/after your change instead of expecting a clean run.

---

## Task 1: Remove the delete-plan auto-navigate

**Files:**
- Modify: `src/routes/workout.tsx:420-434` (`deletePlan`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `deletePlan` keeps its exact signature (`() => Promise<void>`) — both existing `onClick={deletePlan}` call sites need no change.

- [ ] **Step 1: Strip the navigate call and the now-unused `wasCustom`**

Replace:

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

with:

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
    // No redirect — the user stays on /workout. Once workout_profile
    // exists, the empty state already shows a "Create a custom weekly
    // plan" card (renderPlanCard's `prefs`-gated branch) as an explicit
    // next action, so an automatic jump here would just be a second,
    // unwanted deviation.
  };
```

- [ ] **Step 2: Manual verification**

1. With a custom plan active on `/workout`, tap the trash icon in its header.
2. Expected: toast "Plan removed", page stays on `/workout`, empty state shows the single "Create a custom weekly plan" card (from the prior fix — confirms `prefs` is still populated). No automatic navigation.
3. Repeat for the AI-generated "My Plan" card's delete button — same result: toast, stay put, no navigation. (It already had no navigate before this task; confirms the shared function still behaves correctly for both callers.)

- [ ] **Step 3: Commit**

```bash
git add src/routes/workout.tsx
git commit -m "fix: deleting a plan no longer redirects — user stays on /workout"
```

---

## Task 2: Widen the `preferred_training_plan` check constraint (live migration)

**Files:**
- Create: `supabase/migrations/<timestamp>_workout_profile_add_skip_plan.sql` (timestamp assigned by Supabase at apply time, filename renamed to match afterward — same procedure used for every migration this session)

**Interfaces:**
- Consumes: existing table `public.workout_profile`, existing column `preferred_training_plan text not null`.
- Produces: the same column now additionally accepts the literal `'skip'`. No column added, no column renamed.

- [ ] **Step 1: Confirm the live constraint's exact name before touching it**

Run via the Supabase MCP `execute_sql` (read-only, matches the practice already used to sidestep the earlier `polname`/`policyname` mistake this session):

```sql
select conname, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid = 'public.workout_profile'::regclass
  and contype = 'c';
```

Expected: one row, `def` containing `preferred_training_plan = ANY (ARRAY['ai_generated'::text, 'library'::text, 'custom'::text])` (Postgres' canonical rendering of the `in (...)` check written in the original migration). Use the returned `conname` in Step 2 — do not assume it's the default-naming guess (`workout_profile_preferred_training_plan_check`) without checking; confirm it matches first.

- [ ] **Step 2: Write and apply the migration**

```sql
alter table public.workout_profile
  drop constraint <conname from Step 1>;

alter table public.workout_profile
  add constraint workout_profile_preferred_training_plan_check
    check (preferred_training_plan in ('ai_generated', 'library', 'custom', 'skip'));
```

Apply live via `mcp__Supabase__apply_migration` (same as every other migration this session — this is a live production DB, so this step is controller-run, not delegated to a subagent, per this session's standing ruling that live-DB writes are a security-sensitive action).

- [ ] **Step 3: Verify**

Re-run the Step 1 query and confirm `def` now lists all four values. Optionally confirm the constraint actually rejects a 5th value and accepts `'skip'`:

```sql
-- Expect this to fail with a check-constraint violation (proves the constraint is live):
-- insert into public.workout_profile (user_id, fitness_level, fitness_goal, training_days_per_week, preferred_workout_time_min, preferred_training_plan) values ('00000000-0000-0000-0000-000000000000', 'beginner', 'build_muscle', 3, 60, 'bogus');
```

Do not actually run an insert against a real or fake `user_id` — `user_id` is a foreign key into `auth.users`, and this session already had a direct-write verification blocked by the safety classifier once before (see the workout-profile-table plan's ledger). Read-only confirmation via `pg_get_constraintdef` (Step 3's first query) is sufficient; skip the insert probe.

- [ ] **Step 4: Save the migration file locally, matching Supabase's assigned version**

After `apply_migration` returns, note the version it assigned (format `YYYYMMDDHHMMSS`). Write the applied SQL to
`supabase/migrations/<that-version>_workout_profile_add_skip_plan.sql` in the repo (same file-naming-matches-version convention used for every prior migration this session) and sync it to the user's machine.

---

## Task 3: Add the "Skip & save" option end to end

**Files:**
- Modify: `src/lib/workoutPrefs.ts:31` (the `preferredTrainingPlan` union)
- Modify: `src/routes/workout-setup.tsx` (Step 8 option list, `finish()`)
- Modify: `src/routes/profile.tsx` (Workout-details card: edit-mode dropdown, read-only label)

**Interfaces:**
- Consumes: the widened DB constraint from Task 2 (this task can be implemented and reviewed before Task 2's live migration is applied, since it only changes application code — but do not merge/ship Task 3 without Task 2 having been applied first, or saving `preferredTrainingPlan: "skip"` will fail against the live DB's check constraint).
- Produces: `WorkoutPrefs["preferredTrainingPlan"]` becomes `"ai_generated" | "library" | "custom" | "skip"`. No function signatures change.

- [ ] **Step 1: Widen the TS union**

In `src/lib/workoutPrefs.ts`, change:

```ts
  preferredTrainingPlan: "ai_generated" | "library" | "custom";
```

to:

```ts
  preferredTrainingPlan: "ai_generated" | "library" | "custom" | "skip";
```

- [ ] **Step 2: Add the 4th option card and icon import in workout-setup.tsx**

Add `SkipForward` to the existing `lucide-react` import block at the top of `workout-setup.tsx` (alongside `Sparkles`, `Library`, `PencilRuler`, etc. already imported there).

In the step-8 block (`workout-setup.tsx:622-666`), add a 4th `OptionCard` after the existing "Build My Own Workout" one:

```tsx
              <OptionCard
                active={planChoice === "skip"}
                onClick={() => setPlanChoice("skip")}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <SkipForward className="h-4 w-4 text-accent" /> Skip & Save
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Just save my answers — I'll set up a plan later.
                </span>
              </OptionCard>
```

- [ ] **Step 3: Branch `finish()` for the skip case**

In `workout-setup.tsx`'s `finish()` (currently lines ~284-308), the existing three-way `if (planChoice === "ai_generated") {...} else if (planChoice === "library") {...} else {...}` treats everything that isn't `ai_generated`/`library` as `custom`. Add an explicit `skip` branch before that final `else` so `custom` stays the true catch-all only for the one value left:

```ts
      if (planChoice === "ai_generated") {
        await generateAiPlan(prefs);
        toast.success("Your personalized plan is ready! 💪");
        navigate({ to: "/workout" });
      } else if (planChoice === "library") {
        sessionStorage.setItem("workout_initial_tab", "HOME");
        toast.success("Preferences saved — browse the library!");
        navigate({ to: "/workout" });
      } else if (planChoice === "skip") {
        toast.success("Preferences saved!");
        navigate({ to: "/workout" });
      } else {
        toast.success("Preferences saved — build your weekly plan!");
        navigate({ to: "/custom-plan" });
      }
```

Note: `navigate({ to: "/workout" })` with no search params lands on the Gym tab by construction — `workout.tsx`'s `validateSearch` defaults `tab` to `undefined`, and `activeTab = search.tab ?? "GYM"` (`workout.tsx:279`) resolves that to `"GYM"`. No extra param needed to satisfy "gym part, nothing more deviation."

The footer button (`workout-setup.tsx:673-703`) needs no change — its label ternary already falls through to `"Finish"` for any `planChoice` other than `"ai_generated"`, which now correctly covers `"skip"` too.

- [ ] **Step 4: Fix the two Profile "Workout details" surfaces**

In `profile.tsx`, the edit-mode "Preferred plan type" `<Select>` (around line 933) currently has 3 `SelectItem`s. Add a 4th:

```tsx
                            <SelectItem value="skip">Skip for now</SelectItem>
```

placed after the existing `<SelectItem value="custom">Build my own</SelectItem>`.

The read-only "Plan type" `InfoRow` (around lines 974-983) currently does:

```tsx
                      <InfoRow
                        label="Plan type"
                        value={
                          wp.preferredTrainingPlan === "ai_generated"
                            ? "Let AI pick for me"
                            : wp.preferredTrainingPlan === "library"
                              ? "Workout library"
                              : "Build my own"
                        }
                      />
```

Change the final `else` from an assumed `"custom"` into an explicit 4-way check so `skip` doesn't get mislabeled:

```tsx
                      <InfoRow
                        label="Plan type"
                        value={
                          wp.preferredTrainingPlan === "ai_generated"
                            ? "Let AI pick for me"
                            : wp.preferredTrainingPlan === "library"
                              ? "Workout library"
                              : wp.preferredTrainingPlan === "skip"
                                ? "Skipped for now"
                                : "Build my own"
                        }
                      />
```

- [ ] **Step 5: Verify types**

```bash
npx tsc --noEmit --ignoreConfig --jsx react-jsx --esModuleInterop --skipLibCheck --target es2020 --moduleResolution bundler src/lib/workoutPrefs.ts src/routes/workout-setup.tsx src/routes/profile.tsx
```

Compare the `TS1xxx`/`TS2xxx` (excluding `TS2307`/`TS2875`, this sandbox's known module-resolution noise) error count against a `git stash` baseline run of the same command on the pre-change files — expect zero new errors, per the Global Constraints note on this sandbox's missing `node_modules`.

- [ ] **Step 6: Manual verification**

1. Go to `/workout-setup`, click through to step 8. Confirm 4 option cards render, "Skip & Save" selectable.
2. Select "Skip & Save", tap "Finish". Expected: toast "Preferences saved!", lands on `/workout` with the Gym tab active, no plan created, no navigation to `/custom-plan` or library.
3. Go to Profile → Workout details. Confirm "Plan type" reads "Skipped for now", and in edit mode the dropdown shows "Skip for now" selected and can be changed to any of the other 3 options and saved back successfully.

- [ ] **Step 7: Commit**

```bash
git add src/lib/workoutPrefs.ts src/routes/workout-setup.tsx src/routes/profile.tsx
git commit -m "feat: add Skip & Save option to workout setup, save-and-return-to-workout with no forced plan creation"
```

---

## Self-Review

**Spec coverage:** Both Problem Statement items have a task: Task 1 (no delete redirect) and Tasks 2-3 (skip option, split into the live-DB half and the application-code half since one is a controller-run production migration and the other is ordinary reviewable code — matches how this session already split "apply the workout_profile migration" from "point the code at it" in the prior plan).

**Placeholder scan:** No TBD/TODO; every step shows exact before/after code or an exact SQL query; Task 2 Step 1 explicitly requires confirming the real constraint name rather than assuming it, given this session already got bitten once by guessing a Postgres system-catalog column name.

**Type consistency:** `WorkoutPrefs["preferredTrainingPlan"]` widened in exactly one place (`workoutPrefs.ts:31`) that all 6 grepped call sites derive from — `toRow`/`fromRow` pass the value through untyped-string-safe (both already typed against the interface), and the only two consumers that pattern-match on the literal values (`workout-setup.tsx`'s `finish()`, `profile.tsx`'s read-only label) are both updated in Task 3 so no site is left silently mismatching. `deletePlan`'s signature (Task 1) is unchanged, so no caller needs updating.
