/**
 * Runs one AI request down an ordered list of models inside a time budget, so
 * a Gemini 503, a 429 or a stall costs the user a model switch rather than an
 * error. The chains themselves live in aiRoutes.ts; the rules — which failures
 * retry, which move on, which skip a provider — live here, once.
 *
 * Deliberately import-free so its self-check (aiChain.test.ts) runs under
 * plain node.
 */

/** Message prefix the client matches to show the "AI is busy" copy. */
export const AI_BUSY = "AI_BUSY";

export type Provider = "gemini" | "groq";

export class AiHttpError extends Error {
  status: number;
  provider: Provider;
  /** From Gemini's RetryInfo or Groq's retry-after, when the provider sent one. */
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

/** Gemini's daily quotas reset at midnight Pacific time. */
export function msUntilPacificMidnight(now = Date.now()) {
  const pt = new Date(
    new Date(now).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
  );
  const next = new Date(pt);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - pt.getTime();
}

export interface Step {
  provider: Provider;
  model: string;
  run(signal: AbortSignal): Promise<string>;
  /**
   * A deliberate second try at a model already earlier in the chain. It runs
   * through the busy cooldown its first try just set (a 503 may clear), never
   * through a 429's (a quota will not), and it is the first thing dropped
   * when time is short.
   */
  retry?: boolean;
}

export interface ChainResult {
  text: string;
  model: string;
  provider: Provider;
  /** True when the first step answered. */
  primary: boolean;
}

type Kind = "busy" | "limited" | "key" | "bad";

const isTimeout = (e: unknown) =>
  e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");

function classify(e: unknown): Kind {
  if (e instanceof AiHttpError) {
    if (e.status === 429) return "limited";
    if (
      e.status === 401 ||
      e.status === 403 ||
      (e.status === 400 && /API_KEY_INVALID|API key not valid/.test(e.message))
    )
      return "key";
    if (e.status >= 500) return "busy";
    return "bad";
  }
  // AbortSignal.timeout rejects with a TimeoutError and fetch's network failure
  // is a TypeError: both mean "the provider did not answer", not "the request
  // is wrong".
  if (isTimeout(e) || e instanceof TypeError) return "busy";
  return "bad";
}

// Per instance. Fluid Compute reuses instances across requests, so at peak one
// 503 spares the next requests on this instance from waiting on the same model.
// ponytail: per-instance memory; a shared store (Redis) if cross-instance matters.
const cooledUntil = new Map<string, { until: number; busy: boolean }>();
const BUSY_COOL_MS = 10_000;
/** RPM windows are one minute; used when a 429 carries no retryDelay. */
const LIMIT_COOL_MS = 60_000;
/** Starting an attempt with less left than this only burns the budget. */
const MIN_START_MS = 800;
/**
 * The primary may spend at most this share of the budget while a fallback is
 * still available. Seen live: under load Gemini took seconds to return its
 * 503, and the chain gave up without ever trying the next model.
 */
const PRIMARY_SHARE = 0.5;
/**
 * Time a fallback leaves for the next live model. Seen live: lite stalled for
 * the full attempt cap and Groq, which answered in ~1.5 s when given the
 * chance, never ran.
 */
const NEXT_RESERVE_MS = 2000;

export function _resetCooldowns() {
  cooledUntil.clear();
}

function isCooled(s: Step) {
  const c = cooledUntil.get(s.model);
  if (!c || c.until <= Date.now()) return false;
  return !(s.retry && c.busy);
}

export async function runChain(
  steps: Step[],
  opts: {
    budgetMs: number;
    attemptMs: number;
    label: string;
    /**
     * The user's photo rule: once two models have failed on capacity, Groq is
     * tried next and the remaining Gemini steps only if Groq fails too. Off
     * for search, whose order the user set step by step.
     */
    groqJump?: boolean;
  },
): Promise<ChainResult> {
  const start = Date.now();
  const deadline = start + opts.budgetMs;
  const primaryDeadline = start + opts.budgetMs * PRIMARY_SHARE;
  const deadProviders = new Set<Provider>();
  // Reordered below, so a copy: the caller's list is its own.
  const order = [...steps];
  /** Distinct models that failed on capacity during this request. */
  const capacityFailed = new Set<string>();
  let sawCapacity = false;
  let lastErr: unknown = null;

  for (let i = 0; i < order.length; i++) {
    const s = order[i];
    if (deadProviders.has(s.provider)) continue;
    const remaining = deadline - Date.now();
    if (remaining < MIN_START_MS) {
      sawCapacity = true;
      break;
    }
    // A cooled model is skipped only while something uncooled is still ahead;
    // when everything is cooled, trying beats failing instantly.
    const liveAhead = order
      .slice(i + 1)
      .some((n) => !deadProviders.has(n.provider) && !isCooled(n));
    if (isCooled(s) && liveAhead) continue;

    // The primary works inside its own window while a fallback is available;
    // a fallback leaves room for the next one. When that reserve would leave
    // too little to answer, a retry is dropped, and any other step is the last
    // realistic attempt and takes everything left.
    const reserved = remaining - NEXT_RESERVE_MS;
    if (liveAhead && i > 0 && reserved < MIN_START_MS && s.retry) continue;
    const window = !liveAhead
      ? remaining
      : i === 0
        ? Math.max(
            MIN_START_MS,
            Math.min(remaining, primaryDeadline - Date.now()),
          )
        : reserved >= MIN_START_MS
          ? reserved
          : remaining;

    // Not AbortSignal.timeout: its timer is unref'd, so an otherwise idle
    // process can exit (or a frozen instance never wake) before it fires.
    const ctrl = new AbortController();
    const timer = setTimeout(
      () =>
        ctrl.abort(new DOMException(`${s.model} timed out`, "TimeoutError")),
      // The last live model is the last chance: it may use all that is left.
      liveAhead ? Math.min(window, opts.attemptMs) : window,
    );
    const attemptStart = Date.now();
    try {
      const text = await s.run(ctrl.signal);
      if (i > 0)
        console.info(
          `[ai-chain] ${opts.label} answered by fallback ${s.model} in ${Date.now() - start} ms`,
        );
      return { text, model: s.model, provider: s.provider, primary: i === 0 };
    } catch (e) {
      lastErr = e;
      const kind = classify(e);
      console.warn(
        `[ai-chain] ${opts.label} ${s.model} failed (${kind}) after ${Date.now() - attemptStart} ms`,
        e instanceof Error ? e.message.slice(0, 200) : e,
      );
      if (kind === "key") {
        deadProviders.add(s.provider);
        continue;
      }
      if (kind === "bad") continue;
      sawCapacity = true;
      capacityFailed.add(s.model);
      // RPM hit: step aside briefly; the primary is back once the minute
      // clears. RPD hit: the model is out until the daily reset, so the next
      // model carries the rest of the day.
      const http = e instanceof AiHttpError ? e : null;
      const coolMs =
        kind !== "limited"
          ? BUSY_COOL_MS
          : http?.quota === "day"
            ? msUntilPacificMidnight()
            : (http?.retryAfterMs ?? LIMIT_COOL_MS);
      cooledUntil.set(s.model, {
        until: Date.now() + coolMs,
        busy: kind === "busy",
      });
      // The user's rule: once two models have failed on capacity, Groq is
      // tried next, and the remaining Gemini models only if Groq fails too.
      // Gemini models share one overloaded backend far more than they share
      // one with Groq.
      if (opts.groqJump && capacityFailed.size >= 2) {
        const j = order.findIndex((n, k) => k > i + 1 && n.provider === "groq");
        if (j !== -1) order.splice(i + 1, 0, ...order.splice(j, 1));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  if (sawCapacity || lastErr === null)
    throw new Error(
      `${AI_BUSY}: every model for ${opts.label} was busy or out of time`,
    );
  throw lastErr;
}
