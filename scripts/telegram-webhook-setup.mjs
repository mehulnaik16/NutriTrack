/**
 * Register (or inspect) the Telegram webhook for the ops agent.
 *
 * Reads TELEGRAM_TOKEN and TELEGRAM_WEBHOOK_SECRET straight from .env so the
 * bot token never has to be typed into a terminal, pasted into a chat, or left
 * in shell history.
 *
 *   node scripts/telegram-webhook-setup.mjs https://your-domain.vercel.app
 *   node scripts/telegram-webhook-setup.mjs --info      # what is registered now
 *   node scripts/telegram-webhook-setup.mjs --delete    # unregister
 *
 * Registering a webhook disables getUpdates polling, so run --delete first if
 * you ever need to look up a chat id again.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Minimal .env reader — no dependency, and this only needs KEY=value lines. */
function readEnv() {
  let raw;
  try {
    raw = readFileSync(resolve(root, ".env"), "utf8");
  } catch {
    fail("No .env file found. Copy .env.example and fill it in.");
  }
  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

function fail(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

const env = readEnv();
const token = env.TELEGRAM_TOKEN;
const secret = env.TELEGRAM_WEBHOOK_SECRET;
const chatId = env.TELEGRAM_CHAT_ID;

if (!token) fail("TELEGRAM_TOKEN is empty in .env");
if (!secret) fail("TELEGRAM_WEBHOOK_SECRET is empty in .env");
if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
  fail(
    "TELEGRAM_WEBHOOK_SECRET contains characters Telegram rejects.\n" +
      "    Allowed: A-Z a-z 0-9 _ - (1-256 chars).",
  );
}
if (!chatId) {
  console.warn(
    "  ! TELEGRAM_CHAT_ID is empty — the agent will ignore every message until it is set.",
  );
}

const api = (method) => `https://api.telegram.org/bot${token}/${method}`;

async function call(method, body) {
  const res = await fetch(api(method), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) {
    fail(`${method} failed: ${json.description ?? res.status}`);
  }
  return json.result;
}

const arg = process.argv[2];

if (arg === "--info") {
  const [info, me] = await Promise.all([
    call("getWebhookInfo"),
    call("getMe"),
  ]);
  console.log(`\n  Bot        @${me.username}  (${me.first_name})`);
  console.log(`  Webhook    ${info.url || "(none registered)"}`);
  console.log(`  Secret     ${info.has_custom_certificate ? "custom cert" : "header token"}`);
  console.log(`  Pending    ${info.pending_update_count} update(s) queued`);
  if (info.last_error_message) {
    console.log(
      `\n  ✗ Last delivery error: ${info.last_error_message}` +
        `\n    at ${new Date(info.last_error_date * 1000).toISOString()}`,
    );
    console.log(
      "    A 403 here usually means TELEGRAM_WEBHOOK_SECRET differs between .env and the deployment.",
    );
  } else {
    console.log("\n  ✓ No delivery errors reported.");
  }
  console.log(
    "\n  Reminder: privacy mode must be DISABLED in BotFather (/setprivacy),",
  );
  console.log(
    "  and the bot re-added to the group afterwards, or plain questions never arrive.\n",
  );
  process.exit(0);
}

if (arg === "--delete") {
  await call("deleteWebhook", { drop_pending_updates: true });
  console.log("\n  ✓ Webhook removed. getUpdates polling works again.\n");
  process.exit(0);
}

if (!arg || !arg.startsWith("https://")) {
  fail(
    "Pass your deployment's HTTPS origin, e.g.\n" +
      "    node scripts/telegram-webhook-setup.mjs https://dombelz.vercel.app\n\n" +
      "  Telegram refuses plain http, so a local dev server cannot receive webhooks\n" +
      "  directly — deploy first, or tunnel with something like ngrok.",
  );
}

const url = `${arg.replace(/\/+$/, "")}/api/telegram-webhook`;

await call("setWebhook", {
  url,
  secret_token: secret,
  // Everything else (edits, joins, reactions) is noise the handler drops anyway;
  // not subscribing to it keeps the function from waking for nothing.
  allowed_updates: ["message"],
  drop_pending_updates: true,
});

const me = await call("getMe");
console.log(`\n  ✓ Webhook registered for @${me.username}`);
console.log(`    ${url}`);
console.log(
  `\n  The secret is sent as X-Telegram-Bot-Api-Secret-Token on every delivery.`,
);
console.log(
  `  It must match TELEGRAM_WEBHOOK_SECRET in the deployment's env vars, not just .env —`,
);
console.log(
  `  otherwise every delivery is refused with 403 and the bot goes silent.\n`,
);
