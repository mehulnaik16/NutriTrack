/**
 * What a person sees when an AI call fails. Never the raw error: a provider
 * message ("Gemini error 503 (gemini-3.7-flash): …") means nothing to someone
 * logging lunch and reads as the app being broken. The detail goes to the
 * console for us; the person gets a sentence they can act on.
 */
import { toast } from "sonner";

// Must match AI_BUSY in src/server/aiChain.ts — that file is server-only and
// cannot be imported into client code.
const AI_BUSY = "AI_BUSY";

export const isAiBusy = (e: unknown) =>
  e instanceof Error && e.message.includes(AI_BUSY);

const isRateLimited = (e: unknown) =>
  e instanceof Error && e.message.includes("Rate limit exceeded");

/** Toast the friendly copy for an AI failure; `what` names the action for the log. */
export function toastAiError(e: unknown, what: string) {
  console.error(`[ai] ${what} failed`, e);
  if (isAiBusy(e))
    toast.error("AI is extra busy right now", {
      description:
        "High demand is slowing us down. Please try again in a few seconds!",
    });
  else if (isRateLimited(e))
    toast.error("That's a lot of requests at once", {
      description: "Give it a minute, then try again.",
    });
  else
    toast.error("Something went wrong on our side", {
      description: "Please try again in a moment.",
    });
}
