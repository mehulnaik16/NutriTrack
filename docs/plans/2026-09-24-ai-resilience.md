# AI Resilience (503 / 429 / Timeout) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every AI call in the food flow (search, photo, voice) keeps working when Gemini returns 503, 429 or stalls. It does this by walking an ordered model chain inside a fixed time budget, caching only the primary model's answers, and telling the user something friendly when everything fails.

**Architecture:**
- One pure runner, `runChain()` in `src/server/aiChain.ts`, takes an ordered list of model steps and a time budget. It classifies each failure and decides whether to retry, move on, skip a provider or give up.
- `src/server/aiRoutes.ts` defines the three chains: search, vision and voice.
- `gemini.ts` and `groq.ts` only learn to accept an `AbortSignal` and to throw a typed `AiHttpError`.
- The client stops choosing models. The server owns the chain, so every screen gets the same behaviour, meal-builder included.

**Tech Stack:** TanStack Start server functions on Vercel (Fluid Compute, iad1), plain `fetch` to Gemini and Groq, with no new dependencies. `AbortSignal.timeout`, sonner toasts, and plain `node:assert` test scripts run with `node file.test.ts`.

**Spec:** the user's decisions in chat on 2026-09-24, recorded in memory `ai-fallback-and-cache-truth.md`.

## Global Constraints

