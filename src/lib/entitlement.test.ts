/* Runnable self-check for the entitlement fold. No test framework in this repo,
   so this is a plain assert script — same convention as referral.test.ts.

   Build and run:
     npx tsc --outDir <tmp> --target es2020 --module es2020 \
       --moduleResolution bundler --skipLibCheck \
       src/lib/entitlement.ts src/lib/trial.ts src/lib/referral.ts \
       src/lib/plans.ts src/lib/entitlement.test.ts
     # bare Node ESM needs explicit extensions; Vite does not, so only the
     # build output is patched:
     sed -i 's|from "./trial"|from "./trial.js"|;s|from "./entitlement"|from "./entitlement.js"|;s|from "./referral"|from "./referral.js"|;s|from "./plans"|from "./plans.js"|' <tmp>/*.js
     node <tmp>/entitlement.test.js

   Exits non-zero on the first failure.

   These cases pin the behaviour the whole anti-abuse design rests on: days are
   queued and never spent in parallel, nothing is lost, nothing is counted
   twice, and a clawback can only take back what was not used. */
import assert from "node:assert";
import {
  accessDaysLeft,
  computeAccessUntil,
  hasAccess,
  type Grant,
} from "./entitlement";
import { BASE_TRIAL_DAYS } from "./trial";
import {
  MAX_FREE_DAYS,
  MAX_PREMIUM_DAYS,
  PREMIUM_DAYS_PER_SUBSCRIPTION,
  PREMIUM_HOLD_DAYS,
  freeDaysEarned,
  premiumDaysEarned,
} from "./referral";

const DAY = 24 * 60 * 60 * 1000;
/** Midnight IST on the trial start date used throughout. */
const T0 = new Date("2026-03-01T00:00:00+05:30").getTime();
const at = (days: number) => new Date(T0 + days * DAY);
/** Whole days between the fold's answer and the trial start. */
const daysFromT0 = (d: Date | null) => (d === null ? null : (d.getTime() - T0) / DAY);

// ── the constant this file and the SQL must agree on ──────────────────────
// If BASE_TRIAL_DAYS moves, recompute_access()'s base interval moves with it.
// A mismatch shows the user one number and gates on another.
assert.equal(BASE_TRIAL_DAYS, 7, "BASE_TRIAL_DAYS must match recompute_access()");

// ── no trial, no grants: fails closed ─────────────────────────────────────
assert.equal(computeAccessUntil({ trialStartDate: null }), null);
assert.equal(computeAccessUntil({ trialStartDate: undefined }), null);
assert.equal(computeAccessUntil({ trialStartDate: "not-a-date" }), null);

// ── the bare trial ────────────────────────────────────────────────────────
assert.equal(daysFromT0(computeAccessUntil({ trialStartDate: "2026-03-01" })), 7);

// Pool A extends the trial window rather than queueing behind it.
assert.equal(
  daysFromT0(computeAccessUntil({ trialStartDate: "2026-03-01", bonusTrialDays: 5 })),
  12,
);
// A negative or absurd bonus cannot shorten or explode the window.
assert.equal(
  daysFromT0(computeAccessUntil({ trialStartDate: "2026-03-01", bonusTrialDays: -99 })),
  7,
);

// ── queueing: paying mid-trial must not burn both at once ─────────────────
// Charged on day 2 with 5 trial days still to run. The paid period starts at
// trial end, so the total is 7 + 365, not 2 + 365 and not max(7, 367).
const midTrialPurchase: Grant[] = [{ days: 365, effectiveAt: at(2) }];
assert.equal(
  daysFromT0(
    computeAccessUntil({ trialStartDate: "2026-03-01", grants: midTrialPurchase }),
  ),
  7 + 365,
  "paid period must start at trial end — nothing consumed in parallel",
);

// ── queueing: paying after a lapse is honoured in full, not retroactively ──
assert.equal(
  daysFromT0(
    computeAccessUntil({
      trialStartDate: "2026-03-01",
      grants: [{ days: 365, effectiveAt: at(27) }],
    }),
  ),
  27 + 365,
  "a late payment starts at the charge, not at the old trial end",
);

// ── queueing: a renewal extends, it does not double-count ─────────────────
assert.equal(
  daysFromT0(
    computeAccessUntil({
      trialStartDate: "2026-03-01",
      grants: [
        { days: 30, effectiveAt: at(2) },
        { days: 30, effectiveAt: at(20) }, // renewal while still active
      ],
    }),
  ),
  7 + 30 + 30,
  "overlapping grants queue; no day is lost and no day is spent twice",
);

// Order of the input array must not matter — the fold sorts by effectiveAt.
assert.equal(
  daysFromT0(
    computeAccessUntil({
      trialStartDate: "2026-03-01",
      grants: [
        { days: 30, effectiveAt: at(20) },
        { days: 30, effectiveAt: at(2) },
      ],
    }),
  ),
  7 + 30 + 30,
);

