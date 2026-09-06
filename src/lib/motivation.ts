/**
 * The 100-day morning motivation cycle.
 *
 * Which quote a user gets on a given day is computed, never stored. Two inputs
 * decide it: how many days have elapsed since their account was created, and a
 * per-user seed. That has three properties worth the arithmetic:
 *
 *   - Reinstalling the app cannot reset or skew the cycle. There is no local
 *     state to lose and no counter to drift.
 *   - The device can schedule 30 days ahead without asking anything, which is
 *     what makes on-device scheduling viable at all.
 *   - A server can reproduce the same answer later, unchanged, if push is ever
 *     added.
 *
 * Day 101 restarts the cycle in a *different order* rather than replaying day 1
 * verbatim: the shuffle is seeded with the cycle number as well as the user, so
 * each pass through the hundred is its own permutation.
 */

import {
  MOTIVATION_QUOTES,
  type MotivationQuote,
} from "@/data/motivationQuotes";

/** Length of one full pass. Derived, so removing a quote does not desync the UI. */
export const CYCLE_LENGTH = MOTIVATION_QUOTES.length;

/**
 * How many days of quotes to keep scheduled with the OS.
 *
 * iOS allows 64 pending local notifications per app, total — not per day. Ten
 * custom reminders cost one slot each (they repeat daily), leaving this window
 * plus room for snooze reschedules and the digest features still in backlog.
 * A user who does not open the app for this long stops receiving quotes until
 * they do; their custom reminders keep firing regardless, which is the thing
 * most likely to bring them back.
 */
export const MOTIVATION_WINDOW_DAYS = 30;

export interface MotivationUser {
  id: string;
  /** Account creation, from user_profiles.created_at. */
  createdAt: string | Date;
  /** IANA zone, from user_profiles.timezone. */
  timezone: string;
  /** user_profiles.motivation_seed. */
  motivationSeed: number;
}

export interface MotivationDay {
  /** Calendar date in the user's zone, "YYYY-MM-DD". */
  date: string;
  /** 1..CYCLE_LENGTH — what the UI shows as "Day 24 / 100". */
  dayNumber: number;
  /** 0 on the first pass through the set, 1 on the second, and so on. */
  cycle: number;
  quote: MotivationQuote;
}

// ── Calendar helpers ─────────────────────────────────────────────────────────

/**
 * The calendar date at an instant, in a given zone, as "YYYY-MM-DD".
 *
 * Day counting has to happen on calendar dates rather than elapsed milliseconds:
 * a user who signed up at 23:50 is on day 2 ten minutes later, and dividing a
 * duration by 86,400,000 would still say day 1. en-CA formats as ISO, which is
 * why it is the locale here and not the user's own.
 */
export function localDateKey(at: string | Date, timeZone: string): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Whole days from one "YYYY-MM-DD" to another. Negative if `to` precedes `from`. */
export function daysBetweenKeys(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  // Both sides are UTC midnight of a *calendar* date, so no zone offset or DST
  // transition can land between them and turn a day into 23 or 25 hours.
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}

/** Advance a "YYYY-MM-DD" key by whole days. */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

// ── Deterministic shuffle ────────────────────────────────────────────────────

/**
 * FNV-1a over the three inputs that define a permutation.
 *
 * Written with Math.imul and >>> 0 so it stays exact 32-bit across engines —
 * plain `*` would go through a double and diverge once the product exceeds 2^53,
 * which would mean a user's quote order changing between two devices.
 */
function permutationSeed(userId: string, seed: number, cycle: number): number {
  const input = `${userId}:${seed}:${cycle}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, and stable for the same seed on any engine. */
function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * The order this user reads the quotes in on a given pass.
 *
 * Fisher-Yates over indices, seeded per (user, cycle). Pass 0 is shuffled too,
 * so two users who sign up on the same morning do not receive identical quotes
 * for a hundred days.
 */
export function quoteOrder(
  userId: string,
  seed: number,
  cycle: number,
): number[] {
  const order = MOTIVATION_QUOTES.map((_, i) => i);
  const rand = mulberry32(permutationSeed(userId, seed, cycle));
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// ── The lookup ───────────────────────────────────────────────────────────────

/** The quote for one calendar date in the user's own zone. */
export function motivationFor(
  user: MotivationUser,
  on: string | Date = new Date(),
): MotivationDay {
  const startKey = localDateKey(user.createdAt, user.timezone);
  const dateKey =
    typeof on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(on)
      ? on
      : localDateKey(on, user.timezone);

  // Clamped: a clock set backwards, or a profile row back-dated by a support
  // fix, would otherwise index past the start of the array.
  const elapsed = Math.max(0, daysBetweenKeys(startKey, dateKey));

  const cycle = Math.floor(elapsed / CYCLE_LENGTH);
  const index = elapsed % CYCLE_LENGTH;

  return {
    date: dateKey,
    dayNumber: index + 1,
    cycle,
    quote:
      MOTIVATION_QUOTES[quoteOrder(user.id, user.motivationSeed, cycle)[index]],
  };
}

/**
 * The next `days` days of quotes, starting today in the user's zone.
 *
 * This is what the reconciler hands to the OS on every app foreground. It
 * recomputes the whole window rather than topping up the tail: the OS is the
 * only thing that knows what actually survived a reboot or a force-quit, and it
 * does not reliably say. A full rebuild is cheap and has one code path.
 */
export function motivationWindow(
  user: MotivationUser,
  days: number = MOTIVATION_WINDOW_DAYS,
  from: string | Date = new Date(),
): MotivationDay[] {
  const firstKey =
    typeof from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(from)
      ? from
      : localDateKey(from, user.timezone);

  return Array.from({ length: days }, (_, i) =>
    motivationFor(user, addDaysToKey(firstKey, i)),
  );
}