- Search chain: `gemini-3.7-flash` (primary) → retry `gemini-3.7-flash` once, on 5xx only → `gemini-3.5-flash-lite` → Groq `openai/gpt-oss-120b` → `gemini-3.6-flash` (the "go back to Gemini" step).
- Photo chain: `gemini-3.5-flash-lite` (primary) → retry it once, on 5xx only → `gemini-3.7-flash` → `gemini-3.6-flash` → Groq `qwen/qwen3.8-27b`, the last resort.
- Voice parse chain: `gemini-3.7-flash` (primary) → retry once, on 5xx only → `gemini-3.5-flash-lite` → Groq `openai/gpt-oss-120b` → `gemini-3.6-flash`.
- Search takes **8 s total**, including every model switch.
- Photo takes **15 s total**: a 7 s vision chain, then the 8 s food lookup.
- Only answers from the **primary** model of the **search** chain are written to the shared cache. Groq answers are never cached. Fallback Gemini answers are shown but not cached.
- A photo taking more than **2 s** shows cycling stage messages, not a bare spinner.
- Failure copy has the title "AI is extra busy right now" and the body "High demand is slowing us down. Please try again in a few seconds!"
- No new npm dependencies, and no `@google/genai` SDK.
- 429 on the per-minute quota (RPM) cools that model only until the minute clears (Google's `retryDelay`, else 60 s), then the primary is used again. 429 on the daily quota (RPD) cools that model until midnight Pacific (the Gemini reset), so the next model in the chain serves for the rest of the day.
- 401, 403 and an invalid API key are never retried on the same provider. Instead, the remaining steps of that provider are skipped and a critical Telegram alert is sent.
- `supabase/.temp/` stays uncommitted. Do not push.

## Review Focus

1. **Every model returns 503 during peak.** The user must get the busy toast within about 8 s. The search must not hang, must not show a silent blank list, and must not show "no nutrition data".
2. **Only Groq answers.** The user gets a result, and `ai_unverified` gets no new row for that query.
3. **The primary model is cooled after a 429.** The next request in the same instance skips it immediately instead of waiting on it again. When every step is cooled, the runner still tries rather than failing instantly.
4. **A fallback model rejects the request with a 400**, for example an unsupported thinking budget or image input. The chain moves on; a model-specific 400 must not kill the chain.
5. **The photo dialog is closed mid-analysis.** The interval timer is cleared and nothing throws after unmount.

---

### Task 1: Pure chain runner

**Files:**
- Create: `src/server/aiChain.ts`
- Test: `src/server/aiChain.test.ts`

**Interfaces:**
- Produces:
  - `AI_BUSY = "AI_BUSY"`
  - `class AiHttpError(status: number, provider: Provider, retryAfterMs: number | null, message: string, quota?: "minute" | "day" | null)`
  - `msUntilPacificMidnight(now?: number): number`
  - `type Provider = "gemini" | "groq"`
  - `interface Step { provider: Provider; model: string; run(signal: AbortSignal): Promise<string> }`
  - `interface ChainResult { text: string; model: string; provider: Provider; primary: boolean }`
  - `runChain(steps: Step[], opts: { budgetMs: number; attemptMs: number; label: string }): Promise<ChainResult>`
  - `_resetCooldowns(): void` (tests only)

- [ ] **Step 1: Write the failing test** `src/server/aiChain.test.ts`

```ts
/* Runnable self-check for the AI fallback runner. Plain assert script, same
   convention as src/lib/foodCache.test.ts.
   Run: node src/server/aiChain.test.ts */
import assert from "node:assert";
import { AI_BUSY, AiHttpError, msUntilPacificMidnight, runChain, _resetCooldowns } from "./aiChain.ts";
import type { Step } from "./aiChain.ts";

const ok = (model: string, text = model, provider: Step["provider"] = "gemini"): Step => ({
  provider, model, run: async () => text,
});
const fail = (model: string, status: number, provider: Step["provider"] = "gemini", retryAfterMs: number | null = null): Step & { calls: number } => {
  const s = { provider, model, calls: 0, run: async () => { s.calls++; throw new AiHttpError(status, provider, retryAfterMs, `${model} ${status}`); } };
  return s;
};
const hang = (model: string): Step => ({
  provider: "gemini", model,
  run: (signal) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(signal.reason))),
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

// 3. 429 on primary: no retry, cooled for the next request
_resetCooldowns();
const p429 = fail("p", 429, "gemini", 30_000);
await runChain([p429, ok("lite")], opts);
assert.equal(p429.calls, 1, "429 is not retried on the same model");
await runChain([p429, ok("lite")], opts);
assert.equal(p429.calls, 1, "cooled model is skipped on the next request");

// 3b. daily quota (RPD) cools the model until midnight Pacific, RPM does not
_resetCooldowns();
const pDay = { provider: "gemini" as const, model: "pd", calls: 0,
  run: async () => { pDay.calls++; throw new AiHttpError(429, "gemini", 5_000, "pd 429", "day"); } };
await runChain([pDay, ok("lite")], opts);
await new Promise((r) => setTimeout(r, 50));
await runChain([pDay, ok("lite")], opts);
assert.equal(pDay.calls, 1, "RPD-exhausted model stays skipped, not just for retryDelay");
assert.ok(msUntilPacificMidnight() > 0 && msUntilPacificMidnight() <= 24 * 3600_000);

// 4. every step cooled: still tried rather than failing instantly
const cooledOnly = fail("p", 429, "gemini", 30_000);
_resetCooldowns();
await assert.rejects(runChain([cooledOnly], opts));
await assert.rejects(runChain([cooledOnly], opts));
assert.equal(cooledOnly.calls, 2, "a lone cooled step is still attempted");

// 5. timeout moves on within the budget
_resetCooldowns();
const t0 = Date.now();
r = await runChain([hang("p"), ok("lite")], { budgetMs: 8000, attemptMs: 300, label: "test" });
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
await assert.rejects(runChain([fail("a", 503), fail("b", 503, "groq")], opts), (e: Error) => e.message.startsWith(AI_BUSY));
_resetCooldowns();
await assert.rejects(runChain([fail("a", 400), fail("b", 400)], opts), (e: Error) => !e.message.startsWith(AI_BUSY));

// 9. budget exhausted: no attempt starts with < 800 ms left
_resetCooldowns();
const late = fail("late", 503);
await assert.rejects(runChain([hang("p"), late], { budgetMs: 1000, attemptMs: 900, label: "test" }));
assert.equal(late.calls, 0);

console.log("aiChain: all checks passed");
```

- [ ] **Step 2: Run it, expect failure**

Run: `node src/server/aiChain.test.ts`
Expected: FAIL with `Cannot find module ... aiChain.ts`

- [ ] **Step 3: Implement `src/server/aiChain.ts`**

```ts
/**
 * Runs one AI request down an ordered list of models inside a time budget, so
 * a Gemini 503, a 429 or a stall costs the user a model switch rather than an
 * error. The chains themselves live in aiRoutes.ts; the rules (which failures
 * retry, which move on, which skip a provider) live here, once.
 *
 * Deliberately import-free so the self-check runs under plain node.
 */

/** Message prefix the client matches to show the "AI is busy" copy. */
export const AI_BUSY = "AI_BUSY";

export type Provider = "gemini" | "groq";

export class AiHttpError extends Error {
  constructor(
    public status: number,
    public provider: Provider,
    /** From Gemini's RetryInfo or Groq's retry-after, when the provider sent one. */
    public retryAfterMs: number | null,
    message: string,
    /** Which quota a 429 broke: the per-minute one clears in seconds, the daily one at midnight Pacific. */
    public quota: "minute" | "day" | null = null,
  ) {
    super(message);
  }
}

/** Gemini's daily quotas reset at midnight Pacific time. */
export function msUntilPacificMidnight(now = Date.now()) {
  const pt = new Date(new Date(now).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const next = new Date(pt);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - pt.getTime();
}

export interface Step {
  provider: Provider;
  model: string;
  run(signal: AbortSignal): Promise<string>;
}

export interface ChainResult {
  text: string;
  model: string;
  provider: Provider;
  /** True only when the first step answered — the only answer the cache trusts. */
  primary: boolean;
}

type Kind = "busy" | "limited" | "key" | "bad";

function classify(e: unknown): Kind {
  if (e instanceof AiHttpError) {
    if (e.status === 429) return "limited";
    if (
      e.status === 401 ||
      e.status === 403 ||
      (e.status === 400 && /API_KEY_INVALID|API key not valid/.test(e.message))
    )
      return "key";
    if (e.status >= 500) return "busy";
    return "bad";
  }
  // AbortSignal.timeout rejects with a TimeoutError; fetch's network failure is
  // a TypeError. Both are "the provider did not answer", not "the request is wrong".
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError" || e instanceof TypeError))
    return "busy";
  return "bad";
}

// Per instance. Fluid Compute reuses instances across requests, so at peak one
// 503 spares the next requests on this instance from waiting on the same model.
// ponytail: per-instance memory, a shared store (Redis) if cross-instance matters.
const cooledUntil = new Map<string, number>();
const BUSY_COOL_MS = 10_000;
/** RPM windows are one minute; used when the 429 carries no retryDelay. */
const LIMIT_COOL_MS = 60_000;
/** Starting an attempt with less left than this only burns the budget. */
const MIN_START_MS = 800;

export function _resetCooldowns() {
  cooledUntil.clear();
}

const isCooled = (s: Step) => (cooledUntil.get(s.model) ?? 0) > Date.now();

export async function runChain(
  steps: Step[],
  opts: { budgetMs: number; attemptMs: number; label: string },
): Promise<ChainResult> {
  const deadline = Date.now() + opts.budgetMs;
  const deadProviders = new Set<Provider>();
  let sawCapacity = false;
  let lastErr: unknown = null;
  let retried = false;

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (deadProviders.has(s.provider)) continue;
    const remaining = deadline - Date.now();
    if (remaining < MIN_START_MS) break;
    // A cooled model is skipped only while something uncooled is still ahead;
    // when everything is cooled, trying beats failing instantly.
    const live = steps.slice(i + 1).some((n) => !deadProviders.has(n.provider) && !isCooled(n));
    if (isCooled(s) && live) continue;

    try {
      const text = await s.run(AbortSignal.timeout(Math.min(remaining, opts.attemptMs)));
      if (i > 0) console.info(`[ai-chain] ${opts.label} answered by fallback ${s.model}`);
      return { text, model: s.model, provider: s.provider, primary: i === 0 };
    } catch (e) {
      lastErr = e;
      const kind = classify(e);
      console.warn(`[ai-chain] ${opts.label} ${s.model} failed (${kind})`, e instanceof Error ? e.message.slice(0, 200) : e);
      if (kind === "key") {
        deadProviders.add(s.provider);
        continue;
      }
      if (kind === "bad") continue;
      sawCapacity = true;
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      // One quick retry, primary only, and only for a 5xx: a timeout already
      // spent its time, and a 429 will not clear in half a second.
      if (i === 0 && kind === "busy" && !timedOut && !retried) {
        retried = true;
        await new Promise((r) => setTimeout(r, 300 + Math.random() * 400));
        i--;
        continue;
      }
      // RPM hit: step aside briefly, and the primary is back on the next request
      // after it clears. RPD hit: the model is out until the daily reset, so the
      // next model carries the rest of the day.
      const http = e instanceof AiHttpError ? e : null;
      const coolMs =
        kind !== "limited"
          ? BUSY_COOL_MS
          : http?.quota === "day"
            ? msUntilPacificMidnight()
            : (http?.retryAfterMs ?? LIMIT_COOL_MS);
      cooledUntil.set(s.model, Date.now() + coolMs);
    }
  }

  if (sawCapacity || lastErr === null)
    throw new Error(`${AI_BUSY}: every model for ${opts.label} was busy or out of time`);
  throw lastErr;
}
```

- [ ] **Step 4: Run it, expect pass**

Run: `node src/server/aiChain.test.ts`
Expected: `aiChain: all checks passed`

- [ ] **Step 5: Commit**

```bash
git add src/server/aiChain.ts src/server/aiChain.test.ts
git commit -m "feat(ai): add a fallback chain runner for 503, 429 and timeouts"
```

---

### Task 2: Typed errors and abort signals in the providers

**Files:**
- Modify: `src/server/gemini.ts` (header comment, `generate()`, `geminiText`, `geminiVision`)
- Modify: `src/server/groq.ts:102-190` (`groqFetch`), `:216-269` (`groqChat`, `groqVision`)

**Interfaces:**
- Consumes: `AiHttpError` from Task 1.
- Produces:
  - `geminiText({ prompt, max_tokens?, temperature?, model?, signal? })`
  - `geminiVision({ prompt, base64, mimeType, max_tokens?, model?, signal? })`
  - `groqChat({ ..., signal? })`
  - `groqVision({ ..., signal? })`
  - All four throw `AiHttpError` on non-2xx.

- [ ] **Step 1: gemini.ts.** Replace the header paragraph that says "One provider, no fallback, real errors" with: "Fallback between models is aiChain.ts's job; this file makes one call and reports failures as AiHttpError." Then add `signal?: AbortSignal` to `generate`'s opts and to both exported wrappers, and pass it through:

```ts
import { AiHttpError } from "./aiChain";
import { sendAlert } from "./telegram";
// ...inside generate():
  const res = await fetch(
    `${GEMINI_BASE}/${opts.model}:generateContent?key=${encodeURIComponent(key)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, signal: opts.signal, body: JSON.stringify({ /* unchanged */ }) },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    // Google sends RetryInfo on a 429: details[].retryDelay = "37s".
    const delay = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(err)?.[1];
    if (res.status === 401 || res.status === 403 || /API_KEY_INVALID/.test(err))
      await sendAlert({
        severity: "critical",
        title: "Gemini key rejected",
        detail: { status: res.status, model: opts.model },
        throttleKey: "gemini-key-rejected",
      });
    // A 429 names the quota it broke in QuotaFailure.violations[].quotaId,
    // e.g. "GenerateRequestsPerDayPerProjectPerModel-FreeTier".
    const quota =
      res.status !== 429 ? null : /PerDay/.test(err) ? "day" : "minute";
    throw new AiHttpError(
      res.status,
      "gemini",
      delay ? Math.ceil(Number(delay) * 1000) : null,
      `Gemini error ${res.status} (${opts.model}): ${err.slice(0, 400)}`,
      quota,
    );
  }
