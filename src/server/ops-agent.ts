/**
 * The ops agent — a LangGraph tool-calling loop over the metric catalog.
 *
 * Asked a question in plain English, it decides which of the tools in
 * src/server/metrics.ts to call, reads the results, and may call more before
 * answering. That is the whole point over slash commands: "why did signups
 * drop?" needs the daily series *and* system health before it means anything,
 * and the agent works that out rather than making you type two commands and
 * join them up yourself.
 *
 * The graph is deliberately small:
 *
 *     START → agent ⇄ tools → END
 *
 * `agent` is the model with tools bound; if it emitted tool calls we run them
 * and loop, otherwise we are done. State is LangGraph's MessagesAnnotation.
 *
 * SAFETY. The agent's power is bounded entirely by the catalog it is given:
 * every tool is a named, parameterised, read-only, aggregate-only Postgres
 * function. It cannot write, cannot see the schema, cannot compose SQL, and
 * cannot name a user. Those properties come from metrics.ts and the migration
 * behind it — nothing in this file may relax them.
 *
 * Server-only. Holds the Groq key and runs as service_role.
 */

import { ChatGroq } from "@langchain/groq";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import {
  END,
  START,
  MessagesAnnotation,
  StateGraph,
} from "@langchain/langgraph";
import { METRIC_TOOLS, runMetricTool, TOOL_SPECS } from "./metrics";

/** Turns kept per chat. Enough for follow-ups, short enough to stay cheap. */
const HISTORY_LIMIT = 20;

/**
 * Tool-call rounds allowed before we force an answer.
 *
 * A model that keeps calling tools without concluding would otherwise loop
 * until the function times out. Four is comfortably above the two or three a
 * real question needs.
 */
const MAX_TOOL_ROUNDS = 4;

const SYSTEM_PROMPT = `You are the ops assistant for Dombelz, an Indian nutrition and fitness tracking app. You answer questions about the live production system for the founder, in a Telegram chat.

HOW TO ANSWER
- Call tools to get real numbers. Never estimate, never recall figures from earlier in the conversation as if they were fresh — call the tool again.
- Prefer several tools over one when the question needs context. "Why did X drop?" almost always needs get_growth_daily and get_system_health, not just a total.
- Before blaming user behaviour for a metric moving, check get_system_health. A number falling because a webhook broke is a different problem from a number falling because people lost interest.
- Answer in plain prose for Telegram. Short. No markdown tables, no headings. Bold with *asterisks* only if it genuinely helps.
- Lead with the answer, then the number that supports it. Say what it means, not just what it is.
- If a figure looks wrong rather than merely bad, say so. Zero-amount charges and an empty webhook table are bugs, not business results.
- If the tools cannot answer, say exactly that. Never invent a metric that does not exist.

WHAT YOU CANNOT DO
- You have no access to individual users. No names, no emails, no user ids — the tools only return aggregates and that is deliberate. If asked about a specific person, say that ops tooling is aggregate-only by design and point them at the Supabase dashboard.
- You cannot change anything. Every tool is read-only.

Currency is rupees. Today's numbers are small — the app has a few dozen users — so speak in absolute counts rather than percentages where a percentage would be misleading.`;

// ── Model ────────────────────────────────────────────────────────────────────

function model() {
  const apiKey = (process.env.GROQ_API_KEY_1 ?? "").trim();
  if (!apiKey) throw new Error("GROQ_API_KEY_1 is not set");

  // Deliberately not routed through server/groq.ts: that module's rotation is
  // built around raw fetch, while ChatGroq wants to own the request. The ops
  // agent is a handful of calls a day, so it uses the first key and accepts
  // that it has no rotation.
  return new ChatGroq({
    apiKey,
    model: "openai/gpt-oss-120b",
    temperature: 0.2,
    maxTokens: 1200,
  });
}

// ── Graph ────────────────────────────────────────────────────────────────────

async function callModel(state: typeof MessagesAnnotation.State) {
  const bound = model().bindTools(TOOL_SPECS);
  const response = await bound.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    ...state.messages,
  ]);
  return { messages: [response] };
}

/**
 * Run whatever the model asked for.
 *
 * runMetricTool never throws — an unknown tool or bad arguments come back as a
 * readable error, which the model sees on the next turn and can correct. An
 * exception here would end the conversation instead.
 */
