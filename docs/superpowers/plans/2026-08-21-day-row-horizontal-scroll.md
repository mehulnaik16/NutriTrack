# Day Pill Row — Working Horizontal Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the day pills back on a single horizontally-scrolling line (undoing the wrap-to-two-rows change), and make that scrolling actually work with a mouse on a laptop — which is the part that was broken, and the only reason wrapping was introduced.

**Architecture:** The previous fix solved the wrong half of the problem. Touch scrolling always worked; the defect was desktop-only, and wrapping papered over it by removing scrolling entirely — at the cost of the compact single-line look the user wants. The correct fix keeps `overflow-x-auto` and adds the two things a mouse user needs: the wheel scrolling the row horizontally, and the current day being scrolled into view automatically so it is never hidden off-screen on load. Both behaviours are identical for the two day-pill rows on this page, so they move into one small `ScrollableDayRow` wrapper component that owns the container, the ref, and both effects — which also keeps the hooks legal, since the rows are currently rendered from `renderPlanCard()`, a plain function where hooks cannot live.

**Tech Stack:** React 19 (`useRef`, `useEffect`), native DOM `wheel` listener, Tailwind. No new dependencies.

**Spec:** None — direct follow-up bug report. Problem Statement below is the spec, confirmed against the current code.

## Problem Statement (confirmed against current code)

Both day-pill rows in `workout.tsx` are currently `<div className="flex flex-wrap gap-2">` — the custom-plan row (`:640`) and the AI-plan row (`:849`). They wrap onto multiple lines, so all days are visible without scrolling. The user does not want this: they want the original single compact line, scrolled sideways, with days moving into view as you scroll.

The original markup was `<div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">`. That worked on a phone — a touch swipe scrolls any `overflow-x` container natively. It failed on a laptop for two compounding reasons:

1. `.no-scrollbar` (`src/styles.css:279-284`) sets `scrollbar-width: none` and `::-webkit-scrollbar { display: none }`, so there is no scrollbar to drag with a mouse.
2. A vertical mouse wheel does not scroll a horizontal container. (Shift+wheel does, natively, but nothing indicates that and most users will never try it.)

Net effect on desktop: pills past the container edge are unreachable — the reported "cannot see Day 6 or Day 7, scrolling left isn't available."

So the row needs to scroll, and needs a mouse-usable way to scroll it. Two changes cover it:

- **Wheel-to-horizontal.** Translate wheel delta into `scrollLeft`. This must be attached as a *native* listener with `{ passive: false }` rather than React's `onWheel` prop: React attaches wheel listeners passively at the root in React 17+, which makes `preventDefault()` inside `onWheel` unreliable. Using a native listener is correct regardless of whether that behaviour holds in this exact version, so it costs nothing to design around.
- **Scroll the current day into view.** On load and whenever the current day changes, centre the active pill. This alone resolves the everyday case — the day you care about is on screen without you touching anything — and it matters more now that the cycle advances on its own, since the active pill moves one position further right each day and would otherwise drift off the visible edge unnoticed.

Rejected alternatives, and why:

- *Un-hide the scrollbar* (drop `no-scrollbar` on these rows): zero JS and gives a visible affordance, but puts a persistent scrollbar under the pills on Windows/Linux, which is exactly the visual clutter the compact card is avoiding. Reconsider only if the wheel handling proves insufficient in practice.
- *Arrow buttons at the row ends*: discoverable, but adds two controls and layout logic to a card that is deliberately sparse, and does nothing for touch users who already have swipe.
- *Click-and-drag to scroll*: the pills are buttons, so drag needs a movement threshold to avoid firing a day change on every drag — fiddly, and easy to get subtly wrong.
- *A fade/gradient mask on the right edge* to hint at more content: pure decoration, and the auto-scroll already keeps the relevant pill visible. Skipped deliberately; easy to add later if desired.

## Global Constraints

