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
 * DEPLOY ORDER: the supabase/migrations for this feature must be applied before
 * this file ships. Reads degrade safely if they are not — a missing column is
 * logged and falls through to the AI call — but the promotion insert fails, so
 * nothing ever reaches ai_verified and the cache stays permanently empty while
 * search goes on looking perfectly healthy.
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
  PER_USER_CAP,
  QUORUM_SIZE,
  type LoggedEdit,
  type Macros,
  consolidate,
  consolidateIdentity,
  enoughUsers,
  per100g,
  quorumPasses,
} from "@/lib/foodCache";
import { createHash } from "node:crypto";
import { crossCheckAliases, scriptOf, searchKey } from "./foodCacheKeys.ts";
import { searchFoods } from "@/lib/foodDb";

/**
 * A match good enough to serve without calling the model. Always a verified
 * row: nothing still awaiting quorum is ever served from here.
 */
export type CachedFood = Macros & {
  food_name: string;
  food_class: string;
  basis: "100g" | "piece";
  piece_g: number | null;
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
  user_hash: string | null;
};

/**
 * Who staged an answer, as ai_unverified stores it: SHA-256 hex of the
 * authenticated user id, unsalted. Its one job is counting distinct people in
 * a group. The table is service_role-only, and any reader of it can already
 * read auth.users, so a secret pepper would add a deploy dependency for no
 * real protection.
 */
export const userHash = (userId: string) =>
  createHash("sha256").update(userId).digest("hex");

/**
 * Similarity is a backstop for typos in the SAME script. It is not, and cannot
 * be, the cross-script mechanism — that is the alias path in lookupCache.
 *
 * DO NOT LOWER THESE TO FIX A CROSS-SCRIPT MISS. That is the one change these
 * numbers exist to prevent. Measured pg_trgm similarities on this database:
 *
 *   tatte idli / thatte idli         0.643   true cross-script (Kannada)
 *   amara bhata / amar bhat          0.571   true cross-script (Bengali)
 *   curd rise / curd rice            0.538   ordinary typo
 *   naan / paneer naan               0.417   DIFFERENT foods
 *   idhli / idli                     0.375   true cross-script (Tamil)
 *   chicken biryani / chicken pulao  0.364   DIFFERENT foods
 *   iddali / idli                    0.333   true cross-script (Malayalam)
 *   curd rice / fried rice           0.313   DIFFERENT foods
 *
 * The two distributions overlap. A true Tamil match scores 0.375, below two
 * pairs of genuinely different foods at 0.417 and 0.364, so no trigram
 * threshold separates them: any value loose enough to catch cross-script
 * spellings also serves paneer naan's macros for a query of "naan". Cross-
 * script matching is handled instead by comparing normalised alias keys, which
 * is exact and has no threshold to tune.
 *
 * Both numbers were originally calibrated against Levenshtein similarity — the
 * measure of `similarity` in lib/foodFuzzy.ts — which scores these same
 * pairs far higher. They were never right for pg_trgm. They are kept because
 * being too strict here is harmless: a same-script near-miss just costs one AI
 * call, which is what would have happened anyway.
 */
