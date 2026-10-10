/**
 * Browser cache for a user's log rows (web only).
 *
 * Every row of the four cached tables lives in IndexedDB, in two parts:
 *  - frozen: dated before `frozenUpTo` (~8 days back). enforce_log_edit_window
 *    blocks inserts and updates to these, so they only change by deletion or
 *    service-role SQL.
 *  - recent: everything newer, still editable.
 *
 * Two counters on user_profiles, bumped by DB triggers (migrations
 * 20261007130000_history_version, 20261007150000_log_version), validate it:
 *  - log_version: any change to any row → refetch the recent part only.
 *  - history_version: a frozen row changed → refetch everything once.
 * Neither changed → every row comes from the browser, no data request at all.
 *
 * Each day as the cutoff moves forward, recent rows that crossed it simply move
 * to the frozen part, with no download.
 *
 * One counter read is shared by all callers for VERSION_TTL_MS, and is dropped
 * the moment this tab writes to a cached table (see the fetch hook in
 * integrations/client.ts), so your own changes show up on the next read.
 *
 * Skipped in the Capacitor app (app-level caching comes later) and wherever
 * IndexedDB is unavailable: those read everything live, as before.
 */
import { supabase } from "@/integrations/client";
import type { Tables } from "@/integrations/types";
import { FROZEN_DAYS } from "@/lib/cacheRules";
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
type Versions = { history: number; log: number; plan: number; profile: number };
type Saved = Versions & { frozenUpTo: string; rows: unknown[] };

const PAGE = 1000; // PostgREST's per-request row cap
const VERSION_TTL_MS = 3000;

// 8, not 7: the DB counts days in user_profiles.timezone and the device in its
// own clock. The margin keeps a row the DB still lets you edit out of the
// frozen part.
const frozenBefore = () => daysAgoLocal(FROZEN_DAYS);

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

const cacheUsable = () => typeof indexedDB !== "undefined" && !isNativeApp();

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
    // food_logs.date is nullable; an undated row is never frozen, so the
    // recent part must include it.
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

// One counter read shared by every caller for a few seconds: a page's streak,
// calendar, header and charts all ask at once.
let versions: {
  userId: string;
  at: number;
  p: Promise<Versions | null>;
} | null = null;

function getVersions(userId: string): Promise<Versions | null> {
  if (versions?.userId === userId && Date.now() - versions.at < VERSION_TTL_MS)
    return versions.p;
  const p = Promise.resolve(
    supabase
      .from("user_profiles")
      .select("history_version, log_version, plan_version, profile_version")
      .eq("id", userId)
      .maybeSingle(),
  ).then(({ data }) =>
    data
      ? {
          history: data.history_version,
          log: data.log_version,
          plan: data.plan_version,
          profile: data.profile_version,
        }
      : null,
  );
  versions = { userId, at: Date.now(), p };
  p.then((v) => v === null && (versions = null)); // don't keep a failed read
  return p;
}

// A write from this tab to a cached table: forget the shared counter read so
// the very next read sees the bump. Fired by the fetch hook in client.ts.
const WRITE_URL =
  // Any RPC counts: several "reads" write too (get_billing_summary recomputes
  // access_until), and a spare counter check costs one tiny request.
  /\/rest\/v1\/(food_logs|workout_logs|weight_entries|body_measurements|workout_plans|workout_profile|user_profiles)\b|\/rest\/v1\/rpc\//;
/**
 * For writes the fetch hook can't see — server functions (billing) write with
 * the service role from the server — call this once they succeed.
 */
export const forgetCounterCheck = () => {
  versions = null;
};

