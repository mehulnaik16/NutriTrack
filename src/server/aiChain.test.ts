/* Runnable self-check for the AI fallback runner. Plain assert script, same
   convention as src/lib/foodCache.test.ts.

   Run:
     node src/server/aiChain.test.ts

   No network: every step is a fake that answers, fails or hangs on cue. */
import assert from "node:assert";
import {
  AI_BUSY,
  AiHttpError,
  msUntilPacificMidnight,
  runChain,
  _resetCooldowns,
} from "./aiChain.ts";
import type { Step } from "./aiChain.ts";

const ok = (
  model: string,
  text = model,
  provider: Step["provider"] = "gemini",
): Step => ({ provider, model, run: async () => text });

const fail = (
  model: string,
  status: number,
  provider: Step["provider"] = "gemini",
  retryAfterMs: number | null = null,
  quota: "minute" | "day" | null = null,
) => {
  const s = {
    provider,
    model,
    calls: 0,
    run: async (): Promise<string> => {
      s.calls++;
      throw new AiHttpError(
        status,
        provider,
        retryAfterMs,
        `${model} ${status}`,
        quota,
      );
    },
  };
  return s;
};

const hang = (model: string): Step => ({
  provider: "gemini",
  model,
  run: (signal) =>
    new Promise((_, rej) =>
      signal.addEventListener("abort", () => rej(signal.reason)),
    ),
});

const opts = { budgetMs: 8000, attemptMs: 3000, label: "test" };

// 1. primary answers
_resetCooldowns();
let r = await runChain([ok("p"), ok("f")], opts);
assert.deepEqual([r.model, r.primary], ["p", true]);

// 2. a retry is an explicit step: it runs although the first try just cooled
// the model, and nothing retries on its own
_resetCooldowns();
const p503 = fail("p", 503);
r = await runChain([p503, { ...p503, retry: true }, ok("lite")], opts);
assert.equal(p503.calls, 2, "the retry step runs through a busy cooldown");
assert.deepEqual([r.model, r.primary], ["lite", false]);
_resetCooldowns();
const once = fail("once", 503);
await runChain([once, ok("lite")], opts);
assert.equal(once.calls, 1, "no automatic retry without a retry step");

// 2b. a retry step does not override a 429 cooldown: quota will not clear
_resetCooldowns();
const q = fail("q", 429, "gemini", 30_000, "minute");
await runChain([q, ok("mid"), { ...q, retry: true }, ok("lite")], opts);
await runChain([q, fail("mid2", 503), { ...q, retry: true }, ok("lite")], opts);
assert.equal(q.calls, 1, "a rate-limited model is not retried");

// 3. RPM 429 on primary: no retry, cooled for the next request
_resetCooldowns();
const p429 = fail("p", 429, "gemini", 30_000, "minute");
await runChain([p429, ok("lite")], opts);
assert.equal(p429.calls, 1, "429 is not retried on the same model");
await runChain([p429, ok("lite")], opts);
assert.equal(p429.calls, 1, "cooled model is skipped on the next request");

// 3b. RPM cooldown ends and the primary is used again
_resetCooldowns();
const pShort = fail("ps", 429, "gemini", 30, "minute");
await runChain([pShort, ok("lite")], opts);
await new Promise((res) => setTimeout(res, 60));
await runChain([pShort, ok("lite")], opts);
assert.equal(
  pShort.calls,
  2,
  "after the RPM window the primary is tried again",
);

// 3c. RPD 429 cools until the daily reset, ignoring the short retryDelay
_resetCooldowns();
const pDay = fail("pd", 429, "gemini", 30, "day");
await runChain([pDay, ok("lite")], opts);
await new Promise((res) => setTimeout(res, 60));
await runChain([pDay, ok("lite")], opts);
assert.equal(pDay.calls, 1, "RPD-exhausted model stays skipped for the day");
const toReset = msUntilPacificMidnight();
assert.ok(toReset > 0 && toReset <= 24 * 3600_000);

// 4. every step cooled: still tried rather than failing instantly
_resetCooldowns();
const lone = fail("lone", 429, "gemini", 30_000, "minute");
await assert.rejects(runChain([lone], opts));
await assert.rejects(runChain([lone], opts));
assert.equal(lone.calls, 2, "a lone cooled step is still attempted");

// 5. timeout moves on within the budget, no same-model retry
_resetCooldowns();
const t0 = Date.now();
r = await runChain([hang("p"), ok("lite")], {
  budgetMs: 8000,
  attemptMs: 300,
  label: "test",
});
assert.equal(r.model, "lite");
assert.ok(Date.now() - t0 < 1500, "timeout is not retried on the same model");

// 6. key error skips every step of that provider, Groq answers
_resetCooldowns();
const g2 = fail("g2", 503);
r = await runChain([fail("g1", 401), g2, ok("groq", "x", "groq")], opts);
assert.equal(g2.calls, 0, "other Gemini steps skipped after a key error");
assert.deepEqual([r.provider, r.primary], ["groq", false]);

// 7. a model-specific 400 moves on
_resetCooldowns();
r = await runChain([fail("p", 400), ok("lite")], opts);
assert.equal(r.model, "lite");

// 8. all busy → AI_BUSY; all 400 → the real error
_resetCooldowns();
await assert.rejects(
  runChain([fail("a", 503), fail("b", 503, "groq")], opts),
  (e: Error) => e.message.startsWith(AI_BUSY),
);
_resetCooldowns();
await assert.rejects(
  runChain([fail("a", 400), fail("b", 400)], opts),
  (e: Error) => !e.message.startsWith(AI_BUSY),
);

