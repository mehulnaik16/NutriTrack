/**
 * Telegram webhook — the ops agent's inbound door.
 *
 * Mounted at POST /api/telegram-webhook from src/server.ts, the same seam the
 * Razorpay handler uses.
 *
 * THIS IS A PUBLIC URL WITH service_role REACH BEHIND IT. Everything before
 * `askOpsAgent` is the security boundary, and it has three layers because any
 * one of them failing alone should not be enough:
 *
 *   1. Secret token. Telegram echoes X-Telegram-Bot-Api-Secret-Token on every
 *      delivery, set by us at setWebhook time. This is the equivalent of the
 *      HMAC in the Razorpay handler: the URL is not authentication, and a
 *      Vercel path will be found by scanners.
 *
 *   2. Chat allowlist. Anyone can find a bot by username and message it, and
 *      that message reaches this endpoint with a perfectly valid secret token.
 *      Only TELEGRAM_CHAT_ID is answered.
 *
 *   3. The catalog. Even a fully authorised caller only reaches named,
 *      parameterised functions. There is no arbitrary SQL anywhere.
 *
 *   4. Owner-only writes, confirmed out of band. Three tools can change
 *      something, and none of them executes in the turn that proposes it. The
 *      agent returns a code; this handler matches "confirm <code>" with a
 *      regular expression before the model is involved, and ops-authz.ts
 *      checks the sender is the group's creator — administrators are
 *      deliberately not enough, because promoting someone to admin is a
 *      routine convenience that must not hand over billing.
 *
 * Unauthorised requests get 200 and silence, never an error message. A refusal
 * that explains itself confirms the endpoint is real and worth more attention.
 */

import { askOpsAgent, availableTools, clearHistory } from "./ops-agent";
import { sendAlert } from "./telegram";
import { executeConfirmed } from "./ops-actions";

/**
 * Telegram retries non-2xx deliveries, so almost everything answers 200 —
 * including messages we deliberately ignore. There is nothing for Telegram to
 * retry when the answer is "not for you".
 */
