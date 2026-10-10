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
    return known && idx > home ? { kind: "back", steps: idx - home, then: false } : { kind: "replace" };
  if (from === HOME) return { kind: "push" };
  // On a page opened from a tab: drop back to the tab's own entry first.
  if (known && idx > home + 1)
    return { kind: "back", steps: idx - home - 1, then: true };
  return { kind: "replace" };
}
