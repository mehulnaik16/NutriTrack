/**
 * "What is new since this browser last looked?" — the two comparisons behind
 * every progress toast.
 *
 * Kept in their own module, free of imports, so they can be run by
 * `node src/lib/seen.test.ts`. They used to be three lines inside RankPage's
 * loader, which is why nothing ever tested the seeding rule below.
 */

/**
 * Which ids are new since this browser last looked.
 *
 * `seen == null` means we have never looked — a fresh install, a cleared
 * store, or a private window. That seeds silently: the caller writes the ids
 * and says nothing, because none of them happened while the user was watching.
 * Get this backwards and someone who has held nineteen badges for a month is
 * told about all nineteen at once.
 *
 * Note that `[]` is not the same as `null`: a browser whose set was genuinely
 * empty last time really is seeing its first badge now.
 */
export function newIds(
  seen: readonly string[] | null,
  current: readonly string[],
): string[] {
  if (!seen) return [];
  const before = new Set(seen);
  return current.filter((id) => !before.has(id));
}

/**
 * Whether to announce a level.
 *
 * Forward only. totalXP is recomputed from scratch on every load, so deleting
 * a week of logs can move the level *down*; that is a correction, not an
 * event, and the user should not hear about it.
 */
export function leveledUp(seen: number | null, current: number): boolean {
  return seen !== null && current > seen;
}
