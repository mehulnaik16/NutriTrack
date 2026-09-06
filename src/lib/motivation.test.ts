/* Runnable self-check for the 100-day motivation cycle.
   No test framework in this repo, so this is a plain assert script — same
   convention as plans.test.ts and referral.test.ts.

   The day-number arithmetic is worth pinning down because every way it can be
   wrong is silent: an off-by-one shows the wrong quote, a timezone slip moves
   the boundary by hours, and a non-deterministic shuffle would hand the same
   user different quotes on their phone and on a replacement phone. None of
   those throw.

   Build and run:
     npx tsc --outDir <tmp> --target es2020 --module es2020 \
       --moduleResolution bundler --skipLibCheck \
       src/lib/motivation.ts src/data/motivationQuotes.ts src/lib/motivation.test.ts
     find <tmp> -name "*.js" -exec sed -i \
       's|from "@/data/motivationQuotes"|from "../data/motivationQuotes.js"|;s|from "./motivation"|from "./motivation.js"|' {} +
     node <tmp>/lib/motivation.test.js

   Exits non-zero on the first failure. */
import assert from "node:assert";
import {
  CYCLE_LENGTH,
  MOTIVATION_WINDOW_DAYS,
  addDaysToKey,
  daysBetweenKeys,
  localDateKey,
  motivationFor,
  motivationWindow,
  quoteOrder,
  type MotivationUser,
} from "./motivation";
import { MOTIVATION_QUOTES } from "@/data/motivationQuotes";

const user: MotivationUser = {
  id: "3f8c1e42-9a7b-4d51-8e2f-6c0b91d4a7e3",
  createdAt: "2026-01-01T18:30:00.000Z", // 2026-01-02 00:00 IST
  timezone: "Asia/Kolkata",
  motivationSeed: 424242,
};

// ── The quote set itself ─────────────────────────────────────────────────────

assert.equal(MOTIVATION_QUOTES.length, 100, "the cycle is 100 days long");
assert.equal(CYCLE_LENGTH, 100);

assert.deepEqual(
  MOTIVATION_QUOTES.map((q) => q.id),
  Array.from({ length: 100 }, (_, i) => i + 1),
  "ids are 1..100 in order — the shuffle indexes over positions, so a gap would skip a day",
);

for (const q of MOTIVATION_QUOTES) {
  assert.ok(q.text.trim().length > 0, `quote ${q.id} has text`);
  assert.ok(q.author.trim().length > 0, `quote ${q.id} has an author`);
}

// ── Calendar boundaries ──────────────────────────────────────────────────────

// The whole reason day counting works on calendar keys rather than elapsed
// milliseconds: 23:50 to 00:10 is 20 minutes but a new day.
assert.equal(
  localDateKey("2026-01-01T18:29:00.000Z", "Asia/Kolkata"),
  "2026-01-01",
  "23:59 IST is still the first",
);
assert.equal(
  localDateKey("2026-01-01T18:30:00.000Z", "Asia/Kolkata"),
  "2026-01-02",
  "00:00 IST has rolled over",
);

// Same instant, two zones, two different calendar days.
assert.equal(
  localDateKey("2026-01-01T20:00:00.000Z", "Asia/Kolkata"),
  "2026-01-02",
);
assert.equal(
  localDateKey("2026-01-01T20:00:00.000Z", "America/New_York"),
  "2026-01-01",
);

assert.equal(daysBetweenKeys("2026-01-01", "2026-01-01"), 0);
assert.equal(daysBetweenKeys("2026-01-01", "2026-01-02"), 1);
assert.equal(
  daysBetweenKeys("2026-02-28", "2026-03-01"),
  1,
  "2026 is not a leap year",
);
assert.equal(daysBetweenKeys("2024-02-28", "2024-03-01"), 2, "2024 is");
assert.equal(daysBetweenKeys("2026-01-02", "2026-01-01"), -1);

// A DST transition must not turn a day into 23 or 25 hours' worth of arithmetic.
assert.equal(
  daysBetweenKeys("2026-03-07", "2026-03-09"),
  2,
  "spans the US spring-forward",
);

