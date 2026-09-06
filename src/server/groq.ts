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

import { sendAlert } from "./telegram";

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

/**
 * The configured keys, in order.
 *
 * Exported for the ops agent, which uses the Groq SDK through LangChain and so
 * cannot share groqFetch's rotation — but must not hardcode key 1 either, since
 * that is exactly what left it dead in the water when key 1 was revoked.
 */
export function groqKeys(): readonly string[] {
  return KEYS;
}

// Track which keys are currently rate-limited and when they reset
const rateLimitedUntil: Record<number, number> = {};

function getAvailableKey(): {
  key: string;
  index: number;
  /** True when every key is inside its cooldown — the capacity ceiling. */
  allLimited: boolean;
  /** Seconds until the soonest key frees up. Only meaningful when allLimited. */
  resetsInSeconds: number;
} | null {
  const now = Date.now();
  for (let i = 0; i < KEYS.length; i++) {
    const resetAt = rateLimitedUntil[i] ?? 0;
    if (now >= resetAt)
      return { key: KEYS[i], index: i, allLimited: false, resetsInSeconds: 0 };
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
  const resetsInSeconds = Math.ceil((soonestReset - now) / 1000);
  console.warn(
    `[groq] All ${KEYS.length} keys rate-limited. Using key ${soonest + 1}, resets in ${resetsInSeconds}s`,
  );
  return {
    key: KEYS[soonest],
    index: soonest,
    allLimited: true,
    resetsInSeconds,
  };
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

    // Every key inside its cooldown means the daily or per-minute quota is the
    // thing now limiting how many users the app can serve — not a bug, but the
    // ceiling being reached, and the signal that the Groq tier needs raising.
    if (available.allLimited) {
      await sendAlert({
        severity: "warning",
        title: "All Groq keys rate-limited",
        detail: {
          keys: KEYS.length,
          "resets in": `${available.resetsInSeconds}s`,
          endpoint: opts.endpoint,
        },
        throttleKey: "groq-all-limited",
      });
    }

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

    // A revoked, expired or mistyped key. Previously this fell through to the
    // caller, which threw — so one dead key took down every AI feature in the
    // app even while the other keys were healthy, because key 1 is always tried
    // first. Rotate past it like any other unusable key.
    //
    // Cooled for an hour rather than permanently: a 401 can also mean a
    // transient auth outage at Groq, and a process that never retries would
    // stay degraded until the next deploy.
    if (res.status === 401 || res.status === 403) {
      markRateLimited(index, 3600);
      await sendAlert({
        severity: "critical",
        title: "Groq key rejected",
        detail: {
          key: `GROQ_API_KEY_${index + 1}`,
          status: res.status,
          remaining: KEYS.length - 1,
        },
        throttleKey: `groq-key-rejected:${index}`,
      });
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

  // Past warning: users are now seeing AI features fail outright.
  await sendAlert({
    severity: "critical",
    title: "Groq keys exhausted — AI features failing",
    detail: { keys: KEYS.length, endpoint: opts.endpoint },
    throttleKey: "groq-exhausted",
  });
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