```

`geminiVision` and `geminiText` forward `signal: opts.signal`. (`geminiText` already spreads `...opts`.)

- [ ] **Step 2: groq.ts.**
  - Add `signal?: AbortSignal` to `GroqRequestOptions`, `ChatOptions` and `groqVision`'s opts.
  - `groqFetch` passes `signal: opts.signal` to `fetch`.
  - `groqChat` passes `signal: opts.signal` into `groqFetch`.
  - `groqVision` forwards it.
  - Replace the two throws:

```ts
// groqFetch, after the loop — every key exhausted is capacity, not a bad request:
  throw new AiHttpError(503, "groq", null, `All ${KEYS.length} Groq keys exhausted or rate-limited.`);

// groqChat, on !res.ok:
    throw new AiHttpError(res.status, "groq", null, `Groq chat error ${res.status}: ${JSON.stringify(err)}`);
```

- [ ] **Step 3: Typecheck and rerun Task 1**

Run: `npx tsc --noEmit -p . ; node src/server/aiChain.test.ts`
Expected: no type errors, and `aiChain: all checks passed`.

- [ ] **Step 4: Commit**

```bash
git add src/server/gemini.ts src/server/groq.ts
git commit -m "feat(ai): typed provider errors with abort signals"
```

---

### Task 3: The three chains, and search on its chain with primary-only caching

**Files:**
- Create: `src/server/aiRoutes.ts`
- Modify: `src/lib/ai.ts:127-367`: `runFoodSearch` (drop `engine`), the cache write guard, `FoodSearchEngine`, and the `serverAiFoodSearchInline` input

**Interfaces:**
- Consumes: `runChain`, `Step` (Task 1); the provider functions with `signal` (Task 2).
- Produces:
  - `searchChain(system: string, user: string, max_tokens: number, budgetMs: number): Promise<ChainResult>`
  - `visionChain(prompt: string, base64: string, mimeType: string): Promise<ChainResult>`
  - `voiceChain(prompt: string): Promise<ChainResult>`
  - `SEARCH_BUDGET_MS = 8000`

- [ ] **Step 1: Create `src/server/aiRoutes.ts`**

```ts
/**
 * The model order for each AI feature, as the user set it on 2026-09-24. The
 * first step is the primary: only its search answers enter the shared cache.
 * Budgets: search 8 s total; photo 7 s vision + 8 s lookup = 15 s.
 */
