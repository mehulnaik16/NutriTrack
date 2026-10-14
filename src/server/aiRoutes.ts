/**
 * The model order for each AI feature, as the user set it on 2026-09-24;
 * search moved to Lite first on 2026-10-14.
 *
 * Search rotates by attempt: each tap of "Search AI" after a failure is the
 * next attempt, with a fresh 15 s. Only the Flash models' answers enter the
 * shared cache (CACHEABLE_SEARCH_MODELS), never Lite's and never Groq's.
 *
 * Photo rotates the same way, on Proceed: 1) Lite, 3.6, 3.7, each with ~5 s
 * and an instant switch on a 503; 2) Lite, 3.6, then Groq's Qwen; then back to 1.
 *
 * Budgets: a search 15 s; photo 15 s to read the image + an 8 s lookup that
 * prices it = 23 s (the user accepted a longer photo wait: people expect
 * images to take a while, and it gives a slow Gemini time before Groq);
 * voice 7 s to parse + 8 s lookups for its items.
 *
 * Every chain runs through runChainWithRetry, not runChain directly: if every
 * model in the order comes back busy but the budget above still has room,
 * it tries the same order again after a short beat rather than giving up the
 * moment the first pass is exhausted (see aiChain.ts).
 */
import { runChainWithRetry, type Step } from "./aiChain";
import {
  geminiText,
  geminiVision,
  GEMINI_LITE_MODEL as LITE,
  GEMINI_SEARCH_MODEL as FLASH_37,
  GEMINI_VISION_MODEL as FLASH_36,
} from "./gemini";
import { groqChat, groqVision } from "./groq";

export const SEARCH_BUDGET_MS = 15_000;
/** The lookup inside a photo (23 s total) or voice (15 s) log. */
export const LOOKUP_BUDGET_MS = 8000;
const VISION_BUDGET_MS = 15_000;
const VOICE_BUDGET_MS = 7000;
// ponytail: guessed per-attempt cap; tune from the [ai-chain] logs once real traffic exists.
const ATTEMPT_MS = 4000;
/** Three photo models share 15 s: ~5 s each, so every one gets a turn. */
const VISION_ATTEMPT_MS = 5000;

const GROQ_TEXT = "openai/gpt-oss-120b";
const GROQ_VISION = "qwen/qwen3.8-27b";

/** Only these models' search answers are written to the shared cache. */
export const CACHEABLE_SEARCH_MODELS: readonly string[] = [FLASH_37, FLASH_36];

/** Which attempt a search is: 1, 2 or 3, after which the client wraps to 1. */
export type SearchAttempt = 1 | 2 | 3;

const geminiTextStep = (
  model: string,
  prompt: string,
  max_tokens: number,
  temperature: number,
  retry = false,
): Step => ({
  provider: "gemini",
  model,
  retry,
  run: (signal) =>
    geminiText({ model, prompt, max_tokens, temperature, signal }),
});

export function searchChain(
  system: string,
  user: string,
  max_tokens: number,
  budgetMs: number,
  attempt: SearchAttempt,
) {
  // generateContent has no system role, so Gemini gets one string in the same
  // order: reference data before the untrusted query.
  const prompt = [system, user].join("\n\n");
  // Every Gemini step is marked retry: a new attempt is a new tap, and the
  // busy cooldown a previous attempt left is no reason to skip a model the
  // user's order names. A 429's cooldown is still honoured.
  const g = (model: string) =>
    geminiTextStep(model, prompt, max_tokens, 0.1, true);
  const groq: Step = {
    provider: "groq",
    model: GROQ_TEXT,
    run: (signal) =>
      groqChat({
        model: GROQ_TEXT,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens,
        temperature: 0.1,
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        signal,
      }),
  };
  const orders: Record<SearchAttempt, Step[]> = {
    // Lite first (2026-10-14): ~55% cheaper and 1.1-1.6 s, where 3.7 timed
    // out at 4 s on 11 of 20 test searches. Flash stays as the fallback.
    1: [g(LITE), g(FLASH_36), g(FLASH_37)],
    2: [g(LITE), g(FLASH_36), groq],
    3: [g(LITE), g(FLASH_37), g(FLASH_36), groq],
  };
  return runChainWithRetry(orders[attempt], {
    budgetMs,
    attemptMs: ATTEMPT_MS,
    label: `food-search#${attempt}`,
  });
}

