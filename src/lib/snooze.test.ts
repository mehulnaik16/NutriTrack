/* Runnable self-check for the quiet-hours correction.
   No test framework in this repo, so this is a plain assert script — same
   convention as plans.test.ts and motivation.test.ts.

   Worth pinning because every way this goes wrong is quiet: a reminder that
   lands at 3am wakes someone, and one pushed a day further than intended just
   never arrives. Neither throws.

   Build and run:
     npx tsc --outDir <tmp> --target es2020 --module es2020 \
       --moduleResolution bundler --skipLibCheck src/lib/snooze.test.ts
     node <tmp>/snooze.test.js

   Exits non-zero on the first failure. */
import assert from "node:assert";
import { applyQuietHours } from "./snooze";

const at = (h: number, m = 0) => new Date(2026, 8, 19, h, m, 0, 0);
const OFF = { on: false, from: "22:00", to: "06:00" };
const NIGHT = { on: true, from: "22:00", to: "06:00" };
const DAY = { on: true, from: "09:00", to: "17:00" };

// ── Disabled ─────────────────────────────────────────────────────────────────

const untouched = applyQuietHours(at(23, 30), OFF);
assert.equal(untouched.overridden, false);
assert.equal(untouched.at.getHours(), 23, "quiet hours off changes nothing");

// ── Outside the window ───────────────────────────────────────────────────────

for (const h of [6, 12, 21]) {
  const r = applyQuietHours(at(h, 30), NIGHT);
  assert.equal(r.overridden, false, `${h}:30 is outside 22:00-06:00`);
  assert.equal(r.at.getHours(), h);
}

// 06:00 is the end of the window, so it is already out.
assert.equal(applyQuietHours(at(6, 0), NIGHT).overridden, false);

// ── Inside a window that wraps midnight ──────────────────────────────────────

// Late evening: pushed to 06:01 the NEXT day.
const evening = applyQuietHours(at(22, 30), NIGHT);
assert.equal(evening.overridden, true);
assert.equal(evening.at.getHours(), 6);
assert.equal(evening.at.getMinutes(), 1);
assert.equal(evening.at.getDate(), 20, "22:30 moves to tomorrow morning");

// 22:00 exactly is the first minute inside.
assert.equal(applyQuietHours(at(22, 0), NIGHT).overridden, true);

// Small hours: pushed to 06:01 the SAME day. This is the case a naive
// implementation gets wrong by always adding a day.
const smallHours = applyQuietHours(at(3, 15), NIGHT);
assert.equal(smallHours.overridden, true);
assert.equal(smallHours.at.getHours(), 6);
assert.equal(smallHours.at.getMinutes(), 1);
assert.equal(smallHours.at.getDate(), 19, "03:15 moves to this morning");

// Just before the window ends.
const almostOut = applyQuietHours(at(5, 59), NIGHT);
assert.equal(almostOut.overridden, true);
assert.equal(almostOut.at.getDate(), 19);

// ── A window that does not wrap ──────────────────────────────────────────────
// Nobody has configured 09:00-17:00 yet, but the UI permits it.

assert.equal(applyQuietHours(at(8, 0), DAY).overridden, false);
const midday = applyQuietHours(at(12, 0), DAY);
assert.equal(midday.overridden, true);
assert.equal(midday.at.getHours(), 17);
assert.equal(midday.at.getMinutes(), 1);
assert.equal(midday.at.getDate(), 19, "a same-day window never moves the date");
assert.equal(applyQuietHours(at(18, 0), DAY).overridden, false);

// ── The result is always in the future relative to the input ─────────────────
// The whole point is delaying a notification, never pulling one forward.

for (const h of [0, 3, 5, 22, 23]) {
  const r = applyQuietHours(at(h, 30), NIGHT);
  assert.ok(
    r.at.getTime() > at(h, 30).getTime(),
    `${h}:30 must move forward, not back`,
  );
}

console.log("snooze: all assertions passed");
