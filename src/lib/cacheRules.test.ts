/* Runnable self-check for the device-cache freshness rules. Plain assert
   script, same convention as dates.test.ts. Run: npx tsx src/lib/cacheRules.test.ts */
import assert from "node:assert";
import {
  FROZEN_DAYS,
  FROZEN_PHOTO_TTL_MS,
  isPhotoFresh,
  RECENT_PHOTO_TTL_MS,
  resolveWaterPrefs,
} from "./cacheRules";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-10-08T18:00:00Z");
const frozenBefore = "2026-09-30"; // today minus FROZEN_DAYS

assert.equal(FROZEN_DAYS, 8, "photos and log history share the 8-day cutoff");

// ── Progress photos: latest week ────────────────────────────────────────────
// Fresh within a day, re-downloaded after, so a changed photo shows next day.
assert.ok(isPhotoFresh(now - 60_000, "2026-10-08", now, frozenBefore));
assert.ok(isPhotoFresh(now - (DAY - 1), "2026-10-01", now, frozenBefore));
assert.ok(!isPhotoFresh(now - DAY, "2026-10-08", now, frozenBefore));
assert.ok(!isPhotoFresh(now - 2 * DAY, "2026-10-01", now, frozenBefore));
// The cutoff day itself is still recent (only dates before it are frozen).
assert.ok(!isPhotoFresh(now - 2 * DAY, "2026-09-30", now, frozenBefore));
// No date known: treated as recent, never kept for a year.
assert.ok(!isPhotoFresh(now - 2 * DAY, undefined, now, frozenBefore));

// ── Progress photos: older than the cutoff ──────────────────────────────────
assert.ok(isPhotoFresh(now - 2 * DAY, "2026-09-29", now, frozenBefore));
assert.ok(isPhotoFresh(now - 300 * DAY, "2026-07-30", now, frozenBefore));
assert.ok(
  !isPhotoFresh(now - FROZEN_PHOTO_TTL_MS, "2026-07-30", now, frozenBefore),
);

// A photo downloaded while recent moves to the long rule once its date passes
// the cutoff: same copy, same cachedAt, now fresh again without a download.
const cachedAt = now - 3 * DAY;
assert.ok(!isPhotoFresh(cachedAt, "2026-09-30", now, frozenBefore));
assert.ok(isPhotoFresh(cachedAt, "2026-09-30", now + DAY, "2026-10-01"));

// Bad timestamps are never fresh: missing header, garbage, or from the future
// (a wrong device clock must not pin a copy for a year).
for (const bad of [Number.NaN, 0, -1, now + DAY]) {
  assert.ok(
    !isPhotoFresh(bad, "2026-07-30", now, frozenBefore),
    `cachedAt ${bad}`,
  );
}
assert.ok(RECENT_PHOTO_TTL_MS < FROZEN_PHOTO_TTL_MS);

// ── Water prefs ─────────────────────────────────────────────────────────────
const defaults = { goalMl: 2500, cupMl: 250 };

// The bug this guards: changed on another device (account 3500), this device
// still holds 2000. The account wins and the screen must update.
let r = resolveWaterPrefs(
  { goalMl: 2000, cupMl: 250 },
  { goalMl: 3500, cupMl: 250 },
  defaults,
);
assert.deepEqual(r, { prefs: { goalMl: 3500, cupMl: 250 }, changed: true });

// Only the cup changed elsewhere.
r = resolveWaterPrefs(
  { goalMl: 3500, cupMl: 250 },
  { goalMl: 3500, cupMl: 300 },
  defaults,
);
assert.deepEqual(r, { prefs: { goalMl: 3500, cupMl: 300 }, changed: true });

// Same on both: nothing to redraw.
r = resolveWaterPrefs(
  { goalMl: 3000, cupMl: 200 },
  { goalMl: 3000, cupMl: 200 },
  defaults,
);
assert.equal(r.changed, false);

// New device: nothing saved here, account has a value.
r = resolveWaterPrefs(null, { goalMl: 3000, cupMl: 200 }, defaults);
assert.deepEqual(r, { prefs: { goalMl: 3000, cupMl: 200 }, changed: true });

// Account never set (or read failed to give one): keep this device's value.
r = resolveWaterPrefs({ goalMl: 3000, cupMl: 200 }, null, defaults);
assert.deepEqual(r, { prefs: { goalMl: 3000, cupMl: 200 }, changed: false });

// Nothing anywhere: defaults.
r = resolveWaterPrefs(null, null, defaults);
assert.deepEqual(r, { prefs: defaults, changed: true });

console.log("✓ cacheRules.test.ts: all assertions passed");