// 9. budget exhausted: no attempt starts with < 800 ms left
_resetCooldowns();
const late = fail("late", 503);
await assert.rejects(
  runChain([hang("p"), late], {
    budgetMs: 1000,
    attemptMs: 900,
    label: "test",
  }),
  (e: Error) => e.message.startsWith(AI_BUSY),
);
assert.equal(late.calls, 0);

// 10. a slow primary cannot eat the whole budget: seen live, when a 503 took
// seconds to arrive and the retry then timed out, leaving no time for lite.
_resetCooldowns();
let slowCalls = 0;
const slowPrimary: Step = {
  provider: "gemini",
  model: "slow",
  run: (signal) => {
    slowCalls++;
    if (slowCalls === 1)
      return new Promise((_, rej) =>
        setTimeout(
          () => rej(new AiHttpError(503, "gemini", null, "slow 503")),
          600,
        ),
      );
    return hang("slow").run(signal);
  },
};
r = await runChain([slowPrimary, { ...slowPrimary, retry: true }, ok("lite")], {
  budgetMs: 3000,
  attemptMs: 1500,
  label: "test",
});
assert.equal(
  r.model,
  "lite",
  "fallback still gets a turn after a slow primary",
);

// 11. a hanging fallback leaves time for the next one: seen live, lite timed
// out at the full attempt cap and Groq never got a turn.
_resetCooldowns();
r = await runChain([fail("p", 400), hang("lite"), ok("groq", "x", "groq")], {
  budgetMs: 3000,
  attemptMs: 2500,
  label: "test",
});
assert.equal(r.model, "groq", "a stalled fallback cannot starve the next one");

// 12. when a reserve would leave a model too little time to answer, it gets
// the rest: seen live on voice, Groq was cut to 800 ms to save time for a
// last Gemini try that then also timed out.
_resetCooldowns();
const slowOk = (
  model: string,
  ms: number,
  provider: Step["provider"],
): Step => ({
  provider,
  model,
  // Honours the abort like a real fetch does.
  run: (signal) =>
    new Promise((res, rej) => {
      const t = setTimeout(() => res(model), ms);
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        rej(signal.reason);
      });
    }),
});
r = await runChain(
  [fail("p", 400), hang("lite"), slowOk("groq", 1000, "groq"), hang("g36")],
  { budgetMs: 3000, attemptMs: 3000, label: "test" },
);
assert.equal(
  r.model,
  "groq",
  "the last realistic attempt gets the remaining time",
);

// 13. with groqJump, two models failing on capacity sends Groq next, and
// Gemini is tried again only if Groq also fails. Seen live on photo, where
// Groq sat last and three Gemini timeouts used the whole budget first.
const jump = { ...opts, groqJump: true };
_resetCooldowns();
const g3 = fail("g3", 503);
r = await runChain(
  [fail("g1", 503), fail("g2", 503), g3, ok("groq", "x", "groq")],
  jump,
);
assert.equal(r.model, "groq");
assert.equal(g3.calls, 0, "Groq jumps ahead of the remaining Gemini models");
_resetCooldowns();
const g3b = fail("g3b", 503);
await assert.rejects(
  runChain(
    [fail("g1", 503), fail("g2", 503), g3b, fail("groq", 503, "groq")],
    jump,
  ),
);
assert.equal(g3b.calls, 1, "back to Gemini after Groq fails");
// without groqJump the order is followed exactly (the user's search order)
_resetCooldowns();
const g3c = ok("g3c");
r = await runChain(
  [fail("g1", 503), fail("g2", 503), g3c, ok("groq", "x", "groq")],
  opts,
);
assert.equal(r.model, "g3c", "no jump: Gemini lite goes before Groq");

// 14. the last live model is not held to the per-attempt cap: with 15 s for
// a search, lite as the last step may use everything the others left.
_resetCooldowns();
r = await runChain([fail("p", 503), slowOk("lite", 1000, "gemini")], {
  budgetMs: 3000,
  attemptMs: 300,
  label: "test",
});
assert.equal(r.model, "lite", "the last step gets the rest of the budget");

// 15. an immediate retry is skipped after a timeout: seen live on photo, lite
// hung, its retry hung again, and Groq ran out of time. A retry that is not
// immediate (search attempt 3's second 3.6) still runs, as the user ordered.
_resetCooldowns();
let hangCalls = 0;
const hangCounted: Step = {
  provider: "gemini",
  model: "h",
  run: (signal) => {
    hangCalls++;
    return hang("h").run(signal);
  },
};
r = await runChain(
  [hangCounted, { ...hangCounted, retry: true }, ok("groq", "x", "groq")],
  { budgetMs: 4000, attemptMs: 500, label: "test" },
);
assert.equal(hangCalls, 1, "no immediate retry of a model that just timed out");
assert.equal(r.model, "groq");
_resetCooldowns();
hangCalls = 0;
await assert.rejects(
  runChain([hangCounted, fail("mid", 503), { ...hangCounted, retry: true }], {
    budgetMs: 4000,
    attemptMs: 500,
    label: "test",
  }),
);
assert.equal(hangCalls, 2, "a later retry in the order still runs");

console.log("aiChain: all checks passed");
