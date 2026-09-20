/**
 * Server functions for all AI/Groq operations.
 *
 * Every Groq API call goes through a createServerFn here.
 * Client code calls these functions via TanStack Start's RPC mechanism —
 * the browser never sees the Groq API key or contacts api.groq.com directly.
 *
 * The server/groq module is dynamically imported inside each handler
 * so TanStack Start's import protection keeps it out of the client bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAccess } from "@/lib/access-middleware";
import {
  sanitizeFoodQuery,
  validateFoodResponse,
  maxTokensFor,
  FOOD_SEARCH_SYSTEM,
  type AiFoodResult,
} from "@/lib/foodAiSchema";

// ── Rate Limiter (30 requests/min per user, in-memory) ───────────────────────
// Resets per Vercel serverless instance lifecycle — free, zero deps, stops
// script abuse cold. A real user never hits 30 AI calls in 60 seconds.

const rateLimits = new Map<string, { count: number; expiresAt: number }>();

export function checkRateLimit(userId: string) {
  const now = Date.now();
  const record = rateLimits.get(userId);

  if (!record || now > record.expiresAt) {
    rateLimits.set(userId, { count: 1, expiresAt: now + 60_000 });
    return;
  }

  if (record.count >= 30) {
    throw new Error(
      "Rate limit exceeded. Please wait a minute before trying again.",
    );
  }

  record.count++;
}

/**
 * One implementation, two endpoints.
 *
 * `serverAiFoodSearch` and `serverAiFoodSearchInline` were byte-identical, so
 * every fix had to be made twice or silently reached only one caller.
 */
async function runFoodSearch(
  rawQuery: string,
  engine: FoodSearchEngine = "groq",
): Promise<AiFoodResult> {
  const cleanQuery = sanitizeFoodQuery(rawQuery);
  if (cleanQuery.length < 2) return { kind: "single", items: [] };

  // Imported inside the handler, beside groq, so the catalog is not pulled into
  // this module's static graph — foodDb imports nothing from here any more, and
  // this keeps it that way.
  const { referenceFoods, isComposite } = await import("@/lib/foodFuzzy");
  const { PIECE_G } = await import("@/lib/foodUnits");

  // Pipe-delimited rather than JSON: five rows of JSON is ~400 tokens of
  // punctuation, and the model is being told to copy numbers, not parse shapes.
  // `fibtg` is an empty string on 95 restaurant rows, hence the coercion.
  const refs = referenceFoods(cleanQuery, 5).map((it) =>
    [
      it.name,
      it.lang ? it.lang.slice(0, 300) : null,
      `E ${Math.round(Number(it.enerc) || 0)}`,
      `P ${Number(it.protcnt) || 0}`,
      `F ${Number(it.fatce) || 0}`,
      `C ${Number(it.choavldf) || 0}`,
      `Fib ${Number(it.fibtg) || 0}`,
      PIECE_G[it.code] ? `1 pc = ${PIECE_G[it.code]} g` : null,
      it.serving_g ? `serving ${it.serving_g} g` : null,
    ]
      .filter(Boolean)
      .join(" | "),
  );

  // Reference first, query last: the model reads the trusted data before the
  // untrusted string, and the last thing it reads is a food name.
  const userMsg =
    (refs.length ? `<reference>\n${refs.join("\n")}\n</reference>\n` : "") +
    `<query>${cleanQuery}</query>`;

  const max_tokens = maxTokensFor(isComposite(cleanQuery));

  // Same prompt, same budget, same parse below — the engine only decides who
  // reads it. Gemini takes one string because generateContent has no system
  // role; the order is unchanged, so the model still sees the reference data
  // before the untrusted query.
  const raw =
    engine === "gemini"
      ? await (
          await import("@/server/gemini")
        ).geminiText({
          prompt: [FOOD_SEARCH_SYSTEM, userMsg].join("\n\n"),
          max_tokens,
          temperature: 0.1,
        })
      : await (
          await import("@/server/groq")
        ).groqChat({
          model: "openai/gpt-oss-120b",
          messages: [
            { role: "system", content: FOOD_SEARCH_SYSTEM },
            { role: "user", content: userMsg },
          ],
          max_tokens,
          temperature: 0.1,
          reasoning_effort: "low",
          response_format: { type: "json_object" },
        });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return { kind: "single", items: [] };
  }

  return (
    validateFoodResponse(parsed, cleanQuery) ?? { kind: "single", items: [] }
  );
}

/**
 * Which model answers a food search.
 *
 * Per-screen rather than global: the food page runs Gemini, and the dashboard's
 * copy of the same search box stays on Groq, so the two can be compared on the
 * same queries.
 */
export type FoodSearchEngine = "groq" | "gemini";

// ── AI Food Search ───────────────────────────────────────────────────────────

export const serverAiFoodSearch = createServerFn({ method: "POST" })
  .middleware([requireAccess])
  .inputValidator((d: string) => d)
  .handler(async (ctx) => {
    checkRateLimit(ctx.context.userId);
    return runFoodSearch(ctx.data);
  });