/** Which attempt a photo is: 1 or 2, after which the client wraps to 1. */
export type PhotoAttempt = 1 | 2;

export function visionChain(
  prompt: string,
  base64: string,
  mimeType: string,
  attempt: PhotoAttempt,
  /** Already-labelled user note, sent after the photo. */
  after?: string,
) {
  // retry: a new Proceed is a new attempt, so an earlier attempt's busy
  // cooldown does not skip a model the user's order names.
  const g = (model: string): Step => ({
    provider: "gemini",
    model,
    retry: true,
    run: (signal) =>
      geminiVision({ model, prompt, base64, mimeType, after, signal }),
  });
  const qwen: Step = {
    provider: "groq",
    model: GROQ_VISION,
    run: (signal) => groqVision({ prompt, base64, mimeType, after, signal }),
  };
  const orders: Record<PhotoAttempt, Step[]> = {
    1: [g(LITE), g(FLASH_36), g(FLASH_37)],
    // Lite first on the retry too (2026-10-14), 3.6 behind it.
    2: [g(LITE), g(FLASH_36), qwen],
  };
  return runChainWithRetry(orders[attempt], {
    budgetMs: VISION_BUDGET_MS,
    attemptMs: VISION_ATTEMPT_MS,
    label: `food-photo#${attempt}`,
  });
}

// ~50 tokens per parsed food: 400 truncated a full day's meal (~14 foods)
// mid-JSON. 1500 fits a 30 s recording's worth.
const VOICE_MAX_TOKENS = 1500;

/**
 * Voice by audio: the clip goes straight to Gemini, which returns the words
 * and the foods together. Lite first (cheapest; audio in costs the same as
 * text), 3.6 Flash when it is busy. 1000 tokens out: a measured 45 s
 * whole-day clip with 21 foods used 399 in the compact format.
 */
export function voiceAudioChain(
  prompt: string,
  /** Absent on a Power Log Re-parse: the words are already in the prompt. */
  audio?: { base64: string; mimeType: string },
) {
  const g = (model: string): Step => ({
    provider: "gemini",
    model,
    run: (signal) =>
      audio
        ? geminiVision({ model, prompt, ...audio, max_tokens: 1000, signal })
        : geminiText({ model, prompt, max_tokens: 1000, signal }),
  });
  return runChainWithRetry([g(LITE), g(FLASH_36)], {
    budgetMs: VISION_BUDGET_MS,
    attemptMs: 9000,
    label: "voice-audio",
  });
}

export function voiceChain(prompt: string) {
  return runChainWithRetry(
    [
      geminiTextStep(FLASH_37, prompt, VOICE_MAX_TOKENS, 0.1),
      geminiTextStep(FLASH_37, prompt, VOICE_MAX_TOKENS, 0.1, true),
      geminiTextStep(LITE, prompt, VOICE_MAX_TOKENS, 0.1),
      {
        provider: "groq",
        model: GROQ_TEXT,
        run: (signal) =>
          groqChat({
            model: GROQ_TEXT,
            messages: [{ role: "user", content: prompt }],
            max_tokens: VOICE_MAX_TOKENS,
            temperature: 0.1,
            reasoning_effort: "low",
            signal,
          }),
      },
      geminiTextStep(FLASH_36, prompt, VOICE_MAX_TOKENS, 0.1),
    ],
    {
      budgetMs: VOICE_BUDGET_MS,
      attemptMs: ATTEMPT_MS,
      label: "voice-parse",
      groqJump: true,
    },
  );
}