if (typeof window !== "undefined") {
  window.addEventListener("dombelz:write", (e) => {
    if (WRITE_URL.test((e as CustomEvent<string>).detail)) versions = null;
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

const inFlight = new Map<string, Promise<unknown[]>>();

/**
 * Every row of `table` for this user, oldest date first. Callers filter, sort
 * and project in memory.
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
  const [v, saved] = await Promise.all([
    getVersions(userId),
    idbCall<Saved | undefined>("readonly", (s) => s.get(key)).catch(
      () => undefined,
    ),
  ]);
  if (!v) return fetchRows(userId, table, null);

  const cutoff = frozenBefore();
  const save = (rows: Row<T>[]) => {
    const rec: Saved = { ...v, frozenUpTo: cutoff, rows };
    idbCall("readwrite", (s) => s.put(rec, key)).catch(() => {});
    return rows;
  };

  // No cache, an old row changed, or the clock went backwards: start over.
  if (!saved || saved.history !== v.history || saved.frozenUpTo > cutoff)
    return save(await fetchRows(userId, table, null));

  const rows = saved.rows as Row<T>[];

  // Nothing changed anywhere. Days that crossed the cutoff since last time
  // just move to the frozen part (frozenUpTo advances), no download.
  if (saved.log === v.log) {
    if (saved.frozenUpTo !== cutoff) save(rows);
    return rows;
  }

  // Something recent changed: keep the frozen part, refetch the rest.
  const col = DATE_COL[table];
  const frozen = rows.filter((r) => {
    const d = (r as Record<string, unknown>)[col] as string | null;
    return d !== null && d < saved.frozenUpTo;
  });
  return save(frozen.concat(await fetchRows(userId, table, saved.frozenUpTo)));
}

// ── Single cached rows (plan, workout prefs, profile) ────────────────────────

type RowName = "plan" | "prefs" | "profile";
const ROW_COUNTER: Record<RowName, "plan" | "profile"> = {
  plan: "plan", // latest workout_plans row
  prefs: "plan", // workout_profile — same counter, same triggers
  profile: "profile", // user_profiles select("*")
};
type Result = { data: unknown; error: unknown };
const rowInFlight = new Map<string, Promise<Result>>();

/**
 * One rarely-changing row, validated before it is shown: the saved copy is used
 * only if its counter (plan_version / profile_version, migration
 * 20261007170000_config_versions) still matches; otherwise `fetch` runs and its
 * answer is saved. Same `{ data, error }` shape as a Supabase query, so callers
 * keep their error handling. Errors and "no row" are never cached.
 */
export function getCachedRow<F extends () => PromiseLike<Result>>(
  userId: string,
  name: RowName,
  fetch: F,
): Promise<Awaited<ReturnType<F>>> {
  const key = `${userId}:${name}`;
  let p = rowInFlight.get(key);
  if (!p) {
    p = loadRow(userId, name, key, fetch).finally(() =>
      rowInFlight.delete(key),
    );
    rowInFlight.set(key, p);
  }
  // A private copy per caller: pages mutate the profile object they get.
  // (structuredClone is missing before Safari 15.4; these rows are plain JSON.)
  const clone = (x: unknown) =>
    typeof structuredClone === "function"
      ? structuredClone(x)
      : JSON.parse(JSON.stringify(x));
  return p.then((r) => ({
    ...r,
    data: r.data && clone(r.data),
  })) as Promise<Awaited<ReturnType<F>>>;
}

async function loadRow(
  userId: string,
  name: RowName,
  key: string,
  fetch: () => PromiseLike<Result>,
): Promise<Result> {
  if (!cacheUsable()) return fetch();
  const [v, saved] = await Promise.all([
    getVersions(userId),
    idbCall<{ version: number; row: unknown } | undefined>("readonly", (s) =>
      s.get(key),
    ).catch(() => undefined),
  ]);
  const version = v?.[ROW_COUNTER[name]];
  if (version !== undefined && saved && saved.version === version)
    return { data: saved.row, error: null };

  const res = await fetch(); // read after the counter, so it is at least as new
  if (version !== undefined && !res.error && res.data !== null)
    idbCall("readwrite", (s) => s.put({ version, row: res.data }, key)).catch(
      () => {},
    );
  return res;
}

type Cached<T> = Promise<{ data: T | null; error: unknown }>;

/** The user's latest workout plan row (AI or custom), validated. */
export const getPlanRow = (userId: string): Cached<Tables<"workout_plans">> =>
  getCachedRow(userId, "plan", () =>
    supabase
      .from("workout_plans")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ) as Cached<Tables<"workout_plans">>;

/** The user's workout_profile row (questionnaire + units), validated. */
export const getPrefsRow = (
  userId: string,
): Cached<Tables<"workout_profile">> =>
  getCachedRow(userId, "prefs", () =>
    supabase
      .from("workout_profile")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
  ) as Cached<Tables<"workout_profile">>;

/** The user's whole user_profiles row, validated. */
export const getProfileRow = (
  userId: string,
): Cached<Tables<"user_profiles">> =>
  getCachedRow(userId, "profile", () =>
    supabase.from("user_profiles").select("*").eq("id", userId).maybeSingle(),
  ) as Cached<Tables<"user_profiles">>;

/** Forget this user's cached history (sign-out, so the next person can't read it). */
export async function clearHistoryCache(userId: string): Promise<void> {
  versions = null;
  if (typeof indexedDB === "undefined") return;
  await Promise.all(
    [...Object.keys(DATE_COL), ...Object.keys(ROW_COUNTER)].map((t) =>
      idbCall("readwrite", (s) => s.delete(`${userId}:${t}`)).catch(() => {}),
    ),
  );
}

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
export function dayLogs<
  R extends { date: string | null; logged_at: string | null },
>(rows: R[], date: string): R[] {
  const key = (r: R) => r.logged_at ?? "￿"; // Postgres sorts nulls last
  return rows
    .filter((r) => r.date === date)
    .sort((a, b) => key(a).localeCompare(key(b)));
}
