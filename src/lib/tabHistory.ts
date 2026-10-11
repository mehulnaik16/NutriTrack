/**
 * Back from any tab goes to Home, back from Home leaves the app: switching
 * tabs never piles up history. The stack is kept as [Home, tab, ...pages
 * opened from that tab], so the browser or phone back button needs no help.
 *
 * `idx` is the router's history index of the current entry, `home` the index
 * of the Home entry (null when unknown, e.g. the app was opened on a tab).
 */
export type TabStep =
  | { kind: "none" }
  | { kind: "push" }
  | { kind: "replace" }
  // Go back `steps` entries; then, if `then` is set, replace with the target.
  | { kind: "back"; steps: number; then: boolean };

export const HOME = "/dashboard";

export function tabStep(
  from: string,
  to: string,
  idx: number,
  home: number | null,
): TabStep {
  if (from === to) return { kind: "none" };
  const known = home !== null && idx >= home;
  if (to === HOME)
    return known && idx > home
      ? { kind: "back", steps: idx - home, then: false }
      : { kind: "replace" };
  if (from === HOME) return { kind: "push" };
  // On a page opened from a tab: drop back to the tab's own entry first.
  if (known && idx > home + 1)
    return { kind: "back", steps: idx - home - 1, then: true };
  return { kind: "replace" };
}

/** History index of the current entry, as TanStack Router records it. */
export const historyIndex = () =>
  (window.history.state as { __TSR_index?: number } | null)?.__TSR_index ?? 0;

/**
 * Entries to go back to drop a multi-step page whose first entry sits at
 * `start`: all of its own, and the one it was opened on top of is kept. When
 * the page was the first entry (a link or a reload), nothing sits before it.
 */
export const unwindSteps = (idx: number, start: number) =>
  Math.max(0, idx - start) + (start > 0 ? 1 : 0);

/**
 * Leave a multi-step page (workout setup, the calorie calculator's drill-down)
 * without leaving its steps in history, so back never lands on a stale,
 * filled-in step: go back past them, then open `to` unless we landed on it.
 * Landing still on `leaving` (it was the first entry) replaces it instead.
 *
 * `fresh`: also open `to` anew when we landed on it. That push cuts the left
 * steps off the forward stack too (an iPhone swipes forward, not only back),
 * for pages that must never come back, like a finished setup.
 */
export function leaveSteps(
  start: number,
  leaving: string,
  to: string,
  open: (replace: boolean) => void,
  fresh = false,
) {
  const land = () => {
    const at = window.location.pathname;
    if (at !== to) return open(at === leaving);
    if (!fresh) return;
    if (historyIndex() === 0) return open(true);
    window.addEventListener("popstate", () => open(false), { once: true });
    window.history.back();
  };
  const steps = unwindSteps(historyIndex(), start);
  if (!steps) return land();
  window.addEventListener("popstate", land, { once: true });
  window.history.go(-steps);
}
