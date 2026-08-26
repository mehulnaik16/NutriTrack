/* Runnable self-check for the body-measurement maths. No test framework in this
   repo, so this is a plain assert script — same convention as referral.test.ts.

   Build and run:
     npx tsc --outDir <tmp> --target es2020 --module es2020 \
       --moduleResolution bundler --skipLibCheck \
       src/lib/measurements.ts src/lib/measurements.test.ts
     # bare Node ESM needs explicit extensions; Vite does not, so only the
     # build output is patched:
     sed -i 's|from "./measurements"|from "./measurements.js"|' <tmp>/*.js
     node <tmp>/measurements.test.js

   Exits non-zero on the first failure. */
import assert from "node:assert";
import {
  METRICS,
  type MeasurementRow,
  deltaFor,
  fieldKey,
  fieldKeys,
  findMetric,
  formatValues,
  imbalance,
  imbalanceLabel,
  inRange,
  latestFor,
  step,
} from "./measurements";

// ── fieldKey: the one place storage keys are spelled ───────────────────────
assert.equal(fieldKey("biceps", "left"), "biceps_left");
assert.equal(fieldKey("biceps", "right"), "biceps_right");
assert.equal(fieldKey("chest"), "chest");

// A sided metric must never produce its bare id as a key — that would write a
// third, ambiguous "biceps" alongside the pair.
for (const m of METRICS) {
  const keys = fieldKeys(m);
  assert.equal(keys.length, m.sided ? 2 : 1);
  if (m.sided) assert.ok(!keys.includes(m.id));
  else assert.deepEqual(keys, [m.id]);
}
assert.equal(findMetric("biceps")?.sided, true);
assert.equal(findMetric("chest")?.sided, false);
assert.equal(findMetric("nope"), undefined);

// ── latestFor: the jsonb column is sparse ─────────────────────────────────
const rows: MeasurementRow[] = [
  // Newest row logs chest only — it must not hide the older biceps values.
  { measured_at: "2026-08-26", measurements: { chest: 101 } },
  {
    measured_at: "2026-08-19",
    measurements: { biceps_left: 35, biceps_right: 35.5 },
  },
  {
    measured_at: "2026-08-12",
    measurements: { biceps_left: 34, biceps_right: 34.5 },
  },
];

assert.deepEqual(latestFor(rows, "biceps_left"), {
  value: 35,
  date: "2026-08-19",
});
assert.deepEqual(latestFor(rows, "chest"), { value: 101, date: "2026-08-26" });
assert.equal(latestFor(rows, "thigh_left"), null);

// Order of the input array must not matter — the date decides.
const shuffled = [rows[1], rows[2], rows[0]];
assert.deepEqual(latestFor(shuffled, "biceps_left"), {
  value: 35,
  date: "2026-08-19",
});

// ── deltaFor: signed, and null until there are two ────────────────────────
assert.equal(deltaFor(rows, "biceps_left"), 1);
assert.equal(deltaFor(rows, "biceps_right"), 1);
// One entry is not a trend.
assert.equal(deltaFor(rows, "chest"), null);
// A shrinking measurement reads negative.
assert.equal(
  deltaFor(
    [
      { measured_at: "2026-08-26", measurements: { abdomen: 88 } },
      { measured_at: "2026-08-19", measurements: { abdomen: 90.5 } },
    ],
    "abdomen",
  ),
  -2.5,
);

// ── imbalance: right minus left, from ONE session ─────────────────────────
// Catches a swapped subtraction, which is otherwise invisible until someone
// with uneven arms notices the label is backwards.
assert.equal(imbalance(rows, "biceps"), 0.5);
assert.equal(imbalanceLabel(imbalance(rows, "biceps")), "Right 0.5 cm larger");

const leftDominant: MeasurementRow[] = [
  {
    measured_at: "2026-08-26",
    measurements: { thigh_left: 60, thigh_right: 58.5 },
  },
];
assert.equal(imbalance(leftDominant, "thigh"), -1.5);
assert.equal(
  imbalanceLabel(imbalance(leftDominant, "thigh")),
  "Left 1.5 cm larger",
);

assert.equal(imbalanceLabel(0), "Even");
assert.equal(imbalanceLabel(null), null);

// One side alone is a valid log, and it yields no imbalance.
assert.equal(
  imbalance(
    [{ measured_at: "2026-08-26", measurements: { biceps_left: 35 } }],
    "biceps",
  ),
  null,
);
// Never pair a left arm from one session with a right arm from another — that
// is a difference in time, not in the body.
assert.equal(
  imbalance(
    [
      { measured_at: "2026-08-26", measurements: { biceps_left: 40 } },
      { measured_at: "2026-08-19", measurements: { biceps_right: 35 } },
    ],
    "biceps",
  ),
  null,
);
// An unsided metric has no sides to compare.
assert.equal(imbalance(rows, "chest"), null);

// ── inRange: the client mirror of the DB CHECK ────────────────────────────
assert.equal(inRange("biceps", 35.5), true);
assert.equal(inRange("biceps", 0), false);
assert.equal(inRange("biceps", -5), false);
// Per-metric, not one global range: 100 cm is a plausible chest and an
// implausible biceps.
assert.equal(inRange("biceps", 100), false);
assert.equal(inRange("chest", 100), true);
assert.equal(inRange("biceps", NaN), false);
assert.equal(inRange("nope", 35), false);

// ── step: cannot walk a value out of its own range ────────────────────────
assert.equal(step("biceps", 35, 0.5), 35.5);
assert.equal(step("biceps", 35.5, -0.5), 35);
// Float noise stays out of the input box.
assert.equal(step("biceps", 35.1, 0.5), 35.6);
// Clamped at both ends rather than producing a value the CTA would reject.
assert.equal(step("biceps", 70, 0.5), 70);
assert.equal(step("biceps", 15, -0.5), 15);

// ── formatValues: one history line per metric, not one per key ────────────
const biceps = findMetric("biceps")!;
const chest = findMetric("chest")!;
assert.equal(formatValues(rows[1], biceps), "35 / 35.5");
assert.equal(formatValues(rows[0], chest), "101");
// A metric absent from the row contributes no line at all.
assert.equal(formatValues(rows[0], biceps), null);
// A half-filled pair still renders, with the missing side marked.
assert.equal(
  formatValues(
    { measured_at: "2026-08-26", measurements: { biceps_left: 35 } },
    biceps,
  ),
  "35 / —",
);

console.log("measurements self-check passed");
