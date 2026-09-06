/**
 * Server-only operational alerts to a Telegram group.
 *
 * This is an ops channel, not a product feature. It exists so that the things
 * you would otherwise only discover by reading Vercel logs — a webhook that
 * stopped applying, every Groq key exhausted, a refund — arrive somewhere a
 * person actually looks.
 *
 * Same contract as the Python transport in the ReelsMaker repo
 * (app/utils/telegram_approval.py) and the same two environment variables, so
 * one bot can serve both projects:
 *
 *   TELEGRAM_TOKEN    bot token from @BotFather
 *   TELEGRAM_CHAT_ID  group id, e.g. -100xxxxxxxxxx (message @userinfobot)
 *
 * Two rules this file will not break:
 *
 *   1. It never throws and never rejects. An alert failing must not turn a
 *      successful payment into a 500 that Razorpay then retries. Every path
 *      returns, including "not configured", which is a silent no-op.
 *   2. It never sends anything derived from an unverified request body. Alert
 *      text is composed here from values the caller has already validated.
 *      Customer emails, contact numbers and payment payloads stay out.
 *
 * This file lives under src/server/ and is blocked from client bundles by the
 * TanStack Start importProtection in vite.config.ts. The bot token must never
 * reach a browser.
 */

const TELEGRAM_API = "https://api.telegram.org";

/** How long to wait on Telegram before giving up and letting the request finish. */
const SEND_TIMEOUT_MS = 4000;

export type AlertSeverity = "critical" | "warning" | "info";

const SEVERITY_PREFIX: Record<AlertSeverity, string> = {
  critical: "🔴 CRITICAL",
  warning: "🟠 WARNING",
  info: "🔵 INFO",
};

export interface Alert {
  severity: AlertSeverity;
  /** Short headline, e.g. "Razorpay webhook failed". */
  title: string;
  /**
   * Key/value detail lines. Keep these to identifiers and counts — never
   * customer contact details, never a raw payload, never a token.
   */
  detail?: Record<string, string | number | null | undefined>;
  /**
   * Throttle key. Alerts sharing a key are sent at most once per
   * THROTTLE_WINDOW_MS. Defaults to the title, which is usually what you want:
   * a Razorpay retry storm should produce one message, not forty.
   */
  throttleKey?: string;
}

const THROTTLE_WINDOW_MS = 5 * 60_000;

/**
 * Last-sent timestamps, per instance.
 *
 * Same caveat as the AI rate limiter in src/lib/ai.ts: this resets with the
 * serverless instance, so a burst spread across several cold starts can send
 * more than one message. That is the right trade here — the alternative is a
 * database round trip on the failure path, which is exactly when the database
 * is the thing most likely to be broken.
 */
const lastSentAt = new Map<string, number>();

function token(): string {
  return (process.env.TELEGRAM_TOKEN ?? "").trim();
}

function chatId(): string {
  return (process.env.TELEGRAM_CHAT_ID ?? "").trim();
}

export function telegramConfigured(): boolean {
  return Boolean(token() && chatId());
}

/** Telegram's HTML parse mode needs exactly these three escaped. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function render(alert: Alert): string {
  const lines = [
    `${SEVERITY_PREFIX[alert.severity]} · <b>${escapeHtml(alert.title)}</b>`,
  ];

  for (const [key, value] of Object.entries(alert.detail ?? {})) {
    if (value === null || value === undefined || value === "") continue;
    lines.push(`${escapeHtml(key)}: <code>${escapeHtml(String(value))}</code>`);
  }

  lines.push(`<i>Dombelz · ${new Date().toISOString()}</i>`);
  return lines.join("\n");
}

/**
 * Send one alert. Awaited by callers, because a floating promise is killed when
 * a serverless function returns — but bounded by SEND_TIMEOUT_MS so a hanging
 * Telegram cannot hold a webhook response open until Razorpay times out and
 * retries.
 *
 * Returns whether the message was actually sent, for tests and the debug route.
 * Callers in request paths should ignore it.
 */
export async function sendAlert(alert: Alert): Promise<boolean> {
  if (!telegramConfigured()) return false;

  const key = alert.throttleKey ?? alert.title;
  const now = Date.now();
  const previous = lastSentAt.get(key) ?? 0;
  if (now - previous < THROTTLE_WINDOW_MS) return false;
  // Recorded before the await, so concurrent callers on this instance cannot
  // both pass the check and both send.
  lastSentAt.set(key, now);

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token()}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId(),
        text: render(alert),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!res.ok) {
      // Logged without the response body: a 401 from Telegram echoes nothing
      // useful, and this is the one place a token could surface in a log.
      console.warn(`[telegram] sendMessage returned ${res.status}`);
      // Failed sends should not hold the throttle window closed.
      lastSentAt.delete(key);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(
      "[telegram] alert not delivered:",
      e instanceof Error ? e.message : String(e),
    );
    lastSentAt.delete(key);
    return false;
  }
}