const SIM_SAME_SCRIPT = 0.7;
/**
 * Higher still when the query and the stored name are written in different
 * scripts, which at these levels means the similarity path effectively never
 * fires cross-script. That is intended — see above.
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

    // Two rows, not one: a step that matches two different foods is
    // ambiguous, and must be seen to be refused rather than settled by
    // whichever row the database happens to return first.
    const upToTwo = async (
      what: string,
      query: any, // eslint-disable-line @typescript-eslint/no-explicit-any -- a builder on one of the untyped tables above
    ): Promise<VerifiedRow[]> => {
      const { data, error } = await query.limit(2);
      warn(`ai_verified ${what} read failed`, error);
      return data ?? [];
    };

    // Two plain .eq() reads rather than one interpolated `.or()` filter.
    // searchKey emits multi-word keys ("dahi bhaat"), and an `or` expression
    // is a syntax string: values are spliced into a logic tree where `,`,
    // `(` and `)` are structure. A stray one does not fail at the call site,
    // it comes back as a parse error and therefore a miss — and a miss here
    // costs a paid AI call for a food already in the cache. .eq() sends the
    // value as its own parameter, where nothing in it can be syntax.
    const exact = (column: "search_key" | "canonical_key") =>
      upToTwo(column, table("ai_verified").select("*").eq(column, key));

    // Cheapest and surest first. The first three steps are exact matches on the
    // normalised key; only the fourth guesses.

    // 1. canonical_key — the primary key, a btree lookup.
    let rows = await exact("canonical_key");

    // 2. search_key — the row's own display name, normalised.
    if (!rows.length) rows = await exact("search_key");

    // 3. alias_keys — every other spelling the quorum agreed on, normalised the
    //    same way the query was. This is the cross-script path, and it is the
    //    whole reason the model is asked for native-script aliases: a Kannada
    //    query and a stored alias "ತಟ್ಟೆ ಇಡ್ಲಿ" both normalise to "tatte idli",
    //    so they match exactly, with no threshold in the way. Similarity cannot
    //    do this job — see the note on SIM_SAME_SCRIPT for the measurements.
    if (!rows.length)
      rows = await upToTwo(
        "alias_keys",
        table("ai_verified").select("*").contains("alias_keys", [key]),
      );

    // An exact key that two verified foods both answer to — "idli" as an
    // alias of thatte idli and of rava idli — names neither of them. A miss,
    // as in flagFood: it costs one model call, a guess costs a wrong food.
    // Returned outright, so the similarity step cannot pick one either.
    if (rows.length > 1) return null;
    let row: VerifiedRow | null = rows[0] ?? null;

    // 4. Similarity, last: a same-script typo backstop and nothing more.
    if (!row) {
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
export async function recordAnswer(
  row: UnverifiedRow,
  user_hash: string,
): Promise<void> {
  try {
    // No person, no row: a group's answers must be countable by who gave them.
    if (!user_hash) return;
    // Inside the try: reading `row.canonical_key` was the one dereference in
    // this module sitting outside it, and a null row from a caller would have
    // thrown straight through into search.
    // food_class degrades to "" in the schema when the model's answer is
    // off-list (see FOOD_CLASS_VALUES in foodAiSchema.ts) so the item still
    // reaches the user — but it must stop here, the single choke point every
    // write passes through, or every food whose class came back off-list
    // would collide under one (canonical_key, "") group and quorum could
    // promote a class-less row, exactly what food_class exists to prevent.
    if (!row.canonical_key || !row.food_class) return; // Nothing to group it under.
    const { supabaseAdmin: db } = await import("@/integrations/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts omits these service-role-only tables
    const table = (name: string) => db.from(name as any) as any;
    const unverified = () => table("ai_unverified");

    // At most PER_USER_CAP rows per person in one open group, so any
    // QUORUM_SIZE rows span MIN_DISTINCT_USERS people and a group can never
    // fill up on one user's searches. Enforced here, at staging, rather than
    // only at promotion: a group full of one person's rows would otherwise
    // sit at the head of the queue forever. A failed count stages nothing.
    const { count: mine, error: capError } = await unverified()
      .select("id", { count: "exact", head: true })
      .eq("canonical_key", row.canonical_key)
      .eq("food_class", row.food_class)
      .eq("user_hash", user_hash);
    if (capError || mine == null) {
      warn(
        "ai_unverified cap read failed, answer served but not cached",
        capError,
      );
      return;
    }
    if (mine >= PER_USER_CAP) return;

    const { error: insertError } = await unverified().insert({
      user_hash,
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

    // food_class is a grouping guard. Two genuinely different foods can land
    // on one canonical_key by coincidence, and three answers about two
    // different foods must never be averaged into one verified row, so only
    // rows agreeing with this answer's class count. It is a coarse guard, not
    // an absolute one: the class is one of 13 broad buckets, and two foods in
    // the same bucket ("curry" holds malai kofta and chicken kofta alike)
    // still group together if their keys collide.
    const { data: all, error: groupError } = await unverified()
      .select("*")
      .eq("canonical_key", row.canonical_key)
      .order("created_at", { ascending: true });
    warn("ai_unverified group read failed", groupError);

    const group: GroupRow[] = ((all ?? []) as GroupRow[])
      .filter((g) => g.food_class === row.food_class)
      .slice(0, QUORUM_SIZE);

    if (group.length < QUORUM_SIZE) return;

    const macroRows = group.map((g) => {
      const m = {} as Macros;
      for (const k of MACROS) m[k] = Number(g[k]);
      return m;
    });

    // enoughUsers is defence in depth: the staging cap already guarantees it,
    // barring a race between two of one user's own searches. A group short of
    // people is reset like a group that disagrees.
    if (enoughUsers(group) && quorumPasses(macroRows)) {
      const rowKey = searchKey(row.canonical_key);
      const aliases = crossCheckAliases(group.map((g) => g.aliases ?? []));

      // alias_keys is every normalised form this row answers to, and it
      // includes the row's own search_key as well as the aliases. That is what
      // makes step 3 of lookupCache a single indexed containment query which
      // means "does any spelling of this food match the query", rather than one
      // query for the name and another for the aliases. Derived with the same
      // searchKey() the lookup uses — if the two ever diverged the match would
      // silently stop working, so there is exactly one function for it.
      const aliasKeys = [
        ...new Set([rowKey, ...aliases.map(searchKey)].filter(Boolean)),
      ];

      // An insert that does nothing on conflict, never an overwrite. The
      // pipeline must not change a verified row: a later group under the same
      // key ("sugar-free lassi" answered as "lassi") would replace its numbers
      // with a variant's, and its aliases — and with them every spelling that
      // already matched — with the new group's. recordAnswers skips a key that
      // is already verified; this is the backstop for a race with it. Only
      // the weekly manual review changes a verified row.
      const { error } = await table("ai_verified").upsert(
        {
          canonical_key: row.canonical_key,
          search_key: rowKey,
          // Median piece_g, majority basis, most common name: piece_g
          // multiplies every pieces log of this food for good, so one
          // outlier answer must not be what gets stored.
          ...consolidateIdentity(group),
          food_class: row.food_class,
          ...consolidate(macroRows),
          aliases,
          alias_keys: aliasKeys,
          models: group.map((g) => g.model),
        },
        { onConflict: "canonical_key", ignoreDuplicates: true },
      );
      warn("ai_verified insert failed", error);
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

/**
 * Store one model response, which may describe several foods.
 *
 * Quorum means three *independent* verdicts on the same food, from at least
 * MIN_DISTINCT_USERS different people (the cap in recordAnswer). Two items of one
 * response are not two verdicts: they come from one model, one prompt and one
 * generation, so whatever produced a wrong number in the first is still in
 * force for the second. A response that named the same food twice — the same
 * canonical_key and the same food_class — would therefore fill two of the three
 * slots by itself, and the food could be promoted to permanent shared data on
 * what is really a single opinion held twice.
 *
 * So only the first item per (canonical_key, food_class) in a batch is kept.
 * The others are dropped rather than deferred: the remaining slots are meant to
 * be filled by a later search making a fresh call, which is the only thing that
 * makes them independent.
 *
 * A food that is already verified is not staged at all: its row is final as
 * far as this pipeline goes (see the promotion insert in recordAnswer), so a
 * new group under its key could only ever be thrown away. One read for the
 * whole batch; it runs inside the caller's CACHE_RECORD_MS budget like every
 * other write here. If it fails, nothing is staged — a lost answer only
 * delays quorum.
 *
 * This lives here rather than at the caller so that every future caller gets it
 * — a caller that loops over `recordAnswer` itself would silently reintroduce
 * the hole. Deliberately sequential: each answer has to read back the group the
 * one before it just joined.
 */