import { runChain, type Step } from "./aiChain";
import {
  geminiText,
  geminiVision,
  GEMINI_LITE_MODEL as LITE,
  GEMINI_SEARCH_MODEL as FLASH_37,
  GEMINI_VISION_MODEL as FLASH_36,
} from "./gemini";
import { groqChat, groqVision } from "./groq";

export const SEARCH_BUDGET_MS = 8000;
const VISION_BUDGET_MS = 7000;
const VOICE_BUDGET_MS = 7000;
// ponytail: guessed per-attempt caps, tune from the [ai-chain] logs once real traffic exists.
const ATTEMPT_MS = 4000;

const GROQ_TEXT = "openai/gpt-oss-120b";

export function searchChain(system: string, user: string, max_tokens: number, budgetMs: number) {
  const prompt = [system, user].join("\n\n");
  const g = (model: string): Step => ({
    provider: "gemini", model,
    run: (signal) => geminiText({ model, prompt, max_tokens, temperature: 0.1, signal }),
  });
  return runChain(
    [
      g(FLASH_37),
      g(LITE),
      {
        provider: "groq", model: GROQ_TEXT,
        run: (signal) => groqChat({
          model: GROQ_TEXT,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          max_tokens, temperature: 0.1, reasoning_effort: "low",
          response_format: { type: "json_object" }, signal,
        }),
      },
      g(FLASH_36),
    ],
    { budgetMs, attemptMs: ATTEMPT_MS, label: "food-search" },
  );
}

