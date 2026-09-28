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
  markPrimerGranted,
  recordFoodLog,
  recordWorkoutLog,
  triggerDay5Primer,
} from "./notificationPrimer";

const USER_ID = "test-user-123";

// 1. Initial state
mockLocalStorage.clear();
eventsDispatched.length = 0;
const s0 = getPrimerState(USER_ID);
assert.equal(s0.foodLogsCount, 0);
assert.equal(s0.workoutLogsCount, 0);
assert.equal(s0.trigger1Handled, false);
assert.equal(s0.trigger2Handled, false);

// 2. Logging 1 food should NOT trigger
const r1 = recordFoodLog(USER_ID);
assert.equal(r1, false, "1 food log should not trigger primer");
assert.equal(eventsDispatched.length, 0);
assert.equal(getPrimerState(USER_ID).foodLogsCount, 1);
assert.equal(getPrimerState(USER_ID).trigger1Handled, false);

// 3. Logging 2nd food SHOULD trigger Trigger 1
const r2 = recordFoodLog(USER_ID);
assert.equal(r2, true, "2nd food log triggers primer");
assert.equal(eventsDispatched.length, 1);
assert.equal(eventsDispatched[0].detail.trigger, "engagement");
assert.equal(getPrimerState(USER_ID).foodLogsCount, 2);
assert.equal(getPrimerState(USER_ID).trigger1Handled, true);

// 4. Logging 3rd food does NOT trigger again
eventsDispatched.length = 0;
const r3 = recordFoodLog(USER_ID);
assert.equal(r3, false, "already handled Trigger 1");
assert.equal(eventsDispatched.length, 0);

// 5. Test workout trigger on a fresh user
mockLocalStorage.clear();
eventsDispatched.length = 0;
const USER_2 = "test-user-workout";
const w1 = recordWorkoutLog(USER_2);
assert.equal(w1, true, "1st workout log triggers primer");
assert.equal(eventsDispatched.length, 1);
assert.equal(eventsDispatched[0].detail.trigger, "engagement");
assert.equal(getPrimerState(USER_2).workoutLogsCount, 1);
assert.equal(getPrimerState(USER_2).trigger1Handled, true);

// 6. Test Day 5 eligibility
const now = Date.now();
const day4Ago = new Date(now - 4 * 86_400_000);
const day5Ago = new Date(now - 5.1 * 86_400_000);

// 4 days old -> ineligible
assert.equal(checkDay5Eligible(USER_ID, day4Ago), false, "day 4 is not eligible");

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
mockLocalStorage.setItem(`dombelz_notif_primer_${USER_ID}`, JSON.stringify(sUser));
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

// Once granted, never eligible
markPrimerGranted(USER_ID);
assert.equal(getPrimerState(USER_ID).granted, true);
assert.equal(checkDay5Eligible(USER_ID, day5Ago), false, "granted user is never eligible");
assert.equal(recordFoodLog(USER_ID), false, "granted user never triggered on food");

console.log("notificationPrimer.test.ts: all assertions passed successfully!");