export async function recordAnswers(
  rows: UnverifiedRow[],
  userId: string,
): Promise<void> {
  try {
    // The authenticated user from the server function's context, never from
    // client input. No user, nothing staged: a row nobody can be counted for
    // could fill a quorum alone.
    if (!userId) return;
    const hash = userHash(userId);
    const keys = [
      ...new Set((rows ?? []).map((r) => r?.canonical_key).filter(Boolean)),
    ];
    if (!keys.length) return;
    const { supabaseAdmin: db } = await import("@/integrations/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts omits these service-role-only tables
    const { data: done, error } = await (db.from("ai_verified" as any) as any)
      .select("canonical_key")
      .in("canonical_key", keys);
    if (error) {
      warn("ai_verified read failed, answers served but not cached", error);
      return;
    }
    const verified = new Set(
      ((done ?? []) as { canonical_key: string }[]).map((r) => r.canonical_key),
    );

    const seen = new Set<string>();
    for (const row of rows ?? []) {
      if (verified.has(row?.canonical_key)) continue;
      // JSON, not a joined string: no separator character can be assumed
      // absent from two fields the model wrote.
      const slot = JSON.stringify([row?.canonical_key, row?.food_class]);
      if (seen.has(slot)) continue;
      seen.add(slot);
      await recordAnswer(row, hash);
    }
  } catch (err) {
    console.warn(
      "[food-cache] batch write failed, answers served but not cached",
      err,
    );
  }
}

/**
 * Turn an edit of a logged food into this user's correction of it, when the
 * food is a verified cache row.
 *
 * food_logs records no provenance, so which food was edited is worked out here
 * from the logged name, by EXACT match only — a similar-looking match would
 * attach one food's correction to another. In order, surest first:
 *   1. food_name, verbatim: a food served from the cache is logged under the
 *      row's own display name ("Thatte Idli (plate idli)"), which is not the
 *      canonical key and does not normalise to any stored key.
 *   2. search_key: the logged name is the canonical name itself.
 *   3. alias_keys: the entry was logged under another spelling of the food —
 *      voice logs made before they stored the resolved name kept the words
 *      the user said ("ತಟ್ಟೆ ಇಡ್ಲಿ").
 * A step matching two different rows is ambiguous and flags nothing.
 *
 * A bundled catalog food is never a cache food, and is ruled out first with
 * searchFoods(), the typed search's own catalog match. Without that, a
 * generic alias would capture it: the prompt itself teaches "idli" as an alias
 * of thatte idli, so an edit to a catalog Idli would land on thatte idli.
 *
 * No match is the normal case — a catalog food or an unverified estimate — and
 * returns null quietly; otherwise the canonical_key flagged. Never throws: the
 * food_logs edit has already been saved.
 */
export async function flagFood(
  edit: LoggedEdit & { userId: string },
): Promise<string | null> {
  try {
    if (searchFoods(edit.food_name, 1).length) return null;
    const macros = per100g(edit);
    if (!macros) return null;

    const { supabaseAdmin: db } = await import("@/integrations/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts omits these service-role-only tables
    const table = (name: string) => db.from(name as any) as any;
    const verified = () =>
      table("ai_verified").select("canonical_key").limit(2);
    const none = { data: [], error: null };

    const key = searchKey(edit.food_name);
    const steps = await Promise.all([
      verified().eq("food_name", edit.food_name),
      key ? verified().eq("search_key", key) : none,
      key ? verified().contains("alias_keys", [key]) : none,
    ]);
    const failed = steps.find((s) => s.error);
    if (failed) {
      // A step that errored might have matched a different row than the ones
      // that answered, so no step's answer can be trusted.
      warn("ai_verified read for a correction failed", failed.error);
      return null;
    }
    const rows: { canonical_key: string }[] | undefined = steps.find(
      (s) => s.data?.length,
    )?.data;
    if (!rows || rows.length !== 1) return null;
    const canonical_key = rows[0].canonical_key;

    const { error } = await table("ai_flagged").upsert(
      {
        user_id: edit.userId,
        canonical_key,
        ...macros,
        // The column default only fires on insert; a re-correction is newer.
        edited_at: new Date().toISOString(),
      },
      { onConflict: "user_id,canonical_key" },
    );
    if (error) {
      warn("ai_flagged upsert failed, correction not saved", error);
      return null;
    }
    return canonical_key;
  } catch (err) {
    console.warn("[food-cache] correction not saved", err);
    return null;
  }
}
