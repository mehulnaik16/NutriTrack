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
  REFEREE_DISCOUNT_RUPEES,
  REFERRAL_DISCOUNT_PLAN_ID,
  activeGift,
  effectivePrice,
  findPlan,
  giftApplies,
  giftLabel,
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
const YEARLY = { id: "yearly", name: "Yearly", months: 12, price: 999 };
const MONTHLY = { id: "monthly", name: "Monthly", months: 1, price: 249 };
assert.equal(monthlyRate(YEARLY), 83);

// ── The gift, as the cards render it ──────────────────────────────────────────
//
// The whole point of effectivePrice() is that the number on the card and the
// number Razorpay charges are the same number. Pin them to each other: if
// either side is edited alone, this fails rather than silently quoting a price
// the checkout will not honour.
assert.equal(effectivePrice(YEARLY, true), YEARLY_DISCOUNTED.rupees);
assert.equal(effectivePrice(YEARLY, true), 999 - REFEREE_DISCOUNT_RUPEES);
assert.equal(effectivePrice(YEARLY, false), 999);
// The gift cannot leak to a tier that does not carry it, however it is called.
assert.equal(effectivePrice(MONTHLY, true), 249);
// The monthly sub-line recomputes from what is actually paid, not the list price.
assert.equal(monthlyRate(YEARLY, effectivePrice(YEARLY, true)), 71);

// Eligibility. A referred user holds the gift until their first yearly buy,
// which is when handle_razorpay_event() flips the row to 'subscribed'.
assert.equal(giftApplies("pending", "yearly"), true);
assert.equal(giftApplies("trial", "yearly"), true);
assert.equal(giftApplies("subscribed", "yearly"), false, "spent once, never again");
// Never referred at all.
assert.equal(giftApplies(null, "yearly"), false);
assert.equal(giftApplies(undefined, "yearly"), false);
// Yearly only — a referred user still pays full price on the other tiers.
assert.equal(giftApplies("trial", "monthly"), false);
assert.equal(giftApplies("trial", "quarterly"), false);

// ── The gym gift, and the rule that decides who is paid ──────────────────────
//
// A gym code entered at signup earns the member the same ₹150 and earns the gym
// 20% commission. The same code entered from the profile page earns nobody
// anything. `source` is the only thing that distinguishes them, and link_gym()
// in SQL — never a client — is what sets it.
const SIGNUP_LINK = { source: "signup", gift_spent_at: null };
const PROFILE_LINK = { source: "profile", gift_spent_at: null };
const SPENT_LINK = { source: "signup", gift_spent_at: "2026-09-01T00:00:00Z" };

assert.equal(activeGift({ gymLink: SIGNUP_LINK, planId: "yearly" }), "gym");
// The case stated most emphatically: a gym that did not bring us the customer
// gets nothing, and the member gets no discount for walking in later.
assert.equal(
  activeGift({ gymLink: PROFILE_LINK, planId: "yearly" }),
  null,
  "a code entered from the profile page never earns anything",
);
assert.equal(activeGift({ gymLink: SPENT_LINK, planId: "yearly" }), null, "spent once");
assert.equal(activeGift({ planId: "yearly" }), null, "no code at all, no gift");

// Yearly only, for BOTH kinds. The ₹150 must never reach ₹249 or ₹499.
for (const tier of ["monthly", "quarterly"]) {
  assert.equal(
    activeGift({ gymLink: SIGNUP_LINK, planId: tier }),
    null,
    `a gym gift must not reach the ${tier} plan`,
  );
  assert.equal(
    activeGift({ referralStatus: "trial", planId: tier }),
    null,
    `a friend gift must not reach the ${tier} plan`,
  );
}

// A friend code claimed at signup wins, and link_gym() then refuses to attribute
// any gym added afterwards — so this pairing is the one a real account reaches
// after joining a gym from its profile page. It must read as the friend gift.
assert.equal(
  activeGift({ referralStatus: "trial", gymLink: PROFILE_LINK, planId: "yearly" }),
  "friend",
);

// Both kinds are worth exactly the same money, and it is the money Razorpay
// charges — the display price and the charged price are pinned to each other.
for (const kind of [
  activeGift({ referralStatus: "trial", planId: "yearly" }),
  activeGift({ gymLink: SIGNUP_LINK, planId: "yearly" }),
]) {
  assert.ok(kind, "both kinds must resolve");
  assert.equal(effectivePrice(YEARLY, kind !== null), YEARLY_DISCOUNTED.rupees);
}

// Different wording, same amount. Being sent by a friend is not the same thing
// as walking into a gym, and the pill must not say it is.
assert.notEqual(giftLabel("gym"), giftLabel("friend"));
for (const kind of ["gym", "friend"] as const) {
  assert.ok(
    giftLabel(kind).includes(String(REFEREE_DISCOUNT_RUPEES)),
    `${kind} copy must name the amount`,
  );
}

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