export function visionChain(prompt: string, base64: string, mimeType: string) {
  const g = (model: string): Step => ({
    provider: "gemini", model,
    run: (signal) => geminiVision({ model, prompt, base64, mimeType, signal }),
  });
  return runChain(
    [
      g(LITE),
      g(FLASH_37),
      g(FLASH_36),
      { provider: "groq", model: "qwen/qwen3.8-27b", run: (signal) => groqVision({ prompt, base64, mimeType, signal }) },
    ],
    { budgetMs: VISION_BUDGET_MS, attemptMs: ATTEMPT_MS, label: "food-photo" },
  );
}

export function voiceChain(prompt: string) {
  const g = (model: string): Step => ({
    provider: "gemini", model,
    run: (signal) => geminiText({ model, prompt, max_tokens: 400, temperature: 0.1, signal }),
  });
  return runChain(
    [
      g(FLASH_37),
      g(LITE),
      {
        provider: "groq", model: GROQ_TEXT,
        run: (signal) => groqChat({ model: GROQ_TEXT, messages: [{ role: "user", content: prompt }], max_tokens: 400, temperature: 0.1, signal }),
      },
      g(FLASH_36),
    ],
    { budgetMs: VOICE_BUDGET_MS, attemptMs: ATTEMPT_MS, label: "voice-parse" },
  );
}
```

- [ ] **Step 2: Wire search in `src/lib/ai.ts`**
  - Change the signature to `async function runFoodSearch(rawQuery: string, userId?: string)` and record `const started = Date.now();` as its first line.
  - Replace the whole `if (engine === "gemini") { … } else { … }` block (lines 235-261) with:

```ts
  const { searchChain, SEARCH_BUDGET_MS } = await import("@/server/aiRoutes");
  // The budget covers the whole search, the cache lookup above included.
  const answer = await searchChain(
    FOOD_SEARCH_SYSTEM,
    userMsg,
    max_tokens,
    SEARCH_BUDGET_MS - (Date.now() - started),
  );
  const raw = answer.text;
  const model = answer.model;
  const engine = answer.provider;
