# AI Food Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop paying for the same AI food answer twice, by verifying each new answer with three independent agreeing calls and serving it free from Postgres thereafter.

**Architecture:** Four tiers read in order — the client-bundled catalog, the user's own correction, the shared verified cache, then an AI call. Every AI answer is gated for internal consistency, stored as an individual row, and promoted only when three independent answers agree within 5% on all five macros. All judgement logic lives in pure functions in `src/lib/foodCache.ts`; all database access lives in `src/server/foodCache.ts` behind the service-role client.

**Tech Stack:** TypeScript, TanStack Start server functions, Supabase Postgres with `pg_trgm`, `@indic-transliteration/sanscript`, `node:assert` test scripts run directly under Node 22.

**Spec:** `docs/superpowers/specs/2026-09-22-ai-food-cache-design.md`

## Global Constraints

- **No test framework.** Tests are plain `node:assert` scripts run as `node src/lib/<name>.test.ts`. Node 22 strips TypeScript natively. Never introduce vitest, jest or any runner.
- **Energy is kilojoules everywhere.** The catalog stores `enerc` in kJ; `KJ_PER_KCAL = 4.184`. A kcal value written into a kJ column misreports intake by 4.184x.
- **The three cache tables are server-only.** RLS enabled, zero policies for `anon`/`authenticated`, explicit `REVOKE` then `GRANT` to `service_role` alone.
- **The bundled catalog is never written to by code.** `src/data/ifct2017.json`, `src/data/extraFoods.ts` and `src/data/restaurantFoods.json` change only through a reviewed commit.
- **Cache gate thresholds are two separate numbers.** Atwater cache gate **±10%** on a single raw answer; quorum **mean ±5%** across three answers. Never blend them.
- **Cache basis is `100g` or `piece` only.** No bowl, cup or serving-name units in any cache key.
- **The three verification calls must be independent.** No call may see a prior answer from its group; the prompt is byte-identical between them.
- **Personal names never enter `ai_unverified`, `ai_verified` or any alias set**, on a hit or a miss.
- **Same-script similarity threshold 0.7; cross-script 0.85.** `food_class` must agree or it is a miss.
- New environment variables go into `.env.example` and `.env` in the same change.

## Review Focus

Five conditions the spec implies that no obvious task would otherwise test. Each has a test assigned to the task that owns the code.

1. **A repaired energy value silently passing the cache gate** — if the gate runs after `reconcileEnergy` it can never fail. Pinned in Task 5.
2. **A zero or near-zero macro dividing the quorum check** — fibre is 0 on many foods; a naive `mean ±5%` divides by approximately nothing and no food ever verifies. Pinned in Task 6.
3. **A two-letter romanised possessive flagging a real food** — Tamil `en` and Telugu `naa` appear inside ordinary words. Pinned in Task 8.
4. **A catalog row with aliases in the other shape** — 1,014 rows keep aliases in `name`, 430 in `lang`. A parser reading one shape silently drops two thirds or one third of the catalog's aliases. Pinned in Task 4.
5. **A cache write failing while the user is waiting** — a Postgres error must never turn a successful AI answer into a broken search. Pinned in Task 10.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260922<hhmmss>_ai_food_cache.sql` | Create `pg_trgm`, the three tables, indexes, RLS and grants |
| `src/lib/foodCache.ts` | Pure functions: keys, script detection, gates, quorum, alias cross-check, personal names. No network, no Supabase |
| `src/lib/foodCache.test.ts` | `node:assert` script covering every pure function above |
| `src/lib/foodFuzzy.ts` | Modified: export `similarity` and `altNames`, add the parenthetical-name alias shape |
| `src/lib/foodAiSchema.ts` | Modified: prompt and schema gain `canonical_key`, `food_class`, `aliases` |
| `src/server/foodCache.ts` | All cache database access, service-role client, server-only |
| `src/lib/ai.ts` | Modified: `runFoodSearch` gains cache lookup and cache write |
| `src/components/FoodSearch.tsx` | Modified: personal-name path, auto-save on log, correction writes `ai_flagged` |
| `src/components/VoiceFoodDialog.tsx` | Modified: parse returns names and quantities only |
| `scripts/food-cache-review.mjs` | Weekly manual review report |

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260922120000_ai_food_cache.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: tables `ai_unverified`, `ai_verified`, `ai_flagged`, all reachable only by `service_role`.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260922120000_ai_food_cache.sql`:

```sql
-- AI food cache: three staging tiers between the bundled catalog and a paid
-- AI call. Server-only by construction -- see the revoke/grant block at the
-- end. The bundled catalog is not represented here and is never written to.

create extension if not exists pg_trgm with schema extensions;

-- Every individual AI answer, one row each, grouped by the canonical key the
-- model itself returned. Three agreeing rows become one ai_verified row.
create table public.ai_unverified (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null,
  search_key text not null,
  food_name text not null,
  food_class text not null,
  basis text not null check (basis in ('100g', 'piece')),
  piece_g numeric,
  enerc numeric not null,
  protcnt numeric not null,
  fatce numeric not null,
  choavldf numeric not null,
  fibtg numeric not null,
  aliases text[] not null default '{}',
  engine text not null,
  model text not null,
  created_at timestamptz not null default now()
);

create index ai_unverified_group_idx on public.ai_unverified (canonical_key);
create index ai_unverified_search_idx
  on public.ai_unverified using gin (search_key extensions.gin_trgm_ops);

-- The trusted tier. Read on every search alongside the bundled catalog.
create table public.ai_verified (
  canonical_key text primary key,
  search_key text not null,
  food_name text not null,
  food_class text not null,
  basis text not null check (basis in ('100g', 'piece')),
  piece_g numeric,
  enerc numeric not null,
  protcnt numeric not null,
  fatce numeric not null,
  choavldf numeric not null,
  fibtg numeric not null,
  aliases text[] not null default '{}',
  models text[] not null default '{}',
  verified_at timestamptz not null default now()
);

create index ai_verified_search_idx
  on public.ai_verified using gin (search_key extensions.gin_trgm_ops);
create index ai_verified_alias_idx on public.ai_verified using gin (aliases);

-- One user's correction of a verified food. A personal override, never a
-- deletion: the shared ai_verified row keeps serving everybody else.
create table public.ai_flagged (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  canonical_key text not null,
  enerc numeric not null,
  protcnt numeric not null,
  fatce numeric not null,
  choavldf numeric not null,
  fibtg numeric not null,
  edited_at timestamptz not null default now(),
  unique (user_id, canonical_key)
);

create index ai_flagged_key_idx on public.ai_flagged (canonical_key);

-- RLS on with no policies: with the grants below, nothing outside
-- service_role can reach these tables at all.
alter table public.ai_unverified enable row level security;
alter table public.ai_verified enable row level security;
alter table public.ai_flagged enable row level security;

revoke all on public.ai_unverified from anon, authenticated, public;
revoke all on public.ai_verified from anon, authenticated, public;
revoke all on public.ai_flagged from anon, authenticated, public;

grant select, insert, update, delete on public.ai_unverified to service_role;
grant select, insert, update, delete on public.ai_verified to service_role;
grant select, insert, update, delete on public.ai_flagged to service_role;
```

- [ ] **Step 2: Apply the migration**

Ask the user before touching the live project. With approval, apply it through the Supabase MCP `apply_migration` tool with name `ai_food_cache`, or:

```bash
npx supabase db push
```

- [ ] **Step 3: Verify the lockdown from a real signed-in client, not the service role**

A service-role check proves nothing — it bypasses RLS by design. Run this in the browser console of a signed-in session, or as a script using the publishable key plus a real user's session:

```js
const { error } = await supabase.from("ai_verified").select("*").limit(1);
console.log(error?.code, error?.message);
```

Expected: an error, `42501` / "permission denied for table ai_verified". A successful empty result means the revoke did not take and the task is not done.

Repeat for `ai_unverified` and `ai_flagged`.

- [ ] **Step 4: Verify pg_trgm is installed**

Run through MCP `execute_sql`:

```sql
select extname, extversion from pg_extension where extname = 'pg_trgm';
```