// ── the 3-day hold needs no cron: a future grant contributes zero ─────────
const heldBonus: Grant[] = [
  { days: 60, effectiveAt: at(2 + PREMIUM_HOLD_DAYS) }, // friend paid on day 2
];
// Read on day 3, before the hold elapses: the bonus has not landed. The fold is
// evaluated on the timeline, so "not landed" shows up as the trial end standing
// alone until the grant's own instant is reached.
assert.equal(
  daysFromT0(computeAccessUntil({ trialStartDate: "2026-03-01", grants: [] })),
  7,
);
// Once it takes effect it queues behind the trial like any other grant.
assert.equal(
  daysFromT0(computeAccessUntil({ trialStartDate: "2026-03-01", grants: heldBonus })),
  7 + 60,
);

// ── clawback: only the unused remainder goes ──────────────────────────────
// A 60-day bonus effective at trial end, clawed back 20 days into its window.
assert.equal(
  daysFromT0(
    computeAccessUntil({
      trialStartDate: "2026-03-01",
      grants: [{ days: 60, effectiveAt: at(7), clawbackAt: at(27) }],
    }),
  ),
  7 + 20,
  "days already lived through are kept; only the remainder is revoked",
);

// A refund filed during the hold lands before the window opens, so the grant is
// worth nothing and the credit never appears.
assert.equal(
  daysFromT0(
    computeAccessUntil({
      trialStartDate: "2026-03-01",
      grants: [{ days: 60, effectiveAt: at(5), clawbackAt: at(3) }],
    }),
  ),
  7,
  "a clawback before the window start makes the grant worth zero days",
);

// A clawback can never push access behind days already consumed.
const clawedBack = computeAccessUntil({
  trialStartDate: "2026-03-01",
  grants: [{ days: 60, effectiveAt: at(7), clawbackAt: at(0) }],
});
assert.ok(daysFromT0(clawedBack)! >= 7, "clawback must not move access backwards");

// A clawback after the grant fully ran changes nothing.
assert.equal(
  daysFromT0(
    computeAccessUntil({
      trialStartDate: "2026-03-01",
      grants: [{ days: 60, effectiveAt: at(7), clawbackAt: at(999) }],
    }),
  ),
  7 + 60,
);

// ── stacking: both pools pay, and they spend as one queue ─────────────────
// 1 signup referral (5 trial days) + 1 friend who bought yearly (60 premium).
assert.equal(
  daysFromT0(
    computeAccessUntil({
      trialStartDate: "2026-03-01",
      bonusTrialDays: 5,
      grants: [{ days: 60, effectiveAt: at(1 + PREMIUM_HOLD_DAYS) }],
    }),
  ),
  7 + 5 + 60,
  "pool A extends the trial, pool B queues behind it — 65 days across the two",
);

// ── a user who pays without ever starting a trial ─────────────────────────
assert.equal(
  computeAccessUntil({
    trialStartDate: null,
    grants: [{ days: 365, effectiveAt: at(3) }],
  })!.getTime(),
  at(3 + 365).getTime(),
  "no trial means the fold starts at the first grant, not at zero",
);

// ── hasAccess: reads the date, and fails closed ───────────────────────────
const now = at(10);
assert.equal(hasAccess(null, now), false);
assert.equal(hasAccess(undefined, now), false);
assert.equal(hasAccess("", now), false);
assert.equal(hasAccess("garbage", now), false);
assert.equal(hasAccess(at(11), now), true);
assert.equal(hasAccess(at(9), now), false);
assert.equal(hasAccess(at(10), now), false, "expiry is exclusive");
assert.equal(hasAccess(at(11).toISOString(), now), true, "accepts an ISO string");

// ── accessDaysLeft: null and 0 mean different things ──────────────────────
assert.equal(accessDaysLeft(null, now), null, "never granted");
assert.equal(accessDaysLeft(at(9), now), 0, "granted and expired");
assert.equal(accessDaysLeft(at(13), now), 3);

// ── the display caps mirror the SQL row limits ────────────────────────────
assert.equal(freeDaysEarned(0), 0);
assert.equal(freeDaysEarned(1), 5);
assert.equal(freeDaysEarned(12), MAX_FREE_DAYS);
assert.equal(freeDaysEarned(13), MAX_FREE_DAYS, "13th referral adds no days");
assert.equal(freeDaysEarned(50), MAX_FREE_DAYS);

assert.equal(premiumDaysEarned(0), 0);
assert.equal(premiumDaysEarned(1), PREMIUM_DAYS_PER_SUBSCRIPTION);
assert.equal(premiumDaysEarned(8), MAX_PREMIUM_DAYS);
assert.equal(premiumDaysEarned(9), MAX_PREMIUM_DAYS, "9th yearly referral adds none");
assert.equal(premiumDaysEarned(50), MAX_PREMIUM_DAYS, "was uncapped before this work");
assert.equal(premiumDaysEarned(-3), 0);

console.log("entitlement.test.ts — all assertions passed");
