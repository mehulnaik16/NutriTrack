/**
 * Weekly review of the AI food cache. Read-only, by design: every call below is
 * a select, and there is no code path that writes anywhere.
 *
 * Prints what reached ai_verified in the last 7 days, which verified foods users
 * have corrected for themselves (ai_flagged), and which foods are sitting in
 * ai_unverified short of the three agreeing answers, from at least two
 * different people, that promotion needs.
 *
 * Promotion into the bundled catalog, src/data/extraFoods.ts, stays a hand-made
 * edit and a reviewed commit. Nothing automates it, and nothing should: the
 * cache only knows that one model agreed with itself three times, and a
 * consistent mistake passes that just as well as a right answer. The catalog
 * ships to every user as trusted data and is checked before the cache, so a
 * person reading these numbers — against IFCT, a label, or a published range —
 * is the only check a food gets before it becomes permanent. Automating the
 * copy would remove exactly that check.
 *
 * Energy is stored in kJ and printed here in kcal. All macros are per 100 g,
 * including on 'piece' rows: basis says a food is countable and carries a piece
 * weight, it does not change what the numbers are per.
 *
 * Run:  node scripts/food-cache-review.mjs
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment, or
 * from .env at the repo root. The cache tables grant to service_role only.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
// The app's own threshold, not a copy of it: it is scale-dependent (2 for
// today's small user base, 3 once it reaches 1k–10k users), and a copy here
// would drift the day it moves. Node strips the types, as it does for the
// repo's node:assert test files.
import { MIN_DISTINCT_USERS, QUORUM_SIZE } from "../src/lib/foodCache.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(resolve(root, ".env"));
} catch {
  // No .env: the variables may already be in the environment.
}
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** PostgREST's default row cap. Hitting it means the report is partial. */
const MAX_ROWS = 1000;

/** A failed read must not print as an empty, healthy-looking section. */
async function read(what, query) {
  const { data, error } = await query;
  if (error) {
    console.error(`Could not read ${what}: ${error.message}`);
    process.exit(1);
  }
  if (data.length >= MAX_ROWS)
    console.log(`(${what}: first ${MAX_ROWS} rows only — report is partial)`);
  return data;
}

const kcal = (kj) => Math.round(Number(kj) / 4.184);
const macros = (r) =>
  `P${+r.protcnt} F${+r.fatce} C${+r.choavldf} Fib${+r.fibtg}`;
const day = (ts) => ts.slice(0, 10);

// ── Verified this week ──────────────────────────────────────────────────────
const since = new Date(Date.now() - 7 * 864e5).toISOString();
const verified = await read(
  "ai_verified",
  db
    .from("ai_verified")
    .select(
      "canonical_key, food_name, food_class, basis, piece_g, enerc, protcnt, fatce, choavldf, fibtg, aliases, alias_keys, models, verified_at",
    )
    .gte("verified_at", since)
    .order("verified_at", { ascending: false }),
);

console.log(`\n=== Verified this week: ${verified.length} ===`);
for (const v of verified) {
  const piece = v.basis === "piece" ? `, 1 pc = ${+v.piece_g} g` : "";
  console.log(
    `${v.food_name}  [${v.food_class}]  ${day(v.verified_at)}\n` +
      `    ${kcal(v.enerc)} kcal/100 g  ${macros(v)}  (${v.basis}${piece})`,
  );
  if (v.aliases?.length) console.log(`    aliases: ${v.aliases.join(", ")}`);
  // What lookups actually match on — a wrong entry here serves this food's
  // numbers for a different query.
  if (v.alias_keys?.length)
    console.log(`    matches: ${v.alias_keys.join(" | ")}`);
  console.log(`    key: ${v.canonical_key}  models: ${v.models.join(", ")}`);
}

// ── Corrected by users ──────────────────────────────────────────────────────
const flagged = await read(
  "ai_flagged",
  db.from("ai_flagged").select("canonical_key, enerc"),
);

const byFood = new Map();
for (const f of flagged) {
  const list = byFood.get(f.canonical_key) ?? [];
  list.push(kcal(f.enerc));
  byFood.set(f.canonical_key, list);
}

// The shared values beside the corrections, so a reviewer can see which way
// people moved them. Flags are not limited to this week's foods.
const shared = new Map();
if (byFood.size) {
  const rows = await read(
    "ai_verified (corrected foods)",
    db
      .from("ai_verified")
      .select("canonical_key, enerc")
      .in("canonical_key", [...byFood.keys()]),
  );
  for (const r of rows) shared.set(r.canonical_key, kcal(r.enerc));
}

console.log(`\n=== Corrected by users: ${byFood.size} foods ===`);
// Several people correcting the same food is the strongest signal the shared
// row is wrong, so the list is ordered by how many did.
for (const [key, list] of [...byFood].sort(
  (a, b) => b[1].length - a[1].length,
)) {
  const n = list.length;
  const lo = Math.min(...list);
  const hi = Math.max(...list);
  const range = lo === hi ? `${lo}` : `${lo}–${hi}`;
  console.log(
    `${key}  — ${n} user${n > 1 ? "s" : ""}; shared ${shared.get(key) ?? "?"} kcal, corrected to ${range} kcal (per 100 g)`,
  );
}

// ── Short of quorum ─────────────────────────────────────────────────────────
const pending = await read(
  "ai_unverified",
  db
    .from("ai_unverified")
    .select("canonical_key, food_class, food_name, created_at, user_hash"),
);

// Grouped as recordAnswer groups them: by key AND class. Answers that agree on
// the key but not the class never count toward the same three. A group needs
// three answers from at least MIN_DISTINCT_USERS different people.
const groups = new Map();
for (const p of pending) {
  const id = `${p.canonical_key} [${p.food_class}]`;
  const g = groups.get(id) ?? {
    n: 0,
    users: new Set(),
    first: p.created_at,
    name: p.food_name,
  };
  g.n++;
  if (p.user_hash) g.users.add(p.user_hash);
  if (p.created_at < g.first) g.first = p.created_at;
  groups.set(id, g);
}

console.log(`\n=== Short of quorum: ${groups.size} foods ===`);
for (const [id, g] of [...groups].sort((a, b) => b[1].n - a[1].n))
  console.log(
    `${id}  — ${g.n}/${QUORUM_SIZE} answers, ${g.users.size}/${MIN_DISTINCT_USERS} people, since ${day(g.first)}  (${g.name})`,
  );
