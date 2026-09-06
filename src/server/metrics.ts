/**
 * The ops agent's entire capability surface.
 *
 * Every tool here maps 1:1 onto a SECURITY DEFINER function created in
 * 20260906090000_ops_metrics.sql and granted to service_role alone. The agent
 * picks a tool and a period; nothing on this path assembles SQL, and the model
 * never sees the schema. A misunderstood question therefore produces a
 * wrong-but-safe answer rather than an arbitrary read.
 *
 * THREE INVARIANTS. They are why this file exists rather than a generic query
 * endpoint, and none is negotiable:
 *
 *   1. Read only. The catalog contains no writes and must never gain one. An
 *      agent that can act on production from a chat message is a different
 *      product with a different risk profile.
 *
 *   2. Identifiers are opt-in, never incidental. The seven get_* tools are
 *      aggregate-only. The three user tools can name a person, but the listing
 *      returns an 8-char id prefix and no names — resolving one to a human is a
 *      separate, deliberate call. The agent speaks into a group chat whose
 *      membership can change without anyone deciding it should, so scanning
 *      signups must not spray PII into a history that outlives the question.
 *
 *   3. User-typed values are quarantined. full_name, username and email are
 *      attacker-controlled strings reaching an agent that holds service_role,
 *      so the SQL groups them under a "user_supplied" key and the system prompt
 *      tells the model they are data and never instructions. A user whose name
 *      is "ignore previous instructions" is an injection attempt, not a
 *      command. Any future tool returning user-entered text must do the same.
 *
 * `TOOL_SPECS` is shaped as OpenAI-style function definitions, which is what
 * Groq's tool calling accepts and what LangChain's `bindTools` consumes — so
 * the same catalog serves a hand-rolled loop and a LangGraph agent unchanged.
 *
 * Server-only: blocked from client bundles by the importProtection in
 * vite.config.ts. It runs as service_role and must never reach a browser.
 */

import { z } from "zod";

// ── Parameter schemas ────────────────────────────────────────────────────────
//
// Bounded on purpose. A model asking for 100,000 days is asking for a
// sequential scan; clamping in the schema means the database never sees it.

const PeriodDays = z
  .number()
  .int()
  .min(1)
  .max(365)
  .describe("Look-back window in days.");

const NoArgs = z.object({});
const WithPeriod = z.object({ period_days: PeriodDays.default(7) });
const WithDays = z.object({
  days: z
    .number()
    .int()
    .min(2)
    .max(90)
    .default(14)
    .describe("Number of days in the returned series."),
});

// ── The catalog ──────────────────────────────────────────────────────────────

export interface MetricTool {
  /** Tool name exposed to the model. */
  name: string;
  /** The model reads this to choose. Say what question it answers, not how. */
  description: string;
  schema: z.ZodTypeAny;
  /** The Postgres function it calls. */
  rpc: string;
}

