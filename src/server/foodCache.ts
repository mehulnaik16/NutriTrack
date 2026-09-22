/**
 * All database access for the AI food cache.
 *
 * Server-only, like gemini.ts and groq.ts: the three cache tables grant to
 * service_role alone, so nothing here can run in a browser even by accident.
 *
 * Every function in this file swallows its own errors. A cache outage must
 * cost money, never break search — a failed read falls through to the AI call
 * and a failed write only delays a food reaching quorum.
 *
 * The `as any` casts below are the escape this codebase already uses for
 * service-role-only tables (see saved_meals in FoodSearch.tsx and food.tsx):
 * types.ts is generated from what the anon role can see, so the three cache
 * tables and the ai_verified_similar function are simply absent from it. The
 * row shapes are declared here instead, which is why nothing downstream of a
 * cast stays untyped.
 */
import {
  MACROS,
  type Macros,
  consolidate,
  crossCheckAliases,
  quorumPasses,
  scriptOf,
  searchKey,
} from "@/lib/foodCache";

/** A match good enough to serve without calling the model. */
export type CachedFood = Macros & {
  food_name: string;
  food_class: string;
  basis: "100g" | "piece";
  piece_g: number | null;
  /** False for a row still awaiting quorum, which the UI tags "estimated". */
  verified: boolean;
};

export type UnverifiedRow = Macros & {
  canonical_key: string;
  food_name: string;
  food_class: string;
  basis: "100g" | "piece";
  piece_g?: number;
  aliases: string[];
  engine: string;
  model: string;
};

/** What a read of ai_verified — or of the similarity RPC — hands back. */
type VerifiedRow = Macros & {
  canonical_key: string;
  food_name: string;
  food_class: string;
  basis: "100g" | "piece";
  piece_g: number | null;
  /** Present only on RPC rows. */
  sim?: number;
};

/** One stored answer, as recordAnswer reads it back out of ai_unverified. */
type GroupRow = Macros & {
  id: string;
  food_name: string;
  food_class: string;
  basis: "100g" | "piece";
  piece_g: number | null;
  aliases: string[] | null;
  model: string;
};

/** Typo tolerance within one script. */
const SIM_SAME_SCRIPT = 0.7;
/**
 * Across scripts the bar is higher. Transliteration noise is a different and
 * less trustworthy error class than a fat-fingered typo.
 */
const SIM_CROSS_SCRIPT = 0.85;

/**
 * supabase-js reports failures in `error` rather than throwing them, so a read
 * that comes back empty is indistinguishable from a miss unless the error is
 * pulled out and logged. Every call site below goes through this.
 */
const warn = (what: string, error: unknown) => {
  if (error) console.warn(`[food-cache] ${what}`, error);
};

/**
 * The user's own correction first, then the shared verified tier.
 *
 * Returns null on a miss or on any error, which sends the caller to the AI
 * call it would have made anyway.
 */
export async function lookupCache(opts: {
  query: string;
  userId: string;
}): Promise<CachedFood | null> {
  try {
    // Dynamic import, the convention every other server-only consumer here
    // follows (billing.ts, delete-account.ts): it keeps the service-role
    // module out of this file's static graph. `supabaseAdmin` is a lazy proxy,
    // so nothing connects until a property is touched.
    const { supabaseAdmin: db } = await import("@/integrations/client.server");
    const key = searchKey(opts.query);
    if (!key) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts omits these service-role-only tables
    const table = (name: string) => db.from(name as any) as any;

    // Two plain .eq() reads rather than one interpolated `.or()` filter.
    // searchKey emits multi-word keys ("dahi bhaat"), and an `or` expression
    // is a syntax string: values are spliced into a logic tree where `,`,
    // `(` and `)` are structure. A stray one does not fail at the call site,
    // it comes back as a parse error and therefore a miss — and a miss here
    // costs a paid AI call for a food already in the cache. .eq() sends the
    // value as its own parameter, where nothing in it can be syntax.
    const exact = (column: "search_key" | "canonical_key") =>
      table("ai_verified").select("*").eq(column, key).limit(1).maybeSingle();

    const bySearch = await exact("search_key");
    warn("ai_verified search_key read failed", bySearch.error);
    let row: VerifiedRow | null = bySearch.data;

    if (!row) {
      const byCanonical = await exact("canonical_key");
      warn("ai_verified canonical_key read failed", byCanonical.error);
      row = byCanonical.data;
    }

    if (!row) {
      // Fall back to similarity. The threshold depends on whether the query
      // and the stored name are written in the same script.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts leaves Functions empty
      const { data: near, error } = await (db.rpc as any)(
        "ai_verified_similar",
        { q: key, min_sim: SIM_SAME_SCRIPT },
      );
      warn("ai_verified_similar failed", error);
      const candidate: VerifiedRow | undefined = near?.[0];
      if (candidate) {
        const cross = scriptOf(opts.query) !== scriptOf(candidate.food_name);
        const floor = cross ? SIM_CROSS_SCRIPT : SIM_SAME_SCRIPT;
        if ((candidate.sim ?? 0) >= floor) row = candidate;
      }
    }
    if (!row) return null;

    // A per-user correction overrides the shared values, never deletes them.
    const { data: flagged, error: flaggedError } = await table("ai_flagged")
      .select("*")
      .eq("user_id", opts.userId)
      .eq("canonical_key", row.canonical_key)
      .maybeSingle();
    warn("ai_flagged read failed", flaggedError);

    // ai_flagged stores only the five macros, so the name, class and basis
    // always come from the shared row even when an override is in play.
    const source: Macros = (flagged as Macros | null) ?? row;
    const macros = {} as Macros;
    for (const m of MACROS) macros[m] = Number(source[m]);

    return {
      ...macros,
      food_name: row.food_name,
      food_class: row.food_class,
      basis: row.basis,
      piece_g: row.piece_g == null ? null : Number(row.piece_g),
      verified: true,
    };
  } catch (err) {
    console.warn("[food-cache] lookup failed, falling through to AI", err);
    return null;
  }
}

