/* Runnable self-check for gym code shapes and membership date maths. No test
   framework in this repo, so this is a plain assert script — same convention as
   referral.test.ts and plans.test.ts.

   Build and run:
     npx tsc --outDir <tmp> --target es2020 --module es2020 \
       --moduleResolution bundler --skipLibCheck \
       src/lib/gym.ts src/lib/referral.ts src/lib/plans.ts src/lib/trial.ts \
       src/lib/gym.test.ts
     find <tmp> -name "*.js" -exec sed -i \
       's|from "./gym"|from "./gym.js"|;s|from "./referral"|from "./referral.js"|;s|from "./plans"|from "./plans.js"|;s|from "./trial"|from "./trial.js"|' {} +
     node <tmp>/gym.test.js

   Exits non-zero on the first failure. */
import assert from "node:assert";
import {
  GYM_DURATIONS,
  addMonths,
  isGymCode,
  isGymDuration,
  membershipStatus,
  membershipStatusLabel,
} from "./gym";
import { isValidCode } from "./referral";

// ── Code shape: mirrors generate_partner_code() in the partner database ─────
// The two codes below are real, live partner codes. If the partner project ever
// changes its code format, this is where it shows up rather than in production.
assert.equal(isGymCode("GYM-POWERFITNESS-850"), true);
assert.equal(isGymCode("GYM-GAGAGN-452"), true);
assert.equal(isGymCode("GYM-IRONVAULT-123"), true);
// The prefix is the first two words of the gym's name, letters only, capped at
// 12 — partner_code_prefix() falls back to 'GYM' for a name with none.
assert.equal(isGymCode("GYM-GYM-001"), true);
assert.equal(isGymCode("GYM-ABCDEFGHIJKL-999"), true, "twelve letters is the cap");
assert.equal(isGymCode("GYM-ABCDEFGHIJKLM-999"), false, "thirteen is too many");

assert.equal(isGymCode("gym-powerfitness-850"), false, "must be uppercased first");
assert.equal(isGymCode("GYM-POWERFITNESS-85"), false, "three digits, not two");
assert.equal(isGymCode("GYM-POWERFITNESS-8501"), false, "three digits, not four");
assert.equal(isGymCode("GYM-POWER FITNESS-850"), false, "no spaces");
assert.equal(isGymCode("GYM-POWER1-850"), false, "prefix is letters only");
assert.equal(isGymCode("GYM--850"), false, "prefix cannot be empty");
assert.equal(isGymCode("POWERFITNESS-850"), false);
assert.equal(isGymCode(""), false);
assert.equal(isGymCode(null), false);
assert.equal(isGymCode(undefined), false);
// Anchored at both ends: a valid code buried in other text is not a code.
assert.equal(isGymCode("XGYM-POWERFITNESS-850"), false);
assert.equal(isGymCode("GYM-POWERFITNESS-850X"), false);

// ── The two kinds of code can never be confused ────────────────────────────
// This is what lets one input box classify by shape alone, with no extra round
// trip and no ambiguity about which claim path a code should take.
const SAMPLES = [
  "RAH38291", "DBZ00000", "JOX12345",
  "GYM-POWERFITNESS-850", "GYM-GAGAGN-452", "GYM-IRONVAULT-123",
  "", "rah38291", "gym-gagagn-452", "GYM38291", "RAH-123-456",
];
for (const s of SAMPLES) {
  assert.ok(
    !(isValidCode(s) && isGymCode(s)),
    `"${s}" must not match both code shapes`,
  );
}
assert.equal(isValidCode("GYM-GAGAGN-452"), false, "a gym code is not a friend code");
assert.equal(isGymCode("RAH38291"), false, "a friend code is not a gym code");

// ── Durations: the four the UI offers, and nothing else ────────────────────
assert.deepEqual([...GYM_DURATIONS], [1, 3, 6, 12]);
assert.equal(isGymDuration(6), true);
assert.equal(isGymDuration(2), false, "2 months is not on offer");
assert.equal(isGymDuration("6"), false, "the string is not the number");
assert.equal(isGymDuration(null), false);

// ── addMonths: clamps rather than overflowing ──────────────────────────────
assert.equal(addMonths("2026-01-15", 1), "2026-02-15");
assert.equal(addMonths("2026-01-15", 3), "2026-04-15");
assert.equal(addMonths("2026-01-15", 6), "2026-07-15");
// Across a year boundary, which naive month arithmetic gets wrong.
assert.equal(addMonths("2026-01-15", 12), "2027-01-15");
assert.equal(addMonths("2026-09-08", 6), "2027-03-08");
assert.equal(addMonths("2026-12-31", 1), "2027-01-31");
// The whole reason this is not Date.setMonth: that rolls 31 Jan forward into
// early March, handing the member days their gym never sold them.
assert.equal(addMonths("2026-01-31", 1), "2026-02-28", "clamps to a short month");
assert.equal(addMonths("2028-01-31", 1), "2028-02-29", "leap year still clamps");
assert.equal(addMonths("2026-03-31", 1), "2026-04-30");
assert.equal(addMonths("2026-08-31", 6), "2027-02-28");
// A day that exists in the target month is never moved.
assert.equal(addMonths("2026-02-28", 12), "2027-02-28");

// ── membershipStatus: informational only, never an entitlement ─────────────
const START = "2026-06-01";
const END = "2026-12-01";
assert.equal(membershipStatus(START, END, "2026-05-31"), "upcoming");
assert.equal(membershipStatus(START, END, "2026-06-01"), "active", "starts on the day");
assert.equal(membershipStatus(START, END, "2026-09-08"), "active");
assert.equal(membershipStatus(START, END, "2026-12-01"), "active", "ends on the day");
assert.equal(membershipStatus(START, END, "2026-12-02"), "expired");
// A half-filled form must not claim a status it cannot back.
assert.equal(membershipStatus(null, END), "unknown");
assert.equal(membershipStatus(START, null), "unknown");
assert.equal(membershipStatus(null, null), "unknown");

assert.equal(membershipStatusLabel("unknown"), "—");
for (const s of ["upcoming", "active", "expired"] as const) {
  assert.ok(
    membershipStatusLabel(s).length > 1,
    `${s} needs a label of its own`,
  );
}

console.log("gym self-check passed");
