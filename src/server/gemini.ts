/**
 * Server-only Gemini client, for the food-photo A/B against Groq and for the
 * food page's text calls.
 *
 * Lives beside groq.ts and is blocked from client bundles by the same
 * importProtection rule in vite.config.ts.
 *
 * Deliberately not routed through ops-agent.ts. That file's credential chain
 * falls through to Groq when Gemini fails, which is correct for the ops agent
 * and useless here: a Gemini food photo silently answered by Groq would ruin
 * the comparison this exists to run. One provider, no fallback, real errors.
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Hardcoded for the reason ops-agent.ts gives for pinning its own id: a stale
 * value in one deployment's env vars 404s at runtime, and changing it should
 * need a reviewable commit.
 *
 * This was asked for as gemini-2.5-flash. That id is listed by the models
 * endpoint on this key but *rejected* by generateContent — "no longer
 * available to new users" — which is exactly the split ops-agent.ts:203 warns
 * about. gemini-2.5-flash-lite fails the same way. This is the replacement
 * Google's own 404 body names, and it was verified against this key.
 */
const VISION_MODEL = "gemini-3.6-flash";

/**
 * The cheap model the food page runs: its second camera tile, its text search
 * and its voice parse. Verified against this key for both text and image
 * prompts before being wired in.
 */
const LITE_MODEL = "gemini-3.5-flash-lite";

/** Answers the "Search AI" food lookup on every screen. */
const SEARCH_MODEL = "gemini-3.7-flash";

/** What the model is called in the UI and in errors, so a comparison is labelled. */
export const GEMINI_VISION_MODEL = VISION_MODEL;
export const GEMINI_LITE_MODEL = LITE_MODEL;
export const GEMINI_SEARCH_MODEL = SEARCH_MODEL;

/**
 * Thinking budget per model, because the floor is not the same on both.
 *
 * The 3.x models reason before answering and bill it against maxOutputTokens —
 * the same trap as gpt-oss in groq.ts — and a photo the user is waiting on
 * cannot spend a 10s Vercel Hobby budget thinking. gemini-3.6-flash takes 0 for
 * that. gemini-3.5-flash-lite answers 0 with a bare 400 INVALID_ARGUMENT and
 * accepts 128, which it then leaves unspent (no thoughtsTokenCount) on the
 * short, shaped prompts this app sends. Both values were checked against the
 * live API, not inferred from the docs.
 */
const THINKING_BUDGET: Record<string, number> = {
  [VISION_MODEL]: 0,
  [LITE_MODEL]: 128,
  [SEARCH_MODEL]: 0,
};

async function generate(opts: {
  model: string;
  prompt: string;
  image?: { base64: string; mimeType: string };
  max_tokens?: number;
  temperature?: number;
}): Promise<string> {
  const key = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!key) throw new Error("GEMINI_API_KEY is not configured.");

  const parts: Record<string, unknown>[] = [{ text: opts.prompt }];
  if (opts.image)
    parts.push({
      inline_data: { mime_type: opts.image.mimeType, data: opts.image.base64 },
    });

  const res = await fetch(
    `${GEMINI_BASE}/${opts.model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: opts.temperature ?? 0.2,
          maxOutputTokens: opts.max_tokens ?? 800,
          // Ask for JSON directly rather than fishing it out of prose. Every
          // caller here wants JSON, and the caller still runs its own parse,
          // because this only constrains the shape, not the field names.
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: THINKING_BUDGET[opts.model] ?? 0 },
        },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(
      `Gemini error ${res.status} (${opts.model}): ${err.slice(0, 400)}`,
    );
  }

  const data = await res.json();

  // A blocked prompt returns 200 with no candidate at all, and a truncated one
  // returns a candidate with no text. Both would otherwise surface as
  // "Cannot read properties of undefined".
  const cand = data?.candidates?.[0];
  if (!cand) {
    const why = data?.promptFeedback?.blockReason ?? "no candidates";
    throw new Error(`Gemini returned nothing (${why}).`);
  }

  // Parts can carry a thoughtSignature alongside the text, so join the text
  // ones rather than assuming parts[0].
  const text = (cand.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim();

  if (!text)
    throw new Error(`Gemini returned no text (finish: ${cand.finishReason}).`);

  return text;
}

export async function geminiVision(opts: {
  prompt: string;
  base64: string;
  mimeType: string;
  max_tokens?: number;
  model?: string;
}): Promise<string> {
  return generate({
    model: opts.model ?? VISION_MODEL,
    prompt: opts.prompt,
    image: { base64: opts.base64, mimeType: opts.mimeType },
    max_tokens: opts.max_tokens,
  });
}

/** Text-only. Defaults to the cheap model; food search passes SEARCH_MODEL. */
export async function geminiText(opts: {
  prompt: string;
  max_tokens?: number;
  temperature?: number;
  model?: string;
}): Promise<string> {
  return generate({ ...opts, model: opts.model ?? LITE_MODEL });
}
