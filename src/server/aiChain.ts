/**
 * Runs one AI request as a single call to one model inside a time budget. No
 * fallback, no retry, no model switch: the user's rule (2026-10-15) is one
 * Gemini Lite call that gets the whole budget. The calls themselves live in
 * aiRoutes.ts.
 *
 * Deliberately import-free so its self-check (aiChain.test.ts) runs under
 * plain node.
 */

/** Message prefix the client matches to show the "AI is busy" copy. */
export const AI_BUSY = "AI_BUSY";

export type Provider = "gemini";

export class AiHttpError extends Error {
  status: number;
  provider: Provider;
  /** From Gemini's RetryInfo, when it sent one. */
  retryAfterMs: number | null;
  /** Which quota a 429 broke: per-minute clears in seconds, daily at midnight Pacific. */
  quota: "minute" | "day" | null;

  constructor(
    status: number,
    provider: Provider,
    retryAfterMs: number | null,
    message: string,
    quota: "minute" | "day" | null = null,
  ) {
    super(message);
    this.status = status;
    this.provider = provider;
    this.retryAfterMs = retryAfterMs;
    this.quota = quota;
  }
}

export interface Step {
  provider: Provider;
  model: string;
  run(signal: AbortSignal): Promise<string>;
}

export interface ChainResult {
  text: string;
  model: string;
  provider: Provider;
}

const isTimeout = (e: unknown) =>
  e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");

/** Capacity, not a wrong request: a 5xx, a 429, a timeout or a network drop. */
function isBusy(e: unknown) {
  if (e instanceof AiHttpError) return e.status === 429 || e.status >= 500;
  return isTimeout(e) || e instanceof TypeError;
}

export async function runOnce(
  step: Step,
  opts: { budgetMs: number; label: string },
): Promise<ChainResult> {
  const ctrl = new AbortController();
  // Not AbortSignal.timeout: its timer is unref'd, so an otherwise idle
  // process can exit (or a frozen instance never wake) before it fires.
  const timer = setTimeout(
    () =>
      ctrl.abort(new DOMException(`${step.model} timed out`, "TimeoutError")),
    opts.budgetMs,
  );
  const start = Date.now();
  try {
    const text = await step.run(ctrl.signal);
    return { text, model: step.model, provider: step.provider };
  } catch (e) {
    console.warn(
      `[ai] ${opts.label} ${step.model} failed after ${Date.now() - start} ms`,
      e instanceof Error ? e.message.slice(0, 200) : e,
    );
    if (isBusy(e))
      throw new Error(
        `${AI_BUSY}: ${step.model} for ${opts.label} was busy or out of time`,
      );
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
