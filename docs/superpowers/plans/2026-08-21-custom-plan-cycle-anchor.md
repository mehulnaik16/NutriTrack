# Custom Plan Cycle Anchor + Pill Row Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `custom_plan_day_idx` actually earn its keep by pairing it with an anchor date so the custom plan advances as a real self-propelling cycle (Day 4 today → Day 5 tomorrow → … → wraps to Day 1), independent of Mon-Sun. Plus two UI fixes on the same card: make all 7 day pills reachable, and require an explicit confirm before a day change is written.

**Architecture:** The index column today is a *phase offset with no clock attached* — it records "which day is current" but never advances, so it's a one-shot bookmark the user must re-set every single day (the user's complaint, and it's correct — see Problem Statement). Adding one `date` column (`custom_plan_day_anchor`) supplies the missing clock: today's day becomes `(stored_idx + days_elapsed_since_anchor) mod days_count`. That single addition turns the pair into a genuine cycle, and makes the Mon-Sun `todaysPlanIndex()` mapping (and its "· Cal" badge) obsolete *for the custom plan* — those get deleted from that card rather than kept as confusing noise. The two UI issues are independent one-liners in the same JSX block.

**Tech Stack:** React 19, Supabase Postgres (one added column), existing `src/lib/dates.ts` local-date helpers (already owns this exact timezone concern), Tailwind.

**Spec:** None — direct bug report + design challenge from conversation. Problem Statement below is the spec, every claim in it confirmed by reading the live schema and the current code before writing this plan.

## Problem Statement (confirmed against live DB and current code)

### Issue 1 — the index column doesn't do anything over time (user is right)

Live schema for `workout_plans` (read via `information_schema.columns`) is: `id`, `user_id`, `goal`, `plan_json`, `created_at`, `custom_plan_day_idx smallint not null default 0`. There is **no date column**.

In `workout.tsx`, `custom_plan_day_idx` is loaded into `customDayIdx` state (`:413`) and used *directly* as today's day (`:546`, `const todayIdx = Math.min(customDayIdx, plan.days.length - 1)`). Nothing ever advances it: `setCustomDayIdx` is called in exactly two places — the DB load (`:413`) and the user tapping a pill (`selectCustomDay`, `:441-448`). There is no timer, no date comparison, no effect that bumps it.

The consequence, stated plainly: if the user sets "today is Day 4" on Friday, then on Saturday the card still says Day 4. And Sunday. And next month. The stored index is a static bookmark that only ever changes when the user manually taps a pill — so it must be re-tapped *every single day* to stay truthful. That is what makes it feel useless, and the user's read is accurate.

Meanwhile the *other* mechanism on that card, `todaysPlanIndex()` (`:121-126`), does auto-advance — but it computes `(weekday + 6) % 7 % daysCount`, i.e. it is hard-locked to the Mon-Sun calendar the user explicitly rejected ("it is only meant to be cycle not representing mon to sun logic"). It survives only as the informational "· Cal" badge on the pill row (`:623`, `:629`).

So the card currently carries two half-mechanisms: one that respects the user's choice but never moves, and one that moves but ignores the user's choice. Neither alone is a cycle.

**The fix is one column, not a rewrite.** Store *when* the index was set. Then:

```
todayIdx = (stored_idx + days_elapsed_since_anchor) mod days_count
```

Set "Day 4 is today" on Friday → stored_idx=3, anchor=Friday. Saturday: (3+1)%7=4 → Day 5. Sunday → Day 6. Day 7 → wraps to Day 1. The user re-phases the cycle whenever they want by picking a different day (which rewrites both index and anchor); otherwise it advances on its own, forever, and never consults the weekday. That is the cycle the user described, and it is what finally gives the index column a purpose: it is the *phase*, and the anchor is the *clock*.

Once that exists, `todaysPlanIndex()`/"· Cal" on the custom-plan card is not just redundant but actively misleading (it advertises a Mon-Sun mapping that no longer governs anything), so it gets removed from that card. `todaysPlanIndex()` itself stays in the file — the *AI-generated* plan card still uses it (`:746`, `:412`), and changing the AI plan's behavior is out of scope for this request.

### Issue 2 — Day 6 and Day 7 unreachable in the browser

The pill row is `<div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">` (`:615`). `.no-scrollbar` (`src/styles.css:279-284`) sets `scrollbar-width: none` and `::-webkit-scrollbar { display: none }`. Combined with `overflow-x-auto` and `shrink-0` pills, that means: on touch devices swiping works, but in a desktop browser there is no visible scrollbar to drag and mouse wheels do not scroll horizontally by default — so any pill past the container width is simply unreachable. With 7 pills plus a "· Cal" suffix widening one of them, Days 6-7 fall off the edge, exactly as reported.

