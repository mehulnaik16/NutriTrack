/* Runnable self-check for the /welcome weight projection. No test framework in
   this repo, so this is a plain assert script — same convention as
   quizDraft.test.ts.

   Build and run:
     npx tsc --outDir <tmp> --target es2020 --module es2020 \
       --moduleResolution bundler --skipLibCheck \
       src/lib/nutrition.ts src/lib/welcomePlan.ts src/lib/welcomePlan.test.ts
     sed -i 's|from "./nutrition"|from "./nutrition.js"|; s|from "./welcomePlan"|from "./welcomePlan.js"|' <tmp>/*.js
     node <tmp>/welcomePlan.test.js
*/
import assert from "node:assert/strict";
import { formatWeight, weeklyRateKg, weightPlan } from "./welcomePlan";

const today = new Date(2026, 9, 12);

assert.equal(weeklyRateKg("lose_0_5kg"), 0.5);
assert.equal(weeklyRateKg("gain_0_25kg"), 0.25);
assert.equal(weeklyRateKg("maintain"), 0);

const lose = weightPlan(78, "lose", "lose_0_5kg", today)!;
assert.equal(lose.direction, "lose");
assert.equal(lose.endKg, 74);
assert.equal(lose.endDate.getMonth(), 11);
assert.equal(lose.endDate.getDate(), 7);

// A lose goal with no rate picked falls back to the 0.25 kg default.
assert.equal(weightPlan(80, "lose", "", today)!.endKg, 78);

const gain = weightPlan(60, "gain", "gain_0_75kg", today)!;
assert.equal(gain.direction, "gain");
assert.equal(gain.endKg, 66);

const keep = weightPlan(70, "maintain", undefined, today)!;
assert.equal(keep.direction, "maintain");
assert.equal(keep.endKg, 70);

assert.equal(weightPlan(0, "lose", "lose_0_5kg", today), null);
assert.equal(weightPlan(undefined, undefined, undefined, today), null);

assert.equal(formatWeight(74), "74 kg");
assert.equal(formatWeight(74, "lb"), "163 lb");

console.log("welcomePlan: all checks passed");