// ── AI Food Search (inline, for FoodSearch component) ────────────────────────

export const serverAiFoodSearchInline = createServerFn({ method: "POST" })
  .middleware([requireAccess])
  .inputValidator(
    z.object({
      query: z.string(),
      engine: z.enum(["groq", "gemini"]).optional(),
    }),
  )
  .handler(async (ctx) => {
    checkRateLimit(ctx.context.userId);
    return runFoodSearch(ctx.data.query, ctx.data.engine);
  });

// ── AI Chat (generic — used by WeeklyReport, weight motivation, workout plan, voice parse) ──

// Without a runtime schema this endpoint is a general-purpose LLM API billed to
// our Groq account: a TypeScript interface erases at compile time and enforces
// nothing. The allowlist and ceilings below are sized to the app's real callers.
const ALLOWED_CHAT_MODELS = ["openai/gpt-oss-120b"] as const;

const ChatInput = z.object({
  // Sized to the app's real callers — the largest is the workout-plan prompt
  // (~6k chars: a trimmed exercise catalog + profile). Bounded to keep the
  // generic endpoint from being used as an open LLM proxy.
  prompt: z.string().min(1).max(12_000),
  model: z.enum(ALLOWED_CHAT_MODELS).optional(),
  max_tokens: z.number().int().min(1).max(3000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  response_format_json: z.boolean().optional(),
});

export const serverGroqChat = createServerFn({ method: "POST" })
  .middleware([requireAccess])
  .inputValidator(ChatInput)
  .handler(async (ctx) => {
    checkRateLimit(ctx.context.userId);
    const { groqChat } = await import("@/server/groq");
    const { prompt, model, max_tokens, temperature, response_format_json } =
      ctx.data;

    const raw = await groqChat({
      model: model ?? "openai/gpt-oss-120b",
      messages: [{ role: "user", content: prompt }],
      max_tokens: max_tokens ?? 1000,
      temperature: temperature ?? 0.7,
      ...(response_format_json
        ? { response_format: { type: "json_object" as const } }
        : {}),
    });

    return { result: raw };
  });

// ── AI Chat via Gemini (the food page's half of the comparison) ──────────────

// No model field: unlike the Groq endpoint this one is pinned server-side, so
// the generic prompt box cannot be pointed at a model nobody priced. No
// response_format flag either — geminiText always asks for JSON.
export const serverGeminiChat = createServerFn({ method: "POST" })
  .middleware([requireAccess])
  .inputValidator(ChatInput.omit({ model: true, response_format_json: true }))
  .handler(async (ctx) => {
    checkRateLimit(ctx.context.userId);
    const { geminiText } = await import("@/server/gemini");
    const { prompt, max_tokens, temperature } = ctx.data;
    return { result: await geminiText({ prompt, max_tokens, temperature }) };
  });

// ── AI Vision (food photo recognition) ───────────────────────────────────────

// ~8 MB decoded — base64 inflates by 4/3, and the whole string is buffered in
// serverless memory before it is forwarded to Groq.
const MAX_IMAGE_BASE64_CHARS = 11_000_000;

const VisionInput = z.object({
  prompt: z.string().min(1).max(4000),
  base64: z
    .string()
    .min(1)
    .max(MAX_IMAGE_BASE64_CHARS)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Invalid base64 image data"),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

export const serverGroqVision = createServerFn({ method: "POST" })
  .middleware([requireAccess])
  .inputValidator(VisionInput)
  .handler(async (ctx) => {
    checkRateLimit(ctx.context.userId);
    const { groqVision } = await import("@/server/groq");
    const { prompt, base64, mimeType } = ctx.data;
    const raw = await groqVision({ prompt, base64, mimeType });
    return { result: raw };
  });

// ── AI Vision via Gemini (food-photo A/B against the Groq path) ──────────────

// Same validator, same rate limit, same shape back. The only difference from
// serverGroqVision is which model sees the image — which is the point: a
// comparison where the two paths also differ in prompt, limits or parsing
// measures the plumbing, not the models.

export const serverGeminiVision = createServerFn({ method: "POST" })
  .middleware([requireAccess])
  .inputValidator(VisionInput)
  .handler(async (ctx) => {
    checkRateLimit(ctx.context.userId);
    const { geminiVision } = await import("@/server/gemini");
    const { prompt, base64, mimeType } = ctx.data;
    const raw = await geminiVision({ prompt, base64, mimeType });
    return { result: raw };
  });

// The same path on the cheap model, so the food page's three camera tiles
// differ in exactly one thing: which model reads the photo.
export const serverGeminiLiteVision = createServerFn({ method: "POST" })
  .middleware([requireAccess])
  .inputValidator(VisionInput)
  .handler(async (ctx) => {
    checkRateLimit(ctx.context.userId);
    const { geminiVision, GEMINI_LITE_MODEL } = await import("@/server/gemini");
    const { prompt, base64, mimeType } = ctx.data;
    const raw = await geminiVision({
      prompt,
      base64,
      mimeType,
      model: GEMINI_LITE_MODEL,
    });
    return { result: raw };
  });
