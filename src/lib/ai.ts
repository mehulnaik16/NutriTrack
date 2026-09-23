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
  validateFoodSlots,
  extractJsonObject,
  maxTokensFor,
  FOOD_SEARCH_SYSTEM,
  type AiFoodResult,
  type AiFoodItemOut,
} from "@/lib/foodAiSchema";
import type { LoggedEdit } from "@/lib/foodCache";
import { QUANTITY_G } from "@/lib/foodUnits";

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
 * Time budgets for the two cache round-trips inside a food search.
 *
 * The whole search runs inside one Vercel Hobby function, which is killed at
 * 10 s (see the same budget in gemini.ts and ops-agent.ts). The model call
 * needs most of that. The cache exists to save money and must never be the
 * reason a search fails, so each call gets a fixed slice and, when it runs
 * over, is treated exactly like a cache that is down: a lookup becomes a miss
 * and the model is asked, a write is abandoned and the answer still returned.
 *
 * Sized from latency measured against the live project from a laptop
 * (task-11-report.md, "Fix 3"), which is if anything slower than Vercel to
 * Supabase:
 *   lookup — a miss is four sequential reads. Warm: median 207 ms. Cold, in
 *     a fresh process paying module load, DNS and TLS first: median ~500 ms
 *     over 12 runs, worst 1,384 ms. 2 s is ~1.4x the worst cold lookup seen.
 *     1.5 s was considered and rejected: it sits ~8% above that worst case,
 *     so a cold instance would regularly abandon a lookup that was about to
 *     hit and pay for a model call instead.
 *   record — a five-item meal is ten sequential round trips before any
 *     promotion. Median 474 ms, worst 523 ms over 5 runs; each promotion adds
 *     two more. 2 s is ~4x the worst seen.
 *   model — the Gemini path alone: median 1.8 s, worst 2.5 s over 8 runs.
 * Worst case, both budgets expiring: 2 + 2.5 + 2 = 6.5 s, leaving ~3.5 s of
 * the 10 s for a cold start and a slow model day.
 */
const CACHE_LOOKUP_MS = 2000;
const CACHE_RECORD_MS = 2000;

/**
 * Settle within `ms` whatever the cache does: on expiry or on any rejection,
 * log and resolve to `fallback`.
 *
 * The work itself cannot be cancelled and is left running. It only reads or
 * writes cache rows, so finishing late is harmless.
 * ponytail: an abandoned write can be frozen with the serverless instance
 * mid-group (inserted but not yet promoted, or promoted but not yet cleared).
 * recordAnswer is not transactional, so this is the same partial state a
 * crash would leave; move promotion into one SQL function if it ever matters.
 */
