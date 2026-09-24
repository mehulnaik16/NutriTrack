/**
 * The model order for each AI feature, as the user set it on 2026-09-24. The
 * first step is the primary: only its search answers enter the shared cache
 * (see runFoodSearch). Groq sits late in every chain as the last resort, and
 * after it the chain goes back to Gemini once more on a model it has not
 * tried yet.
 *
 * Budgets: search 8 s total; photo 7 s to read the image + the 8 s search that
 * prices it = 15 s; voice 7 s to parse + the searches that price its items.
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
// ponytail: guessed per-attempt cap; tune from the [ai-chain] logs once real traffic exists.
const ATTEMPT_MS = 4000;

const GROQ_TEXT = "openai/gpt-oss-120b";
const GROQ_VISION = "qwen/qwen3.8-27b";

const geminiTextStep = (
  model: string,
  prompt: string,
  max_tokens: number,
  temperature: number,
): Step => ({
  provider: "gemini",
  model,
  run: (signal) =>
    geminiText({ model, prompt, max_tokens, temperature, signal }),
});

export function searchChain(
  system: string,
  user: string,
  max_tokens: number,
  budgetMs: number,
) {
  // generateContent has no system role, so Gemini gets one string in the same
  // order: reference data before the untrusted query.
  const prompt = [system, user].join("\n\n");
  return runChain(
    [
      geminiTextStep(FLASH_37, prompt, max_tokens, 0.1),
      geminiTextStep(LITE, prompt, max_tokens, 0.1),
      {
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
      },
      geminiTextStep(FLASH_36, prompt, max_tokens, 0.1),
    ],
    { budgetMs, attemptMs: ATTEMPT_MS, label: "food-search" },
  );
}

export function visionChain(prompt: string, base64: string, mimeType: string) {
  const g = (model: string): Step => ({
    provider: "gemini",
    model,
    run: (signal) => geminiVision({ model, prompt, base64, mimeType, signal }),
  });
  return runChain(
    [
      g(LITE),
      g(FLASH_37),
      g(FLASH_36),
      {
        provider: "groq",
        model: GROQ_VISION,
        run: (signal) => groqVision({ prompt, base64, mimeType, signal }),
      },
    ],
    { budgetMs: VISION_BUDGET_MS, attemptMs: ATTEMPT_MS, label: "food-photo" },
  );
}

export function voiceChain(prompt: string) {
  return runChain(
    [
      geminiTextStep(FLASH_37, prompt, 400, 0.1),
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
    { budgetMs: VOICE_BUDGET_MS, attemptMs: ATTEMPT_MS, label: "voice-parse" },
  );
}
