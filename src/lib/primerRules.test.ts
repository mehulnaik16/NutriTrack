/* Runnable self-check for the notification-primer rules (primerRules.ts).
   No test framework in this repo — plain asserts, same as plans.test.ts.

   Build and run:
     npx tsc --outDir <tmp> --target es2020 --module es2020 --moduleResolution bundler \
       --allowImportingTsExtensions --rewriteRelativeImportExtensions --skipLibCheck \
       src/lib/primerRules.ts src/lib/primerRules.test.ts
     echo '{"type":"module"}' > <tmp>/package.json && node <tmp>/primerRules.test.js
*/
import assert from "node:assert";
import { day5Due, isFirstEverLog } from "./primerRules.ts";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const now = Date.UTC(2026, 9, 7, 12);

// First log: only when nothing existed before this logging session.
assert.equal(isFirstEverLog(0), true, "brand-new account: ask");
assert.equal(isFirstEverLog(1), false, "had a log before: never ask");
assert.equal(isFirstEverLog(400), false, "long-time user: never ask");

// Day 5: counted from joining.
assert.equal(day5Due(new Date(now - 4.9 * DAY), now, null), false, "day 4");
assert.equal(day5Due(new Date(now - 5 * DAY), now, null), true, "day 5");
assert.equal(day5Due(new Date(now - 40 * DAY), now, null), true, "day 40");

// Not within 48h of a "Not now" on this device.
const d5 = new Date(now - 6 * DAY).toISOString();
assert.equal(day5Due(d5, now, new Date(now - 47 * HOUR).toISOString()), false);
assert.equal(day5Due(d5, now, new Date(now - 49 * HOUR).toISOString()), true);

// Bad input never asks.
assert.equal(day5Due("not a date", now, null), false);

console.log("primerRules: all checks passed");