const ack = (detail: string) =>
  new Response(JSON.stringify({ ok: true, detail }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

function pick(obj: unknown, ...path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

async function reply(chatId: number, text: string): Promise<void> {
  const token = (process.env.TELEGRAM_TOKEN ?? "").trim();
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        // Telegram's Markdown is strict and the agent writes free prose; an
        // unbalanced asterisk would make the send fail rather than look odd.
        // Plain text always delivers.
        text: text.slice(0, 4000),
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    console.warn(
      "[telegram-webhook] reply failed:",
      e instanceof Error ? e.message : String(e),
    );
  }
}

const HELP = `I answer questions about the live Dombelz system in plain English — no commands needed.

Try:
• how are we doing this week?
• why did signups drop?
• where are people dropping out of the funnel?
• is anything broken right now?
• list the users who haven't logged anything
• what's going on with <name>'s account?

I can also fix a few things — grant access, revoke a grant, reset someone's notification settings. I never do it straight away: I'll describe the change and give you a code, and it happens only when the group OWNER replies "confirm <code>". Admins can't, deliberately.

/reset clears this conversation's memory.`;

export async function handleTelegramWebhook(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // ── Layer 1: the secret token ──────────────────────────────────────────────
  const expectedSecret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
  if (!expectedSecret) {
    // Refuse to serve rather than run unauthenticated. A missing secret in
    // production is a misconfiguration, not a reason to accept everything.
    console.error("[telegram-webhook] TELEGRAM_WEBHOOK_SECRET is not set");
    return new Response("Not configured", { status: 503 });
  }
  if (
    request.headers.get("x-telegram-bot-api-secret-token") !== expectedSecret
  ) {
    console.warn("[telegram-webhook] rejected: bad or missing secret token");
    return new Response("Forbidden", { status: 403 });
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return new Response("Malformed payload", { status: 400 });
  }

  // Edited messages, joins, reactions and channel posts all arrive here.
  // Only plain new messages are acted on.
  const chatId = pick(update, "message", "chat", "id");
  const text = pick(update, "message", "text");
  // Authority is per person, not per chat. Writes are owner-only, and the
  // owner is established from Telegram rather than from anything in the
  // message — see src/server/ops-authz.ts.
  const fromId = pick(update, "message", "from", "id");
  if (typeof chatId !== "number" || typeof text !== "string") {
    return ack("ignored: not a text message");
  }

  // ── Layer 2: the chat allowlist ────────────────────────────────────────────
  const allowed = (process.env.TELEGRAM_CHAT_ID ?? "").trim();
  if (!allowed || String(chatId) !== allowed) {
    // No reply to the sender: an unknown chat learns nothing about whether this
    // bot exists or does anything.
    console.warn("[telegram-webhook] ignored message from unallowed chat");

    // But tell the *configured* chat once, because the failure is otherwise
    // invisible in the worst possible way. A mismatched TELEGRAM_CHAT_ID makes
    // the handler return 200, so Telegram reports successful delivery and no
    // errors while the bot sits silent — everything looks healthy and nothing
    // is. That cost an hour to diagnose the first time it happened.
    //
    // Throttled per offending chat, so a stranger messaging the bot repeatedly
    // cannot use this to flood the ops channel.
    await sendAlert({
      severity: "warning",
      title: allowed
        ? "Message from a chat that is not allowlisted"
        : "TELEGRAM_CHAT_ID is not set",
      detail: allowed
        ? {
            from_chat: chatId,
            configured: allowed,
            hint: "If this is your group, TELEGRAM_CHAT_ID in the deployment does not match it — check for a dropped minus sign or a Preview/Production scope mismatch.",
          }
        : {
            from_chat: chatId,
            hint: "Every message will be ignored until it is set.",
          },
      throttleKey: `unallowed-chat:${chatId}`,
    });
    return ack("ignored: chat not allowed");
  }

  const trimmed = text.trim();
  if (!trimmed) return ack("ignored: empty");

  // A couple of literal commands are still worth having; everything else is
  // natural language handed to the agent.
  if (trimmed === "/start" || trimmed === "/help") {
    await reply(chatId, HELP);
    return ack("help");
  }
  if (trimmed === "/reset") {
    await clearHistory(chatId);
    await reply(chatId, "Conversation memory cleared.");
    return ack("reset");
  }
  // Confirmation is matched here, before the model is involved at all. That is
  // the point of it: a prompt injection can talk the agent into proposing a
  // change, but the code that performs it is typed by a human and parsed by a
  // regular expression.
  const confirm = trimmed.match(/^confirm\s+([A-Za-z0-9]{6})$/i);
  if (confirm) {
    const result = await executeConfirmed(
      String(chatId),
      typeof fromId === "number" ? fromId : undefined,
      confirm[1],
    );
    await reply(chatId, result.message);
    return ack(result.ok ? "action executed" : "action refused");
  }

  // Telegram appends @botname in groups; strip it so "/foo@bot" is not sent to
  // the agent as if it were a question.
  const question = trimmed.replace(/^\/\w+(@\w+)?\s*/, "") || trimmed;

  try {
    const { text: answer, toolsUsed } = await askOpsAgent(chatId, question, {
      fromUserId: typeof fromId === "number" ? fromId : undefined,
    });
    const footer = toolsUsed.length
      ? `\n\n— ${toolsUsed.join(", ")}`
      : `\n\n— no tools used`;
    await reply(chatId, answer + footer);
    return ack("answered");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[telegram-webhook] agent failed:", message);
    // The founder is the only person who can read this, so the real error is
    // more useful than a polite apology.
    await reply(chatId, `Agent error: ${message}`);
    return ack("error reported");
  }
}

/** Exposed for the setup script and tests. */
export { availableTools };