assert.equal(addDaysToKey("2026-12-31", 1), "2027-01-01");
assert.equal(addDaysToKey("2026-03-01", -1), "2026-02-28");

// ── Day numbering ────────────────────────────────────────────────────────────

const first = motivationFor(user, "2026-01-02");
assert.equal(first.dayNumber, 1, "the day the account exists is day 1");
assert.equal(first.cycle, 0);

assert.equal(motivationFor(user, "2026-01-25").dayNumber, 24);
assert.equal(
  motivationFor(user, "2026-04-11").dayNumber,
  100,
  "last day of pass one",
);
assert.equal(motivationFor(user, "2026-04-11").cycle, 0);

const rollover = motivationFor(user, "2026-04-12");
assert.equal(rollover.dayNumber, 1, "day 101 shows as day 1 again");
assert.equal(rollover.cycle, 1, "…but on the second pass");

// A back-dated profile or a clock set backwards must not index off the array.
const before = motivationFor(user, "2025-06-01");
assert.equal(before.dayNumber, 1, "clamped rather than negative");
assert.ok(before.quote, "and still resolves to a quote");

// ── Determinism ──────────────────────────────────────────────────────────────

assert.equal(
  motivationFor(user, "2026-01-25").quote.id,
  motivationFor(user, "2026-01-25").quote.id,
  "same user, same day, same quote — every call",
);

const order0 = quoteOrder(user.id, user.motivationSeed, 0);
assert.deepEqual(
  [...order0].sort((a, b) => a - b),
  Array.from({ length: 100 }, (_, i) => i),
  "the shuffle is a permutation: every quote appears exactly once per pass",
);

const pass0 = Array.from(
  { length: 100 },
  (_, i) => motivationFor(user, addDaysToKey("2026-01-02", i)).quote.id,
);
assert.equal(new Set(pass0).size, 100, "no quote repeats within a pass");

const pass1 = Array.from(
  { length: 100 },
  (_, i) => motivationFor(user, addDaysToKey("2026-04-12", i)).quote.id,
);
assert.equal(new Set(pass1).size, 100, "nor within the second pass");
assert.notDeepEqual(pass0, pass1, "the second pass is reordered, not a replay");

// Two users starting the same morning should not read the same hundred quotes
// in the same order.
const other: MotivationUser = {
  ...user,
  id: "9d1a77b0-2c34-4e88-b5f1-0e6a3c9d2b41",
};
assert.notEqual(
  quoteOrder(other.id, other.motivationSeed, 0).join(),
  order0.join(),
  "the order is per-user, not global",
);

// The seed is what a support fix would change to reshuffle someone.
assert.notEqual(
  quoteOrder(user.id, user.motivationSeed + 1, 0).join(),
  order0.join(),
  "a different seed gives a different order",
);

// ── The scheduling window ────────────────────────────────────────────────────

const win = motivationWindow(user, MOTIVATION_WINDOW_DAYS, "2026-01-02");
assert.equal(win.length, 30, "one entry per day of the window");
assert.equal(win[0].date, "2026-01-02");
assert.equal(win[29].date, "2026-01-31");
assert.deepEqual(
  win.map((d) => d.dayNumber),
  Array.from({ length: 30 }, (_, i) => i + 1),
  "consecutive days, no gaps",
);

// The window has to survive being computed across a cycle boundary — this is
// the case that would break if the shuffle were resolved once per call site.
const spanning = motivationWindow(user, 5, "2026-04-09");
assert.deepEqual(
  spanning.map((d) => d.date),
  ["2026-04-09", "2026-04-10", "2026-04-11", "2026-04-12", "2026-04-13"],
);
assert.deepEqual(
  spanning.map((d) => d.dayNumber),
  [98, 99, 100, 1, 2],
);
assert.deepEqual(
  spanning.map((d) => d.cycle),
  [0, 0, 0, 1, 1],
);

// The pair either side of the boundary must come from different permutations —
// this is what makes day 101 a reshuffle rather than a replay.
assert.notEqual(
  spanning[3].quote.id,
  motivationFor(user, "2026-01-02").quote.id,
  "day 101 is not day 1's quote again",
);

console.log("motivation: all assertions passed");
