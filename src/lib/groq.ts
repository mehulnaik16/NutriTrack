/**
 * groq.ts — Groq API client with automatic key rotation
 *
 * HOW TO ADD MORE KEYS:
 * In your .env file, just add more numbered keys:
 *   VITE_GROQ_KEY_1=gsk_...
 *   VITE_GROQ_KEY_2=gsk_...
 *   VITE_GROQ_KEY_3=gsk_...
 *   VITE_GROQ_KEY_4=gsk_...   ← just add this when you get a new one
 *   VITE_GROQ_KEY_5=gsk_...   ← and this, no code changes needed
 *
 * The client picks up however many keys are defined and rotates
 * through them automatically on rate limit (429) or server errors (5xx).
 */

const GROQ_BASE = "https://api.groq.com/openai/v1";

// ── Load all keys from env ────────────────────────────────────────────────────
// Scans VITE_GROQ_KEY_1 through VITE_GROQ_KEY_20.
// Any slot that's empty or undefined is skipped.
// Add more by just adding VITE_GROQ_KEY_N to your .env — no code change needed.
function loadKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 20; i++) {
    const key = (import.meta.env as Record<string, string>)[`VITE_GROQ_KEY_${i}`];
    if (key && key.trim().length > 0) keys.push(key.trim());
  }
  if (keys.length === 0) {
    console.warn("[groq] No API keys found. Add VITE_GROQ_KEY_1, VITE_GROQ_KEY_2, … to your .env");
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
  console.warn(`[groq] All ${KEYS.length} keys rate-limited. Using key ${soonest + 1}, resets in ${Math.ceil((soonestReset - now) / 1000)}s`);
  return { key: KEYS[soonest], index: soonest };
}

function markRateLimited(index: number, retryAfterSeconds = 60) {
  rateLimitedUntil[index] = Date.now() + retryAfterSeconds * 1000;
  console.warn(`[groq] Key ${index + 1} rate-limited for ${retryAfterSeconds}s`);
}

// ── Core fetch with rotation ──────────────────────────────────────────────────
interface GroqRequestOptions {
  endpoint: string;
  body: Record<string, unknown>;
  isFormData?: false;
}
interface GroqFormRequestOptions {
  endpoint: string;
  formData: FormData;
  isFormData: true;
}

async function groqFetch(opts: GroqRequestOptions | GroqFormRequestOptions): Promise<Response> {
  if (KEYS.length === 0) throw new Error("No Groq API keys configured.");

  const triedKeys = new Set<number>();

  while (triedKeys.size < KEYS.length) {
    const available = getAvailableKey();
    if (!available) throw new Error("No Groq keys available.");

    const { key, index } = available;
    if (triedKeys.has(index) && triedKeys.size >= KEYS.length) break;
    triedKeys.add(index);

    const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
    let fetchBody: BodyInit;

    if (opts.isFormData) {
      fetchBody = opts.formData;
    } else {
      headers["Content-Type"] = "application/json";
      fetchBody = JSON.stringify(opts.body);
    }

    const res = await fetch(`${GROQ_BASE}/${opts.endpoint}`, {
      method: "POST",
      headers,
      body: fetchBody,
    });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "60", 10);
      markRateLimited(index, retryAfter);
      continue; // try next key
    }

    if (res.status >= 500) {
      console.warn(`[groq] Key ${index + 1} got ${res.status}, trying next key`);
      markRateLimited(index, 10); // short backoff for server errors
      continue;
    }

    return res; // success (or a 4xx that isn't 429 — let caller handle)
  }

  throw new Error(`All ${KEYS.length} Groq keys exhausted or rate-limited.`);
}

// ── Public API ────────────────────────────────────────────────────────────────

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
}

/** Text / vision chat completion */
export async function groqChat(opts: ChatOptions): Promise<string> {
  const res = await groqFetch({
    endpoint: "chat/completions",
    body: {
      model: opts.model ?? "llama-3.3-70b-versatile",
      max_tokens: opts.max_tokens ?? 1000,
      temperature: opts.temperature ?? 0.7,
      ...(opts.response_format ? { response_format: opts.response_format } : {}),
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
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    max_tokens: opts.max_tokens ?? 500,
    temperature: 0.2,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: opts.prompt },
        { type: "image_url", image_url: { url: `data:${opts.mimeType};base64,${opts.base64}` } },
      ],
    }],
  });
}

/** Speech to text via Whisper */
export async function groqTranscribe(audioBlob: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", audioBlob, "audio.webm");
  form.append("model", "whisper-large-v3-turbo");
  form.append("response_format", "text");
  form.append("language", "en");

  const res = await groqFetch({ endpoint: "audio/transcriptions", formData: form, isFormData: true });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq Whisper error ${res.status}: ${err}`);
  }

  return res.text();
}

/** Returns how many keys are loaded and their rate-limit status — useful for debugging */
export function groqStatus(): { total: number; available: number; keys: { index: number; available: boolean; resetsIn?: number }[] } {
  const now = Date.now();
  const keys = KEYS.map((_, i) => {
    const resetAt = rateLimitedUntil[i] ?? 0;
    const available = now >= resetAt;
    return { index: i + 1, available, ...(available ? {} : { resetsIn: Math.ceil((resetAt - now) / 1000) }) };
  });
  return { total: KEYS.length, available: keys.filter((k) => k.available).length, keys };
}
