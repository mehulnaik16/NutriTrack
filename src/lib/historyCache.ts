/**
 * Browser cache for a user's old log rows (web only).
 *
 * Rows dated more than 7 days back are frozen: enforce_log_edit_window blocks
 * every insert and update to them, so they only ever change by being deleted
 * (or by service-role SQL). Those rows live in IndexedDB indefinitely; each
 * read fetches only the recent tail plus user_profiles.history_version, which
 * DB triggers bump whenever an old row changes (migration
 * 20261007130000_history_version). A version mismatch drops the cache and
 * refetches everything once — that is how a delete on another device shows up.
 *
 * Skipped in the Capacitor app (app-level caching comes later) and wherever
 * IndexedDB is unavailable: those read everything live, as before.
 */
import { supabase } from "@/integrations/client";
import type { Tables } from "@/integrations/types";
import { daysAgoLocal } from "@/lib/dates";
import { isNativeApp } from "@/lib/platform";

const DATE_COL = {
  food_logs: "date",
  workout_logs: "date",
  weight_entries: "date",
  body_measurements: "measured_at",
} as const;

export type CachedTable = keyof typeof DATE_COL;
type Row<T extends CachedTable> = Tables<T>;
type Record_ = { version: number; frozenUpTo: string; rows: unknown[] };

const PAGE = 1000; // PostgREST's per-request row cap

// 8, not 7: the DB counts days in user_profiles.timezone and the device in its
// own clock. The margin keeps a row the DB still lets you edit out of the cache.
const frozenBefore = () => daysAgoLocal(8);

// ── IndexedDB (native API, one object store keyed `${userId}:${table}`) ──────

const STORE = "rows";
let dbp: Promise<IDBDatabase> | undefined;

function idb(): Promise<IDBDatabase> {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open("dombelz-history", 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  dbp.catch(() => (dbp = undefined)); // blocked storage: retry next time
  return dbp;
}

function idbCall<T>(
  mode: IDBTransactionMode,
  op: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return idb().then(
    (db) =>
      new Promise<T>((res, rej) => {
        const req = op(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      }),
  );
}

const cacheUsable = () =>
  typeof indexedDB !== "undefined" && !isNativeApp();

// ── Network ──────────────────────────────────────────────────────────────────

/** All of the user's rows dated on/after `from` (or all rows), oldest first. */
async function fetchRows<T extends CachedTable>(
  userId: string,
  table: T,
  from: string | null,
): Promise<Row<T>[]> {
  const col = DATE_COL[table];
  const out: Row<T>[] = [];
  for (let start = 0; ; start += PAGE) {
    let q = supabase
      .from(table as CachedTable)
      .select("*")
      .eq("user_id", userId);
    // food_logs.date is nullable; an undated row is never frozen, so the tail
    // must include it.
    if (from) q = q.or(`${col}.gte.${from},${col}.is.null`);
    const { data, error } = await q
      .order(col, { ascending: true })
      .order("id", { ascending: true })
      .range(start, start + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as Row<T>[]));
    if (!data || data.length < PAGE) return out;
  }
}

const versionInFlight = new Map<string, Promise<number | null>>();
function historyVersion(userId: string): Promise<number | null> {
  // The four tables are usually read together; ask once for all of them.
  let p = versionInFlight.get(userId);
  if (!p) {
    p = Promise.resolve(
      supabase
        .from("user_profiles")
        .select("history_version")
        .eq("id", userId)
        .maybeSingle(),
    )
      .then(({ data }) => data?.history_version ?? null)
      .finally(() => versionInFlight.delete(userId));
    versionInFlight.set(userId, p);
  }
  return p;
}

// ── Public API ───────────────────────────────────────────────────────────────

const inFlight = new Map<string, Promise<unknown[]>>();

/**
 * Every row of `table` for this user, oldest date first: frozen rows from the
 * browser cache plus a fresh read of everything newer. Callers filter, sort and
 * project in memory.
 */
export function getHistory<T extends CachedTable>(
  userId: string,
  table: T,
): Promise<Row<T>[]> {
  const key = `${userId}:${table}`;
  let p = inFlight.get(key);
  if (!p) {
    p = load(userId, table).finally(() => inFlight.delete(key));
    inFlight.set(key, p);
  }
  // A copy per caller: concurrent callers share one fetch, and one of them
  // sorting or reversing in place must not reorder the others' rows.
  return p.then((rows) => rows.slice()) as Promise<Row<T>[]>;
}

async function load<T extends CachedTable>(
  userId: string,
  table: T,
): Promise<Row<T>[]> {
  if (!cacheUsable()) return fetchRows(userId, table, null);

  const key = `${userId}:${table}`;
  const [version, saved] = await Promise.all([
    historyVersion(userId),
    idbCall<Record_ | undefined>("readonly", (s) => s.get(key)).catch(
      () => undefined,
    ),
  ]);
  if (version === null) return fetchRows(userId, table, null);

  const col = DATE_COL[table];
  const cutoff = frozenBefore();
  const isFrozen = (r: Row<T>) => {
    const d = (r as Record<string, unknown>)[col] as string | null;
    return d !== null && d < cutoff;
  };

  let frozen: Row<T>[];
  let tail: Row<T>[];
  if (saved && saved.version === version && saved.frozenUpTo <= cutoff) {
    frozen = saved.rows as Row<T>[];
    tail = await fetchRows(userId, table, saved.frozenUpTo);
  } else {
    frozen = [];
    tail = await fetchRows(userId, table, null);
  }

  // Days that froze since the last visit move from the tail into the cache.
  const newlyFrozen = tail.filter(isFrozen);
  const live = tail.filter((r) => !isFrozen(r));
  frozen = frozen.concat(newlyFrozen);

  if (!saved || saved.version !== version || newlyFrozen.length || saved.frozenUpTo !== cutoff) {
    const rec: Record_ = { version, frozenUpTo: cutoff, rows: frozen };
    idbCall("readwrite", (s) => s.put(rec, key)).catch(() => {});
  }
  return frozen.concat(live);
}

/** Forget this user's cached history (sign-out, so the next person can't read it). */
export async function clearHistoryCache(userId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await Promise.all(
    (Object.keys(DATE_COL) as CachedTable[]).map((t) =>
      idbCall("readwrite", (s) => s.delete(`${userId}:${t}`)).catch(() => {}),
    ),
  );
}

/** True when `date` is old enough to be served from the cache. */
export const isFrozenDate = (date: string) => date < frozenBefore();

/** Rows ordered by date, then logged_at — like `.order("date").order("logged_at")`. */
export function byDateThenTime<
  R extends { date: string | null; logged_at: string | null },
>(rows: R[], newestFirst: boolean): R[] {
  const k = (r: R) => `${r.date ?? ""} ${r.logged_at ?? ""}`;
  return rows.sort((a, b) =>
    newestFirst ? k(b).localeCompare(k(a)) : k(a).localeCompare(k(b)),
  );
}

/** One day's food logs from history, in `.order("logged_at")` order. */
export function dayLogs<R extends { date: string | null; logged_at: string | null }>(
  rows: R[],
  date: string,
): R[] {
  const key = (r: R) => r.logged_at ?? "￿"; // Postgres sorts nulls last
  return rows
    .filter((r) => r.date === date)
    .sort((a, b) => key(a).localeCompare(key(b)));
}