Rather than making horizontal scrolling work (a scrollbar to un-hide, or scroll buttons to add), the smaller and better fix is to stop scrolling at all: `flex-wrap` lets all 7 pills wrap onto two rows, fully visible at every width, no scroll affordance needed. Deleting the mechanism beats fixing it.

The identical pattern exists on the AI-plan card's day selector (`:789`, same classes, same `shrink-0` pills) and has the same latent bug — it is included in this fix since it is the same defect in the same kind of row, not a speculative extra. A third `no-scrollbar` row exists at `:1184` (muscle sub-category pills); that one has a genuinely variable and potentially long item count where horizontal scroll is a reasonable choice, it was not reported, and it is **left alone**.

### Issue 3 — tapping a day pill commits instantly, with no confirmation

`onClick={() => selectCustomDay(i)}` (`:619`) → `selectCustomDay` (`:441-448`) immediately calls `setCustomDayIdx(i)` and writes to the DB. A stray tap silently re-phases the user's whole cycle with no confirmation and no undo. The request is for an explicit confirm step: tapping a pill stages the choice, a confirmation control appears below the row, and only confirming writes.

This lands naturally alongside Issue 1, because the confirm action is exactly where the new anchor date gets written (`custom_plan_day_idx = picked`, `custom_plan_day_anchor = today`).

## Global Constraints

- One new column only: `custom_plan_day_anchor date not null default current_date` on `workout_plans`. No other schema change. The `not null default current_date` form backfills existing rows at migration time with that day's date, which is semantically correct: an existing plan showing "Day 4" keeps showing Day 4 today (elapsed = 0) and begins advancing tomorrow. No data is invalidated.
- Modulo must be sign-safe: `((x % n) + n) % n`. A negative elapsed value (clock skew, timezone travel, a hand-edited future anchor) must not produce a negative index and crash the array lookup.
- Day math goes through `src/lib/dates.ts`, which already exists specifically to keep local-date handling correct (its header documents the UTC-vs-local bug this codebase already hit). Do not use `toISOString()` or raw `Date` subtraction inline; add the one missing helper there and use it.
- Date differences must be DST-safe — use `Math.round` on the millisecond delta, not `Math.floor`, so a 23- or 25-hour day still counts as one day.
- `todaysPlanIndex()` stays in `workout.tsx` — only its use on the *custom-plan* card is removed. The AI-plan card's `todayIdx`/"· Today" behavior (`:746`, `:796`, `:802`) is untouched.
- The confirm step must not fire a DB write on pill tap — staging is local state only. Only the confirm control writes.
- Do not touch `no-scrollbar` on the sub-category pill row (`:1184`) or the `.no-scrollbar` CSS class itself (other rows may rely on it).
- No automated test runner in this repo — verification is manual click-through plus type-check-vs-baseline, consistent with every prior plan this session.
- Type-check command in this sandbox: `npx tsc --noEmit --ignoreConfig --jsx react-jsx --esModuleInterop --skipLibCheck --target es2020 --moduleResolution bundler <files>`. `--ignoreConfig` is mandatory (without it `tsc` emits only `TS5112` and silently parses nothing). This sandbox has no `node_modules`, so compare error counts against a `git stash` baseline rather than expecting a clean run; ignore `TS2307`/`TS2875`.

---

## Task 1: Add the anchor column (live migration)

**Files:**
- Create: `supabase/migrations/<assigned-version>_workout_plans_day_anchor.sql`

**Interfaces:**
- Consumes: existing `public.workout_plans`.
- Produces: column `custom_plan_day_anchor date not null default current_date`, backfilled on existing rows.

- [ ] **Step 1: Apply the migration**