async function callTools(state: typeof MessagesAnnotation.State) {
  const last = state.messages[state.messages.length - 1] as AIMessage;
  const calls = last.tool_calls ?? [];

  const results = await Promise.all(
    calls.map(async (call) => {
      const result = await runMetricTool(call.name, call.args);
      return new ToolMessage({
        tool_call_id: call.id ?? call.name,
        name: call.name,
        content: JSON.stringify(
          result.ok ? result.data : { error: result.error },
        ),
      });
    }),
  );

  return { messages: results };
}

function shouldContinue(state: typeof MessagesAnnotation.State) {
  const last = state.messages[state.messages.length - 1] as AIMessage;
  if (!last.tool_calls?.length) return END;

  // Count how many times we have already been round. Past the ceiling we stop
  // asking for data and let the model answer with what it has.
  const rounds = state.messages.filter(
    (m) => m.getType() === "ai" && (m as AIMessage).tool_calls?.length,
  ).length;
  return rounds > MAX_TOOL_ROUNDS ? END : "tools";
}

const graph = new StateGraph(MessagesAnnotation)
  .addNode("agent", callModel)
  .addNode("tools", callTools)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", shouldContinue, { tools: "tools", [END]: END })
  .addEdge("tools", "agent")
  .compile();

// ── Persistence ──────────────────────────────────────────────────────────────
//
// Only human and final assistant turns are stored. Tool calls and their results
// are working notes: replaying them would grow the prompt without helping, and
// stale figures in the history are exactly what the system prompt tells the
// model not to trust.

// A type alias rather than an interface on purpose: only aliases satisfy the
// index signature that Supabase's generated Json type requires, so this is what
// lets the history be written to a jsonb column without a cast.
type StoredTurn = {
  role: "user" | "assistant";
  content: string;
};

async function loadHistory(chatId: number): Promise<StoredTurn[]> {
  const { supabaseAdmin } = await import("@/integrations/client.server");
  const { data } = await supabaseAdmin
    .from("ops_agent_threads")
    .select("messages")
    .eq("chat_id", chatId)
    .maybeSingle();
  // Through unknown: jsonb is Json to the type system, and its actual shape is
  // guaranteed by saveHistory below rather than by the database.
  return (data?.messages as unknown as StoredTurn[]) ?? [];
}

async function saveHistory(chatId: number, turns: StoredTurn[]): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/client.server");
  const trimmed = turns.slice(-HISTORY_LIMIT);
  await supabaseAdmin.from("ops_agent_threads").upsert(
    {
      chat_id: chatId,
      messages: trimmed,
      turn_count: turns.length,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "chat_id" },
  );
}

/** Wipe one chat's memory. Backs the /reset command. */
export async function clearHistory(chatId: number): Promise<void> {
  await saveHistory(chatId, []);
}

// ── Entry point ──────────────────────────────────────────────────────────────

export interface AgentReply {
  text: string;
  /** Tools actually invoked, for the debug footer. */
  toolsUsed: string[];
}

export async function askOpsAgent(
  chatId: number,
  question: string,
): Promise<AgentReply> {
  const history = await loadHistory(chatId);

  const messages: BaseMessage[] = [
    ...history.map((t) =>
      t.role === "user"
        ? new HumanMessage(t.content)
        : new AIMessage(t.content),
    ),
    new HumanMessage(question),
  ];

  const result = await graph.invoke({ messages });

  const produced = result.messages;
  const final = produced[produced.length - 1];
  const text =
    typeof final.content === "string"
      ? final.content.trim()
      : JSON.stringify(final.content);

  const toolsUsed = produced
    .filter((m) => m.getType() === "ai")
    .flatMap((m) => (m as AIMessage).tool_calls ?? [])
    .map((c) => c.name);

  await saveHistory(chatId, [
    ...history,
    { role: "user", content: question },
    { role: "assistant", content: text },
  ]);

  return {
    text: text || "I could not produce an answer for that.",
    toolsUsed: [...new Set(toolsUsed)],
  };
}

/** Names of every tool the agent can reach. Backs the /help text. */
export function availableTools(): string[] {
  return METRIC_TOOLS.map((t) => t.name);
}
