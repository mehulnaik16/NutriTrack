/**
 * Server functions for all AI operations (Gemini on Vertex AI; Claude for the
 * weekly check-in once its key is set).
 *
 * Every AI call goes through a createServerFn here.
 * Client code calls these functions via TanStack Start's RPC mechanism —
 * the browser never sees an API key or contacts Google directly.
 *
 * The server/* modules are dynamically imported inside each handler
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
  FAST_FOOD_SYSTEM,
  fastFoodQuery,
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
 * The food search behind every AI search box and every photo or voice lookup.
 *
 * Deliberately NOT exported. serverAiFoodSearchInline is its only caller, so
 * the client build drops it along with that handler. Exported,
 * it stays in the client module graph, and its `@/server/*` imports trip
 * TanStack Start's import protection: the dev server refuses to load any page.
 */
async function runFoodSearch(
  rawQuery: string,
  userId: string | undefined,
  /** 15 s for a typed search; less for the lookup inside a photo or voice log. */
  budgetMs: number,
  /** A Fast Food Meal lookup: its own short prompt and this brand's rows. */
  fastFood?: { restaurant: string; meal: string },
): Promise<AiFoodResult> {
  // The budget covers the whole search: cache lookup, the model call, and the
  // cache write.
  const started = Date.now();
  const ff = fastFood && fastFoodQuery(fastFood.restaurant, fastFood.meal);
  const cleanQuery = ff ? ff.key : sanitizeFoodQuery(rawQuery);
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

  // Imported inside the handler, beside the model call, so the catalog is not pulled into
  // this module's static graph — foodDb imports nothing from here any more, and
  // this keeps it that way.
  const { referenceFoods, isComposite } = await import("@/lib/foodFuzzy");
  const { PIECE_G } = await import("@/lib/foodUnits");

  // Pipe-delimited rather than JSON: five rows of JSON is ~400 tokens of
  // punctuation, and the model is being told to copy numbers, not parse shapes.
  // `fibtg` is an empty string on 95 restaurant rows, hence the coercion.
  // A fast-food lookup sees at most 3 rows, and only the named brand's, from
  // the restaurant menus (which the everyday catalog no longer holds).
  let refRows;
  if (fastFood) {
    const rdb = await import("@/lib/restaurantDb");
    const { rows, brands } = await rdb.loadRestaurants();
    const brand = rdb.exactBrand(brands, fastFood.restaurant);
    refRows = brand ? rdb.menuMatches(rows, brand, fastFood.meal, 3) : [];
  } else {
    refRows = referenceFoods(cleanQuery, 5);
  }
  const refs = refRows.map((it) =>
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
    (ff ? ff.message : `<query>${cleanQuery}</query>`);

  const max_tokens = maxTokensFor(!ff && isComposite(cleanQuery));

  // The one model call lives in server/aiRoutes.ts. `model` is recorded beside
  // every cached answer. Dynamic import: vite.config.ts
  // fails the build on any static path into **/server/**.
  const { searchChain, CACHEABLE_SEARCH_MODELS } =
    await import("@/server/aiRoutes");
  const answer = await searchChain(
    ff ? FAST_FOOD_SYSTEM : FOOD_SEARCH_SYSTEM,
    userMsg,
    max_tokens,
    budgetMs - (Date.now() - started),
  );
  const raw = answer.text;
  const { model, provider: engine } = answer;

  // extractJsonObject tolerates prose the model added around its JSON — a
  // plain JSON.parse on the raw text lost the whole answer the moment the
  // model echoed the <reference> block back first, which is what happened to
  // "thatte idli" 4 calls out of 5 (see extractJsonObject's own comment).
  // Logged, not silent: a future regression of this shape now leaves a trace
  // instead of a blank screen with no record of why.
  const { value: parsed, count: candidateCount } = extractJsonObject(raw);
  if (parsed === undefined) {
    console.warn("[ai-food-search] no JSON object found in the model's reply", {
      query: cleanQuery,
      engine,
      rawLen: raw.length,
      rawPreview: raw.slice(0, 200),
    });
    return { kind: "single", items: [] };
  }
  // More than one candidate means the model echoed something else that also
  // happens to be valid JSON before its real answer — the prompt's own
  // EXAMPLES section is full of exactly that shape (six complete, schema-
  // valid objects). extractJsonObject already chose the LAST one to serve,
  // but an echoed few-shot example would pass Zod validation cleanly and
  // could be written to the shared cache under the wrong canonical_key and
  // food_class — permanently. Ambiguity costs one uncached answer, never a
  // wrong row: the answer is still served, just not recorded below.
  const ambiguous = candidateCount > 1;
  if (ambiguous) {
    console.warn(
      "[ai-food-search] multiple JSON objects in the model's reply — serving the last, not caching it",
      { query: cleanQuery, engine, candidateCount },
    );
  }

  const validated = validateFoodSlots(parsed, cleanQuery);
  // Built field by field so the cache-only `slots` array never rides along in
  // the RPC payload to the browser.
  const result: AiFoodResult = validated
    ? { kind: validated.kind, items: validated.items }
    : { kind: "single", items: [] };

  // No userId, nothing staged: quorum counts distinct people (see
  // MIN_DISTINCT_USERS), and an answer nobody can be counted for could fill a
  // group alone. Both server functions pass ctx.context.userId.
  const cacheable = CACHEABLE_SEARCH_MODELS.includes(answer.model);
  if (!personal && !ambiguous && userId && cacheable) {
    // cacheableAnswers pairs each raw item with its own validation slot BY
    // POSITION and gates the RAW numbers — gating after reconcileEnergy would
    // be a silent no-op, since a repaired enerc passes by construction. The
    // two-Koftas case in src/lib/foodCache.test.ts fails if cacheableAnswers
    // gates a slot's repaired numbers instead of its first argument's. What
    // no test sees is THIS call: that first argument must be the parsed
    // reply's own items, never anything validation has touched. Nothing on
    // this path dereferences a raw item that is not an object.
    // kind decides how many of the items are answers: "single" means they are
    // alternatives for one query and only the first is, "meal" means they are
    // separate foods and all of them are. Defaulted rather than optional so a
    // reply that failed validation entirely caches nothing extra — the schema
    // already catches an unknown kind to "single".
    const rows = cacheableAnswers(
      (parsed as { items?: unknown } | null)?.items,
      validated?.slots ?? [],
      validated?.kind ?? "single",
    );
    if (rows.length) {
      // One batched call rather than a loop over recordAnswer: the batch
      // dedupes by (canonical_key, food_class), which is what stops two items
      // of a single response filling two of the three slots meant to hold
      // three independent answers. Awaited rather than fired and forgotten — a
      // serverless function may be frozen the moment it returns, losing an
      // unawaited write — but only for as long as the budget allows.
      // Whatever is left of the search budget, so a slow write cannot push
      // the user past 8 s; an abandoned write still serves the answer.
      await withinBudget(
        "write abandoned, answer served but not cached",
        Math.max(
          500,
          Math.min(CACHE_RECORD_MS, budgetMs - (Date.now() - started)),
        ),
        async () =>
          (await import("@/server/foodCache")).recordAnswers(
            rows.map((r) => ({ ...r, engine, model })),
            userId,
          ),
        undefined,
      );
    }
  }

  return result;
}

// ── AI Food Search ───────────────────────────────────────────────────────────

export const serverAiFoodSearchInline = createServerFn({ method: "POST" })
  .middleware([requireAccess])
  .inputValidator(
    z.object({
      query: z.string(),
      /** A photo or voice log passes its lookup budget; capped at a search's. */
      budgetMs: z.number().int().min(3000).max(15_000).optional(),
    }),
  )
  .handler(async (ctx) => {
    checkRateLimit(ctx.context.userId);
    const { query, budgetMs = 15_000 } = ctx.data;
    return runFoodSearch(query, ctx.context.userId, budgetMs);
  });

// ── Fast Food Meal ───────────────────────────────────────────────────────────
// One menu item at one named restaurant, on FAST_FOOD_SYSTEM rather than the
// general search prompt. Same model, budget and cache rules.

export const serverFastFoodSearch = createServerFn({ method: "POST" })
  .middleware([requireAccess])
  .inputValidator(
    z.object({
      restaurant: z.string().min(1).max(80),
      meal: z.string().min(1).max(120),
    }),
  )
  .handler(async (ctx) => {
    checkRateLimit(ctx.context.userId);
    const { restaurant, meal } = ctx.data;
    return runFoodSearch("", ctx.context.userId, 15_000, {
      restaurant,
      meal,
    });
  });

// ── Food correction ─────────────────────────────────────────────────────────
// A user editing the macros of a logged verified food overrides it for
// themselves. The shared ai_verified row is deliberately left alone: one person
// cannot change a food for everybody else, or push them back onto paid calls.

/**
 * The handler's work. Not exported, for the same reason as runFoodSearch: the
 * client build must be able to drop it with the handler. Never throws.
 *
 * On the cache-write budget: two sequential round trips (three parallel reads,
 * then one upsert) against the ten that budget was sized for. The food_logs
 * edit is saved before this runs, so running over costs only the correction.
 */
function recordCorrection(
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

// ── AI Chat (generic — used by WeeklyReport and weight motivation) ──

// Without a runtime schema this endpoint is a general-purpose LLM API billed to
// our Google Cloud account: a TypeScript interface erases at compile time and
// enforces nothing. The ceilings below are sized to the app's real callers.
const ChatInput = z.object({
  // Sized to the app's real callers. Bounded to keep the generic endpoint
  // from being used as an open LLM proxy.
  prompt: z.string().min(1).max(12_000),
  max_tokens: z.number().int().min(1).max(3000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  response_format_json: z.boolean().optional(),
});

export const serverAiChat = createServerFn({ method: "POST" })
  .middleware([requireAccess])
  .inputValidator(ChatInput)
  .handler(async (ctx) => {
    checkRateLimit(ctx.context.userId);
    const { geminiText } = await import("@/server/gemini");
    const { prompt, max_tokens, temperature, response_format_json } = ctx.data;
    const raw = await geminiText({
      prompt,
      max_tokens: max_tokens ?? 1000,
      temperature: temperature ?? 0.7,
      json: !!response_format_json,
    });
    return { result: raw };
  });

// ── Weekly check-in (Claude Haiku) ───────────────────────────────────────────
// The client sends numbers only; the prompt and the WEEK_DATA line are built
// here, so this endpoint can't be used as an open LLM proxy.
const day = z.string().max(12);
const WeeklyReportInput = z.object({
  name: z.string().max(60),
  goal: z.enum(["lose", "maintain", "gain"]),
  weightKg: z.number().nullable(),
  kcalTarget: z.number().positive(),
  proteinTarget: z.number().positive().nullable(),
  daysLogged: z.number().int().min(0).max(7),
  missedDays: z.array(day).max(7),
  avgKcal: z.number(),
  avgProtein: z.number(),
  closestDay: day.nullable(),
  closestKcal: z.number().nullable(),
  furthestDay: day.nullable(),
  furthestKcal: z.number().nullable(),
  workouts: z.number().int().min(0).max(7),
  weightChange: z.number().nullable(),
});

export const serverWeeklyReport = createServerFn({ method: "POST" })
  .middleware([requireAccess])
  .inputValidator(WeeklyReportInput)
  .handler(async (ctx) => {
    checkRateLimit(ctx.context.userId);
    const { claudeWeeklyReport, WEEKLY_SYSTEM } =
      await import("@/server/anthropic");
    const d = ctx.data;
    const na = "not tracked";
    const line = [
      `name ${d.name.replace(/[;\n]/g, " ")}`,
      `goal ${d.goal}`,
      `weight_kg ${d.weightKg ?? na}`,
      `kcal_target ${d.kcalTarget}`,
      `protein_target_g ${d.proteinTarget ?? na}`,
      `days_logged ${d.daysLogged}`,
      `missed_days ${d.missedDays.join(", ") || "none"}`,
      `avg_kcal ${d.avgKcal}`,
      `avg_protein_g ${d.avgProtein}`,
      // Precomputed: the model gets percentages wrong (it called 115 of 120 g "115%").
      `kcal_pct ${d.daysLogged ? Math.round((d.avgKcal / d.kcalTarget) * 100) : na}`,
      `protein_pct ${d.daysLogged && d.proteinTarget ? Math.round((d.avgProtein / d.proteinTarget) * 100) : na}`,
      `closest_day ${d.closestDay ? `${d.closestDay} ${d.closestKcal}` : "none"}`,
      `furthest_day ${d.furthestDay ? `${d.furthestDay} ${d.furthestKcal}` : "none"}`,
      `workouts ${d.workouts}`,
      `weight_change_kg ${d.weightChange === null ? na : `${d.weightChange > 0 ? "+" : ""}${d.weightChange}`}`,
    ].join("; ");
    if (process.env.ANTHROPIC_API_KEY)
      return { result: await claudeWeeklyReport(line) };

    // Gemini Lite writes the report until the Claude key is connected.
    const { geminiText } = await import("@/server/gemini");
    const result = await geminiText({
      prompt: `${WEEKLY_SYSTEM}\n\nWEEK_DATA: ${line}`,
      max_tokens: 300,
      temperature: 0.7,
      json: false,
    });
    return { result };
  });

// ── Workout plan ─────────────────────────────────────────────────────────────
// The coach prompt and catalog live server-side (lib/workoutPrompt.ts) and go
// go first in the prompt, so Gemini's implicit prefix cache can reuse them;
// the client sends only the athlete's answers.
const WorkoutPlanInput = z.object({
  athlete: z.string().min(1).max(2000),
  fitnessGoal: z.enum([
    "build_muscle",
    "general_fitness",
    "conditioning",
    "strength",
  ]),
  musclesPerWorkout: z.enum(["1", "2", "3", "not_sure"]),
});

export const serverWorkoutPlan = createServerFn({ method: "POST" })
  .middleware([requireAccess])
  .inputValidator(WorkoutPlanInput)
  .handler(async (ctx) => {
    checkRateLimit(ctx.context.userId);
    const [{ geminiText }, { WORKOUT_COACH_SYSTEM, buildWorkoutUserMessage }] =
      await Promise.all([
        import("@/server/gemini"),
        import("@/lib/workoutPrompt"),
      ]);
    const { athlete, fitnessGoal, musclesPerWorkout } = ctx.data;
    // Plan limits (ai_plan_limits migration): take a turn before the model
    // runs, give it back if the model fails so an error never costs one.
    const { data: turn, error: turnError } =
      await ctx.context.supabase.rpc("claim_ai_plan");
    if (turnError)
      throw new Error("Couldn't start your plan. Please try again.");
    if (!turn) throw new Error(AI_PLAN_LIMIT_MESSAGE);
    try {
      const raw = await geminiText({
        prompt: `${WORKOUT_COACH_SYSTEM}\n\n${buildWorkoutUserMessage(
          athlete,
          fitnessGoal,
          musclesPerWorkout,
        )}`,
        max_tokens: 3000,
        temperature: 0.4,
      });
      const days = JSON.parse(raw.replace(/```json|```/g, "").trim())?.days;
      if (!Array.isArray(days) || days.length === 0)
        throw new Error("The AI returned an invalid plan. Please try again.");
      return { result: raw };
    } catch (e) {
      const { supabaseAdmin } = await import("@/integrations/client.server");
      await supabaseAdmin.rpc("release_ai_plan", { p_id: turn });
      throw e instanceof SyntaxError
        ? new Error("The AI returned an invalid plan. Please try again.")
        : e;
    }
  });

/** Shown when "Let AI Pick for You" has no turns left. Kind, not a lock. */
export const AI_PLAN_LIMIT_MESSAGE =
  "You've used your AI plans for now. Your current plan is ready to train with 💪";

// ── Voice parse ──────────────────────────────────────────────────────────────
// Pinned server-side like the vision path: the model lives in
// server/aiRoutes.ts, so the generic prompt box cannot be pointed at a model
// nobody priced.
export const serverVoiceParse = createServerFn({ method: "POST" })
  .middleware([requireAccess])
  .inputValidator(ChatInput.pick({ prompt: true }))
  .handler(async (ctx) => {
    checkRateLimit(ctx.context.userId);
    const { voiceChain } = await import("@/server/aiRoutes");
    return { result: (await voiceChain(ctx.data.prompt)).text };
  });

// ── Speech to text (voice food logging) ─────────────────────────────────────

// 30 s of compressed speech is a few hundred KB; this allows ~1 MB decoded.
const MAX_AUDIO_BASE64_CHARS = 1_400_000;

const AudioInput = z.object({
  base64: z
    .string()
    .min(1)
    .max(MAX_AUDIO_BASE64_CHARS)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Invalid base64 audio data"),
  // What MediaRecorder produces: WebM/Opus on Android and desktop
  // Chrome, MP4/AAC on iPhone.
  mimeType: z.enum([
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/aac",
    "audio/mpeg",
    "audio/wav",
  ]),
});

/**
 * A recorded clip in, its words and foods out in one call: Gemini hears the
 * audio itself. A whole-day Power Log takes one of the day's two
 * turns first and gives it back if the model fails.
 */
export const serverVoiceGeminiParse = createServerFn({ method: "POST" })
  .middleware([requireAccess])
  .inputValidator(
    AudioInput.partial()
      .extend({
        /** The user's meal names, so the model can only pick among them. */
        meals: z.array(z.string().trim().min(1).max(30)).max(8),
        power: z.boolean(),
        /** The user's local date, for the per-day Power Log limit. */
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        /** A Power Log Re-parse: the edited words instead of the clip. */
        text: z.string().trim().min(1).max(2000).optional(),
      })
      .refine(
        (d) => (d.text ? d.power && !d.base64 : !!d.base64 && !!d.mimeType),
        "Send a recording, or words for a Power Log re-parse",
      ),
  )
  .handler(async (ctx) => {
    checkRateLimit(ctx.context.userId);
    const [
      { voiceAudioChain },
      { buildVoiceAudioPrompt, POWER_LOG_LIMIT_MESSAGE },
    ] = await Promise.all([
      import("@/server/aiRoutes"),
      import("@/lib/voiceShort"),
    ]);
    const { base64, mimeType, meals, power, day, text } = ctx.data;
    let turn: string | null = null;
    if (text) {
      // A re-parse re-reads a Power Log already counted today; it takes no
      // new turn, but needs one spent, so it is not a free Power Log.
      const { data: left, error } = await ctx.context.supabase.rpc(
        "power_logs_left",
        { p_day: day },
      );
      if (error || left === 2)
        throw new Error("Record your Whole Day log first, then re-parse.");
    } else if (power) {
      const { data, error } = await ctx.context.supabase.rpc(
        "claim_power_log",
        { p_day: day },
      );
      if (error)
        throw new Error("Couldn't start your Power Log. Please try again.");
      if (!data) throw new Error(POWER_LOG_LIMIT_MESSAGE);
      turn = data;
    }
    try {
      const prompt = buildVoiceAudioPrompt(meals, power, text);
      const audio = base64 && mimeType ? { base64, mimeType } : undefined;
      return { result: (await voiceAudioChain(prompt, audio)).text };
    } catch (e) {
      if (turn) {
        const { supabaseAdmin } = await import("@/integrations/client.server");
        await supabaseAdmin.rpc("release_power_log", { p_id: turn });
      }
      throw e;
    }
  });

// ── AI Vision (food photo recognition) ───────────────────────────────────────

// ~8 MB decoded — base64 inflates by 4/3, and the whole string is buffered in
// serverless memory before it is forwarded to Gemini.
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

// The client no longer picks a model: every screen that takes a food photo
// gets the same call (server/aiRoutes.ts), meal builder included.
export const serverFoodVision = createServerFn({ method: "POST" })
  .middleware([requireAccess])
  .inputValidator(
    VisionInput.extend({
      /** Optional user hint about the food; same 50-char cap as the app. */
      note: z.string().trim().max(50).optional(),
    }),
  )
  .handler(async (ctx) => {
    checkRateLimit(ctx.context.userId);
    const { visionChain } = await import("@/server/aiRoutes");
    const { prompt, base64, mimeType, note } = ctx.data;
    // Labelled here, not by the client, and stripped of quotes and line
    // breaks, so a typed note can't pose as part of the instructions.
    const clean = note?.replace(/["\s]+/g, " ").trim();
    const after = clean
      ? `User's note (optional, may be wrong): "${clean}"`
      : undefined;
    return {
      result: (await visionChain(prompt, base64, mimeType, after)).text,
    };
  });