/**
 * Store one gated answer, then promote or reset its group.
 *
 * The caller has already served the user, so nothing here is on the critical
 * path and nothing here may throw.
 */
export async function recordAnswer(row: UnverifiedRow): Promise<void> {
  if (!row.canonical_key) return; // Nothing to group it under.
  try {
    const { supabaseAdmin: db } = await import("@/integrations/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts omits these service-role-only tables
    const table = (name: string) => db.from(name as any) as any;
    const unverified = () => table("ai_unverified");

    const { error: insertError } = await unverified().insert({
      canonical_key: row.canonical_key,
      search_key: searchKey(row.canonical_key),
      food_name: row.food_name,
      food_class: row.food_class,
      basis: row.basis,
      piece_g: row.piece_g ?? null,
      enerc: row.enerc,
      protcnt: row.protcnt,
      fatce: row.fatce,
      choavldf: row.choavldf,
      fibtg: row.fibtg,
      aliases: row.aliases,
      engine: row.engine,
      model: row.model,
    });
    if (insertError) {
      // Bail rather than carry on: this answer never joined the group, so
      // promoting and then deleting whatever is already there would
      // consolidate — and then destroy — a quorum this call was not part of.
      warn(
        "ai_unverified insert failed, answer served but not cached",
        insertError,
      );
      return;
    }

    // food_class is an absolute collision guard. Romanisation is lossy, so two
    // genuinely different foods can land on one canonical_key by coincidence —
    // and three answers about two different foods must never be averaged into
    // one verified row. Only rows agreeing with this answer's class count.
    const { data: all, error: groupError } = await unverified()
      .select("*")
      .eq("canonical_key", row.canonical_key)
      .order("created_at", { ascending: true });
    warn("ai_unverified group read failed", groupError);

    const group: GroupRow[] = ((all ?? []) as GroupRow[])
      .filter((g) => g.food_class === row.food_class)
      .slice(0, 3);

    if (group.length < 3) return;

    const macroRows = group.map((g) => {
      const m = {} as Macros;
      for (const k of MACROS) m[k] = Number(g[k]);
      return m;
    });

    if (quorumPasses(macroRows)) {
      const { error } = await table("ai_verified").upsert({
        canonical_key: row.canonical_key,
        search_key: searchKey(row.canonical_key),
        food_name: group[0].food_name,
        food_class: group[0].food_class,
        basis: group[0].basis,
        piece_g: group[0].piece_g,
        ...consolidate(macroRows),
        aliases: crossCheckAliases(group.map((g) => g.aliases ?? [])),
        models: group.map((g) => g.model),
      });
      warn("ai_verified upsert failed", error);
      // Leave the group standing if the promotion did not land, so the next
      // answer retries it instead of the food restarting from zero.
      if (error) return;
    }

    // Pass or fail, the group's rows are done: promoted, or deleted so the
    // next search starts a brand-new group at entry one. Deliberately not a
    // sliding window.
    const { error: deleteError } = await unverified()
      .delete()
      .in(
        "id",
        group.map((g) => g.id),
      );
    warn("ai_unverified group delete failed", deleteError);
  } catch (err) {
    console.warn(
      "[food-cache] write failed, answer served but not cached",
      err,
    );
  }
}