```

  - Change the cache guard at line 305 to `if (!personal && !ambiguous && userId && answer.primary) {`, with this comment above it: `// Only the primary model's answer is the cache's truth: a fallback Gemini answer is served but not recorded, and a Groq answer is never recorded (the user judged its answers unreliable).`
  - Delete `export type FoodSearchEngine` and its comment.
  - `serverAiFoodSearch`: `return runFoodSearch(ctx.data, ctx.context.userId);`
  - `serverAiFoodSearchInline`: its input becomes `z.object({ query: z.string() })` and it calls `runFoodSearch(ctx.data.query, ctx.context.userId)`.

- [ ] **Step 3: Typecheck.** Run `npx tsc --noEmit -p .` and expect errors only in the callers that still pass `engine` (FoodSearch, VoiceFoodDialog, PhotoFoodDialog). Task 4 fixes those.

- [ ] **Step 4: Commit** (together with Task 4, since the tree does not typecheck between them)

---

### Task 4: Vision and voice on their chains; clients stop choosing models

**Files:**
- Modify: `src/lib/ai.ts:460-536`: replace `serverGeminiChat`, `serverGroqVision`, `serverGeminiVision` and `serverGeminiLiteVision` with `serverFoodVision` and `serverVoiceParse`
- Modify: `src/components/PhotoFoodDialog.tsx`: drop `VisionProvider`, `VISION_FN`, `PROVIDER_LABEL` and the `provider` prop
- Modify: `src/components/VoiceFoodDialog.tsx`: drop the `engine` params and prop, and add the busy rethrow in `resolveFood`
- Modify: `src/components/FoodSearch.tsx`: turn `cameraProvider` state into a boolean `cameraOpen`, and drop `engine` from its calls
- `src/routes/meal-builder.tsx` needs no edit. It now gets Gemini because the defaults are gone. Before this change it ran Groq for photo and voice and cached Groq answers.

**Interfaces:**
- Consumes: `visionChain`, `voiceChain` (Task 3).
- Produces:
  - `serverFoodVision({ data: { prompt, base64, mimeType } }) → { result: string }`
  - `serverVoiceParse({ data: { prompt, max_tokens?, temperature? } }) → { result: string }`
  - `resolveFood(name: string)`
  - `parseVoiceFoodLog(transcript, mealType)`

- [ ] **Step 1: Server functions in `ai.ts`**

```ts
// ── AI Vision (food photo) ───────────────────────────────────────────────────
// The model order and fallbacks live in server/aiRoutes.ts; the client no
// longer picks a model, so every screen gets the same chain.
export const serverFoodVision = createServerFn({ method: "POST" })
  .middleware([requireAccess])
  .inputValidator(VisionInput)
  .handler(async (ctx) => {
    checkRateLimit(ctx.context.userId);
    const { visionChain } = await import("@/server/aiRoutes");
    const { prompt, base64, mimeType } = ctx.data;
    return { result: (await visionChain(prompt, base64, mimeType)).text };
  });

// ── Voice parse ──────────────────────────────────────────────────────────────
export const serverVoiceParse = createServerFn({ method: "POST" })
  .middleware([requireAccess])
  .inputValidator(ChatInput.pick({ prompt: true }))
  .handler(async (ctx) => {
    checkRateLimit(ctx.context.userId);
    const { voiceChain } = await import("@/server/aiRoutes");
    return { result: (await voiceChain(ctx.data.prompt)).text };
  });
```

  Delete `serverGeminiChat`, `serverGroqVision`, `serverGeminiVision` and `serverGeminiLiteVision`. `serverGroqChat` stays; WeeklyReport, weight and aiPlan use it and are out of scope.

- [ ] **Step 2: `PhotoFoodDialog.tsx`**
  - Import `serverFoodVision` in place of the three vision functions.
  - Delete `VisionProvider`, `VISION_FN` and `PROVIDER_LABEL`, and the `<span>` showing the label in the title.
  - `recognizeFoodFromImage(base64, mimeType)` calls `serverFoodVision({ data: { prompt, base64, mimeType } })`.
  - `resolveFood(result.food_name)`.
  - Remove `provider = "groq"` and `provider?: VisionProvider` from the props.

- [ ] **Step 3: `VoiceFoodDialog.tsx`**
  - Import `serverVoiceParse`. Remove `serverGeminiChat`, `serverGroqChat` and `FoodSearchEngine`.
  - `resolveFood(name)` sends `data: { query: name }`. In its `catch`, rethrow when `isAiBusy(e)` (Task 5). Only a real miss returns `null`.
  - `resolveVoiceItem(it)` and `parseVoiceFoodLog(transcript, mealType)` lose `engine`.
  - The parse call becomes `const { result: raw } = await serverVoiceParse({ data: { prompt } });`
  - Remove the `engine` prop and its doc comment.

- [ ] **Step 4: `FoodSearch.tsx`**
  - `data: { query: q }`.
  - Remove `engine="gemini"` from `<VoiceFoodDialog>`.
  - Replace `cameraProvider` state with `const [cameraOpen, setCameraOpen] = useState(false)`. The Photo tile calls `setCameraOpen(true)`. The dialog renders when `cameraOpen`, with `onOpenChange={(o) => !o && setCameraOpen(false)}` and no `provider` or `key`.

- [ ] **Step 5: Typecheck, lint and tests**

Run: `npx tsc --noEmit -p . ; npx eslint src/lib/ai.ts src/server src/components/PhotoFoodDialog.tsx src/components/VoiceFoodDialog.tsx src/components/FoodSearch.tsx ; node src/server/aiChain.test.ts ; node src/lib/foodCache.test.ts`
Expected: clean except pre-existing warnings, and both scripts pass.

- [ ] **Step 6: Commit Tasks 3 and 4 together**

```bash
git add src/server/aiRoutes.ts src/lib/ai.ts src/components/PhotoFoodDialog.tsx src/components/VoiceFoodDialog.tsx src/components/FoodSearch.tsx
git commit -m "feat(ai): search, photo and voice fall back across models; cache only primary answers"
```

---

### Task 5: What the user sees: busy toast and photo loading stages

**Files:**
- Create: `src/lib/aiErrors.ts`
- Modify: `src/components/FoodSearch.tsx:411-413` (the silent `catch`)
- Modify: `src/components/PhotoFoodDialog.tsx`: the `capture` catch, and the overlay at `:264-269`
- Modify: `src/components/VoiceFoodDialog.tsx`: the `parse` catch at `:310-311`

**Interfaces:**
- Produces:
  - `isAiBusy(e: unknown): boolean`
  - `toastAiError(e: unknown, prefix: string): void`

- [ ] **Step 1: `src/lib/aiErrors.ts`**

```ts
import { toast } from "sonner";

// Must match AI_BUSY in src/server/aiChain.ts — that file is server-only and
// cannot be imported here.
const AI_BUSY = "AI_BUSY";

export const isAiBusy = (e: unknown) =>
  e instanceof Error && e.message.includes(AI_BUSY);

/** The friendly copy for capacity failures; the real message for anything else. */
export function toastAiError(e: unknown, prefix: string) {
  if (isAiBusy(e))
    toast.error("AI is extra busy right now", {
      description: "High demand is slowing us down. Please try again in a few seconds!",
    });
  else toast.error(`${prefix}: ${e instanceof Error ? e.message : String(e)}`);
}
```

- [ ] **Step 2: Call sites**
  - FoodSearch's `handleAiFallback` catch: keep `console.error` and add `toastAiError(e, "AI search failed")`. This ends the silent failure.
  - PhotoFoodDialog's `capture` catch becomes `toastAiError(e, "Could not identify food")`.
  - VoiceFoodDialog's `parse` catch becomes `toastAiError(e, "Parsing failed")`.

- [ ] **Step 3: Photo stages** in `PhotoFoodDialog.tsx`

```tsx
// After 2 s a bare spinner reads as frozen; cycle what the AI is doing instead.
const PHOTO_STAGES = [
  "Analyzing image details…",
  "Identifying ingredients…",
  "Calculating estimated nutrition…",
  "Almost done…",
];
// inside the component:
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!analyzing) return setElapsed(0);
    const started = Date.now();
    const iv = setInterval(() => setElapsed(Date.now() - started), 500);
    return () => clearInterval(iv);
  }, [analyzing]);
  const analyzingLabel =
    elapsed < 2000
      ? "Analysing food…"
      : PHOTO_STAGES[Math.min(PHOTO_STAGES.length - 1, Math.floor((elapsed - 2000) / 3000))];
```

  The overlay `<p>` renders `{analyzingLabel}`. From 2 s onward, add a second line: `<p className="text-xs text-white/70">Photos can take a few seconds — hang tight!</p>`.

- [ ] **Step 4: Typecheck, then commit**

```bash
git add src/lib/aiErrors.ts src/components/FoodSearch.tsx src/components/PhotoFoodDialog.tsx src/components/VoiceFoodDialog.tsx
git commit -m "feat(ai): friendly busy message and staged photo loading copy"
```

---

### Task 6: Live verification

**Files:**
- Modify: `docs/plans/task.md` (add this work with a done note)

- [ ] **Step 1: Happy path.** Start `dombelz-dev` and sign in as the user. On /food:
  - Search "paneer bhurji" with Search AI and get a result.
  - The server logs have no `[ai-chain]` fallback line, and `ai_unverified` gains a row with `model = gemini-3.7-flash`.
  - Take a photo and expect a result.
  - Parse a voice sentence and expect items.
- [ ] **Step 2: Forced fallback.** Temporarily set `SEARCH_MODEL` to `"gemini-0-nonexistent"`, which returns 404, a "bad" failure.
  - Search a new food. `[ai-chain] food-search answered by fallback gemini-3.5-flash-lite` appears, and **no** new `ai_unverified` row is written for that query.
  - Revert the model name.
- [ ] **Step 3: Forced busy.**
  - Temporarily make `generate()` throw `new AiHttpError(503, "gemini", null, "test")`, and set `GROQ_API_KEY_*` unset in `.env.local` for the run, or make `groqFetch` throw the same.
  - Search. Within about 8 s the "AI is extra busy right now" toast shows.
  - Take a photo. The stage messages cycle after 2 s, then the busy toast shows.
  - Revert both.
- [ ] **Step 4: meal-builder.** Take a photo and parse voice on /meal-builder. The dev network tab shows calls to `serverFoodVision` and `serverVoiceParse`, not the removed Groq functions.
- [ ] **Step 5:** Update `docs/plans/task.md`, then commit.

```bash
git add docs/plans/task.md docs/plans/2026-09-24-ai-resilience.md
git commit -m "docs: record AI resilience work"
```

---

## Not in this plan (suggestions for the user to decide)

- **Function region.** Vercel runs functions in `iad1` (Virginia) while Supabase is in `ap-south-1` (Mumbai). Every search does an auth check, a cache lookup and a cache write, and each crosses the globe (roughly 200+ ms each). Moving functions to `bom1` is a one-line Vercel project setting and likely the single biggest latency win. It is a settings change on the live project, so it needs the user's go-ahead.
- **Paid Gemini tier at launch.** The free tier's per-minute quota is the real peak-load ceiling. The chain softens it but cannot remove it.
- **`checkRateLimit`** is an in-memory map per instance. Replace it with a shared store only if abuse shows up.
- **Search spinner copy after 2 s**, like the photo's, if searches feel slow at peak.
