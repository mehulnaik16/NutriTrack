/**
 * Server-only Gemini vision client, for the food-photo A/B against Groq.
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

/** What the model is called in the UI and in errors, so a comparison is labelled. */
export const GEMINI_VISION_MODEL = VISION_MODEL;

export async function geminiVision(opts: {
  prompt: string;
  base64: string;
  mimeType: string;
  max_tokens?: number;
}): Promise<string> {
  const key = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!key) throw new Error("GEMINI_API_KEY is not configured.");

  const res = await fetch(
    `${GEMINI_BASE}/${VISION_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: opts.prompt },
              {
                inline_data: { mime_type: opts.mimeType, data: opts.base64 },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: opts.max_tokens ?? 800,
          // Ask for JSON directly rather than fishing it out of prose. The
          // caller still runs its brace-matching parse, because this only
          // constrains the shape, not the field names.
          responseMimeType: "application/json",
          // The 3.x models reason before answering and bill it against
          // maxOutputTokens — same trap as gpt-oss in groq.ts. Off entirely:
          // Vercel functions time out at 10s on Hobby, and a photo the user is
          // waiting on cannot spend that budget thinking.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Gemini vision error ${res.status}: ${err.slice(0, 400)}`);
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
