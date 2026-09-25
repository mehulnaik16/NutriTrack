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
  REFEREE_GIFT_DAYS,
  GIFT_PLAN_ID,
  activeGift,
  findPlan,
  giftApplies,
  giftLabel,
  monthlyRate,
  periodLabel,
  planCta,
  showsTrialBanner,
} from "./plans";
import * as razorpay from "../server/razorpay";
const { PLAN_CATALOG, TIERS } = razorpay;

// The prices the product actually sells, duration-based. Anything else on a
// page, in a doc, or in a deployed bundle is stale.
const SOLD = [
  { id: "monthly", months: 1, price: 299 },
  { id: "quarterly", months: 3, price: 599 },
  { id: "yearly", months: 12, price: 1199 },
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

// Prices are inclusive of 18% GST, so the base sent to the partner project is
// the price × 100/118 — ₹1,199 → ₹1,016.10. Charged amount is the list price.
assert.equal(razorpay.GST_BPS, 1800);
assert.equal(razorpay.basePaise(119900), 101610);
assert.equal(razorpay.basePaise(29900), 25339);
assert.equal(razorpay.basePaise(59900), 50763);

// One tier per sold plan, no orphan tier that no page can reach.
assert.deepEqual([...TIERS].sort(), SOLD.map((p) => p.id).sort());

// The referral gift is days, not money: yearly-only, 60 days (the number
// public.gift_grants() grants), and no discounted fourth plan to charge it by.
assert.equal(GIFT_PLAN_ID, "yearly");
assert.equal(REFEREE_GIFT_DAYS, 60);
assert.ok(
  !("YEARLY_DISCOUNTED" in razorpay),
  "the discounted Razorpay plan must stay gone",
);

// Labels and the "works out to" line, since both are read straight off price.
assert.equal(periodLabel(1), "/month");
assert.equal(periodLabel(3), "/3 months");
assert.equal(periodLabel(12), "/year");
const YEARLY = { id: "yearly", name: "Yearly", months: 12, price: 1199 };
assert.equal(monthlyRate(YEARLY), 100);
assert.equal(
  monthlyRate({ ...YEARLY, id: "quarterly", months: 3, price: 599 }),
  200,
);

// Eligibility. A referred user holds the gift until their first yearly buy,
// which is when handle_razorpay_event() flips the row to 'subscribed'.
assert.equal(giftApplies("pending", "yearly"), true);
assert.equal(giftApplies("trial", "yearly"), true);
assert.equal(
  giftApplies("subscribed", "yearly"),
  false,
  "spent once, never again",
);
// Never referred at all.
assert.equal(giftApplies(null, "yearly"), false);
assert.equal(giftApplies(undefined, "yearly"), false);
// Yearly only — a referred user still pays full price on the other tiers.
assert.equal(giftApplies("trial", "monthly"), false);
assert.equal(giftApplies("trial", "quarterly"), false);

// ── The gym gift, and the rule that decides who is paid ──────────────────────
//
// A gym code entered at signup earns the member the same 60 days and earns the
// gym commission. The same code entered from the profile page earns nobody
// anything. `source` is the only thing that distinguishes them, and link_gym()
// in SQL — never a client — is what sets it.
// No partner_type on these three on purpose: that is what a gym_links row
// written before partner types existed looks like, and every one of those is a
// gym.
const SIGNUP_LINK = { source: "signup", gift_spent_at: null };
const PROFILE_LINK = { source: "profile", gift_spent_at: null };
const SPENT_LINK = { source: "signup", gift_spent_at: "2026-09-01T00:00:00Z" };

const DOCTOR_LINK = {
  source: "signup",
  gift_spent_at: null,
  partner_type: "doctor",
};
const UGC_LINK = { source: "signup", gift_spent_at: null, partner_type: "ugc" };

assert.equal(activeGift({ gymLink: SIGNUP_LINK, planId: "yearly" }), "gym");

// A doctor's and a creator's code earn the member exactly what a gym's does.
// The partner type picks the wording and nothing else — the rule above it is
// still "entered at signup, on Yearly, not yet spent".
assert.equal(activeGift({ gymLink: DOCTOR_LINK, planId: "yearly" }), "doctor");
assert.equal(activeGift({ gymLink: UGC_LINK, planId: "yearly" }), "ugc");
assert.equal(
  activeGift({
    gymLink: { ...DOCTOR_LINK, source: "profile" },
    planId: "yearly",
  }),
  null,
  "a doctor's code entered from the profile page earns nothing either",
);
assert.equal(
  activeGift({
    gymLink: { ...UGC_LINK, gift_spent_at: "2026-09-01T00:00:00Z" },
    planId: "yearly",
  }),
  null,
  "spent once, for a creator too",
);
// An unrecognised value must not invent a fourth kind of gift.
assert.equal(
  activeGift({
    gymLink: { ...SIGNUP_LINK, partner_type: "hospital" },
    planId: "yearly",
  }),
  "gym",
);

// Every kind is worth the same days, and each has its own words for it.
assert.ok(giftLabel("doctor").includes("60"));
assert.ok(giftLabel("ugc").includes("60"));
assert.notEqual(giftLabel("doctor"), giftLabel("gym"));
assert.notEqual(giftLabel("ugc"), giftLabel("gym"));
// The case stated most emphatically: a gym that did not bring us the customer
// gets nothing, and the member gets no gift for walking in later.
assert.equal(
  activeGift({ gymLink: PROFILE_LINK, planId: "yearly" }),
  null,
  "a code entered from the profile page never earns anything",
);
assert.equal(
  activeGift({ gymLink: SPENT_LINK, planId: "yearly" }),
  null,
  "spent once",
);
assert.equal(activeGift({ planId: "yearly" }), null, "no code at all, no gift");

// Yearly only, for BOTH kinds. The gift must never reach monthly or quarterly.
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
  activeGift({
    referralStatus: "trial",
    gymLink: PROFILE_LINK,
    planId: "yearly",
  }),
  "friend",
);

// Both kinds resolve on Yearly. Neither changes what Razorpay charges — that is
// PLAN_CATALOG's list price, pinned above.
for (const kind of [
  activeGift({ referralStatus: "trial", planId: "yearly" }),
  activeGift({ gymLink: SIGNUP_LINK, planId: "yearly" }),
]) {
  assert.ok(kind, "both kinds must resolve");
}

// Different wording, same amount. Being sent by a friend is not the same thing
// as walking into a gym, and the pill must not say it is.
assert.notEqual(giftLabel("gym"), giftLabel("friend"));
for (const kind of ["gym", "friend"] as const) {
  assert.ok(
    giftLabel(kind).includes(String(REFEREE_GIFT_DAYS)),
    `${kind} copy must name the days`,
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
