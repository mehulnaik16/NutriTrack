/**
 * Server-only Gemini client, on Google Cloud Vertex AI only, for every AI
 * call in the app.
 *
 * Blocked from client bundles by the importProtection rule in vite.config.ts.
 * Reports each failure as an AiHttpError so aiChain.ts can tell a 503 from a
 * 429 from a dead key.
 */

import { GoogleAuth } from "google-auth-library";
import { AiHttpError } from "./aiChain";
import { sendAlert } from "./telegram";

/**
 * Vertex AI instead of AI Studio when GOOGLE_VERTEX_PROJECT is set. Auth comes
 * from Application Default Credentials: the gcloud login file locally.
 * shortcut: no Vercel OIDC client yet, so Vertex only works where ADC exists
 * (local dev); add the Workload Identity ExternalAccountClient before setting
 * GOOGLE_VERTEX_PROJECT on Vercel.
 */
const VERTEX_PROJECT = (process.env.GOOGLE_VERTEX_PROJECT ?? "").trim();
const VERTEX_LOCATION =
  (process.env.GOOGLE_VERTEX_LOCATION ?? "").trim() || "global";
const vertexAuth = VERTEX_PROJECT
  ? new GoogleAuth({ scopes: "https://www.googleapis.com/auth/cloud-platform" })
  : null;

/** URL and auth header for one call. Vertex only: there is no AI Studio path. */
async function endpoint(
  model: string,
): Promise<{ url: string; headers: Record<string, string> }> {
  // Vertex API key (express mode): works on Vercel with no login setup.
  // Key-mode URLs carry no project or region; the key is tied to the project.
  // GEMINI_API_KEY is read too because the deployed key (AQ. prefix) is a
  // Vertex key stored under that name.
  const vertexKey = (
    process.env.GOOGLE_VERTEX_API_KEY ||
    process.env.GEMINI_API_KEY ||
    ""
  ).trim();
  if (vertexKey)
    return {
      url: `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent`,
      headers: { "x-goog-api-key": vertexKey },
    };
  if (vertexAuth) {
    // The global endpoint has no region prefix on its host.
    const host =
      VERTEX_LOCATION === "global"
        ? "aiplatform.googleapis.com"
        : `${VERTEX_LOCATION}-aiplatform.googleapis.com`;
    let token: string | null | undefined;
    try {
      token = await vertexAuth.getAccessToken();
    } catch (e) {
      // No ADC on this machine: report it like a dead key.
      throw new AiHttpError(401, "gemini", null, `Vertex auth failed: ${e}`);
    }
    return {
      url: `https://${host}/v1/projects/${VERTEX_PROJECT}/locations/${VERTEX_LOCATION}/publishers/google/models/${model}:generateContent`,
      headers: { Authorization: `Bearer ${token}` },
    };
  }
  throw new AiHttpError(
    401,
    "gemini",
    null,
    "No Vertex credentials: set GOOGLE_VERTEX_API_KEY or GOOGLE_VERTEX_PROJECT.",
  );
}

/**
 * The one model every AI feature runs (user's rule, 2026-10-15). Hardcoded,
 * not read from the environment: a stale value in one deployment's env vars
 * 404s at runtime, and changing it should need a reviewable commit.
 */
const LITE_MODEL = "gemini-3.5-flash-lite";
export const GEMINI_LITE_MODEL = LITE_MODEL;

/**
 * Lite answers a thinking budget of 0 with a bare 400 INVALID_ARGUMENT and
 * accepts 128, which it leaves unspent on the short, shaped prompts this app
 * sends. Checked against the live API.
 */
const THINKING_BUDGET = 128;

async function generate(opts: {
  model: string;
  prompt: string;
  image?: { base64: string; mimeType: string };
  /** Text sent after the image: variable input goes last. */
  after?: string;
  max_tokens?: number;
  temperature?: number;
  /** False for prose (weekly check-in, motivation); every other caller wants JSON. */
  json?: boolean;
  signal?: AbortSignal;
}): Promise<string> {
  const { url, headers } = await endpoint(opts.model);

  const parts: Record<string, unknown>[] = [{ text: opts.prompt }];
  if (opts.image)
    parts.push({
      inline_data: { mime_type: opts.image.mimeType, data: opts.image.base64 },
    });
  if (opts.after) parts.push({ text: opts.after });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    signal: opts.signal,
    body: JSON.stringify({
      // Vertex rejects contents without a role.
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: opts.temperature ?? 0.2,
        maxOutputTokens: opts.max_tokens ?? 800,
        // Ask for JSON directly rather than fishing it out of prose. The
        // caller still runs its own parse, because this only constrains
        // the shape, not the field names.
        ...(opts.json === false
          ? {}
          : { responseMimeType: "application/json" }),
        thinkingConfig: { thinkingBudget: THINKING_BUDGET },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403 || /API_KEY_INVALID/.test(err))
      await sendAlert({
        severity: "critical",
        title: "Gemini key rejected",
        detail: { status: res.status, model: opts.model },
        throttleKey: "gemini-key-rejected",
      });
    // Google names the broken quota in QuotaFailure.violations[].quotaId —
    // "GenerateRequestsPerDayPerProjectPerModel-…" for the daily one — and
    // how long to wait in RetryInfo.retryDelay ("37s").
    const delay = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(err)?.[1];
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
  after?: string;
  max_tokens?: number;
  model?: string;
  signal?: AbortSignal;
}): Promise<string> {
  return generate({
    model: opts.model ?? LITE_MODEL,
    prompt: opts.prompt,
    image: { base64: opts.base64, mimeType: opts.mimeType },
    after: opts.after,
    max_tokens: opts.max_tokens,
    signal: opts.signal,
  });
}

/** Text-only, on the Lite model unless told otherwise. */
export async function geminiText(opts: {
  prompt: string;
  max_tokens?: number;
  temperature?: number;
  json?: boolean;
  model?: string;
  signal?: AbortSignal;
}): Promise<string> {
  return generate({ ...opts, model: opts.model ?? LITE_MODEL });
}
