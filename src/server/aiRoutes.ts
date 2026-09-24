/**
 * The model order for each AI feature, as the user set it on 2026-09-24.
 *
 * Search rotates by attempt: each tap of "Search AI" after a failure is the
 * next attempt, with a fresh 15 s. Only the Flash models' answers enter the
 * shared cache (CACHEABLE_SEARCH_MODELS), never Lite's and never Groq's.
 *
 * Budgets: a search 15 s; photo 7 s to read the image + an 8 s lookup that
 * prices it = 15 s; voice 7 s to parse + 8 s lookups for its items.
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

export const SEARCH_BUDGET_MS = 15_000;
/** The lookup inside a photo or voice log, so that whole flow stays at 15 s. */
export const LOOKUP_BUDGET_MS = 8000;
const VISION_BUDGET_MS = 7000;
const VOICE_BUDGET_MS = 7000;
// ponytail: guessed per-attempt cap; tune from the [ai-chain] logs once real traffic exists.
const ATTEMPT_MS = 4000;

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
    1: [g(FLASH_37), g(FLASH_36), g(LITE)],
    2: [g(FLASH_36), g(LITE), groq],
    3: [g(FLASH_37), g(FLASH_36), g(LITE), g(FLASH_36), groq],
  };
  return runChain(orders[attempt], {
    budgetMs,
    attemptMs: ATTEMPT_MS,
    label: `food-search#${attempt}`,
  });
}

export function visionChain(prompt: string, base64: string, mimeType: string) {
  const g = (model: string, retry = false): Step => ({
    provider: "gemini",
    model,
    retry,
    run: (signal) => geminiVision({ model, prompt, base64, mimeType, signal }),
  });
  return runChain(
    [
      g(LITE),
      g(LITE, true),
      g(FLASH_37),
      g(FLASH_36),
      {
        provider: "groq",
        model: GROQ_VISION,
        run: (signal) => groqVision({ prompt, base64, mimeType, signal }),
      },
    ],
    {
      budgetMs: VISION_BUDGET_MS,
      attemptMs: ATTEMPT_MS,
      label: "food-photo",
      groqJump: true,
    },
  );
}

export function voiceChain(prompt: string) {
  return runChain(
    [
      geminiTextStep(FLASH_37, prompt, 400, 0.1),
      geminiTextStep(FLASH_37, prompt, 400, 0.1, true),
      geminiTextStep(LITE, prompt, 400, 0.1),
      {
        provider: "groq",
        model: GROQ_TEXT,
        run: (signal) =>
          groqChat({
            model: GROQ_TEXT,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 400,
            temperature: 0.1,
            signal,
          }),
      },
      geminiTextStep(FLASH_36, prompt, 400, 0.1),
    ],
    {
      budgetMs: VOICE_BUDGET_MS,
      attemptMs: ATTEMPT_MS,
      label: "voice-parse",
      groqJump: true,
    },
  );
}
