/**
 * Who may make the ops agent change something.
 *
 * Reads are open to the allowlisted chat. Writes are restricted to the group's
 * OWNER — Telegram's `creator` status, which exactly one account holds.
 * Administrators are explicitly not enough: promoting someone to admin is a
 * routine, reversible convenience, and it must not silently hand them the
 * ability to grant paid access.
 *
 * Membership is asked of Telegram rather than stored, so removing someone from
 * the group removes their authority immediately. The answer is cached briefly:
 * ownership changes perhaps once in the life of a group, and a live API call on
 * the path of every message would add latency to the common case for no real
 * gain.
 */

const OWNER_CACHE_MS = 10 * 60_000;

let cachedOwner: { chatId: string; userId: number; at: number } | null = null;

/**
 * The Telegram user id of the group's creator, or null if it cannot be
 * determined.
 *
 * Null is treated as "no", never as "yes": an outage on Telegram's side must
 * not become an open door.
 */
export async function chatOwnerId(chatId: string): Promise<number | null> {
  const token = (process.env.TELEGRAM_TOKEN ?? "").trim();
  if (!token) return null;

  if (
    cachedOwner &&
    cachedOwner.chatId === chatId &&
    Date.now() - cachedOwner.at < OWNER_CACHE_MS
  ) {
    return cachedOwner.userId;
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getChatAdministrators`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId }),
        signal: AbortSignal.timeout(5000),
      },
    );
    const json = (await res.json()) as {
      ok?: boolean;
      result?: { status?: string; user?: { id?: number } }[];
    };
    if (!json.ok || !Array.isArray(json.result)) return null;

    // "creator" is the owner. "administrator" deliberately does not match.
    const owner = json.result.find((m) => m.status === "creator");
    const id = owner?.user?.id;
    if (typeof id !== "number") return null;

    cachedOwner = { chatId, userId: id, at: Date.now() };
    return id;
  } catch {
    return null;
  }
}

/** May this person make changes? Owner only. */
export async function canWrite(
  chatId: string,
  userId: number | undefined,
): Promise<boolean> {
  if (typeof userId !== "number") return false;
  const owner = await chatOwnerId(chatId);
  return owner !== null && owner === userId;
}

/**
 * A code the operator types back to confirm.
 *
 * Six characters from an unambiguous alphabet — no O/0, no I/1/L — because it
 * is read off a phone screen and retyped, often in a hurry. Randomness comes
 * from a CSPRNG: short is fine, guessable is not, and the window is minutes.
 */
export function confirmationCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