export const METRIC_TOOLS: readonly MetricTool[] = [
  {
    name: "get_users_overview",
    description:
      "Total and new users, how many are active, how many started a trial, and how many currently hold access. Includes the previous equivalent period so growth can be compared. Use for questions about signups, user counts, or growth.",
    schema: WithPeriod,
    rpc: "ops_users_overview",
  },
  {
    name: "get_growth_daily",
    description:
      "Day-by-day series of signups, active users and food logs. Use when the question is about a trend, a change over time, or when something started or stopped happening — not for a single total.",
    schema: WithDays,
    rpc: "ops_growth_daily",
  },
  {
    name: "get_revenue",
    description:
      "Charges, gross rupees, refunds, subscription counts by tier, and trial-to-paid conversion over a period. Also reports how many charges were recorded with a zero amount, which indicates a payment-capture problem rather than free access.",
    schema: z.object({ period_days: PeriodDays.default(30) }),
    rpc: "ops_revenue",
  },
  {
    name: "get_engagement",
    description:
      "How much people are logging: food, workouts, weigh-ins, water, saved meals. Includes logs per active user and the median number of distinct days each active user logged on, which separates one heavy day from a real habit.",
    schema: WithPeriod,
    rpc: "ops_engagement",
  },
  {
    name: "get_funnel",
    description:
      "The signup-to-retention funnel: signed up, completed the quiz, started a trial, logged food once, logged on three days, still active at day seven, subscribed. Use to find which step people stop at. Usually more informative than totals.",
    schema: NoArgs,
    rpc: "ops_funnel",
  },
  {
    name: "get_system_health",
    description:
      "Operational signals: webhook delivery counts, hours since the last charge, zero-amount charges, open refund requests, notification backlog, and data-quality checks. Use for 'is anything broken' and before concluding a metric moved for product reasons.",
    schema: NoArgs,
    rpc: "ops_system_health",
  },
  {
    name: "get_notifications",
    description:
      "Notification delivery and snooze behaviour, broken down by status and type. Returns empty objects until the notification feature ships, which is expected and not a fault.",
    schema: WithPeriod,
    rpc: "ops_notifications",
  },
  {
    name: "list_users",
    description:
      "List individual users with an 8-char id prefix, signup date, whether they finished the quiz, whether they hold access, and how much they have logged. Deliberately returns no names or emails — use get_user_detail on one id when a name is actually needed. sort_by accepts 'recent' (newest first), 'active' (most recently logged first) or 'inactive' (least logging first).",
    schema: z.object({
      limit_n: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(15)
        .describe("How many users to return."),
      sort_by: z
        .enum(["recent", "active", "inactive"])
        .default("recent")
        .describe("Ordering: recent, active, or inactive."),
    }),
    rpc: "ops_list_users",
  },
  {
    name: "search_users",
    description:
      "Find users by name, username, email or id fragment. Returns at most 10. Use when the founder names a person and you need their id before calling get_user_detail. Requires at least 2 characters.",
    schema: z.object({
      q: z
        .string()
        .min(2)
        .max(80)
        .describe("Name, email, username or id fragment."),
    }),
    rpc: "ops_search_users",
  },
  {
    name: "get_user_detail",
    description:
      "Everything about one user: entitlement (access_until, trial, plan), billing (subscriptions, charges, amount paid, refund requests), activity (logs, weigh-ins, last seen) and referrals. Accepts a full uuid or the 8-char prefix from list_users. This is the tool for support questions like 'they say they paid but have no access'.",
    schema: z.object({
      user_ref: z
        .string()
        .min(4)
        .max(64)
        .describe("Full uuid or the 8-char id prefix."),
    }),
    rpc: "ops_user_detail",
  },
] as const;

const BY_NAME = new Map(METRIC_TOOLS.map((t) => [t.name, t]));

// ── Model-facing definitions ─────────────────────────────────────────────────

/** OpenAI/Groq-style function definitions. Also accepted by LangChain bindTools. */
export const TOOL_SPECS = METRIC_TOOLS.map((t) => ({
  type: "function" as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: zodToJsonSchema(t.schema),
  },
}));