async function withinBudget<T>(
  what: string,
  ms: number,
  work: () => Promise<T>,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[food-cache] ${what} (budget of ${ms} ms exceeded)`);
      resolve(fallback);
    }, ms);
  });
  try {
    return await Promise.race([
      work().catch((err) => {
        console.warn(`[food-cache] ${what} (failed)`, err);
        return fallback;
      }),
      expiry,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One implementation, two endpoints.
 *
 * `serverAiFoodSearch` and `serverAiFoodSearchInline` were byte-identical, so
 * every fix had to be made twice or silently reached only one caller.
 *
 * Exported so the cache path can be exercised end to end without a browser and
 * without a request context: the two server functions below are the only
 * callers in the app.
 */
export async function runFoodSearch(
  rawQuery: string,
  engine: FoodSearchEngine = "groq",
  userId?: string,
): Promise<AiFoodResult> {
  const cleanQuery = sanitizeFoodQuery(rawQuery);
  if (cleanQuery.length < 2) return { kind: "single", items: [] };

  // Dynamic, like foodFuzzy below: foodCache imports the catalog transitively,
  // and a static import here would drag it back into this module's graph.
  const { isPersonalName, cacheableAnswers } = await import("@/lib/foodCache");
  // A private meal name never touches the shared cache, on a hit or a miss.
  const personal = isPersonalName(cleanQuery);

  if (!personal && userId) {
    const hit = await withinBudget(
      "lookup abandoned, falling through to AI",
      CACHE_LOOKUP_MS,
      async () =>
        (await import("@/server/foodCache")).lookupCache({
          query: cleanQuery,
          userId,
        }),
      null,
    );
    if (hit) {
      // "pcs" without a piece weight makes toGrams() return 0, so the unit is
      // only offered when the cached row actually carries one.
      const piece_g = hit.piece_g ?? undefined;
      return {
        kind: "single",
        items: [
          {
            heard: cleanQuery,
            name: hit.food_name,
            lang: "",
            confidence: "high" as const,
            units:
              piece_g === undefined
                ? ["g" as const]
                : ["g" as const, "pcs" as const],
            piece_g,
            serving_g: 100,
            code: "ai-fallback" as const,
            scie: "",
            grup: hit.food_class || "AI Fallback",
            enerc: hit.enerc,
            protcnt: hit.protcnt,
            fatce: hit.fatce,
            choavldf: hit.choavldf,
            fibtg: hit.fibtg,
            // Empty on purpose: a served hit is not a fresh opinion, so
            // nothing downstream may record it as one.
            canonical_key: "",
            // Narrows a plain DB string back to the schema's closed type.
            // Safe: recordAnswer never writes a row whose food_class isn't
            // one of FOOD_CLASS_VALUES (see its guard in server/foodCache.ts),
            // so every value this can read back is already list-valid.
            food_class: hit.food_class as AiFoodItemOut["food_class"],
            aliases: [],
            basis: hit.basis,
          },
        ],
      };
    }
  }

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
  // `model` is recorded beside every cached answer, so it is read from the
  // module the branch already imports rather than a second literal. The Gemini
  // id must come from that dynamic import and never from a top-level one:
  // vite.config.ts fails the build on any static path into **/server/**.
  let model: string;
  let raw: string;
  if (engine === "gemini") {
    const gemini = await import("@/server/gemini");
    model = gemini.GEMINI_LITE_MODEL;
    raw = await gemini.geminiText({
      prompt: [FOOD_SEARCH_SYSTEM, userMsg].join("\n\n"),
      max_tokens,
      temperature: 0.1,
    });
  } else {
    model = "openai/gpt-oss-120b";
    raw = await (
      await import("@/server/groq")
    ).groqChat({
      model,
      messages: [
        { role: "system", content: FOOD_SEARCH_SYSTEM },
        { role: "user", content: userMsg },
      ],
      max_tokens,
      temperature: 0.1,
      reasoning_effort: "low",
      response_format: { type: "json_object" },
    });
  }

  // extractJsonObject tolerates prose the model added around its JSON — a
  // plain JSON.parse on the raw text lost the whole answer the moment the
  // model echoed the <reference> block back first, which is what happened to
  // "thatte idli" 4 calls out of 5 (see extractJsonObject's own comment).
  // Logged, not silent: a future regression of this shape now leaves a trace
  // instead of a blank screen with no record of why.
  const parsed = extractJsonObject(raw);
  if (parsed === undefined) {
    console.warn("[ai-food-search] no JSON object found in the model's reply", {
      query: cleanQuery,
      engine,
      rawLen: raw.length,
      rawPreview: raw.slice(0, 200),
    });
    return { kind: "single", items: [] };
  }

  const validated = validateFoodSlots(parsed, cleanQuery);
  // Built field by field so the cache-only `slots` array never rides along in
  // the RPC payload to the browser.
  const result: AiFoodResult = validated
    ? { kind: validated.kind, items: validated.items }
    : { kind: "single", items: [] };

  if (!personal) {
    // cacheableAnswers pairs each raw item with its own validation slot BY
    // POSITION and gates the RAW numbers — gating after reconcileEnergy would
    // be a silent no-op, since a repaired enerc passes by construction. The
    // two-Koftas case in src/lib/foodCache.test.ts fails if cacheableAnswers
    // gates a slot's repaired numbers instead of its first argument's. What
    // no test sees is THIS call: that first argument must be the parsed
    // reply's own items, never anything validation has touched. Nothing on
    // this path dereferences a raw item that is not an object.
    const rows = cacheableAnswers(
      (parsed as { items?: unknown } | null)?.items,
      validated?.slots ?? [],
    );
    if (rows.length) {
      // One batched call rather than a loop over recordAnswer: the batch
      // dedupes by (canonical_key, food_class), which is what stops two items
      // of a single response filling two of the three slots meant to hold
      // three independent answers. Awaited rather than fired and forgotten — a
      // serverless function may be frozen the moment it returns, losing an
      // unawaited write — but only for as long as the budget allows.
      await withinBudget(
        "write abandoned, answer served but not cached",
        CACHE_RECORD_MS,
        async () =>
          (await import("@/server/foodCache")).recordAnswers(
            rows.map((r) => ({ ...r, engine, model })),
          ),
        undefined,
      );
    }
  }

  return result;
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
    return runFoodSearch(ctx.data, undefined, ctx.context.userId);
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
    return runFoodSearch(ctx.data.query, ctx.data.engine, ctx.context.userId);
  });

// ── Food correction ─────────────────────────────────────────────────────────
// A user editing the macros of a logged verified food overrides it for
// themselves. The shared ai_verified row is deliberately left alone: one person
// cannot change a food for everybody else, or push them back onto paid calls.

/**
 * The handler's work, exported for the same reason as runFoodSearch: so it can
 * be driven end to end without a request context. Never throws.
 *
 * On the cache-write budget: two sequential round trips (three parallel reads,
 * then one upsert) against the ten that budget was sized for. The food_logs
 * edit is saved before this runs, so running over costs only the correction.
 */
export function recordCorrection(
  userId: string,
  edit: LoggedEdit,
): Promise<string | null> {
  return withinBudget(
    "correction abandoned, food_logs edit kept",
    CACHE_RECORD_MS,
    async () =>
      (await import("@/server/foodCache")).flagFood({ ...edit, userId }),
    null,
  );
}

// Totals of one food_logs row, bounded exactly as the table's own constraints
// bound them (food_logs_macros_range, food_logs_quantity_g_range), so any row
// the app could have saved is accepted and nothing else is.
const macroTotal = z.number().finite().min(0).max(2000);

export const serverFlagFood = createServerFn({ method: "POST" })
  .middleware([requireAccess])
  .inputValidator(
    z.object({
      // Not trimmed: step 1 of the match is the verbatim display name.
      food_name: z.string().min(1).max(200),
      quantity_g: z.number().finite().gt(0).max(QUANTITY_G.max),
      calories: z.number().finite().min(0).max(20000),
      protein_g: macroTotal,
      carbs_g: macroTotal,
      fat_g: macroTotal,
      fiber_g: macroTotal,
    }),
  )
  .handler(async (ctx) => {
    checkRateLimit(ctx.context.userId);
    // userId from the verified session only — never from the request body.
    await recordCorrection(ctx.context.userId, ctx.data);
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
