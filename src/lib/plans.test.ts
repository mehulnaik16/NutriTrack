/* Runnable self-check that pricing has exactly one meaning across the app.
   No test framework in this repo, so this is a plain assert script — same
   convention as referral.test.ts.

   src/lib/plans.ts is what the user sees; src/server/razorpay.ts is what is
   actually charged. They were only ever kept in step by a comment, which is how
   a display price and a charged price drift apart.

   Build and run:
     npx tsc --outDir <tmp> --target es2020 --module es2020 \
       --moduleResolution bundler --skipLibCheck \
       src/lib/plans.ts src/server/razorpay.ts src/lib/plans.test.ts
     find <tmp> -name "*.js" -exec sed -i 's|from "./plans"|from "./plans.js"|;s|from "../server/razorpay"|from "../server/razorpay.js"|' {} +
     node <tmp>/lib/plans.test.js

   Exits non-zero on the first failure. */
import assert from "node:assert";
import {
  PLANS,
  REFERRAL_DISCOUNT_PLAN_ID,
  findPlan,
  monthlyRate,
  periodLabel,
  planCta,
  showsTrialBanner,
} from "./plans";
import { PLAN_CATALOG, TIERS, YEARLY_DISCOUNTED } from "../server/razorpay";

// The prices the product actually sells, duration-based. Anything else on a
// page, in a doc, or in a deployed bundle is stale.
const SOLD = [
  { id: "monthly", months: 1, price: 249 },
  { id: "quarterly", months: 3, price: 499 },
  { id: "yearly", months: 12, price: 999 },
];

assert.equal(
  PLANS.length,
  SOLD.length,
  "PLANS must list exactly the sold plans",
);
for (const want of SOLD) {
  const plan = findPlan(want.id);
  assert.ok(plan, `${want.id} missing from PLANS`);
  assert.equal(plan.price, want.price, `${want.id} price`);
  assert.equal(plan.months, want.months, `${want.id} period`);

  // What the browser shows and what Razorpay charges must be the same number.
  const charged = PLAN_CATALOG[want.id as (typeof TIERS)[number]];
  assert.equal(
    charged.rupees,
    want.price,
    `${want.id} charged amount differs from the displayed price`,
  );
}

// Days of access one charge buys. handle_razorpay_event() hard-codes the same
// numbers as its fallback (case sub.tier when 'monthly' then 30 when
// 'quarterly' then 91 else 365), and that fallback is what actually runs — the
// webhook sends p_period_days null on purpose. If these drift, a monthly
// customer stops getting a month.
const PERIOD_DAYS: Record<string, number> = {
  monthly: 30,
  quarterly: 91,
  yearly: 365,
};
for (const [tier, days] of Object.entries(PERIOD_DAYS)) {
  assert.equal(
    PLAN_CATALOG[tier as (typeof TIERS)[number]].periodDays,
    days,
    `${tier} period_days differs from handle_razorpay_event()`,
  );
}
assert.equal(YEARLY_DISCOUNTED.periodDays, PERIOD_DAYS.yearly);

// One tier per sold plan, no orphan tier that no page can reach.
assert.deepEqual([...TIERS].sort(), SOLD.map((p) => p.id).sort());

// The ₹150 referral gift is a yearly-only discount, never a fourth plan.
assert.equal(REFERRAL_DISCOUNT_PLAN_ID, "yearly");
assert.equal(YEARLY_DISCOUNTED.rupees, 999 - 150);
assert.equal(YEARLY_DISCOUNTED.periodDays, PLAN_CATALOG.yearly.periodDays);

// Labels and the "works out to" line, since both are read straight off price.
assert.equal(periodLabel(1), "/month");
assert.equal(periodLabel(3), "/3 months");
assert.equal(periodLabel(12), "/year");
assert.equal(
  monthlyRate({ id: "yearly", name: "Yearly", months: 12, price: 999 }),
  83,
);

// The call to action. A trial is spent once per account, so the moment
// trial_start_date exists every card must sell instead of offering a trial —
// including the plan the user is already on, which is what a lapsed user came
// back to buy.
assert.equal(
  planCta({ planId: "monthly", trialUsed: false, selectedPlan: null }),
  "trial",
);
assert.equal(
  planCta({ planId: "monthly", trialUsed: false, selectedPlan: "monthly" }),
  "current",
);
assert.equal(
  planCta({ planId: "monthly", trialUsed: true, selectedPlan: "monthly" }),
  "buy",
);
assert.equal(
  planCta({ planId: "yearly", trialUsed: true, selectedPlan: "monthly" }),
  "buy",
);
// No third-party checkout inside the native shell.
assert.equal(
  planCta({ planId: "yearly", trialUsed: true, native: true }),
  "native",
);
// A trial the account cannot get must not be advertised on the same page.
assert.equal(showsTrialBanner(false), true);
assert.equal(showsTrialBanner(true), false);

console.log("plans self-check passed");
