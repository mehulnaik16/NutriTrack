/**
 * One model for every AI feature, as the user set it on 2026-10-15: one call
 * to gemini-3.5-flash-lite on Vertex AI, with the whole budget, no fallback,
 * no rotation and no retry.
 *
 * Budgets: a search 15 s; photo 15 s to read the image + an 8 s lookup that
 * prices it = 23 s; voice 7 s to parse + 8 s lookups for its items.
 */
import { runOnce, type Step } from "./aiChain";
import { geminiText, geminiVision, GEMINI_LITE_MODEL as LITE } from "./gemini";

export const SEARCH_BUDGET_MS = 15_000;
/** The lookup inside a photo (23 s total) or voice (15 s) log. */
export const LOOKUP_BUDGET_MS = 8000;
const VISION_BUDGET_MS = 15_000;
const VOICE_BUDGET_MS = 7000;

/**
 * Search answers written to the shared cache. Lite is the only model now, so
 * its answers are the cache's truth (they were served uncached while the
 * Flash models existed).
 */
export const CACHEABLE_SEARCH_MODELS: readonly string[] = [LITE];

const lite = (run: Step["run"]): Step => ({
  provider: "gemini",
  model: LITE,
  run,
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
  return runOnce(
    lite((signal) =>
      geminiText({ prompt, max_tokens, temperature: 0.1, signal }),
    ),
    { budgetMs, label: "food-search" },
  );
}

export function visionChain(
  prompt: string,
  base64: string,
  mimeType: string,
  /** Already-labelled user note, sent after the photo. */
  after?: string,
) {
  return runOnce(
    lite((signal) =>
      geminiVision({ model: LITE, prompt, base64, mimeType, after, signal }),
    ),
    { budgetMs: VISION_BUDGET_MS, label: "food-photo" },
  );
}

// ~50 tokens per parsed food: 400 truncated a full day's meal (~14 foods)
// mid-JSON. 1500 fits a 30 s recording's worth.
const VOICE_MAX_TOKENS = 1500;

/**
 * Voice by audio: the clip goes straight to Gemini, which returns the words
 * and the foods together. 1000 tokens out: a measured 45 s whole-day clip
 * with 21 foods used 399 in the compact format.
 */
export function voiceAudioChain(
  prompt: string,
  /** Absent on a Power Log Re-parse: the words are already in the prompt. */
  audio?: { base64: string; mimeType: string },
) {
  return runOnce(
    lite((signal) =>
      audio
        ? geminiVision({
            model: LITE,
            prompt,
            ...audio,
            max_tokens: 1000,
            signal,
          })
        : geminiText({ prompt, max_tokens: 1000, signal }),
    ),
    { budgetMs: VISION_BUDGET_MS, label: "voice-audio" },
  );
}

export function voiceChain(prompt: string) {
  return runOnce(
    lite((signal) =>
      geminiText({
        prompt,
        max_tokens: VOICE_MAX_TOKENS,
        temperature: 0.1,
        signal,
      }),
    ),
    { budgetMs: VOICE_BUDGET_MS, label: "voice-parse" },
  );
}