Expected: one row.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260922120000_ai_food_cache.sql
git commit -m "feat(db): ai food cache tables, server-role only"
```

---

### Task 2: Transliteration dependency and `searchKey`

**Files:**
- Create: `src/lib/foodCache.ts`
- Create: `src/lib/foodCache.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `scriptOf(text: string): string` returning `"Latin"`, `"Devanagari"`, `"Kannada"`, `"Tamil"`, `"Telugu"`, `"Malayalam"`, `"Bengali"`, `"Gujarati"`, `"Gurmukhi"`, `"Arabic"` or `"Unknown"`; `searchKey(text: string): string` returning a lowercased, romanised, punctuation-free string.

- [ ] **Step 1: Install the transliteration library**

```bash
npm install @indic-transliteration/sanscript
```

It is pure JavaScript with no native build step, and it is only ever imported server-side.

- [ ] **Step 2: Write the failing test**

Create `src/lib/foodCache.test.ts`:

```ts
/* Runnable self-check for the AI food cache's pure logic. No test framework in
   this repo, so this is a plain assert script — same convention as
   foodUnits.test.ts and ai.test.ts.

   Run:
     node src/lib/foodCache.test.ts

   Everything here is a pure function: no network, no Supabase, no API key. */
import assert from "node:assert";
import { scriptOf, searchKey } from "./foodCache.ts";

// ── script detection ───────────────────────────────────────────────────────
assert.equal(scriptOf("thatte idli"), "Latin");
assert.equal(scriptOf("ತಟ್ಟೆ ಇಡ್ಲಿ"), "Kannada");
assert.equal(scriptOf("मेरा शेक"), "Devanagari");
assert.equal(scriptOf("என் இட்லி"), "Tamil");
// Mixed input takes the first non-Latin script it finds: a romanised word
// beside a native one is still a native-script query.
assert.equal(scriptOf("2 ಇಡ್ಲಿ"), "Kannada");

// ── search key ─────────────────────────────────────────────────────────────
assert.equal(searchKey("Thatte Idli"), "thatte idli");
assert.equal(searchKey("  Curd   Rice!  "), "curd rice");
// The whole point: a native-script name and its romanisation must land close
// enough for pg_trgm to see them as the same food.
const kn = searchKey("ಇಡ್ಲಿ");
assert.ok(kn.startsWith("idl"), `expected an idli-like key, got ${kn}`);
assert.equal(searchKey(""), "");

console.log("foodCache: all assertions passed");
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node src/lib/foodCache.test.ts`
Expected: FAIL — `Cannot find module './foodCache.ts'`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/foodCache.ts`:

```ts
/**
 * Pure logic for the AI food cache.
 *
 * Everything here is a pure function so it can be tested with node:assert and
 * no database. All Postgres access lives in src/server/foodCache.ts.
 *
 * Matching never runs on raw text. pg_trgm compares characters, so
 * "thatte idli" and "ತಟ್ಟೆ ಇಡ್ಲಿ" share nothing at all; everything is compared
 * on `searchKey`, which romanises first.
 */
import Sanscript from "@indic-transliteration/sanscript";

/** The scripts this app actually meets, plus Latin. */
const SCRIPTS = [
  ["Devanagari", /\p{Script=Devanagari}/u, "devanagari"],
  ["Kannada", /\p{Script=Kannada}/u, "kannada"],
  ["Tamil", /\p{Script=Tamil}/u, "tamil"],
  ["Telugu", /\p{Script=Telugu}/u, "telugu"],
  ["Malayalam", /\p{Script=Malayalam}/u, "malayalam"],
  ["Bengali", /\p{Script=Bengali}/u, "bengali"],
  ["Gujarati", /\p{Script=Gujarati}/u, "gujarati"],
  ["Gurmukhi", /\p{Script=Gurmukhi}/u, "gurmukhi"],
  ["Arabic", /\p{Script=Arabic}/u, ""], // Urdu: no Sanscript scheme, kept as-is
] as const;

/**
 * Which script a query is written in.
 *
 * A non-Latin hit wins over Latin, because "2 ಇಡ್ಲಿ" is a Kannada query with a
 * digit in it, not a Latin one.
 */
export function scriptOf(text: string): string {
  for (const [name, re] of SCRIPTS) if (re.test(text)) return name;
  if (/\p{Script=Latin}/u.test(text)) return "Latin";
  return "Unknown";
}

/**
 * The form everything is matched on: romanised, lowercased, stripped of
 * punctuation and collapsed whitespace. The original text is always kept
 * beside it for display — nothing is replaced.
 */
