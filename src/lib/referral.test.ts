/* Runnable self-check for the referral maths. No test framework in this repo,
   so this is a plain assert script — same convention as xpConfig.test.ts.

   Build and run:
     npx tsc --outDir <tmp> --target es2020 --module es2020 \
       --moduleResolution bundler --skipLibCheck \
       src/lib/referral.ts src/lib/plans.ts src/lib/trial.ts src/lib/referral.test.ts
     # bare Node ESM needs explicit extensions; Vite does not, so only the
     # build output is patched:
     sed -i 's|from "./plans"|from "./plans.js"|;s|from "./referral"|from "./referral.js"|;s|from "./trial"|from "./trial.js"|' <tmp>/*.js
     node <tmp>/referral.test.js

   Exits non-zero on the first failure. */
import assert from "node:assert";
import {
  DAYS_PER_REFERRAL,
  FALLBACK_PREFIX,
  MAX_FREE_DAYS,
  MAX_PREMIUM_DAYS,
  PREMIUM_DAYS_PER_SUBSCRIPTION,
  codePrefix,
  freeDaysEarned,
  giftMessage,
  isValidCode,
  isPremiumProcessing,
  premiumDaysEarned,
} from "./referral";
import { BASE_TRIAL_DAYS, isTrialActive, trialDaysLeft } from "./trial";

// ── codePrefix: must match public.referral_code_prefix() in the migration ──
assert.equal(codePrefix("Rahul Sharma"), "RAH");
assert.equal(codePrefix("Priya Mehta"), "PRI");
// Short names pad with X rather than producing a 2-char prefix.
assert.equal(codePrefix("Jo"), "JOX");
assert.equal(codePrefix("A"), "AXX");
// Non-letters are stripped before the first three are taken.
assert.equal(codePrefix("  d'Souza"), "DSO");
assert.equal(codePrefix("J. R. R. Tolkien"), "JRR");
assert.equal(codePrefix("12345"), FALLBACK_PREFIX);
// A name with no Latin characters lands on the generic prefix. Known ceiling,
// documented in referral.ts — transliteration is the upgrade path.
assert.equal(codePrefix("राहुल"), FALLBACK_PREFIX);
assert.equal(codePrefix(""), FALLBACK_PREFIX);
assert.equal(codePrefix(null), FALLBACK_PREFIX);

// ── Code shape: three letters then five digits ────────────────────────────
assert.equal(isValidCode("RAH38291"), true);
assert.equal(isValidCode("DBZ00000"), true);
assert.equal(
  isValidCode("rah38291"),
  false,
  "lowercase must be normalised first",
);
assert.equal(isValidCode("RA38291"), false);
assert.equal(isValidCode("RAH3829"), false);
assert.equal(isValidCode("RAH382911"), false);
assert.equal(isValidCode(""), false);
assert.equal(isValidCode(null), false);

// ── Free track: +5 a referral, accrual stops at 60 ────────────────────────
assert.equal(freeDaysEarned(0), 0);
assert.equal(freeDaysEarned(1), 5);
assert.equal(freeDaysEarned(3), 15);
// The 12th qualified referral is where accrual tops out.
assert.equal(freeDaysEarned(11), 55);
assert.equal(freeDaysEarned(12), MAX_FREE_DAYS);
// Referring is uncapped; the cap holds however many qualify beyond that.
assert.equal(freeDaysEarned(20), MAX_FREE_DAYS);
assert.equal(freeDaysEarned(25), MAX_FREE_DAYS);
assert.equal(
  freeDaysEarned(-3),
  0,
  "a negative count must not produce negative days",
);
assert.equal(MAX_FREE_DAYS / DAYS_PER_REFERRAL, 12);

// ── Paid track: 60 premium days each, capped at 480 lifetime ──────────────
// The cap was added with the billing work; before it, this track was unbounded.
// It mirrors `limit 8` in public.premium_grants(). See entitlement.test.ts for
// how the days are then spent.
assert.equal(premiumDaysEarned(0), 0);
assert.equal(premiumDaysEarned(1), PREMIUM_DAYS_PER_SUBSCRIPTION);
assert.equal(premiumDaysEarned(4), 240);
assert.equal(premiumDaysEarned(8), MAX_PREMIUM_DAYS);
assert.equal(premiumDaysEarned(50), MAX_PREMIUM_DAYS, "the paid track is capped");

// ── The 3-day hold ────────────────────────────────────────────────────────
// The referrer must see "processing", not a number, until the hold elapses —
// a friend who buys and refunds inside the 2-day window credits nobody.
const paidAt = "2026-08-25T10:00:00Z";
const twoDaysLater = new Date("2026-08-27T10:00:00Z");
const fourDaysLater = new Date("2026-08-29T10:00:00Z");
assert.equal(isPremiumProcessing(paidAt, twoDaysLater), true);
assert.equal(isPremiumProcessing(paidAt, fourDaysLater), false);
// Exactly on the boundary the hold is over, matching `charged_at + 3 days`.
assert.equal(
  isPremiumProcessing(paidAt, new Date("2026-08-28T10:00:00Z")),
  false,
);
// Unknown or unparseable dates fail closed — never promise days we cannot back.
assert.equal(isPremiumProcessing(null), true);
assert.equal(isPremiumProcessing("not a date"), true);

// ── Trial length grows with earned bonus days ─────────────────────────────
const start = "2026-08-25";
const dayAfterStart = new Date("2026-08-26T09:00:00");

// No trial started is null, which is distinct from 0 (started, now expired).
assert.equal(trialDaysLeft(null), null);
assert.equal(trialDaysLeft(undefined, 30), null);

assert.equal(trialDaysLeft(start, 0, dayAfterStart), BASE_TRIAL_DAYS - 1);
// Five referral days must show up as five more days left.
assert.equal(
  trialDaysLeft(start, 5, dayAfterStart)! -
    trialDaysLeft(start, 0, dayAfterStart)!,
  5,
);

const wellPastBaseTrial = new Date("2026-09-01T09:00:00");
assert.equal(trialDaysLeft(start, 0, wellPastBaseTrial), 0);
assert.equal(isTrialActive(start, 0, wellPastBaseTrial), false);
// ...but a referral bonus keeps it alive.
assert.equal(isTrialActive(start, MAX_FREE_DAYS, wellPastBaseTrial), true);
assert.equal(
  isTrialActive(null, 60),
  false,
  "no trial started is never active",
);

// ── Gift copy stays a gift, never a promotion ─────────────────────────────
const msg = giftMessage({
  senderName: "Rahul Sharma",
  code: "RAH38291",
  url: "https://dombelz.app/quiz?ref=RAH38291",
});
assert.ok(msg.includes("RAH38291"), "the code must be in the message");
assert.ok(msg.includes("quiz?ref=RAH38291"), "the link must be in the message");
assert.ok(
  msg.includes("Rahul"),
  "the sender's first name, not their full name",
);
assert.ok(!msg.includes("Sharma"), "surname should not leak into the message");
for (const banned of ["discount", "offer", "promo", "limited time", "deal"]) {
  assert.ok(
    !msg.toLowerCase().includes(banned),
    `gift copy must not use the word "${banned}"`,
  );
}
assert.ok(msg.includes("\n— Rahul"), "a known sender signs off by first name");
// A missing name must not render a dangling signature line.
assert.ok(
  !giftMessage({ code: "DBZ00001", url: "x" }).includes("\n— "),
  "an unknown sender must produce no sign-off at all",
);
assert.ok(
  !giftMessage({ senderName: "  ", code: "DBZ00001", url: "x" }).includes(
    "\n— ",
  ),
);

console.log("referral self-check passed");
