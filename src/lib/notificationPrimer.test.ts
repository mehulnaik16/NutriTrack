/* Runnable unit test for Notification Pre-Permission Primer logic. */
import assert from "node:assert";

// Mock localStorage and window for Node environment
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => {
    store[key] = value;
  },
  removeItem: (key: string) => {
    delete store[key];
  },
  clear: () => {
    for (const k of Object.keys(store)) delete store[k];
  },
};

(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).window = {
  dispatchEvent: (event: any) => {
    eventsDispatched.push(event);
    return true;
  },
};
(globalThis as any).CustomEvent = class {
  type: string;
  detail: any;
  constructor(type: string, opts?: any) {
    this.type = type;
    this.detail = opts?.detail;
  }
};

const eventsDispatched: any[] = [];

import {
  checkDay5Eligible,
  dismissPrimer,
  getPrimerState,
  isOnboarded,
  markOnboarded,
  markPrimerGranted,
  recordFoodLog,
  recordWorkoutLog,
  triggerDay5Primer,
} from "./notificationPrimer.ts";

const USER_ID = "test-user-123";

// 1. Initial state
mockLocalStorage.clear();
eventsDispatched.length = 0;
const s0 = getPrimerState(USER_ID);
assert.equal(s0.foodLogsCount, 0);
assert.equal(s0.workoutLogsCount, 0);
assert.equal(s0.trigger1Handled, false);
assert.equal(s0.trigger2Handled, false);
assert.equal(isOnboarded(USER_ID), false, "fresh user is not onboarded");

// 2. Before onboarding, nothing fires and nothing is recorded
assert.equal(
  recordFoodLog(USER_ID),
  false,
  "food log pre-onboarding is silent",
);
assert.equal(
  recordWorkoutLog(USER_ID),
  false,
  "workout log pre-onboarding is silent",
);
assert.equal(eventsDispatched.length, 0);
assert.equal(
  getPrimerState(USER_ID).trigger1Handled,
  false,
  "a suppressed prompt must not burn the one lifetime ask",
);
assert.equal(getPrimerState(USER_ID).foodLogsCount, 0);

// 3. Onboarded: the FIRST food log triggers
markOnboarded(USER_ID);
assert.equal(isOnboarded(USER_ID), true);
const r1 = recordFoodLog(USER_ID);
assert.equal(r1, true, "1st food log after onboarding triggers primer");
assert.equal(eventsDispatched.length, 1);
assert.equal(eventsDispatched[0].detail.trigger, "engagement");
assert.equal(getPrimerState(USER_ID).foodLogsCount, 1);
assert.equal(getPrimerState(USER_ID).trigger1Handled, true);

// 4. No further log of any kind triggers again
eventsDispatched.length = 0;
assert.equal(recordFoodLog(USER_ID), false, "2nd food log does not re-ask");
assert.equal(recordFoodLog(USER_ID), false, "3rd food log does not re-ask");
assert.equal(
  recordWorkoutLog(USER_ID),
  false,
  "a workout does not re-ask either",
);
assert.equal(eventsDispatched.length, 0, "at most one engagement prompt, ever");

// 5. Workout is the other way in, on a fresh onboarded user
mockLocalStorage.clear();
eventsDispatched.length = 0;
const USER_2 = "test-user-workout";
assert.equal(recordWorkoutLog(USER_2), false, "not onboarded yet");
markOnboarded(USER_2);
const w1 = recordWorkoutLog(USER_2);
assert.equal(w1, true, "1st workout log triggers primer");
assert.equal(eventsDispatched.length, 1);
assert.equal(eventsDispatched[0].detail.trigger, "engagement");
assert.equal(getPrimerState(USER_2).workoutLogsCount, 1);
assert.equal(getPrimerState(USER_2).trigger1Handled, true);
assert.equal(
  recordFoodLog(USER_2),
  false,
  "food after a workout does not re-ask",
);

// 6. Test Day 5 eligibility
const now = Date.now();
const day4Ago = new Date(now - 4 * 86_400_000);
const day5Ago = new Date(now - 5.1 * 86_400_000);

// Storage was cleared above, so USER_ID is a day-5-old account that has not
// been onboarded -> still ineligible.
assert.equal(
  checkDay5Eligible(USER_ID, day5Ago),
  false,
  "day 5 without onboarding is not eligible",
);
markOnboarded(USER_ID);

// 4 days old -> ineligible
assert.equal(
  checkDay5Eligible(USER_ID, day4Ago),
  false,
  "day 4 is not eligible",
);

// 5 days old -> eligible
assert.equal(checkDay5Eligible(USER_ID, day5Ago), true, "day 5 is eligible");

// Dismissing sets cooldown
dismissPrimer(USER_ID);
assert.ok(getPrimerState(USER_ID).lastDismissedAt);

// Within 48 hours of dismissal -> ineligible even if Day 5+
assert.equal(
  checkDay5Eligible(USER_ID, day5Ago),
  false,
  "dismissed less than 48h ago is ineligible",
);

// If dismissed 50 hours ago -> eligible
const sUser = getPrimerState(USER_ID);
sUser.lastDismissedAt = new Date(now - 50 * 3600 * 1000).toISOString();
mockLocalStorage.setItem(
  `dombelz_notif_primer_${USER_ID}`,
  JSON.stringify(sUser),
);
assert.equal(
  checkDay5Eligible(USER_ID, day5Ago),
  true,
  "dismissed 50h ago is eligible",
);

// Triggering Day 5
eventsDispatched.length = 0;
triggerDay5Primer(USER_ID);
assert.equal(eventsDispatched.length, 1);
assert.equal(eventsDispatched[0].detail.trigger, "day5");
assert.equal(getPrimerState(USER_ID).trigger2Handled, true);

// ...and never again. Two prompts is the whole budget.
assert.equal(
  checkDay5Eligible(USER_ID, day5Ago),
  false,
  "day 5 fires once, not on every launch after",
);

// Once granted, never eligible
markPrimerGranted(USER_ID);
assert.equal(getPrimerState(USER_ID).granted, true);
assert.equal(
  checkDay5Eligible(USER_ID, day5Ago),
  false,
  "granted user is never eligible",
);
assert.equal(
  recordFoodLog(USER_ID),
  false,
  "granted user never triggered on food",
);

// 7. A blob from an older build must not read as NaN and re-prompt someone
const USER_3 = "test-user-legacy";
mockLocalStorage.setItem(
  `dombelz_notif_primer_${USER_3}`,
  JSON.stringify({ trigger1Handled: true, lastDismissedAt: 12345 }),
);
const legacy = getPrimerState(USER_3);
assert.equal(
  legacy.foodLogsCount,
  0,
  "missing counter reads as 0, not undefined",
);
assert.equal(legacy.workoutLogsCount, 0);
assert.equal(legacy.trigger1Handled, true, "flags that are present survive");
assert.equal(legacy.trigger2Handled, false);
assert.equal(
  legacy.lastDismissedAt,
  null,
  "a non-string timestamp is discarded",
);
assert.equal(legacy.granted, false);

// Unparseable blob falls back to defaults rather than throwing
mockLocalStorage.setItem(`dombelz_notif_primer_${USER_3}`, "{not json");
assert.equal(getPrimerState(USER_3).trigger1Handled, false);

console.log("notificationPrimer.test.ts: all assertions passed successfully!");
