/* Runnable self-check for the single-call AI runner. Plain assert script, same
   convention as src/lib/foodCache.test.ts.

   Run:
     node src/server/aiChain.test.ts

   No network: every step is a fake that answers, fails or hangs on cue. */
import assert from "node:assert";
import { AI_BUSY, AiHttpError, runOnce } from "./aiChain.ts";
import type { Step } from "./aiChain.ts";

const opts = { budgetMs: 200, label: "test" };
const step = (run: Step["run"]): Step & { calls: number } => {
  const s = {
    provider: "gemini" as const,
    model: "lite",
    calls: 0,
    run: (sig: AbortSignal) => {
      s.calls++;
      return run(sig);
    },
  };
  return s;
};
const failWith = (status: number) =>
  step(async () => {
    throw new AiHttpError(status, "gemini", null, `err ${status}`);
  });
const busy = (p: Promise<unknown>) =>
  assert.rejects(p, (e: Error) => e.message.startsWith(AI_BUSY));

// 1. an answer comes back with the model that gave it
const r = await runOnce(
  step(async () => "hi"),
  opts,
);
assert.deepEqual([r.text, r.model, r.provider], ["hi", "lite", "gemini"]);

// 2. capacity failures (503, 429) are one call, then AI_BUSY: no retry
for (const status of [503, 429]) {
  const s = failWith(status);
  await busy(runOnce(s, opts));
  assert.equal(s.calls, 1, `${status} is not retried`);
}

// 3. a hang is cut at the budget and reported busy
const hang = step(
  (sig) =>
    new Promise((_, rej) =>
      sig.addEventListener("abort", () => rej(sig.reason)),
    ),
);
const t0 = Date.now();
await busy(runOnce(hang, opts));
assert.ok(Date.now() - t0 < 1000, "timed out at the budget");
assert.equal(hang.calls, 1);

// 4. a real error (bad request, dead key) is rethrown as itself
for (const status of [400, 401]) {
  await assert.rejects(
    runOnce(failWith(status), opts),
    (e: unknown) => e instanceof AiHttpError && e.status === status,
  );
}

console.log("aiChain: all checks passed");
