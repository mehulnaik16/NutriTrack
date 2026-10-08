/**
 * The freshness rules for data this app keeps on the device, as pure
 * functions so they can be tested without a browser or the network
 * (cacheRules.test.ts). Used by services/storage.ts (progress photos) and
 * lib/water.ts (water prefs); lib/historyCache.ts shares FROZEN_DAYS.
 */
import type { WaterPrefs } from "@/lib/water";

/**
 * Entries dated before this many days ago can no longer be edited (the DB's
 * log edit window is 7 days; the 8th is margin for device vs account
 * timezone), so data tied to them is kept long-term.
 */
export const FROZEN_DAYS = 8;

export const RECENT_PHOTO_TTL_MS = 24 * 60 * 60 * 1000;
export const FROZEN_PHOTO_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Whether a cached progress photo may be shown without downloading it again.
 * `date` is the entry's date (YYYY-MM-DD); unknown counts as recent.
 * `frozenBefore` is the date FROZEN_DAYS ago. A missing or unreadable
 * `cachedAt` is never fresh.
 */
export function isPhotoFresh(
  cachedAt: number,
  date: string | undefined,
  now: number,
  frozenBefore: string,
): boolean {
  if (!Number.isFinite(cachedAt) || cachedAt <= 0 || cachedAt > now)
    return false;
  const ttl =
    date && date < frozenBefore ? FROZEN_PHOTO_TTL_MS : RECENT_PHOTO_TTL_MS;
  return now - cachedAt < ttl;
}

/**
 * Water prefs to use, given this device's saved copy and the account's
 * value. The account wins (it may have been changed on another device);
 * `changed` says whether what is on screen must be replaced.
 */
export function resolveWaterPrefs(
  local: WaterPrefs | null,
  account: WaterPrefs | null,
  defaults: WaterPrefs,
): { prefs: WaterPrefs; changed: boolean } {
  const prefs = account ?? local ?? defaults;
  const changed =
    !local || prefs.goalMl !== local.goalMl || prefs.cupMl !== local.cupMl;
  return { prefs, changed };
}