Controller-run (live production DB — a security-sensitive action per this session's standing ruling), via `mcp__Supabase__apply_migration`:

```sql
alter table public.workout_plans
  add column custom_plan_day_anchor date not null default current_date;

comment on column public.workout_plans.custom_plan_day_anchor is
  'The date on which custom_plan_day_idx was last set. Together they define a
   self-advancing cycle: today''s day = (custom_plan_day_idx + days since this
   date) mod days_in_plan. Deliberately NOT tied to weekday — the user picks
   which day of their split is "today", and it rolls forward from there.';
```

- [ ] **Step 2: Verify**

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='workout_plans'
  and column_name='custom_plan_day_anchor';
```

Expected: one row, `date`, `NO`, `CURRENT_DATE`.

Then confirm existing rows were backfilled (read-only, no write — this session already had a direct test-write to a real user row blocked by the safety classifier, so verification stays read-only):

```sql
select id, custom_plan_day_idx, custom_plan_day_anchor from public.workout_plans;
```

Expected: every existing row has a non-null anchor equal to today's date.

- [ ] **Step 3: Save the migration file under the assigned version**

Read the version `apply_migration` assigned (`select version, name from supabase_migrations.schema_migrations order by version desc limit 1;`), write the same SQL to `supabase/migrations/<version>_workout_plans_day_anchor.sql`, and sync it to the user's machine — same filename-matches-version convention used for every migration this session.

---

## Task 2: Add the date-difference helper

**Files:**
- Modify: `src/lib/dates.ts`

**Interfaces:**
- Produces: `daysBetweenLocal(from: string, to: string): number` — whole days from ISO date `from` to ISO date `to`, positive when `to` is later. Consumed by Task 3.

- [ ] **Step 1: Append the helper**

Add to the end of `src/lib/dates.ts`:

```ts
/**
 * Whole days from ISO date `from` to ISO date `to` (positive when `to` is
 * later). Parses at local midnight and rounds, so DST days (23h/25h) still
 * count as exactly one day.
 */
export function daysBetweenLocal(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
```

- [ ] **Step 2: Leave a runnable self-check**

Non-trivial date math gets one check. Append to the same file:

```ts
/* istanbul ignore next -- dev self-check, tree-shaken from production builds */
export function __datesSelfCheck() {
  console.assert(daysBetweenLocal("2026-08-21", "2026-08-22") === 1, "next day");
  console.assert(daysBetweenLocal("2026-08-21", "2026-08-21") === 0, "same day");
  console.assert(daysBetweenLocal("2026-08-22", "2026-08-21") === -1, "previous day");
  console.assert(daysBetweenLocal("2026-08-21", "2026-08-28") === 7, "one week");
  // DST boundary (US spring-forward 2026-03-08 is a 23-hour day in most US zones)
  console.assert(daysBetweenLocal("2026-03-07", "2026-03-09") === 2, "spans DST");
}
```

Note: this is an exported dev helper, not wired into any runtime path — it exists so the rounding/DST behavior can be exercised from a console without adding a test framework to a repo that has none.

---

## Task 3: Make the custom plan a real cycle, fix the pill row, add confirm

**Files:**
- Modify: `src/routes/workout.tsx`

**Interfaces:**
- Consumes: `daysBetweenLocal` from Task 2, `custom_plan_day_anchor` from Task 1, existing `todayLocal` (already imported at `:80`).
- Produces: nothing exported — all changes are internal to the `WorkoutPage` component.

- [ ] **Step 1: Import the new helper**

`workout.tsx:80` currently reads:

```ts
import { todayLocal } from "@/lib/dates";
```

Change to:

```ts
import { todayLocal, daysBetweenLocal } from "@/lib/dates";
```

- [ ] **Step 2: Add anchor and pending-selection state**

`workout.tsx:326` currently reads:

```ts
  const [customDayIdx, setCustomDayIdx] = useState(0);
```

Change to:

```ts
  const [customDayIdx, setCustomDayIdx] = useState(0);
  // The date customDayIdx was set on. Together they form a self-advancing
  // cycle — see custom_plan_day_anchor's column comment.
  const [customDayAnchor, setCustomDayAnchor] = useState<string | null>(null);
  // A day the user tapped but hasn't confirmed yet. Local only — never written.
  const [pendingDayIdx, setPendingDayIdx] = useState<number | null>(null);
```

- [ ] **Step 3: Load the anchor alongside the index**

`workout.tsx:413` currently reads:

```ts
      setCustomDayIdx((wp as any).custom_plan_day_idx ?? 0);
```

Change to:

```ts
      setCustomDayIdx((wp as any).custom_plan_day_idx ?? 0);
      setCustomDayAnchor((wp as any).custom_plan_day_anchor ?? null);
```

(The row is already fetched with `select("*")`, so no query change is needed.)

- [ ] **Step 4: Replace `selectCustomDay` with a staging + confirm pair**

`workout.tsx:441-448` currently reads:

```ts
  /** User taps a day pill to mark it "current" — persists on the plan row so it survives missed days. */
  const selectCustomDay = async (i: number) => {
    setCustomDayIdx(i);
    if (!planId) return;
    const { error } = await supabase
      .from("workout_plans")
      .update({ custom_plan_day_idx: i } as any)
      .eq("id", planId);
    if (error) toast.error(error.message);
  };
```

Replace with:

```ts
  /**
   * Commit a re-phase of the cycle: the picked day becomes "today", anchored
   * to today's date, so it rolls forward from here. Only called from the
   * explicit confirm control — tapping a pill alone stages, never writes.
   */
  const confirmCustomDay = async (i: number) => {
    if (!planId) return;
    const anchor = todayLocal();
    const { error } = await supabase
      .from("workout_plans")
      .update({ custom_plan_day_idx: i, custom_plan_day_anchor: anchor } as any)
      .eq("id", planId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setCustomDayIdx(i);
    setCustomDayAnchor(anchor);
    setPendingDayIdx(null);
    toast.success("Day updated");
  };
```

Note the ordering change from the old function: state now updates *after* a successful write, not before it. The old version optimistically set state first and left the UI showing a day the database had rejected whenever the write failed.

- [ ] **Step 5: Compute today's day from the cycle instead of the raw index**

`workout.tsx:543-548` currently reads:

```ts
      // customDayIdx is the user-chosen "current" day (persisted). calendarIdx
      // is just the Mon-Sun reference shown as a hint on the pill row — it no
      // longer drives what counts as "today".
      const todayIdx = Math.min(customDayIdx, plan.days.length - 1);
      const calendarIdx = todaysPlanIndex(plan.days.length);
      const todayDay = plan.days[todayIdx];
```

Replace with:

```ts
      // The cycle: the user's chosen day, rolled forward by however many days
      // have passed since they chose it. Never consults the weekday — Day 1
      // is wherever the user started, not Monday.
      const dayCount = plan.days.length;
      const elapsed = customDayAnchor
        ? daysBetweenLocal(customDayAnchor, todayLocal())
        : 0;
      const todayIdx = dayCount > 0
        ? (((customDayIdx + elapsed) % dayCount) + dayCount) % dayCount
        : 0;
      const todayDay = plan.days[todayIdx];
```

`calendarIdx` is deleted — it was only used by the "· Cal" badge being removed in Step 6.

- [ ] **Step 6: Fix the pill row — wrap instead of scroll, stage instead of commit, drop the Cal badge**

`workout.tsx:614-631` currently reads:

```tsx
            {/* Day selector — pick which split day is "current" */}
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {plan.days.map((d, i) => (
                <button
                  key={i}
                  onClick={() => selectCustomDay(i)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
                    i === todayIdx
                      ? "bg-accent text-accent-foreground glow-accent-sm"
                      : i === calendarIdx
                        ? "border border-accent/50 text-accent"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d.day}
                  {i === calendarIdx && i !== todayIdx && " · Cal"}
                </button>
              ))}
            </div>
```

Replace with:

```tsx
            {/* Day selector — tap to stage, then confirm below. Wraps rather
                than scrolls so every day is reachable on desktop too. */}
            <div className="flex flex-wrap gap-2">
              {plan.days.map((d, i) => {
                const isToday = i === todayIdx;
                const isPending = i === pendingDayIdx && i !== todayIdx;
                return (
                  <button
                    key={i}
                    onClick={() =>
                      setPendingDayIdx((prev) => (prev === i || i === todayIdx ? null : i))
                    }
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
                      isToday
                        ? "bg-accent text-accent-foreground glow-accent-sm"
                        : isPending
                          ? "border-2 border-accent text-accent"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {d.day}
                  </button>
                );
              })}
            </div>

            {/* Confirm bar — only while a different day is staged */}
            {pendingDayIdx !== null && pendingDayIdx !== todayIdx && (
              <div className="animate-in fade-in slide-in-from-top-1 flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/5 p-3 duration-200">
                <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                  Make <span className="font-bold text-foreground">
                    {plan.days[pendingDayIdx].day}
                  </span> today? Your plan continues from there.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 text-xs"
                  onClick={() => setPendingDayIdx(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8 shrink-0 bg-accent text-xs text-accent-foreground hover:bg-accent/90"
                  onClick={() => confirmCustomDay(pendingDayIdx)}
                >
                  Confirm
                </Button>
              </div>
            )}
```

Note the toggle behavior in `onClick`: tapping the staged pill again un-stages it, and tapping the already-current day never stages anything — so the confirm bar can always be dismissed by tapping, not only via Cancel.

- [ ] **Step 7: Fix the same unreachable-pill bug on the AI-plan day selector**

`workout.tsx:789` currently reads:

```tsx
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
```

Change to:

```tsx
          <div className="flex flex-wrap gap-2">
```

Nothing else in that block changes — its `onClick={() => setPlanDayIdx(i)}` is local-only view state (not a persisted choice), so it needs no confirm step, and its `todayIdx`/"· Today" badge stays exactly as-is per the Global Constraints.

- [ ] **Step 8: Type-check against baseline**

```bash
npx tsc --noEmit --ignoreConfig --jsx react-jsx --esModuleInterop --skipLibCheck --target es2020 --moduleResolution bundler src/lib/dates.ts src/routes/workout.tsx
```

Capture the `TS1xxx`/`TS2xxx` lines (excluding `TS2307`/`TS2875`), then `git stash`, re-run, `git stash pop`, and diff the two. Expect zero new errors. In particular confirm no "`calendarIdx` is not defined" survivor — Step 5 deletes it and Step 6 removes its last two uses; a leftover reference is the most likely mistake in this task.

- [ ] **Step 9: Manual verification**

1. On `/workout` with a custom plan, confirm **all 7 day pills are visible** (wrapped onto two rows), with no horizontal scrolling and no "· Cal" suffix on any of them.
2. Tap a day that isn't today. Expected: that pill gets an outlined style, the current day keeps its filled style, and a confirm bar appears below reading "Make Day N today?". **Nothing has been saved yet** — reload the page and confirm the day is unchanged.
3. Tap the same staged pill again → confirm bar disappears, staging cleared. Tap a different day, then press Cancel → same result.
4. Stage a day and press **Confirm**. Expected: toast "Day updated", the pill becomes the filled/current one, confirm bar closes. Reload the page — the new day persists.
5. **The cycle test (this is the whole point of Issue 1).** After step 4, verify in the DB that both columns moved together:
   ```sql
   select custom_plan_day_idx, custom_plan_day_anchor from public.workout_plans;
   ```
   Expected: the index is the day you picked (0-based), and the anchor is today's date.
   Then simulate tomorrow **without waiting a day** by moving the anchor back one day — this is a write to the user's own plan row, so run it only with the user's go-ahead, and restore it afterward:
   ```sql
   -- shift the anchor one day into the past, i.e. pretend it is tomorrow
   update public.workout_plans set custom_plan_day_anchor = custom_plan_day_anchor - 1;
   ```
   Reload `/workout`. Expected: the card now shows the **next** day in the cycle (Day 4 → Day 5), and "TODAY:" shows that day's muscles. Shift it back by 6 more days and confirm it **wraps** past Day 7 to Day 1 rather than going out of range or negative.
   Restore with `update public.workout_plans set custom_plan_day_anchor = current_date;` and re-confirm the card shows the originally chosen day.
6. Confirm the AI-generated plan card (if one exists) still shows its own day pills, now wrapped, with its "· Today" badge intact and clicking a pill still switching the viewed day instantly (no confirm bar — that card is unchanged by design).

- [ ] **Step 10: Commit**

```bash
git add src/lib/dates.ts src/routes/workout.tsx
git commit -m "feat: custom plan advances as a real cycle via day anchor; wrap day pills; confirm before re-phasing"
```

---

## Self-Review

**Spec coverage:** All three reported issues have a task. Issue 1 (index does nothing over time) → Tasks 1-2 plus Task 3 Steps 1-5. Issue 2 (Days 6-7 unreachable) → Task 3 Steps 6-7. Issue 3 (no confirm) → Task 3 Steps 4 and 6. The user's underlying design question ("what is the use of storing the index") is answered structurally rather than deferred: the index becomes the cycle's phase, the anchor its clock.

**Placeholder scan:** No TBD/TODO. Every step shows exact before/after code with real line references. The one SQL step that writes to the user's data (Step 9's time-travel test) is explicitly gated on the user's go-ahead and paired with its restore statement, rather than being assumed safe — consistent with the classifier-blocked write earlier in this session.

**Type consistency:** `daysBetweenLocal(from: string, to: string): number` is defined in Task 2 and consumed in Task 3 Step 5 with two `string` arguments (`customDayAnchor` narrowed non-null by the ternary guard, and `todayLocal()` which returns `string`). `customDayAnchor` is `string | null`, matching a nullable-in-practice read from an untyped `as any` row even though the column itself is `not null` — the guard costs one ternary and protects against a legacy row or a failed select. `selectCustomDay` is renamed to `confirmCustomDay`; its only call site (`:619`) is rewritten in Step 6, so no dangling reference remains — the Step 8 type-check is specifically instructed to confirm that and the `calendarIdx` deletion.