/**
 * Minimal Zod → JSON Schema for the shapes used above.
 *
 * Deliberately not a dependency: the catalog only ever uses flat objects of
 * bounded integers, and a general converter would be several hundred kilobytes
 * to express `{ period_days: integer 1..365 }`. Throws on anything it does not
 * recognise, so a future tool with a richer schema fails loudly here rather
 * than silently handing the model an empty parameter list.
 */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (!(schema instanceof z.ZodObject)) {
    throw new Error("Metric tool schemas must be ZodObject");
  }
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, raw] of Object.entries(
    schema.shape as Record<string, z.ZodTypeAny>,
  )) {
    let field = raw;
    let optional = false;

    if (field instanceof z.ZodDefault) {
      optional = true;
      field = field._def.innerType;
    }
    if (field instanceof z.ZodOptional) {
      optional = true;
      field = field._def.innerType;
    }
    const described = field.description
      ? { description: field.description }
      : {};

    if (field instanceof z.ZodNumber) {
      const checks = field._def.checks ?? [];
      const min = checks.find((c: { kind: string }) => c.kind === "min") as
        | { value: number }
        | undefined;
      const max = checks.find((c: { kind: string }) => c.kind === "max") as
        | { value: number }
        | undefined;

      properties[key] = {
        type: "integer",
        ...(min ? { minimum: min.value } : {}),
        ...(max ? { maximum: max.value } : {}),
        ...described,
      };
    } else if (field instanceof z.ZodEnum) {
      // Enumerated in the schema so the model is told the valid values rather
      // than guessing and having runMetricTool reject it a round later.
      properties[key] = {
        type: "string",
        enum: field._def.values as string[],
        ...described,
      };
    } else if (field instanceof z.ZodString) {
      const checks = field._def.checks ?? [];
      const min = checks.find((c: { kind: string }) => c.kind === "min") as
        | { value: number }
        | undefined;
      const max = checks.find((c: { kind: string }) => c.kind === "max") as
        | { value: number }
        | undefined;

      properties[key] = {
        type: "string",
        ...(min ? { minLength: min.value } : {}),
        ...(max ? { maxLength: max.value } : {}),
        ...described,
      };
    } else {
      throw new Error(`Unsupported schema for parameter "${key}"`);
    }

    if (!optional) required.push(key);
  }

  return { type: "object", properties, required };
}

// ── Execution ────────────────────────────────────────────────────────────────

export interface ToolResult {
  ok: boolean;
  tool: string;
  data?: unknown;
  error?: string;
}

/**
 * Run one tool by the name the model produced.
 *
 * Every failure returns rather than throws, because the caller is an agent
 * loop: a tool error the model can read ("no such tool") lets it recover on
 * the next turn, whereas an exception ends the conversation.
 */
export async function runMetricTool(
  name: string,
  rawArgs: unknown = {},
): Promise<ToolResult> {
  const tool = BY_NAME.get(name);
  if (!tool) {
    // Names the real options: a hallucinated tool becomes a correctable mistake.
    return {
      ok: false,
      tool: name,
      error: `Unknown tool. Available: ${METRIC_TOOLS.map((t) => t.name).join(", ")}`,
    };
  }

  const parsed = tool.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      tool: name,
      error: `Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
    };
  }

  try {
    const { supabaseAdmin } = await import("@/integrations/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts leaves Functions empty
    const { data, error } = await (supabaseAdmin.rpc as any)(
      tool.rpc,
      parsed.data as Record<string, unknown>,
    );
    if (error) return { ok: false, tool: name, error: error.message };
    return { ok: true, tool: name, data };
  } catch (e) {
    return {
      ok: false,
      tool: name,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export interface Snapshot {
  metrics: Record<string, unknown>;
  /** Tools that failed, with their reason. Empty on a healthy run. */
  errors: { tool: string; error: string }[];
}

/**
 * Every tool at once, for the daily digest.
 *
 * Failures are returned rather than swallowed. A digest built from silently
 * missing data renders zeros everywhere and concludes that nothing needs
 * attention — indistinguishable from a genuinely quiet day, and precisely the
 * outcome this whole feature exists to prevent. Callers must treat a non-empty
 * `errors` as more urgent than anything in `metrics`.
 */
export async function snapshot(periodDays = 7): Promise<Snapshot> {
  const [users, growth, revenue, engagement, funnel, health, notifications] =
    await Promise.all([
      runMetricTool("get_users_overview", { period_days: periodDays }),
      runMetricTool("get_growth_daily", { days: 14 }),
      runMetricTool("get_revenue", { period_days: 30 }),
      runMetricTool("get_engagement", { period_days: periodDays }),
      runMetricTool("get_funnel"),
      runMetricTool("get_system_health"),
      runMetricTool("get_notifications", { period_days: periodDays }),
    ]);

  const all = {
    users,
    growth,
    revenue,
    engagement,
    funnel,
    health,
    notifications,
  };

  return {
    metrics: Object.fromEntries(
      Object.entries(all).map(([key, r]) => [key, r.data]),
    ),
    errors: Object.values(all)
      .filter((r) => !r.ok)
      .map((r) => ({ tool: r.tool, error: r.error ?? "unknown error" })),
  };
}
