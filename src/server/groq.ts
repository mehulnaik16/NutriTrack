/**
 * Server-only Groq API client with automatic key rotation.
 *
 * This file lives under src/server/ and is blocked from client bundles
 * by the TanStack Start importProtection in vite.config.ts.
 *
 * HOW TO ADD MORE KEYS:
 * In your .env file, add more numbered keys:
 *   GROQ_API_KEY_1=gsk_...
 *   GROQ_API_KEY_2=gsk_...
 *   GROQ_API_KEY_3=gsk_...
 *
 * The client picks up however many keys are defined and rotates
 * through them automatically on rate limit (429) or server errors (5xx).
 */

const GROQ_BASE = "https://api.groq.com/openai/v1";

// ── Load all keys from server-side env ────────────────────────────────────────
// Scans GROQ_API_KEY_1 through GROQ_API_KEY_20.
// Any slot that's empty or undefined is skipped.
function loadKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 20; i++) {
    const key = process.env[`GROQ_API_KEY_${i}`];
    if (key && key.trim().length > 0) keys.push(key.trim());
  }
  if (keys.length === 0) {
    console.warn(
      "[groq] No API keys found. Add GROQ_API_KEY_1, GROQ_API_KEY_2, … to your .env",
    );
  }
  return keys;
}

const KEYS = loadKeys();

// Track which keys are currently rate-limited and when they reset
const rateLimitedUntil: Record<number, number> = {};

function getAvailableKey(): { key: string; index: number } | null {
  const now = Date.now();
  for (let i = 0; i < KEYS.length; i++) {
    const resetAt = rateLimitedUntil[i] ?? 0;
    if (now >= resetAt) return { key: KEYS[i], index: i };
  }
  // All keys rate-limited — find the one that resets soonest
  let soonest = 0;
  let soonestReset = Infinity;
  for (let i = 0; i < KEYS.length; i++) {
    if ((rateLimitedUntil[i] ?? 0) < soonestReset) {
      soonestReset = rateLimitedUntil[i] ?? 0;
      soonest = i;
    }
  }
  console.warn(
    `[groq] All ${KEYS.length} keys rate-limited. Using key ${soonest + 1}, resets in ${Math.ceil((soonestReset - now) / 1000)}s`,
  );
  return { key: KEYS[soonest], index: soonest };
}

function markRateLimited(index: number, retryAfterSeconds = 60) {
  rateLimitedUntil[index] = Date.now() + retryAfterSeconds * 1000;
  console.warn(
    `[groq] Key ${index + 1} rate-limited for ${retryAfterSeconds}s`,
  );
}

// ── Core fetch with rotation ──────────────────────────────────────────────────
interface GroqRequestOptions {
  endpoint: string;
  body: Record<string, unknown>;
}

async function groqFetch(opts: GroqRequestOptions): Promise<Response> {
  if (KEYS.length === 0) throw new Error("No Groq API keys configured.");

  const triedKeys = new Set<number>();

  while (triedKeys.size < KEYS.length) {
    const available = getAvailableKey();
    if (!available) throw new Error("No Groq keys available.");

    const { key, index } = available;
    if (triedKeys.has(index) && triedKeys.size >= KEYS.length) break;
    triedKeys.add(index);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    };

    const res = await fetch(`${GROQ_BASE}/${opts.endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(opts.body),
    });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "60", 10);
      markRateLimited(index, retryAfter);
      continue; // try next key
    }

    if (res.status >= 500) {
      console.warn(
        `[groq] Key ${index + 1} got ${res.status}, trying next key`,
      );
      markRateLimited(index, 10); // short backoff for server errors
      continue;
    }

    return res; // success (or a 4xx that isn't 429 — let caller handle)
  }

  throw new Error(`All ${KEYS.length} Groq keys exhausted or rate-limited.`);
}

// ── Public API (server-only) ──────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface ChatOptions {
  model?: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: "json_object" };
  reasoning_effort?: "none" | "low" | "medium" | "high";
}

/** Text / vision chat completion */
export async function groqChat(opts: ChatOptions): Promise<string> {
  const res = await groqFetch({
    endpoint: "chat/completions",
    body: {
      model: opts.model ?? "openai/gpt-oss-120b",
      max_tokens: opts.max_tokens ?? 1000,
      temperature: opts.temperature ?? 0.7,
      ...(opts.response_format
        ? { response_format: opts.response_format }
        : {}),
      // gpt-oss models reason before emitting content and bill those tokens
      // against max_tokens, which truncates short prose. "low" keeps that
      // overhead near zero. Note: gpt-oss rejects "none" with a 400 — only
      // the qwen vision model accepts it, and groqVision passes it explicitly.
      reasoning_effort: opts.reasoning_effort ?? "low",
      messages: opts.messages,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Groq chat error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return data.choices[0].message.content.trim();
}

/** Vision chat — pass base64 image */
export async function groqVision(opts: {
  prompt: string;
  base64: string;
  mimeType: string;
  max_tokens?: number;
}): Promise<string> {
  return groqChat({
    model: "qwen/qwen3.6-27b",
    max_tokens: opts.max_tokens ?? 500,
    temperature: 0.2,
    reasoning_effort: "none",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: opts.prompt },
          {
            type: "image_url",
            image_url: { url: `data:${opts.mimeType};base64,${opts.base64}` },
          },
        ],
      },
    ],
  });
}
