import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (
    request: Request,
    env: unknown,
    ctx: unknown,
  ) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) =>
        (m as { default?: ServerEntry }).default ??
        (m as unknown as ServerEntry),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(
  body: string,
  responseStatus: number,
): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(
  response: Response,
): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(
    consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`),
  );
  return brandedErrorResponse();
}

/**
 * The Razorpay webhook is handled here rather than as a route file: this
 * version of @tanstack/react-start has no `server` option on route options, and
 * the entry already sees every request. It is intercepted before the router so
 * an unauthenticated POST never touches SSR — Razorpay carries no Supabase JWT,
 * and the HMAC inside the handler is the authentication.
 *
 * Dynamically imported so the module, and its reads of the Razorpay secrets,
 * only load on an actual webhook request.
 */
const RAZORPAY_WEBHOOK_PATH = "/api/razorpay-webhook";

/**
 * The ops agent's inbound webhook. Intercepted here for the same reason as
 * Razorpay: Telegram carries no Supabase JWT, and the secret-token header
 * inside the handler is the authentication.
 */
const TELEGRAM_WEBHOOK_PATH = "/api/telegram-webhook";

/**
 * The daily digest, driven by Vercel Cron. Authenticated by CRON_SECRET inside
 * the handler rather than here, so the route stays a plain dispatch.
 */
const OPS_DIGEST_PATH = "/api/ops-digest";

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const { pathname } = new URL(request.url);

      if (pathname === RAZORPAY_WEBHOOK_PATH) {
        const { handleRazorpayWebhook } =
          await import("./server/razorpay-webhook");
        return await handleRazorpayWebhook(request);
      }

      if (pathname === TELEGRAM_WEBHOOK_PATH) {
        const { handleTelegramWebhook } =
          await import("./server/telegram-webhook");
        return await handleTelegramWebhook(request);
      }

      if (pathname === OPS_DIGEST_PATH) {
        const { handleOpsDigest } = await import("./server/ops-digest");
        return await handleOpsDigest(request);
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