export function searchKey(text: string): string {
  const script = scriptOf(text);
  const scheme = SCRIPTS.find((s) => s[0] === script)?.[2];
  const roman =
    scheme && scheme !== ""
      ? Sanscript.t(text, scheme, "itrans")
      : text;
  return roman
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node src/lib/foodCache.test.ts`
Expected: PASS — "foodCache: all assertions passed".

If the `idl` assertion fails, print `searchKey("ಇಡ್ಲಿ")` and adjust the ITRANS output handling — Sanscript emits capitals for long vowels, which the `toLowerCase()` already covers, but it may emit `~` or `.` marks that the punctuation strip must remove.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/foodCache.ts src/lib/foodCache.test.ts
git commit -m "feat(food-cache): script detection and romanised search keys"
```

---

### Task 3: Export the existing fuzzy helpers

**Files:**
- Modify: `src/lib/foodFuzzy.ts`
- Modify: `src/lib/foodFuzzy.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `similarity(a: string, b: string): number` (1 identical, 0 nothing in common) and `altNames(lang: string): string[]`, both exported from `src/lib/foodFuzzy.ts`.

Both functions already exist and are private. The alias cross-check and the catalog alias parser need them, and rewriting either would be duplicate logic.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/foodFuzzy.test.ts`:

```ts
import { similarity, altNames } from "./foodFuzzy.ts";

// ── similarity: exported for the cache's alias cross-check ─────────────────
assert.equal(similarity("idli", "idli"), 1);
assert.ok(similarity("idli", "idly") >= 0.7);
assert.ok(similarity("idli", "dosa") < 0.5);
assert.equal(similarity("", ""), 1);

// ── altNames: the lang shape, 430 catalog rows use it ─────────────────────
assert.deepEqual(altNames("A., Kash. Baajra; Kan. Sajje; Tam. Kambu"), [
  "Baajra",
  "Sajje",
  "Kambu",
]);
assert.deepEqual(altNames(""), []);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node src/lib/foodFuzzy.test.ts`
Expected: FAIL — `similarity` and `altNames` are not exported.

- [ ] **Step 3: Export both functions**

In `src/lib/foodFuzzy.ts`, change `function altNames(` to `export function altNames(` and `const similarity = (` to `export const similarity = (`. Add to the comment above `similarity`:

```ts
/**
 * 1 for identical words, 0 for nothing in common.
 *
 * Exported because the food cache's alias cross-check compares alias lists at
 * 0.9 and must use the same measure this module matches on.
 */
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node src/lib/foodFuzzy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/foodFuzzy.ts src/lib/foodFuzzy.test.ts
git commit -m "refactor(food): export similarity and altNames for the cache"
```

---

### Task 4: Catalog alias parser, both shapes

**Files:**
- Modify: `src/lib/foodCache.ts`
- Modify: `src/lib/foodCache.test.ts`

**Interfaces:**
- Consumes: `altNames` from Task 3.
- Produces: `catalogAliases(row: { name: string; lang?: string }): string[]` — every alias a catalog row carries, in either shape, excluding the row's own primary name.

This is Review Focus item 4. Of the catalog's 1,556 rows, 1,014 have an empty `lang` and keep aliases inside `name` in parentheses; 430 populate `lang`. Reading one shape drops the other's aliases entirely.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/foodCache.test.ts`, above the final `console.log`:

```ts
import { catalogAliases } from "./foodCache.ts";

// ── alias shape 1: `lang`, semicolon-delimited (430 rows, real IFCT) ───────
assert.deepEqual(
  catalogAliases({
    name: "Bajra",
    lang: "A., Kash. Baajra; Kan. Sajje; Tam. Kambu",
  }),
  ["Baajra", "Sajje", "Kambu"],
);

// ── alias shape 2: parenthetical in `name` (1,014 rows, merged corpus) ─────
assert.deepEqual(
  catalogAliases({
    name: "Curd rice (Dahi bhaat/Dahi chawal/ Perugu annam/Thayir saadam)",
    lang: "",
  }),
  ["Dahi bhaat", "Dahi chawal", "Perugu annam", "Thayir saadam"],
);

// ── neither shape: roughly 630 rows carry no aliases at all ───────────────
assert.deepEqual(catalogAliases({ name: "Bajra", lang: "" }), []);

// A parenthetical that is a portion hint, not an alias, must not become one.
assert.deepEqual(catalogAliases({ name: "Roti (1 medium = 40g)", lang: "" }), []);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node src/lib/foodCache.test.ts`
Expected: FAIL — `catalogAliases` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/foodCache.ts`:

```ts
import { altNames } from "./foodFuzzy.ts";

/**
 * A parenthetical group that is a list of names rather than a portion hint.
 * "Roti (1 medium = 40g)" is a measurement; "Curd rice (Dahi bhaat/...)" is an
 * alias list. Digits and "=" mark the former.
 */
const isAliasGroup = (inner: string) => !/[0-9=]/.test(inner);

/**
 * Every alias a catalog row carries, in whichever of the two shapes it uses.
 *
 * The catalog is not one corpus. Its 430 real IFCT rows keep regional names in
 * `lang`, semicolon-delimited with language tags. Its 1,014 merged rows leave
 * `lang` empty and bake aliases into `name`, in parentheses, slash-delimited.
 * Reading only one shape silently loses the other's aliases entirely, so this
 * reads both.
 */
export function catalogAliases(row: { name: string; lang?: string }): string[] {
  const out = [...altNames(row.lang ?? "")];
  for (const [, inner] of row.name.matchAll(/\(([^)]*)\)/g)) {
    if (!isAliasGroup(inner)) continue;
    for (const part of inner.split("/")) {
      const alias = part.trim();
      if (alias) out.push(alias);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node src/lib/foodCache.test.ts`
Expected: PASS.

- [ ] **Step 5: Sanity-check against the real catalog**

```bash
node -e "
const d=require('./src/data/ifct2017.json');
import('./src/lib/foodCache.ts').then(({catalogAliases})=>{
  const withAliases=d.filter(r=>catalogAliases(r).length>0);
  console.log('rows with aliases', withAliases.length, 'of', d.length);
  console.log('from lang', d.filter(r=>r.lang&&r.lang.trim()&&catalogAliases(r).length).length);
  console.log('from name', d.filter(r=>(!r.lang||!r.lang.trim())&&catalogAliases(r).length).length);
});"
```

Expected: roughly 420 from `lang` and roughly 380 from `name`. A zero on either line means one shape is not being parsed and the task is not done.

- [ ] **Step 6: Commit**

```bash
git add src/lib/foodCache.ts src/lib/foodCache.test.ts
git commit -m "feat(food-cache): parse catalog aliases from both name and lang shapes"
```

---

### Task 5: Atwater cache gate and mass balance

**Files:**
- Modify: `src/lib/foodCache.ts`
- Modify: `src/lib/foodCache.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `CACHE_ENERGY_TOL = 0.1`; `cacheGate(it: { enerc: number; protcnt: number; fatce: number; choavldf: number; fibtg: number }): boolean` — true when the answer is trustworthy enough to count toward the three.

This is Review Focus item 1. `reconcileEnergy` in `src/lib/foodAiSchema.ts` repairs `enerc` from the macros at ±25%; a repaired value is Atwater-consistent by construction, so this gate must see the **raw** model answer. Task 10 wires the call order.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/foodCache.test.ts`:

```ts
import { cacheGate, CACHE_ENERGY_TOL } from "./foodCache.ts";
import { reconcileEnergy } from "./foodAiSchema.ts";

const KJ = 4.184;
/** Internally consistent: 10P + 5F + 20C implies (40 + 45 + 80) kcal. */
const consistent = {
  name: "test food",
  protcnt: 10,
  fatce: 5,
  choavldf: 20,
  fibtg: 2,
  enerc: +(165 * KJ).toFixed(1),
};

assert.equal(CACHE_ENERGY_TOL, 0.1);
assert.equal(cacheGate(consistent), true);

// Within 10%: still cacheable.
assert.equal(cacheGate({ ...consistent, enerc: 165 * KJ * 1.08 }), true);
// Outside 10%: shown to the user, never cached.
assert.equal(cacheGate({ ...consistent, enerc: 165 * KJ * 1.2 }), false);

// Zero energy fails. The zero-energy IFCT oils are a catalog quirk, not
// something an AI answer may reproduce.
assert.equal(cacheGate({ ...consistent, enerc: 0 }), false);

// Mass balance: the macros of 100 g cannot exceed 100 g. The schema caps each
// field at 100 individually and never checks the sum.
assert.equal(
  cacheGate({ protcnt: 40, fatce: 40, choavldf: 40, fibtg: 5, enerc: 2800 }),
  false,
);

// ── Review Focus 1: the gate must run BEFORE reconcileEnergy ──────────────
// A repaired answer is Atwater-consistent by construction, so gating after the
// repair can never fail and the whole check becomes a no-op.
const bad = { ...consistent, enerc: 165 * KJ * 1.2 };
assert.equal(cacheGate(bad), false, "raw answer must fail");
assert.equal(
  cacheGate(reconcileEnergy(bad, "test food")),
  true,
  "repaired answer passes — proof the gate must see the raw value first",
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node src/lib/foodCache.test.ts`
Expected: FAIL — `cacheGate` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/foodCache.ts`:

```ts
const KJ_PER_KCAL = 4.184;

/**
 * How far a cacheable answer's stated energy may sit from what its own macros
 * imply.
 *
 * Deliberately stricter than ENERGY_TOL (0.25) in foodAiSchema.ts, and doing a
 * different job. That one repairs a bad value so the user still sees an
 * answer, because this path only runs when local search found nothing. This
 * one decides whether the answer is solid enough to count toward the three
 * that make a food permanent. A borderline answer is shown and not cached.
 *
 * 10% costs roughly 6% of genuine foods by the measurement recorded on
 * ENERGY_TOL — an acceptable price for a row that outlives the search.
 */
export const CACHE_ENERGY_TOL = 0.1;

/**
 * Is this single answer internally consistent enough to be cached?
 *
 * MUST be called on the raw model answer, before reconcileEnergy touches it.
 * Run afterwards it always returns true, because a repaired enerc is computed
 * from these very macros.
 */
export function cacheGate(it: {
  enerc: number;
  protcnt: number;
  fatce: number;
  choavldf: number;
  fibtg: number;
}): boolean {
  if (!(it.enerc > 0)) return false;
  // Per 100 g, the parts cannot outweigh the whole.
  if (it.protcnt + it.fatce + it.choavldf + it.fibtg > 100) return false;
  const implied = (4 * it.protcnt + 9 * it.fatce + 4 * it.choavldf) * KJ_PER_KCAL;
  if (!(implied > 0)) return false;
  return Math.abs(it.enerc - implied) <= CACHE_ENERGY_TOL * implied;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node src/lib/foodCache.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/foodCache.ts src/lib/foodCache.test.ts
git commit -m "feat(food-cache): Atwater and mass-balance gate at 10 percent"
```

---

### Task 6: Quorum check and consolidation

**Files:**
- Modify: `src/lib/foodCache.ts`
- Modify: `src/lib/foodCache.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MACROS = ["enerc", "protcnt", "fatce", "choavldf", "fibtg"] as const`; `type Macros = Record<(typeof MACROS)[number], number>`; `quorumPasses(rows: Macros[]): boolean`; `consolidate(rows: Macros[]): Macros` returning the per-macro mean.

This is Review Focus item 2. Fibre is 0 on many foods, so a plain `mean ±5%` divides by approximately nothing and nothing ever verifies.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/foodCache.test.ts`:

```ts
import { quorumPasses, consolidate } from "./foodCache.ts";

const macro = (over: Partial<Record<string, number>> = {}) => ({
  enerc: 700,
  protcnt: 10,
  fatce: 5,
  choavldf: 20,
  fibtg: 2,
  ...over,
});

// Three near-identical answers verify.
assert.equal(
  quorumPasses([macro(), macro({ enerc: 710 }), macro({ enerc: 690 })]),
  true,
);

// One macro outside mean ±5% fails the whole group — delete and restart.
assert.equal(quorumPasses([macro(), macro(), macro({ protcnt: 14 })]), false);

// A group that is not yet three rows never passes.
assert.equal(quorumPasses([macro(), macro()]), false);

// ── Review Focus 2: near-zero macros ──────────────────────────────────────
// Fibre 0 across all three is agreement, not a division by nothing.
assert.equal(
  quorumPasses([
    macro({ fibtg: 0 }),
    macro({ fibtg: 0 }),
    macro({ fibtg: 0 }),
  ]),
  true,
);
// 0.1 vs 0.3 g of fibre is 200% apart in relative terms and identical in
// practice — the absolute floor must let it through.
assert.equal(
  quorumPasses([
    macro({ fibtg: 0.1 }),
    macro({ fibtg: 0.3 }),
    macro({ fibtg: 0.2 }),
  ]),
  true,
);
// But a real disagreement at low values is still a disagreement.
assert.equal(
  quorumPasses([macro({ fibtg: 0.1 }), macro({ fibtg: 0.2 }), macro({ fibtg: 9 })]),
  false,
);

// consolidate takes the per-macro mean of the three.
assert.deepEqual(
  consolidate([macro({ enerc: 690 }), macro({ enerc: 700 }), macro({ enerc: 710 })]),
  macro({ enerc: 700 }),
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node src/lib/foodCache.test.ts`
Expected: FAIL — `quorumPasses` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/foodCache.ts`:

```ts
/** The five macros the cache stores and agrees on. enerc is kJ, the rest grams. */
export const MACROS = ["enerc", "protcnt", "fatce", "choavldf", "fibtg"] as const;
export type Macros = Record<(typeof MACROS)[number], number>;

/** How far each answer may sit from the group mean, per macro. */
export const QUORUM_TOL = 0.05;

/**
 * Below this the relative test is meaningless and an absolute one takes over.
 * 0.1 g and 0.3 g of fibre are 200% apart and the same food; without this
 * floor every food with a near-zero macro fails forever.
 */
export const QUORUM_ABS_FLOOR = 0.5;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Do three independent answers agree closely enough to become permanent?
 *
 * All five macros must pass. A single failure deletes the whole group and
 * restarts it from empty — deliberately not a sliding window, so a run of bad
 * answers can never accumulate into a verified row.
 */
export function quorumPasses(rows: Macros[]): boolean {
  if (rows.length !== 3) return false;
  return MACROS.every((m) => {
    const values = rows.map((r) => r[m]);
    const avg = mean(values);
    const tol = Math.max(QUORUM_TOL * avg, QUORUM_ABS_FLOOR);
    return values.every((v) => Math.abs(v - avg) <= tol);
  });
}

/** The per-macro mean of an agreeing group — what reaches ai_verified. */
export function consolidate(rows: Macros[]): Macros {
  const out = {} as Macros;
  for (const m of MACROS) out[m] = +mean(rows.map((r) => r[m])).toFixed(2);
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node src/lib/foodCache.test.ts`
Expected: PASS.

Note the `QUORUM_ABS_FLOOR` also loosens `enerc` by 0.5 kJ, which is negligible against values in the hundreds.

- [ ] **Step 5: Commit**

```bash
git add src/lib/foodCache.ts src/lib/foodCache.test.ts
git commit -m "feat(food-cache): three-way quorum with a near-zero floor"
```

---

### Task 7: Alias cross-check

**Files:**
- Modify: `src/lib/foodCache.ts`
- Modify: `src/lib/foodCache.test.ts`

**Interfaces:**
- Consumes: `similarity` from Task 3, `searchKey` from Task 2.
- Produces: `ALIAS_SIM = 0.9`; `crossCheckAliases(lists: string[][]): string[]` — aliases backed by at least two of the three answers.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/foodCache.test.ts`:

```ts
import { crossCheckAliases } from "./foodCache.ts";

// Backed by two of three, with a spelling difference inside 0.9.
assert.deepEqual(
  crossCheckAliases([
    ["Dahi bhaat", "Thayir saadam"],
    ["Dahi bhat", "Perugu annam"],
    ["Curd rice"],
  ]),
  ["Dahi bhaat"],
);

// A single answer's claim is never trusted on its own.
assert.deepEqual(
  crossCheckAliases([["Thayir saadam"], ["Perugu annam"], ["Daddojanam"]]),
  [],
);

// Native script and its romanisation are the same alias: comparison runs on
// searchKey, so the surviving alias is kept in the form it was first given.
const cross = crossCheckAliases([["ಇಡ್ಲಿ"], ["idli"], ["Idly"]]);
assert.equal(cross.length >= 1, true, `expected an idli alias, got ${cross}`);

assert.deepEqual(crossCheckAliases([[], [], []]), []);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node src/lib/foodCache.test.ts`
Expected: FAIL — `crossCheckAliases` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/foodCache.ts`:

```ts
import { similarity } from "./foodFuzzy.ts";

/** How close two spellings must be to count as the same alias. */
export const ALIAS_SIM = 0.9;

/**
 * The aliases at least two of the three answers agree on.
 *
 * A single model's claim is never written to the trusted set: one confident
 * hallucination would otherwise make "biryani" an alias of "pulao" forever.
 * Comparison runs on searchKey, so a native-script spelling and its
 * romanisation count as the same alias rather than two separate ones.
 */
export function crossCheckAliases(lists: string[][]): string[] {
  const kept: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lists.length; i++) {
    for (const alias of lists[i]) {
      const key = searchKey(alias);
      if (!key || seen.has(key)) continue;
      const backers = lists.filter((other, j) =>
        j !== i
          ? other.some((b) => similarity(searchKey(b), key) >= ALIAS_SIM)
          : true,
      ).length;
      if (backers >= 2) {
        seen.add(key);
        kept.push(alias);
      }
    }
  }
  return kept;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node src/lib/foodCache.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/foodCache.ts src/lib/foodCache.test.ts
git commit -m "feat(food-cache): alias cross-check across three answers"
```

---

### Task 8: Personal-name detection

**Files:**
- Modify: `src/lib/foodCache.ts`
- Modify: `src/lib/foodCache.test.ts`

**Interfaces:**
- Consumes: `scriptOf` from Task 2.
- Produces: `isPersonalName(query: string): boolean`.

This is Review Focus item 3. Detection runs on the text **as typed**, before romanisation: two-letter possessives such as Tamil `என்` and Telugu `నా` romanise to `en` and `naa`, which collide with ordinary words.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/foodCache.test.ts`:

```ts
import { isPersonalName } from "./foodCache.ts";

// English, the 66-of-293 case in the live data.
assert.equal(isPersonalName("My shake"), true);
assert.equal(isPersonalName("my chicken biryani"), true);
assert.equal(isPersonalName("our breakfast"), true);

// Native script, matched in its own script before any romanisation.
assert.equal(isPersonalName("ನನ್ನ ಶೇಕ್"), true); // Kannada
assert.equal(isPersonalName("मेरा शेक"), true); // Hindi
assert.equal(isPersonalName("என் இட்லி"), true); // Tamil
assert.equal(isPersonalName("నా అన్నం"), true); // Telugu

// Romanised possessives long enough to be safe.
assert.equal(isPersonalName("mera shake"), true);
assert.equal(isPersonalName("nanna shake"), true);

// ── Review Focus 3: short romanisations must NOT flag real foods ──────────
// "en" and "naa" are Tamil and Telugu possessives, and also ordinary letters
// inside real food names. Two-letter tokens are excluded from the Latin list.
assert.equal(isPersonalName("en idli"), false);
assert.equal(isPersonalName("naan"), false);
assert.equal(isPersonalName("naa rice"), false);

// Ordinary foods are never personal.
assert.equal(isPersonalName("curd rice"), false);
assert.equal(isPersonalName("thatte idli"), false);
// A possessive in the middle is not a possessive name.
assert.equal(isPersonalName("chicken my way"), false);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node src/lib/foodCache.test.ts`
Expected: FAIL — `isPersonalName` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/foodCache.ts`:

```ts
/**
 * Possessive markers, in their own scripts.
 *
 * Matched before romanisation, because that is where these words lose their
 * distinctiveness: Tamil என் and Telugu నా romanise to "en" and "naa", which
 * occur inside ordinary food names. Closed-class words with fixed spellings,
 * so the comparison is exact — fuzzy-matching them would catch real foods.
 */
const NATIVE_POSSESSIVES = [
  "मेरा", "मेरी", "मेरे", "माझा", "माझी", // Hindi, Marathi
  "ನನ್ನ", // Kannada
  "என்", "எனது", // Tamil
  "నా", "నాది", // Telugu
  "എന്റെ", // Malayalam
  "আমার", // Bengali
  "મારું", "મારી", // Gujarati
  "ਮੇਰਾ", "ਮੇਰੀ", // Punjabi
  "میرا", "میری", // Urdu
];

/**
 * Latin possessives. Every entry is three characters or more on purpose:
 * "en" and "naa" collide with ordinary words far too often to be trusted, so
 * those two languages are detected in their own script only.
 */
const LATIN_POSSESSIVES = [
  "my", "mine", "our",
  "mera", "meri", "nanna", "enadhu", "amar", "maru", "majha",
];

/**
 * Is this someone's private meal name rather than a food?
 *
 * Nothing that returns true may reach ai_unverified, ai_verified or an alias
 * set, on a hit or a miss. Ties break toward personal: a false positive costs
 * one AI call, a false negative writes somebody's private meal name into a
 * shared table permanently.
 *
 * This is a heuristic and will miss unusual phrasings. The quorum is the real
 * protection — a private name needs three independent agreeing answers to be
 * promoted, which it essentially never gets.
 */
export function isPersonalName(query: string): boolean {
  const text = query.trim();
  if (!text) return false;

  // Possessives lead the phrase in every language listed, so only the opening
  // tokens are examined: "chicken my way" is a recipe, not a private name.
  if (NATIVE_POSSESSIVES.some((p) => text.startsWith(p))) return true;

  const first = text.toLowerCase().split(/\s+/)[0].replace(/[^\p{L}]/gu, "");
  // "my" is two letters but unambiguous in English, unlike "en"/"naa".
  return LATIN_POSSESSIVES.includes(first);
}
```

Note: `"my"` is in the Latin list despite being two characters. It is unambiguous in English — no Indian food name begins with the standalone word "my" — whereas `en` and `naa` are not, which is exactly why they are excluded.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node src/lib/foodCache.test.ts`
Expected: PASS.

- [ ] **Step 5: Check against the live data**

Run through MCP `execute_sql`, then confirm every name returned is genuinely personal:

```sql
select distinct food_name from public.food_logs
where food_name ilike 'my %' or food_name ilike 'our %'
order by food_name;
```

Expected: roughly the 66-of-293 personal names described in the spec, no real foods among them.

- [ ] **Step 6: Commit**

```bash
git add src/lib/foodCache.ts src/lib/foodCache.test.ts
git commit -m "feat(food-cache): personal-name detection in Latin and Indic scripts"
```

---

### Task 9: Extend the AI response schema and prompt

**Files:**
- Modify: `src/lib/foodAiSchema.ts`
- Modify: `src/lib/ai.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `AiFoodItemOut` gains `canonical_key: string`, `food_class: string`, `aliases: string[]`, `basis: "100g" | "piece"`.

The model currently returns none of these. The cache groups on `canonical_key` and guards collisions on `food_class`, so both must come back from the call.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/ai.test.ts`:

```ts
// ── cache fields: the model must name the food canonically and classify it ──
const cacheItem = validateFoodResponse(
  {
    kind: "single",
    items: [
      item({
        canonical_key: "curd rice",
        food_class: "rice dish",
        aliases: ["Dahi bhaat", "Thayir saadam"],
        basis: "100g",
      }),
    ],
  },
  "curd rice",
);
assert.ok(cacheItem);
assert.equal(cacheItem.items[0].canonical_key, "curd rice");
assert.equal(cacheItem.items[0].food_class, "rice dish");
assert.deepEqual(cacheItem.items[0].aliases, ["Dahi bhaat", "Thayir saadam"]);
assert.equal(cacheItem.items[0].basis, "100g");

// Missing cache fields must not reject the item — the user still gets an
// answer, it simply cannot be cached without a key to group it under.
const noCache = validateFoodResponse({ kind: "single", items: [item()] }, "x");
assert.ok(noCache);
assert.equal(noCache.items[0].canonical_key, "");
assert.deepEqual(noCache.items[0].aliases, []);
assert.equal(noCache.items[0].basis, "100g");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node src/lib/ai.test.ts`
Expected: FAIL — `canonical_key` is `undefined`.

- [ ] **Step 3: Add the fields to the schema**

In `src/lib/foodAiSchema.ts`, inside the `AiFoodItem` object, beside the other per-item fields:

```ts
    // ── Cache fields ─────────────────────────────────────────────────────
    // The cache groups three independent answers by canonical_key and refuses
    // to serve a keyed match whose food_class disagrees. Every one of these
    // catches to a safe empty value: an answer without them is still shown to
    // the user, it just cannot be cached.
    canonical_key: z.string().max(120).catch(""),
    food_class: z.string().max(60).catch(""),
    aliases: z.array(z.string().max(120)).max(12).catch([]),
    basis: z.enum(["100g", "piece"]).catch("100g"),
```

- [ ] **Step 4: Add the instructions to the prompt**

In `FOOD_SEARCH_SYSTEM` in the same file, append to the rules section, keeping the existing tone:

```
Also return, for each item:
- "canonical_key": the plainest English name for this food, lowercase, no
  brand, no portion, no region — "curd rice", not "My Curd Rice (Daddojanam)".
  The same dish must produce the same key every time you are asked.
- "food_class": what kind of food it is — "rice dish", "flatbread", "lentil
  curry", "beverage", "fried snack".
- "aliases": other names for this food, including native-script spellings in
  Kannada, Tamil, Telugu, Hindi, Malayalam, Bengali, Gujarati or Punjabi where
  you know them. Names only, never portions.
- "basis": "100g" for anything weighed, "piece" for a countable item you have
  given piece_g for.
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node src/lib/ai.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify against the live model**

The prompt change is only real if the model obeys it. With `GEMINI_API_KEY` set:

```bash
npm run dev
```

Search a food the catalog does not hold — "thatte idli" — on the food page, and confirm in the server log that the parsed item carries a non-empty `canonical_key` and `food_class`. An empty key means the prompt wording needs sharpening, not that the schema is wrong.

- [ ] **Step 7: Commit**

```bash
git add src/lib/foodAiSchema.ts src/lib/ai.test.ts
git commit -m "feat(food-cache): AI answers carry canonical key, class and aliases"
```

---

### Task 10: Cache reads and writes

**Files:**
- Create: `src/server/foodCache.ts`

**Interfaces:**
- Consumes: `Macros`, `quorumPasses`, `consolidate`, `crossCheckAliases`, `searchKey`, `scriptOf` from `src/lib/foodCache.ts`.
- Produces:
  - `lookupCache(opts: { query: string; userId: string }): Promise<CachedFood | null>`
  - `recordAnswer(row: UnverifiedRow): Promise<void>`
  - `types`: `CachedFood = Macros & { food_name: string; food_class: string; basis: "100g" | "piece"; piece_g: number | null; verified: boolean }`; `UnverifiedRow = Macros & { canonical_key: string; food_name: string; food_class: string; basis: "100g" | "piece"; piece_g?: number; aliases: string[]; engine: string; model: string }`

This is Review Focus item 5: a Postgres failure must never turn a working search into a broken one.

- [ ] **Step 1: Write the file**

Create `src/server/foodCache.ts`:

```ts
/**
 * All database access for the AI food cache.
 *
 * Server-only, like gemini.ts and groq.ts: the three cache tables grant to
 * service_role alone, so nothing here can run in a browser even by accident.
 *
 * Every function in this file swallows its own errors. A cache outage must
 * cost money, never break search — a failed read falls through to the AI call
 * and a failed write only delays a food reaching quorum.
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

/** Typo tolerance within one script. */
const SIM_SAME_SCRIPT = 0.7;
/**
 * Across scripts the bar is higher. Transliteration noise is a different and
 * less trustworthy error class than a fat-fingered typo.
 */
const SIM_CROSS_SCRIPT = 0.85;

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

    const { data: verified } = await db
      .from("ai_verified")
      .select("*")
      .or(`canonical_key.eq.${key},search_key.eq.${key}`)
      .limit(1)
      .maybeSingle();

    let row = verified;
    if (!row) {
      // Fall back to similarity. The threshold depends on whether the query
      // and the stored name are written in the same script.
      const { data: near } = await db.rpc("ai_verified_similar", {
        q: key,
        min_sim: SIM_SAME_SCRIPT,
      });
      const candidate = near?.[0];
      if (candidate) {
        const cross = scriptOf(opts.query) !== scriptOf(candidate.food_name);
        const floor = cross ? SIM_CROSS_SCRIPT : SIM_SAME_SCRIPT;
        if (candidate.sim >= floor) row = candidate;
      }
    }
    if (!row) return null;

    // A per-user correction overrides the shared values, never deletes them.
    const { data: flagged } = await db
      .from("ai_flagged")
      .select("*")
      .eq("user_id", opts.userId)
      .eq("canonical_key", row.canonical_key)
      .maybeSingle();

    const macros = {} as Macros;
    for (const m of MACROS) macros[m] = Number((flagged ?? row)[m]);

    return {
      ...macros,
      food_name: row.food_name,
      food_class: row.food_class,
      basis: row.basis,
      piece_g: row.piece_g,
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
    await db.from("ai_unverified").insert({
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

    // food_class is an absolute collision guard. Romanisation is lossy, so two
    // genuinely different foods can land on one canonical_key by coincidence —
    // and three answers about two different foods must never be averaged into
    // one verified row. Only rows agreeing with this answer's class count.
    const { data: all } = await db
      .from("ai_unverified")
      .select("*")
      .eq("canonical_key", row.canonical_key)
      .order("created_at", { ascending: true });

    const group = (all ?? [])
      .filter((g) => g.food_class === row.food_class)
      .slice(0, 3);

    if (group.length < 3) return;

    const macroRows = group.map((g) => {
      const m = {} as Macros;
      for (const k of MACROS) m[k] = Number(g[k]);
      return m;
    });

    if (quorumPasses(macroRows)) {
      await db.from("ai_verified").upsert({
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
    }

    // Pass or fail, the group's rows are done: promoted, or deleted so the
    // next search starts a brand-new group at entry one. Deliberately not a
    // sliding window.
    await db
      .from("ai_unverified")
      .delete()
      .in("id", group.map((g) => g.id));
  } catch (err) {
    console.warn("[food-cache] write failed, answer served but not cached", err);
  }
}
```

- [ ] **Step 2: Verify the food_class collision guard**

The guard has no pure function to unit-test, so prove it against the database.
Insert three rows sharing a `canonical_key` but split across two classes:

```sql
insert into public.ai_unverified
  (canonical_key, search_key, food_name, food_class, basis, enerc, protcnt, fatce, choavldf, fibtg, engine, model)
values
  ('test collide', 'test collide', 'Test A', 'rice dish',  '100g', 700, 10, 5, 20, 2, 'test', 'test'),
  ('test collide', 'test collide', 'Test B', 'rice dish',  '100g', 700, 10, 5, 20, 2, 'test', 'test'),
  ('test collide', 'test collide', 'Test C', 'beverage',   '100g', 700, 10, 5, 20, 2, 'test', 'test');
```

Then call `recordAnswer` with a fourth `rice dish` answer for the same key.

Expected: the three `rice dish` rows consolidate and the `beverage` row is left
untouched in `ai_unverified`. A verified row averaging all four means the guard
is not wired and the task is not done. Clean up afterwards:

```sql
delete from public.ai_unverified where canonical_key = 'test collide';
delete from public.ai_verified where canonical_key = 'test collide';
```

- [ ] **Step 3: Add the similarity RPC**

Create `supabase/migrations/20260922130000_ai_verified_similar.sql`:

```sql
-- Trigram nearest-match over the verified cache. SECURITY INVOKER so it holds
-- no privilege of its own: only service_role can read the table it queries.
create or replace function public.ai_verified_similar(q text, min_sim real)
returns table (
  canonical_key text,
  search_key text,
  food_name text,
  food_class text,
  basis text,
  piece_g numeric,
  enerc numeric,
  protcnt numeric,
  fatce numeric,
  choavldf numeric,
  fibtg numeric,
  sim real
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select v.canonical_key, v.search_key, v.food_name, v.food_class, v.basis,
         v.piece_g, v.enerc, v.protcnt, v.fatce, v.choavldf, v.fibtg,
         similarity(v.search_key, q) as sim
  from public.ai_verified v
  where similarity(v.search_key, q) >= min_sim
  order by sim desc
  limit 1;
$$;

revoke all on function public.ai_verified_similar(text, real) from public, anon, authenticated;
grant execute on function public.ai_verified_similar(text, real) to service_role;
```

Apply it the same way as Task 1, and verify with the same signed-in-client check that `authenticated` cannot execute it.

- [ ] **Step 4: Verify the module does not reach the client bundle**

```bash
npm run build
```

Expected: build succeeds. Then confirm no cache module is bundled:

```bash
grep -rl "ai_unverified" dist/ | grep -v "server" | head
```

Expected: no output. Any client chunk naming the table means the import protection was bypassed and the task is not done.

- [ ] **Step 5: Commit**

```bash
git add src/server/foodCache.ts supabase/migrations/20260922130000_ai_verified_similar.sql
git commit -m "feat(food-cache): server-side cache reads and quorum writes"
```

---

### Task 11: Wire the cache into `runFoodSearch`

**Files:**
- Modify: `src/lib/ai.ts:53-128`

**Interfaces:**
- Consumes: `lookupCache`, `recordAnswer` from Task 10; `cacheGate`, `isPersonalName` from Tasks 5 and 8.
- Produces: `runFoodSearch(rawQuery, engine, userId)` — the third parameter is new and required for the per-user `ai_flagged` override.

- [ ] **Step 1: Add the cache lookup before the AI call**

In `src/lib/ai.ts`, change the signature and add the lookup immediately after the `cleanQuery` guard:

```ts
async function runFoodSearch(
  rawQuery: string,
  engine: FoodSearchEngine = "groq",
  userId?: string,
): Promise<AiFoodResult> {
  const cleanQuery = sanitizeFoodQuery(rawQuery);
  if (cleanQuery.length < 2) return { kind: "single", items: [] };

  const { isPersonalName, cacheGate } = await import("@/lib/foodCache");
  // A private meal name never touches the shared cache, on a hit or a miss.
  const personal = isPersonalName(cleanQuery);

  if (!personal && userId) {
    const { lookupCache } = await import("@/server/foodCache");
    const hit = await lookupCache({ query: cleanQuery, userId });
    if (hit) {
      return {
        kind: "single",
        items: [
          {
            code: "ai-fallback" as const,
            name: hit.food_name,
            scie: "",
            grup: hit.food_class || "AI Fallback",
            enerc: hit.enerc,
            protcnt: hit.protcnt,
            fatce: hit.fatce,
            choavldf: hit.choavldf,
            fibtg: hit.fibtg,
            units: hit.basis === "piece" ? ["g" as const, "pcs" as const] : ["g" as const],
            piece_g: hit.piece_g ?? undefined,
            serving_g: 100,
            canonical_key: "",
            food_class: hit.food_class,
            aliases: [],
            basis: hit.basis,
          },
        ],
      };
    }
  }
```

- [ ] **Step 2: Gate and record the answer after the AI call**

`validateFoodResponse` runs `reconcileEnergy` internally, so the gate must see the parsed object *before* validation repairs it. Replace the final return of `runFoodSearch`:

```ts
  // The cache gate reads the RAW model answer. reconcileEnergy inside
  // validateFoodResponse rewrites enerc from the macros, and a repaired value
  // passes the gate by construction — running this afterwards is a no-op.
  const rawItems = Array.isArray((parsed as { items?: unknown[] })?.items)
    ? ((parsed as { items: Record<string, number>[] }).items ?? [])
    : [];
  const cacheable = rawItems.filter((it) =>
    cacheGate({
      enerc: Number(it.enerc),
      protcnt: Number(it.protcnt),
      fatce: Number(it.fatce),
      choavldf: Number(it.choavldf),
      fibtg: Number(it.fibtg),
    }),
  );

  const result = validateFoodResponse(parsed, cleanQuery) ?? {
    kind: "single" as const,
    items: [],
  };

  if (!personal && cacheable.length) {
    const { recordAnswer } = await import("@/server/foodCache");
    const model = engine === "gemini" ? GEMINI_LITE_MODEL : "openai/gpt-oss-120b";
    // Awaited rather than fired and forgotten: a serverless function may be
    // frozen the moment it returns, and an unawaited write would be lost.
    for (const it of cacheable) {
      const out = result.items.find((r) => r.name === it.name);
      if (!out?.canonical_key) continue;
      await recordAnswer({
        canonical_key: out.canonical_key,
        food_name: out.name,
        food_class: out.food_class,
        basis: out.basis,
        piece_g: out.piece_g,
        aliases: out.aliases,
        engine,
        model,
        enerc: Number(it.enerc),
        protcnt: Number(it.protcnt),
        fatce: Number(it.fatce),
        choavldf: Number(it.choavldf),
        fibtg: Number(it.fibtg),
      });
    }
  }

  return result;
}
```

`GEMINI_LITE_MODEL` is already exported from `src/server/gemini.ts`, but that module must not enter this file's static graph. Read it from the dynamic import the Gemini branch already performs — capture the module object there and reuse it — rather than adding a top-level import.

- [ ] **Step 3: Pass the user id from both server functions**

In the same file, both handlers already hold `ctx.context.userId`:

```ts
    return runFoodSearch(ctx.data, undefined, ctx.context.userId);
```

and

```ts
    return runFoodSearch(ctx.data.query, ctx.data.engine, ctx.context.userId);
```

- [ ] **Step 4: Verify a miss becomes a row, and a repeat is free**

```bash
npm run dev
```

Search "thatte idli" on the food page. Then check the row landed:

```sql
select canonical_key, food_name, engine, model, created_at
from public.ai_unverified order by created_at desc limit 3;
```

Expected: one row. Search it twice more and confirm the group consolidates:

```sql
select canonical_key, models, verified_at from public.ai_verified;
select count(*) from public.ai_unverified;
```

Expected: one verified row, and the three staging rows gone. A fourth search should now return with no AI call in the server log.

- [ ] **Step 5: Verify a cache outage does not break search**

Temporarily set `SUPABASE_SERVICE_ROLE_KEY` to an invalid value, restart the dev server, and search an uncached food.

Expected: the search still returns an answer, and the log shows `[food-cache] lookup failed, falling through to AI`. This is Review Focus item 5. Restore the key afterwards.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai.ts
git commit -m "feat(food-cache): serve from cache, gate and record every AI answer"
```

---

### Task 12: Personal-name path and auto-save on log

**Files:**
- Modify: `src/components/FoodSearch.tsx:166-215`, `:443-500`

**Interfaces:**
- Consumes: `isPersonalName` from Task 8, the existing `saveFavoriteMeal` and `savedMeals` state.
- Produces: no new exports.

- [ ] **Step 1: Match a personal query against the user's own saved meals first**

In `src/components/FoodSearch.tsx`, before the AI search fires at line 376, add:

```ts
      // A private meal name is answered from the user's own saved meals when
      // it can be, and never reaches the shared cache either way. The match
      // runs here rather than on the server because saved_meals is already
      // loaded under per-user RLS — no round trip, no pg_trgm.
      if (isPersonalName(q)) {
        const own = savedMeals.find(
          (m) => similarity(m.name.toLowerCase(), q.toLowerCase()) >= 0.8,
        );
        if (own) {
          applySavedMeal(own);
          return;
        }
      }
```

Import both helpers at the top of the file:

```ts
import { isPersonalName } from "@/lib/foodCache";
import { similarity } from "@/lib/foodFuzzy";
```

`applySavedMeal` is the existing handler the saved-meals list already uses to populate the form; reuse it rather than writing a second path.

- [ ] **Step 2: Auto-save the estimate when a personal food is logged**

In the insert branch at line 443, after a successful `food_logs` insert:

```ts
      // Auto-save on log, not on search. Searching a private name saves
      // nothing; logging it is the signal that the name means something, and
      // it makes the next search of it free.
      if (isPersonalName(item.food_name)) {
        await saveFavoriteMeal({
          name: item.food_name,
          calories: item.calories,
          protein_g: item.protein_g,
          carbs_g: item.carbs_g,
          fat_g: item.fat_g,
          fiber_g: item.fiber_g,
        });
      }
```

`saveFavoriteMeal` already upserts on `(user_id, name)`, so re-logging the same name updates rather than duplicating.

- [ ] **Step 3: Verify the whole personal loop by hand**

```bash
npm run dev
```

1. Search "my protein shake" — an AI estimate appears.
2. Confirm nothing was cached:
   ```sql
   select count(*) from public.ai_unverified where food_name ilike 'my %';
   ```
   Expected: 0.
3. Log it. Confirm it saved:
   ```sql
   select name from public.saved_meals where name ilike 'my protein shake';
   ```
   Expected: one row.
4. Search "my protein shake" again. Expected: it resolves instantly from saved meals, with no AI call in the server log.

- [ ] **Step 4: Commit**

```bash
git add src/components/FoodSearch.tsx
git commit -m "feat(food-cache): personal names resolve from saved meals and save on log"
```

---

### Task 13: Voice and photo parse returns names only

**Files:**
- Modify: `src/components/VoiceFoodDialog.tsx:74-140`

**Interfaces:**
- Consumes: `serverAiFoodSearchInline` from `src/lib/ai.ts`.
- Produces: `parseVoiceFoodLog` returns items whose macro fields are filled by the cache path rather than by the parse call.

Today this does name-finding and macro-estimation in one call, so voice and photo logs bypass the cache entirely — they pay full price forever and contribute nothing.

- [ ] **Step 1: Strip macros from the parse prompt**

In `src/components/VoiceFoodDialog.tsx`, replace the JSON shape and the rules in `parseVoiceFoodLog`:

```ts
  const prompt = `You are a nutrition expert. The user said: "${transcript}"
Parse every food item mentioned and return ONLY a JSON array, no markdown:
[
  {
    "food_name": "string",
    "quantity_g": number,
    "unit": "string (e.g. 'pieces', 'bowls', 'g')",
    "unit_quantity": number,
    "meal_type": "${mealType}"
  }
]
Rules:
- Name the food only. Do NOT return calories or any macro value: those are
  looked up separately, from a verified database wherever one exists.
- Use common portion sizes if not specified (1 roti = 40g, 1 bowl dal = 150g, 1 banana = 120g, 1 egg = 50g)
- If user says "2 rotis", set unit="rotis", unit_quantity=2, quantity_g=80. If they just say grams, set unit="g", unit_quantity=100
- Each distinct food is a separate item in the array
- Return empty array [] if no food is mentioned`;
```

Lower the budget, since the response is now much smaller: change `max_tokens: 600` to `max_tokens: 400` in both the Gemini and Groq branches.

- [ ] **Step 2: Fill the macros through the cache path**

After the parsed array is obtained, resolve each name:

```ts
  // Each parsed name goes through the same path a typed search takes: the
  // bundled catalog, then the user's correction, then the verified cache, and
  // only then a paid call. This is what puts voice and photo logs on the
  // cache instead of beside it.
  const items = Array.isArray(parsed) ? (parsed as VoiceFoodItem[]) : [];
  return Promise.all(
    items.map(async (it) => {
      const { items: found } = await serverAiFoodSearchInline({
        data: { query: it.food_name, engine },
      });
      const f = found[0];
      if (!f) return { ...it, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };
      const ratio = (it.quantity_g || 100) / 100;
      return {
        ...it,
        calories: +((f.enerc / 4.184) * ratio).toFixed(1),
        protein_g: +(f.protcnt * ratio).toFixed(1),
        carbs_g: +(f.choavldf * ratio).toFixed(1),
        fat_g: +(f.fatce * ratio).toFixed(1),
        fiber_g: +(f.fibtg * ratio).toFixed(1),
      };
    }),
  );
```

Add `serverAiFoodSearchInline` to the existing import from `@/lib/ai`.

- [ ] **Step 3: Verify a spoken sentence splits and resolves**

```bash
npm run dev
```

Speak or type "I ate two idlis and a bowl of sambar" into the voice dialog.

Expected: two items, each with real macros, and — for any food already in `ai_verified` — no second AI call in the server log. The rejected alternative here was splitting speech with the free `COMPOSITE_SPLIT` regex; it is weaker than the model on messy speech, which is why the parse call stays.

- [ ] **Step 4: Commit**

```bash
git add src/components/VoiceFoodDialog.tsx
git commit -m "feat(food-cache): voice and photo logs resolve through the cache"
```

---

### Task 14: A correction writes `ai_flagged`

**Files:**
- Modify: `src/lib/ai.ts`
- Modify: `src/components/FoodSearch.tsx:426-441`

**Interfaces:**
- Consumes: `supabaseAdmin` from `@/integrations/client.server`, dynamically imported.
- Produces: `serverFlagFood` — a TanStack server function taking `{ canonical_key, enerc, protcnt, fatce, choavldf, fibtg }` and upserting one `ai_flagged` row for the calling user.

- [ ] **Step 1: Add the server function**

In `src/lib/ai.ts`, beside the other server functions:

```ts
// ── Food correction ─────────────────────────────────────────────────────────
// A user editing the macros of a verified food overrides it for themselves.
// The shared ai_verified row is deliberately left alone: one person cannot
// wipe a food for everybody else, or push them back onto paid calls.

export const serverFlagFood = createServerFn({ method: "POST" })
  .middleware([requireAccess])
  .inputValidator(
    z.object({
      canonical_key: z.string().min(1).max(120),
      enerc: z.number().finite().min(0).max(3766),
      protcnt: z.number().finite().min(0).max(100),
      fatce: z.number().finite().min(0).max(100),
      choavldf: z.number().finite().min(0).max(100),
      fibtg: z.number().finite().min(0).max(100),
    }),
  )
  .handler(async (ctx) => {
    const { supabaseAdmin: db } = await import("@/integrations/client.server");
    const { error } = await db
      .from("ai_flagged")
      .upsert(
        { user_id: ctx.context.userId, ...ctx.data },
        { onConflict: "user_id,canonical_key" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
```

- [ ] **Step 2: Call it from the edit path**

In `src/components/FoodSearch.tsx`, in the `isEditing && editLogId` branch at line 426, after the `food_logs` update succeeds:

```ts
      // Only a verified food can be corrected — a catalog row is authoritative
      // and an estimate is not stable enough to be worth overriding.
      if (editingCanonicalKey) {
        await serverFlagFood({
          data: {
            canonical_key: editingCanonicalKey,
            enerc: +(((+customCal || 0) * 4.184) / ratio).toFixed(1),
            protcnt: +((+customP || 0) / ratio).toFixed(1),
            fatce: +((+customF || 0) / ratio).toFixed(1),
            choavldf: +((+customC || 0) / ratio).toFixed(1),
            fibtg: +((+customFib || 0) / ratio).toFixed(1),
          },
        });
      }
```

`editingCanonicalKey` is new component state, set alongside `setEditLogId` when the row being edited came from the cache, and cleared with it. Values are divided by `ratio` because `ai_flagged` stores the per-100 g basis while the form holds the logged quantity.

- [ ] **Step 3: Verify the override is per user**

```bash
npm run dev
```

1. Search a verified food, log it, edit its calories, save.
2. Confirm the flag exists and the shared row is untouched:
   ```sql
   select user_id, canonical_key, enerc from public.ai_flagged;
   select canonical_key, enerc from public.ai_verified where canonical_key = '<key>';
   ```
   Expected: one flagged row with the new value; the verified row unchanged.
3. Search the same food again as that user — the corrected values appear.
4. Search it as a different user — the original shared values appear.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai.ts src/components/FoodSearch.tsx
git commit -m "feat(food-cache): a correction becomes a per-user override"
```

---

### Task 15: Weekly review tooling

**Files:**
- Create: `scripts/food-cache-review.mjs`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Produces: a printed report. Writes nothing.

Promotion into the bundled catalog stays a hand-made commit to `src/data/extraFoods.ts`. That review step is the whole protection the "never write to the catalog" rule is asking for, and automating it would remove it.

- [ ] **Step 1: Write the script**

Create `scripts/food-cache-review.mjs`:

```js
/**
 * Weekly review of the AI food cache. Read-only, by design.
 *
 * Prints what verified recently, what users have corrected, and which foods
 * are stuck short of quorum. Promotion into src/data/extraFoods.ts is a hand
 * edit and a reviewed commit — this script never writes anywhere.
 *
 * Run:  node scripts/food-cache-review.mjs
 */
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const since = new Date(Date.now() - 7 * 864e5).toISOString();

const { data: verified } = await db
  .from("ai_verified")
  .select("canonical_key, food_name, food_class, enerc, protcnt, fatce, choavldf, fibtg, aliases, models")
  .gte("verified_at", since)
  .order("verified_at", { ascending: false });

console.log(`\n=== Verified this week: ${verified?.length ?? 0} ===`);
for (const v of verified ?? []) {
  console.log(
    `${v.food_name}  [${v.food_class}]  ${Math.round(v.enerc / 4.184)} kcal  ` +
      `P${v.protcnt} F${v.fatce} C${v.choavldf} Fib${v.fibtg}`,
  );
  if (v.aliases?.length) console.log(`    aliases: ${v.aliases.join(", ")}`);
}

const { data: flagged } = await db
  .from("ai_flagged")
  .select("canonical_key, enerc, protcnt, fatce, choavldf, fibtg");

const byFood = new Map();
for (const f of flagged ?? [])
  byFood.set(f.canonical_key, (byFood.get(f.canonical_key) ?? 0) + 1);

console.log(`\n=== Corrected by users: ${byFood.size} foods ===`);
// Several people correcting the same food is the strongest signal the shared
// row is wrong, so the list is ordered by how many did.
for (const [key, n] of [...byFood].sort((a, b) => b[1] - a[1]))
  console.log(`${key}  — ${n} user${n > 1 ? "s" : ""}`);

const { data: pending } = await db
  .from("ai_unverified")
  .select("canonical_key, food_name");

const stuck = new Map();
for (const p of pending ?? [])
  stuck.set(p.canonical_key, (stuck.get(p.canonical_key) ?? 0) + 1);

console.log(`\n=== Short of quorum: ${stuck.size} foods ===`);
for (const [key, n] of [...stuck].sort((a, b) => b[1] - a[1]))
  console.log(`${key}  — ${n}/3`);
```

- [ ] **Step 2: Run it**

```bash
node scripts/food-cache-review.mjs
```

Expected: three sections print without error. Empty sections are correct on a fresh cache.

- [ ] **Step 3: Commit**

```bash
git add scripts/food-cache-review.mjs
git commit -m "feat(food-cache): weekly review report"
```

---

## Verification

After every task is complete:

- [ ] `node src/lib/foodCache.test.ts` — passes
- [ ] `node src/lib/foodFuzzy.test.ts` — passes
- [ ] `node src/lib/ai.test.ts` — passes
- [ ] `npm run lint` — clean
- [ ] `npm run build` — succeeds, and `grep -rl "ai_unverified" dist/ | grep -v server` finds nothing
- [ ] A signed-in client is denied on all three cache tables and on `ai_verified_similar`
- [ ] A food searched three times reaches `ai_verified`, and the fourth search makes no AI call
- [ ] A personal name never appears in `ai_unverified`
