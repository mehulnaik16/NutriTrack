# Custom Plan Confirm & Start-Day Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a user finishes filling all 7 days of the custom-plan builder (`/custom-plan`) and taps what is currently "Save my plan" on Day 7, insert one review screen before anything is written to the database: it shows the full week they just built, asks which of those 7 days is the one they're doing *today*, lets them pick it, and only then actually saves — using their pick as `workout_plans.custom_plan_day_idx` instead of always silently defaulting to 0.

**Architecture:** No schema change — `custom_plan_day_idx` already exists on `workout_plans` (added this session for exactly this "which day is current" concept, currently only ever set by `/workout`'s day-pill selector after a plan already exists, or defaulted to 0 on insert). This plan closes the one remaining gap: plan *creation* itself never asks. One new boolean UI state (`confirming`) in `src/routes/custom-plan.tsx` swaps the muscle-picker view for a review view when Day 7 is finished; the existing `save()` function gains one parameter (the chosen start-day index) and passes it through to the insert it already does.

**Tech Stack:** React 19, existing `custom-plan.tsx` component state and Supabase insert already in place — no new libraries.

**Spec:** None — direct feature request from conversation. The Problem Statement below documents the exact current behavior (confirmed by reading `custom-plan.tsx` and `workout.tsx` before writing this plan) and the exact gap being closed.

## Problem Statement (confirmed against current code)

- `/custom-plan` (`src/routes/custom-plan.tsx`) is a 7-step wizard (`day` state, 1..7). On day 7, the footer button is "Save my plan" and calls `save()` directly (`custom-plan.tsx:114-140`), which deletes any existing plan row(s) for the user and inserts a new one. The insert (`custom-plan.tsx:125-129`) does **not** set `custom_plan_day_idx`, so it always takes the column's DB default, `0` — meaning every save (first-time or a full rebuild) silently resets "today" to Day 1, regardless of which day the user actually intends to start on.
- Separately, once a custom plan exists, `/workout`'s plan card already lets the user tap any day pill to mark it "current" (`selectCustomDay`, `workout.tsx:436-444`), persisting to that same `custom_plan_day_idx` column, and that same page shows an informational "· Cal" badge (`workout.tsx:629`) computed from `todaysPlanIndex()` (a Mon-Sun calendar mapping, `workout.tsx:122-125`) purely as a *hint* next to the pill row — it does not drive which day is "today". This confirms the existing model is already the cyclical one this request describes (Day 1..Day 7 is a fixed order from how the user built the plan, not a Mon-Sun mapping) — no change is needed there. The only gap is that this same choice — "which day is current" — is never offered at plan-*creation* time; it silently defaults to Day 1 and the user has to know to go fix it afterward on `/workout`.
- This plan adds that missing choice directly into the creation flow, so "which day are you starting on" is asked once, at the moment it's most natural to ask — right after the user has just finished describing their week — instead of defaulting silently.

## Global Constraints

- Only `src/routes/custom-plan.tsx` changes. No new files, no schema change, no change to `workout.tsx`'s existing pill-selector/Cal-badge logic (already correct per the Problem Statement).
- `custom_plan_day_idx` stays a 0-based index into `plan.days` (matches the existing column: `smallint not null default 0 check (between 0 and 6)`, and matches how `workout.tsx` already reads/writes it) — the UI shows "Day 1".."Day 7" (1-based, human-facing) but stores 0-based.
- The review screen must not let a user reach it with an unsaved, uncommitted plan silently discarded — it's purely an added step before the existing `save()` call, not a replacement path; canceling out of it must return to editing Day 7 with all answers intact (no data loss, since `week` state is untouched by entering/leaving the review screen).
- If the user is editing/rebuilding an existing custom plan (the `existingPlanIds.length > 0` pre-fill path, `custom-plan.tsx:49-68`), default the review screen's day picker to that plan's *current* `custom_plan_day_idx` (fetch it alongside the existing pre-fill query — it's already in the same row, just not currently read into state) rather than always defaulting to Day 1 — the user can still change it, but a plan edit shouldn't silently reset which day they're on today unless they choose to change it.
- No automated test runner in this repo — verification is manual click-through, consistent with every other plan this session.

---

## Task 1: Add the review-and-pick-start-day screen

**Files:**
- Modify: `src/routes/custom-plan.tsx`

**Interfaces:**
- Consumes: existing `week: StandardMuscle[][]`, `previewDays`/`colCount` (table-preview helpers already computed in the component), existing `save()` logic and its Supabase insert.
- Produces: `save()` gains one parameter, `startDayIdx: number` (0-based), and includes `custom_plan_day_idx: startDayIdx` in its insert payload. No other exported/consumed interface changes — this is a self-contained UI addition inside one route component.

- [ ] **Step 1: Read the existing plan's current day when pre-filling (for the edit/rebuild case)**

In the existing pre-fill effect (`custom-plan.tsx:49-68`), the query already does `select("*")` and reads `data[0]` for `plan_json`. Add one more read from that same row and store it in new state:

```ts
  const [startDayIdx, setStartDayIdx] = useState(0);
```

(new state, declared near the existing `const [existingPlanIds, setExistingPlanIds] = useState<string[]>([]);`)

Inside the pre-fill effect, right after `setExistingPlanIds(data.map((d: any) => d.id));`, add:

```ts
        const existingIdx = (data[0] as any)?.custom_plan_day_idx;
        if (typeof existingIdx === "number") setStartDayIdx(existingIdx);
```

For a brand-new plan (no existing rows), `startDayIdx` stays at its initial `0` (Day 1) — the sensible default for a first-time build.

- [ ] **Step 2: Add the `confirming` UI-phase state**

```ts
  const [confirming, setConfirming] = useState(false);
```

(declared alongside `day`/`week`/`saving`)

- [ ] **Step 3: Change Day 7's footer button to open the review screen instead of saving directly**

Currently (`custom-plan.tsx:307-330`):

```tsx
          {day < TOTAL_DAYS ? (
            <Button
              onClick={() => setDay(day + 1)}
              className="h-13 w-full gap-2 rounded-full bg-accent py-6 text-base font-bold text-accent-foreground hover:bg-accent/90"
            >
              {selections.length === 0 ? "Rest day — next" : "Continue"}
              <ArrowRight className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              onClick={save}
              disabled={saving}
              className="h-13 w-full gap-2 rounded-full bg-accent py-6 text-base font-bold text-accent-foreground glow-accent hover:bg-accent/90"
            >
              {saving ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save className="h-5 w-5" /> Save my plan
                </>
              )}
            </Button>
          )}
```

Change the `day === TOTAL_DAYS` branch's button to open the review screen instead of calling `save` directly (the actual "Save my plan" button moves to the new review screen in Step 5):

```tsx
          {day < TOTAL_DAYS ? (
            <Button
              onClick={() => setDay(day + 1)}
              className="h-13 w-full gap-2 rounded-full bg-accent py-6 text-base font-bold text-accent-foreground hover:bg-accent/90"
            >
              {selections.length === 0 ? "Rest day — next" : "Continue"}
              <ArrowRight className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              onClick={() => setConfirming(true)}
              className="h-13 w-full gap-2 rounded-full bg-accent py-6 text-base font-bold text-accent-foreground hover:bg-accent/90"
            >
              Review my week
              <ArrowRight className="h-5 w-5" />
            </Button>
          )}
```

- [ ] **Step 4: Make the header back button leave the review screen instead of going back a day**

Currently (`custom-plan.tsx:159-166`):

```tsx
            onClick={() =>
              day > 1 ? setDay(day - 1) : router.history.back()
            }
```

Change to:

```tsx
            onClick={() =>
              confirming ? setConfirming(false) : day > 1 ? setDay(day - 1) : router.history.back()
            }
```

Also update the header title/subtitle block (`custom-plan.tsx:167-175`) to reflect the review phase:

```tsx
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate font-display text-sm font-bold">
              <PencilRuler className="h-4 w-4 text-accent" /> Custom Workout
              Plan
            </p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {confirming ? "Review & confirm" : `Day ${day} of ${TOTAL_DAYS}`}
            </p>
          </div>
```

And the progress bar (`custom-plan.tsx:177-182`) should read as complete while confirming:

```tsx
        <div className="h-1 w-full bg-muted">
          <div
            className="h-full bg-accent transition-all duration-500 ease-out glow-accent-sm"
            style={{ width: confirming ? "100%" : `${(day / TOTAL_DAYS) * 100}%` }}
          />
        </div>
```

- [ ] **Step 5: Render the review screen (replaces the muscle-picker `<main>` content when `confirming` is true)**

The existing `<main>` block (`custom-plan.tsx:185-302`) currently always renders the muscle-picker + live preview table. Wrap it so that when `confirming` is true, a different view renders instead — the same preview table (now fully populated, since all 7 days are done) plus the new start-day question and picker:

```tsx
      <main className="mx-auto max-w-md px-4 py-6">
        {confirming ? (
          <>
            <h2 className="font-display text-2xl font-bold tracking-tight">
              Your week
            </h2>
            <p className="mb-5 mt-1 text-sm text-muted-foreground">
              Here's the plan you just built.
            </p>

            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground">
                      Days
                    </th>
                    {Array.from({ length: colCount }, (_, i) => (
                      <th
                        key={i}
                        className="px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground"
                      >
                        Muscle {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewDays.map((d, i) => (
                    <tr
                      key={d.day}
                      className={`border-b border-border/50 transition-colors last:border-b-0 ${
                        i === startDayIdx ? "bg-accent/10" : ""
                      }`}
                    >
                      <td
                        className={`px-3 py-2 font-semibold ${
                          i === startDayIdx ? "text-accent" : ""
                        }`}
                      >
                        {d.day}
                      </td>
                      {Array.from({ length: colCount }, (_, c) => (
                        <td key={c} className="px-3 py-2">
                          {d.isRest ? (
                            c === 0 ? (
                              <span className="italic text-muted-foreground">
                                Rest Day
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">-</span>
                            )
                          ) : d.muscles[c] ? (
                            <span className="font-medium">{d.muscles[c]}</span>
                          ) : (
                            <span className="text-muted-foreground/40">-</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-8">
              <h3 className="font-display text-lg font-bold tracking-tight">
                Which one is today?
              </h3>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">
                Pick whichever day you're actually doing today — this is a
                repeating cycle, not tied to the calendar, so "Day 1" doesn't
                have to mean Monday. You can always change this later from
                the Workout page.
              </p>
              <div className="grid grid-cols-1 gap-2">
                {previewDays.map((d, i) => (
                  <button
                    key={d.day}
                    type="button"
                    onClick={() => setStartDayIdx(i)}
                    className={`flex items-center justify-between rounded-2xl border-2 p-3.5 text-left transition-all duration-200 ${
                      i === startDayIdx
                        ? "border-accent bg-accent/10 glow-accent-sm"
                        : "border-border bg-card hover:border-muted-foreground/40"
                    }`}
                  >
                    <span className="text-sm font-semibold">{d.day}</span>
                    <span className="text-xs text-muted-foreground">
                      {d.isRest ? "Rest Day" : d.muscles.join(", ")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div
            key={day}
            className="animate-in fade-in slide-in-from-right-4 duration-300"
          >
            {/* ...existing Day N muscle-picker content, unchanged (custom-plan.tsx:186-237)... */}
          </div>
        )}

        {!confirming && (
          <div className="mt-8">
            {/* ...existing "Your week so far" live preview table, unchanged (custom-plan.tsx:240-301)... */}
          </div>
        )}
      </main>
```

Note for whoever implements this: the two `{/* ...unchanged... */}` comments above are a guide to *where* the existing JSX blocks move, not literal code to write — lift the current Day-N picker block (`custom-plan.tsx:186-237`, the `<div key={day}>...</div>` with the muscle-group grid) and the current live-preview table block (`custom-plan.tsx:240-301`, the `<div className="mt-8">...Your week so far...</div>`) into the `{!confirming && ...}`/else branches exactly as they already exist today — no changes to their internals, only to what wraps them.

- [ ] **Step 6: Wire the real Save button into the review screen's footer**

Change the footer (`custom-plan.tsx:305-333`) so the "Save my plan" action only appears once `confirming` is true, and calls `save(startDayIdx)`:

```tsx
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 pb-safe backdrop-blur-xl">
        <div className="mx-auto max-w-md px-4 py-3">
          {confirming ? (
            <Button
              onClick={() => save(startDayIdx)}
              disabled={saving}
              className="h-13 w-full gap-2 rounded-full bg-accent py-6 text-base font-bold text-accent-foreground glow-accent hover:bg-accent/90"
            >
              {saving ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save className="h-5 w-5" /> Save my plan
                </>
              )}
            </Button>
          ) : day < TOTAL_DAYS ? (
            <Button
              onClick={() => setDay(day + 1)}
              className="h-13 w-full gap-2 rounded-full bg-accent py-6 text-base font-bold text-accent-foreground hover:bg-accent/90"
            >
              {selections.length === 0 ? "Rest day — next" : "Continue"}
              <ArrowRight className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              onClick={() => setConfirming(true)}
              className="h-13 w-full gap-2 rounded-full bg-accent py-6 text-base font-bold text-accent-foreground hover:bg-accent/90"
            >
              Review my week
              <ArrowRight className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
```

- [ ] **Step 7: Thread `startDayIdx` through `save()`**

Currently (`custom-plan.tsx:114-140`):

```ts
  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const plan = buildCustomPlan(week);
      if (existingPlanIds.length > 0) {
        await supabase
          .from("workout_plans")
          .delete()
          .in("id", existingPlanIds);
      }
      const { error } = await supabase.from("workout_plans").insert({
        user_id: user.id,
        goal: plan.goal, // NOT NULL column
        plan_json: plan,
      } as any);
      if (error) throw error;
      // custom_plan_day_idx defaults to 0 on the new row — a rebuilt plan
      // naturally restarts at Day 1, no extra write needed.
      toast.success("Custom plan saved! 💪");
      navigate({ to: "/workout" });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save plan");
    } finally {
      setSaving(false);
    }
  };
```

Change to:

```ts
  const save = async (chosenStartDayIdx: number) => {
    if (!user) return;
    setSaving(true);
    try {
      const plan = buildCustomPlan(week);
      if (existingPlanIds.length > 0) {
        await supabase
          .from("workout_plans")
          .delete()
          .in("id", existingPlanIds);
      }
      const { error } = await supabase.from("workout_plans").insert({
        user_id: user.id,
        goal: plan.goal, // NOT NULL column
        plan_json: plan,
        custom_plan_day_idx: chosenStartDayIdx,
      } as any);
      if (error) throw error;
      toast.success("Custom plan saved! 💪");
      navigate({ to: "/workout" });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save plan");
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 8: Type-check**

```bash
npx tsc --noEmit --ignoreConfig --jsx react-jsx --esModuleInterop --skipLibCheck --target es2020 --moduleResolution bundler src/routes/custom-plan.tsx
```

Compare the `TS1xxx`/`TS2xxx` (excluding this sandbox's known `TS2307`/`TS2875` module-resolution noise — no `node_modules` here) error count against a `git stash` baseline run of the same command, per every prior plan's verification approach this session. Expect zero new errors.

- [ ] **Step 9: Manual verification**

1. Start a brand-new custom plan (no existing plan). Fill all 7 days (mix of muscle groups and at least one Rest Day). Tap "Review my week" on Day 7.
2. Expected: the review screen shows the full 7-day table (all rows populated, no "·" placeholders), a "Which one is today?" section with 7 selectable rows below it, Day 1 selected by default (matches the fresh-plan default from Step 1).
3. Tap a different day (e.g. Day 4), confirm its row highlights and Day 1's highlight clears.
4. Tap the back arrow — confirm it returns to editing Day 7 (not history-back out of the wizard), with all 7 days' selections intact.
5. Re-open the review screen, pick Day 4 again, tap "Save my plan". Expected: toast "Custom plan saved! 💪", navigates to `/workout`, and the custom-plan card's "Today" shows Day 4 (not Day 1) — confirms `custom_plan_day_idx` was actually written as 3 (0-based) and read back correctly by `workout.tsx`'s existing load logic.
6. Go back into `/custom-plan` to rebuild/edit that same plan. Expected: the review screen (once reached) defaults its picker to whichever day was last selected (Day 4 from step 5) rather than resetting to Day 1 — confirms Step 1's pre-fill read.
7. Confirm the small "· Cal" badge on `/workout`'s custom-plan pill row still shows independently and never overrides which day is marked current — unchanged behavior, just re-confirming Step 1 of the Problem Statement wasn't disturbed.

- [ ] **Step 10: Commit**

```bash
git add src/routes/custom-plan.tsx
git commit -m "feat: add review-and-pick-your-starting-day screen before saving a custom plan"
```

---

## Self-Review

**Spec coverage:** The Problem Statement's one gap — plan creation never asks which day is current, always defaults to 0 — is fully covered by Task 1: the review screen (Steps 2-6), the picker's smart default for edits vs. fresh plans (Step 1), and `save()` actually persisting the choice (Step 7).

**Placeholder scan:** Every step shows exact before/after code. Step 5 contains two `{/* ...unchanged... */}` markers, called out explicitly in the note directly beneath the code block as "lift existing JSX as-is, not code to write" — not a placeholder for new logic, a relocation instruction for existing logic, consistent with the "No Placeholders" rule (references exact existing line ranges rather than saying "similar to before").

**Type consistency:** `save()`'s signature changes from `() => Promise<void>` to `(chosenStartDayIdx: number) => Promise<void>` — its only two call sites are both inside this same file and both updated in this plan (the old direct `onClick={save}` is removed in Step 3/6, replaced by `onClick={() => save(startDayIdx)}` in Step 6). No other file calls `save` from `custom-plan.tsx` (it's a local, unexported function) — confirmed by construction, not grep, since it's `const save = ...` inside the component body, not module-scope.
