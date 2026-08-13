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

// ── AI Food Search ───────────────────────────────────────────────────────────

export const serverAiFoodSearch = createServerFn({ method: "POST" })
  .inputValidator((d: string) => d)
  .handler(async (ctx) => {
    const { groqChat } = await import("@/server/groq");
    const query = ctx.data;
    if (query.trim().length < 2) return { items: [] };

    const prompt = `You are a nutrition expert. The user is searching for "${query}".
If this food is missing from a standard database, provide its typical nutritional values per 100g.
Return ONLY a JSON object with a key "items" containing up to 3 matching items, no markdown:
{
  "items": [
    {
      "code": "ai-fallback",
      "name": "string (specific name)",
      "scie": "",
      "lang": "",
      "grup": "AI Fallback",
      "enerc": number (in KJ, multiply kcal by 4.184),
      "protcnt": number (g),
      "fatce": number (g),
      "choavldf": number (g),
      "fibtg": number (g)
    }
  ]
}
Rules for accuracy:
- For cooked/boiled dals/pulses: ~90-110 kcal per 100g (thick consistency).
- For thin dal/soups: ~40-60 kcal per 100g.
- For cooked rice: ~130 kcal per 100g.
- For Roti (standard): ~120 kcal per 40g (one roti).
Use accurate values for common Indian foods.`;

    const raw = await groqChat({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800,
      temperature: 0.1,
      response_format: { type: "json_object" },
    });
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return { items: parsed.items || [] };
  });

// ── AI Food Search (inline, for FoodSearch component) ────────────────────────

export const serverAiFoodSearchInline = createServerFn({ method: "POST" })
  .inputValidator((d: string) => d)
  .handler(async (ctx) => {
    const { groqChat } = await import("@/server/groq");
    const query = ctx.data;
    if (query.trim().length < 2) return { items: [] };

    const prompt = `You are a nutrition expert. The user is searching for "${query}". 
If this food is missing from a standard database, provide its typical nutritional values per 100g.
Return ONLY a JSON object with a key "items" containing up to 3 matching items, no markdown:
{
  "items": [
    {
      "code": "ai-fallback",
      "name": "string (specific name)",
      "scie": "",
      "lang": "",
      "grup": "AI Fallback",
      "enerc": number (in KJ, multiply kcal by 4.184),
      "protcnt": number (g),
      "fatce": number (g),
      "choavldf": number (g),
      "fibtg": number (g)
    }
  ]
}
Rules for accuracy:
- For cooked/boiled dals/pulses: ~90-110 kcal per 100g (thick consistency).
- For thin dal/soups: ~40-60 kcal per 100g.
- For cooked rice: ~130 kcal per 100g.
- For Roti (standard): ~120 kcal per 40g (one roti).
- NEVER return values as low as 28 kcal for dal unless it is mostly water.
Use accurate values for Indian foods like Idli, Dosa, etc.`;

    const raw = await groqChat({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800,
      temperature: 0.1,
      response_format: { type: "json_object" },
    });
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return { items: parsed.items || [] };
  });

// ── AI Chat (generic — used by WeeklyReport, weight motivation, workout plan, voice parse) ──

interface ChatInput {
  prompt: string;
  model?: string;
  max_tokens?: number;
  temperature?: number;
  response_format_json?: boolean;
}

export const serverGroqChat = createServerFn({ method: "POST" })
  .inputValidator((d: ChatInput) => d)
  .handler(async (ctx) => {
    const { groqChat } = await import("@/server/groq");
    const { prompt, model, max_tokens, temperature, response_format_json } =
      ctx.data;

    const raw = await groqChat({
      model: model ?? "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: max_tokens ?? 1000,
      temperature: temperature ?? 0.7,
      ...(response_format_json
        ? { response_format: { type: "json_object" as const } }
        : {}),
    });

    return { result: raw };
  });

// ── AI Vision (food photo recognition) ───────────────────────────────────────

interface VisionInput {
  prompt: string;
  base64: string;
  mimeType: string;
}

export const serverGroqVision = createServerFn({ method: "POST" })
  .inputValidator((d: VisionInput) => d)
  .handler(async (ctx) => {
    const { groqVision } = await import("@/server/groq");
    const { prompt, base64, mimeType } = ctx.data;
    const raw = await groqVision({ prompt, base64, mimeType });
    return { result: raw };
  });
