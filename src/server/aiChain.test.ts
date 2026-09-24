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

// 2. primary 503 → retried once → fallback answers, not primary
_resetCooldowns();
const p503 = fail("p", 503);
r = await runChain([p503, ok("lite")], opts);
assert.equal(p503.calls, 2, "503 on primary gets exactly one retry");
assert.deepEqual([r.model, r.primary], ["lite", false]);

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

console.log("aiChain: all checks passed");