- Only `src/routes/workout.tsx` changes. No CSS changes — `.no-scrollbar` stays exactly as it is and keeps being used by the three other rows that rely on it (`:1251` sub-category pills, `:1411` and `:1762` tab strips). Those are out of scope and untouched.
- The pill markup itself does not change: the custom row keeps its staging/pending styling and confirm-bar behaviour, the AI row keeps its "· Today" badge and instant `setPlanDayIdx` switch. Only the container around them changes.
- The wheel handler must not hijack page scrolling. When the row is already at its left or right extreme, or has nothing to scroll, the event passes through untouched so the page scrolls normally.
- Auto-scroll must never move the page vertically. Set `scrollLeft` on the container directly rather than calling `scrollIntoView`, which can scroll ancestors vertically when the row is below the fold.
- Hooks cannot be added inside `renderPlanCard()` / `renderMuscleGrid()` — those are plain functions called during render, not components. Any ref or effect lives inside the new `ScrollableDayRow` component (or at `WorkoutPage`'s top level).
- No automated test runner in this repo. This change is DOM/layout behaviour with no extractable pure logic, so it carries no unit test — verification is the manual click-through in Task 1 Step 5. (The cycle math it sits next to is already covered by `src/lib/__cycle.test.mjs`; nothing in this change touches that logic.)
- Type-check command: `npx tsc --noEmit --ignoreConfig --jsx react-jsx --esModuleInterop --skipLibCheck --target es2020 --moduleResolution bundler <files>`. `--ignoreConfig` is mandatory. Compare against a `git stash` baseline; ignore `TS2307`/`TS2875` (this sandbox has no `node_modules`).

---

## Task 1: Add `ScrollableDayRow` and put both day rows back on one line

**Files:**
- Modify: `src/routes/workout.tsx`

**Interfaces:**
- Produces: `ScrollableDayRow({ activeIdx, children })` — a module-scope component in `workout.tsx` (not exported; it has one file's worth of callers). `activeIdx` is the 0-based index of the pill to keep visible; `children` are the pill buttons, rendered unchanged by the caller.
- Consumes: nothing new from other modules.

- [ ] **Step 1: Add `useRef` to the React import**

`workout.tsx:2` currently reads:

```ts
import { useEffect, useState, useMemo, Fragment } from "react";
```

Change to:

```ts
import { useEffect, useState, useMemo, useRef, Fragment } from "react";
```

- [ ] **Step 2: Add the `ScrollableDayRow` component at module scope**

Place it next to the other module-scope helper components in this file (e.g. immediately before `DayMuscleEditor`, which sits just after `todaysPlanIndex` around `:129`). Module scope matters — defining it inside `WorkoutPage` would give it a new identity on every render and remount the row, losing its scroll position on each keystroke elsewhere on the page.

```tsx
/**
 * One horizontally-scrolling line of day pills.
 *
 * Touch swipe scrolls this natively; a mouse does not, and the scrollbar is
 * hidden by design — so the wheel is wired to horizontal scrolling, and the
 * active day is scrolled into view automatically. Wheel is bound as a native
 * non-passive listener because React binds wheel passively at the root, where
 * preventDefault() would be ignored.
 */
function ScrollableDayRow({
  activeIdx,
  children,
}: {
  activeIdx: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Wheel → horizontal scroll, without stealing the page's vertical scroll.
  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const onWheel = (e: WheelEvent) => {
      if (row.scrollWidth <= row.clientWidth) return; // nothing to scroll
      const delta =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const atStart = row.scrollLeft <= 0 && delta < 0;
      const atEnd =
        row.scrollLeft + row.clientWidth >= row.scrollWidth - 1 && delta > 0;
      if (atStart || atEnd) return; // let the page take it
      e.preventDefault();
      row.scrollLeft += delta;
    };
    row.addEventListener("wheel", onWheel, { passive: false });
    return () => row.removeEventListener("wheel", onWheel);
  }, []);

  // Keep the active day on screen — it moves one pill further along each day
  // as the cycle advances, so it would otherwise drift out of view.
  useEffect(() => {
    const row = ref.current;
    const pill = row?.children[activeIdx] as HTMLElement | undefined;
    if (!row || !pill) return;
    // scrollLeft directly, never scrollIntoView — the latter can scroll the
    // page vertically when this row is below the fold.
    row.scrollLeft =
      pill.offsetLeft - row.clientWidth / 2 + pill.clientWidth / 2;
  }, [activeIdx, children]);

  return (
    <div ref={ref} className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
      {children}
    </div>
  );
}
```

Note on the second effect's `children` dependency: it re-centres when the pill set itself changes (a plan rebuilt with a different number of days), not just when `activeIdx` changes. `children` is a fresh array identity each render, so this effect runs on every render of the parent — that is acceptable here because the body is three cheap DOM reads and an assignment, and assigning the same `scrollLeft` value is a no-op that does not trigger scroll events or layout thrash.

- [ ] **Step 3: Put the custom-plan row back on one line**

`workout.tsx:638-640` currently reads:

```tsx
            {/* Day selector — tap to stage, then confirm below. Wraps rather
                than scrolls so every day is reachable on desktop too. */}
            <div className="flex flex-wrap gap-2">
              {plan.days.map((d, i) => {
```

Change the comment and opening tag to:

```tsx
            {/* Day selector — tap to stage, then confirm below. */}
            <ScrollableDayRow activeIdx={todayIdx}>
              {plan.days.map((d, i) => {
```

Then find that row's closing `</div>` — it is the one immediately after the `.map(...)` closes with `})}`, directly before the `{/* Confirm bar ... */}` comment — and change it to `</ScrollableDayRow>`.

Nothing between those tags changes: the pill buttons keep `shrink-0` (required — it is what stops flex from squashing them instead of overflowing), their staging/pending/today styling, and the `setPendingDayIdx` toggle.

- [ ] **Step 4: Put the AI-plan row back on one line**

`workout.tsx:848-850` currently reads:

```tsx
          {/* Day selector */}
          <div className="flex flex-wrap gap-2">
            {plan.days.map((d, i) => (
```

Change to:

```tsx
          {/* Day selector */}
          <ScrollableDayRow activeIdx={planDayIdx}>
            {plan.days.map((d, i) => (
```

and its matching closing `</div>` (immediately after that `.map(...)` closes with `))}`) to `</ScrollableDayRow>`.

`activeIdx` is `planDayIdx` here, not `todayIdx`: on the AI card the pills select which day is being *viewed*, so the one to keep on screen is the one the user is looking at. (On the custom card the pills mark which day is *current*, hence `todayIdx` there.)

- [ ] **Step 5: Type-check against baseline**

```bash
npx tsc --noEmit --ignoreConfig --jsx react-jsx --esModuleInterop --skipLibCheck --target es2020 --moduleResolution bundler src/routes/workout.tsx
```

Capture `TS1xxx`/`TS2xxx` lines excluding `TS2307`/`TS2875`, then `git stash`, re-run, `git stash pop`, and diff. Expect zero new errors. The likeliest mistake in this task is a mismatched closing tag — a `</div>` left where `</ScrollableDayRow>` belongs, or vice versa — which surfaces here as a `TS17002`/`TS1005` parse error, so do not skip this step.

- [ ] **Step 6: Manual verification**

On a laptop browser, on `/workout` with the 7-day custom plan:

1. The day pills are on **one line** again, not wrapped, with days past the edge clipped.
2. **Wheel over the pill row** scrolls it sideways; Day 6 and Day 7 become reachable and tappable. This is the originally-reported bug — confirm it directly.
3. Wheel over the row when it is scrolled fully left, scrolling further left → the **page** scrolls vertically instead of the row being stuck. Same at the fully-right extreme. The row must not trap the wheel.
4. Wheel over the rest of the page behaves exactly as before.
5. Reload the page. The **current day pill is visible without scrolling** — centred if the row is wide enough to centre it. Since the cycle now advances daily, this is what stops the active day drifting off-screen over the week.
6. Tap a day that is only reachable after scrolling (e.g. Day 7): the confirm bar appears as before, Confirm persists, Cancel clears. Scroll position is not lost when the confirm bar appears or closes.
7. On a phone (or with device emulation): swipe the row sideways — still works exactly as it did before.
8. On the AI-generated plan card, if one exists: same single line, wheel scrolls it, and clicking a day still switches the viewed day instantly with no confirm step.

- [ ] **Step 7: Commit**

```bash
git add src/routes/workout.tsx
git commit -m "fix: day pills scroll horizontally again, with wheel support and auto-scroll to the current day"
```

---

## Self-Review

**Spec coverage:** The single requirement — single-line scrolling pills that a laptop mouse can actually scroll — is covered by Task 1: Steps 3-4 restore the single line, Step 2 supplies wheel scrolling and auto-centring. The auto-centring is not strictly in the request, but is included because the cycle now advances the active day one pill per day, and without it the day the user most needs to see would drift off-screen within a week; it is one effect in the same component, not a separate feature.

**Placeholder scan:** No TBD/TODO. Steps 3 and 4 identify closing tags by their position relative to named neighbours rather than quoting line numbers that shift as the file is edited — deliberate, since both edits change line counts above the tags they describe.

**Type consistency:** `ScrollableDayRow` takes `activeIdx: number` and `children: React.ReactNode`. Both call sites pass a `number` (`todayIdx` from `cycleDayIndex`, `planDayIdx` from `useState(0)`) and JSX children. It is module-scope and unexported, so there are exactly two callers, both introduced here. `useRef` is added to the React import in Step 1 — the one new binding this task introduces.
