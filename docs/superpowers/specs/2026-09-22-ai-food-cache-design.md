# AI Food Cache — Design

Date: 2026-09-22
Status: approved for planning

## Purpose

Most food searches in Dombelz repeat a food someone has already looked up. Today
every miss against the bundled catalog costs a fresh AI call, and the answer is
thrown away the moment it is rendered. This design keeps those answers, verifies
them before trusting them, and serves them for free from then on.

Success is measured two ways: AI spend per logged food falls as the same foods
recur, and a cached answer is at least as trustworthy as the AI answer it
replaces — because nothing reaches the trusted tier without three independent
agreeing answers.

## Verified starting state

These were checked against the repository and the live project on 2026-09-22.
Several contradict the original brief, and the design follows the code.

- **`main_food_db` is not a Postgres table.** The authoritative catalog is three
  client-bundled files merged into `ITEMS` in `src/lib/foodDb.ts`:
  `src/data/ifct2017.json` (534 KB, IFCT 2017), `src/data/extraFoods.ts`
  (curated cooked dishes), `src/data/restaurantFoods.json` (menu items). Search
  runs in the browser via `searchFoods` and `src/lib/foodFuzzy.ts`, costing
  nothing and hitting no network.
- **Nothing generates the multilingual alias names.** "Curd rice (Dahi
  bhaat/Dahi chawal/Perugu annam/Daddojanam/Thayir saadam)" is a literal row
  name in `ifct2017.json` at line 7888. There is no existing pipeline behind it,
  so there is nothing to duplicate and nothing to fold in. IFCT rows also carry
  a `lang` field holding per-language names, which is already fed to the model as
  reference data.
- **Every AI food search funnels through one function**, `runFoodSearch` in
  `src/lib/ai.ts`. Both `serverAiFoodSearch` and `serverAiFoodSearchInline` call
  it, both gate on `requireAccess`, and both are rate limited to 30 requests per
  minute per user.
- **No edge functions are needed.** AI calls already run inside Vercel server
  functions, which is where the cache belongs too.
- **Gemini is the production model.** Groq is the current default on some
  surfaces and is being removed over time, so the cache is written to be
  engine-agnostic: every stored answer records which model produced it, and a
  fallback model works through the same path.
- **`saved_meals` already exists** with per-user RLS, written by
  `saveFavoriteMeal` in `src/components/FoodSearch.tsx`. It stores whole-meal
  totals in kcal, not per-100 g values, so it never interacts with the shared
  cache's basis or matching.
- **Multi-item splitting already exists**, twice: the free `COMPOSITE_SPLIT`
  regex in `src/lib/foodFuzzy.ts` for typed queries, and `parseVoiceFoodLog` in
  `src/components/VoiceFoodDialog.tsx` for spoken sentences and photos.
- **Energy is stored in kilojoules** throughout the catalog (`enerc`), converted
  at display time by `kcalOf`. The cache stores kJ for the same reason; mixing
  units would silently misreport a day's intake by a factor of 4.184.
- `pg_trgm` is not installed on the project. `pgvector` is not needed.

## Scope

In scope: the three new cache tables, the verification pipeline, the search
wiring, the personal-name path, cross-script matching, and the voice/photo
change needed for those logs to use the cache.

Out of scope: Gemini's own server-side context caching. It is a pure cost
optimisation with no effect on correctness and is deferred to its own piece of
work. Also out of scope: migrating the bundled catalog into Postgres.

## Architecture

Four tiers are read in order. The first three cost nothing.

1. **Bundled catalog** (`ITEMS`) — searched in the browser, unchanged, instant.
   This is `main_food_db`. It is never written to by any part of this pipeline;
   additions arrive only through the weekly manual review as a reviewed commit.
2. **`ai_flagged`** — the searching user's own correction, if they have one.
3. **`ai_verified`** — the shared trusted tier, three independent agreeing
   answers consolidated into one row.
4. **AI call** — last resort, and its answer becomes a row in `ai_unverified`.

Code is split so the judgement logic can be tested without a database:

- `src/lib/foodCache.ts` — pure functions only: canonical key, search key,
  Atwater gate, quorum check, alias cross-check, personal-name detection. No
  imports from the server, no network, no Supabase.
- `src/server/foodCache.ts` — all database access, using the service-role
  client. Server-only, kept out of the client bundle by the same
  `importProtection` rule that protects `src/server/gemini.ts`.
- `src/lib/ai.ts` — `runFoodSearch` gains the cache lookup before the AI call
  and the write after it. No new endpoint; every existing caller inherits the
  cache.

## Schema

Three new tables. RLS is enabled on all three with **no policies for `anon` or
`authenticated`**: the migration explicitly revokes from those roles and grants
only to `service_role`. Nothing about a shared cache needs to be reachable from
a browser, and this removes the entire class of a user writing to `ai_verified`
directly.

### `ai_unverified`

One row per individual AI answer.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `canonical_key` | text | grouping key, from the AI answer (see below) |
| `search_key` | text | romanised, normalised form used for matching |
| `food_name` | text | as the model named it, original script, never overwritten |
| `food_class` | text | collision guard — two foods that sound alike are not the same food |
| `basis` | text | `'100g'` or `'piece'`, checked |
| `piece_g` | numeric | grams in one piece, when `basis = 'piece'` |
| `enerc` | numeric | kJ |
| `protcnt`, `fatce`, `choavldf`, `fibtg` | numeric | grams |
| `aliases` | text[] | this single answer's claim; not trusted yet |
| `engine`, `model` | text | which model produced this row |
| `created_at` | timestamptz | |

Indexes: btree on `canonical_key`, GIN `gin_trgm_ops` on `search_key`.

### `ai_verified`

One row per verified food. The three source rows are deleted on consolidation.

| Column | Type | Notes |
|---|---|---|
| `canonical_key` | text pk | |
| `search_key` | text | |
| `food_name` | text | |
| `food_class` | text | |
| `basis`, `piece_g` | | as above |
| `enerc`, `protcnt`, `fatce`, `choavldf`, `fibtg` | numeric | the mean of the three answers |
| `aliases` | text[] | only aliases that survived the 2-of-3 cross-check |
| `models` | text[] | the three models that produced it |
| `verified_at` | timestamptz | |

Indexes: GIN `gin_trgm_ops` on `search_key`, GIN on `aliases`.

### `ai_flagged`

One row per user per corrected food. A correction is that user's own override
and is also the signal the weekly review reads.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid | |
| `canonical_key` | text | the `ai_verified` row corrected |
| `enerc`, `protcnt`, `fatce`, `choavldf`, `fibtg` | numeric | the user's values |
| `edited_at` | timestamptz | |

Unique on `(user_id, canonical_key)`.

## Matching: canonical key, search key, and script

`pg_trgm` compares characters, so "thatte idli" and "ತಟ್ಟೆ ಇಡ್ಲಿ" share nothing
and read as unrelated foods. Matching therefore never runs on raw text.

**`search_key`** is the romanised, lowercased, punctuation-stripped form of a
name, produced by an off-the-shelf transliteration library rather than
hand-written rules. `food_name` keeps the original script untouched for display
and as an alias. All lookup, dedup and similarity work uses `search_key`.

**`canonical_key`** comes from the model's own answer, not from the query text.
This is what groups the three verification rows together. Grouping on the AI's
canonical key rather than fuzzy-matching the raw query before the call sidesteps
cross-script matching entirely for this step — and it costs nothing, because
under organic timing an unverified search fires an AI call regardless of what a
pre-match would have said.

`pg_trgm` is still load-bearing for the **known-food lookup** in step 1, which
is the one place a hit must be recognised before any AI call happens.

**Thresholds.** A same-script match needs `similarity >= 0.7`, which is a typo
tolerance. A cross-script match — the query's detected script differs from the
stored name's original script — needs `>= 0.85`, because transliteration noise
is a different and less trustworthy error class than a fat-fingered typo.

**`food_class` is an absolute guard.** A `search_key` match alone never serves a
cached value. If the keys match but `food_class` disagrees, it is a miss: route
to a new group and a new AI call rather than silently serving the wrong food.

## Per-search flow

1. The client searches the bundled catalog. A hit ends here, as today: instant,
   no network, no cost.
2. On a miss, `runFoodSearch` runs server-side. Personal names branch off here
   (see below).
3. Look up `ai_flagged` for this user, then `ai_verified`, by `canonical_key`,
   alias, or `search_key` similarity at the thresholds above, with `food_class`
   agreement required. A hit is served at no cost and is not marked estimated.
4. On a miss, call the AI — one call, the same prompt every time, with no
   reference whatsoever to any existing row in the group. Independence is the
   property the whole quorum rests on.
5. Run the answer through the Atwater and mass-balance gate. A failure is
   discarded: no row is written, the group does not advance, and the user is
   served whatever the normal no-result path serves today.
6. On a pass, insert the row under its `canonical_key` group and serve it
   immediately, tagged "estimated".
7. If the group now holds three rows, run the quorum check. All five macros
   passing consolidates the group into one `ai_verified` row and deletes the
   three sources. Any macro failing deletes all three rows and empties the
   group; the next matching search starts again at entry one. This is
   delete-and-restart, never a sliding window.

Verification timing is **organic**: slots two and three fill only when real
users search that food again. Total spend is the same either way for foods
people actually repeat, and organic timing avoids burning three calls on typos,
junk and one-off regional dishes. Popular foods converge within hours at real
traffic; rare ones cost one call and stop.

## The gates

**Atwater and mass balance.** The reported energy must sit within **±7.5%** of
`4·protein + 9·fat + 4·carbohydrate`, and `protein + fat + carbohydrate + fibre`
must not exceed 100 g per 100 g. The band is deliberately wider than the 5%
quorum: published energy legitimately diverges from the Atwater calculation on
high-fibre, fermented and cooked Indian foods, and a 5% gate would reject real
curd rice while a 20% gate would catch almost nothing. A reported energy of zero
fails. The zero-energy oils in IFCT are a catalog quirk handled by `kcalOf`, not
something an AI answer should reproduce.

This gate is free, runs before any write, and applies only to AI answers.
Catalog rows never enter this flow.

**Quorum.** For each of the five macros, take the mean of the three answers;
every answer must fall within mean ±5%. Where the mean is below 0.5 g the macro
passes when all three values lie within 0.5 g of each other — without this floor
a fibre value of zero divides by approximately nothing and no food ever
verifies.

**Alias cross-check.** An alias survives only if it matches an alias in at least
**two of the three** answers at `similarity >= 0.9`, compared on `search_key`.
Aliases claimed by a single answer are dropped. The verification prompt asks for
native-script spellings as well as English variants; each is romanised through
the same library before comparison and storage.

## Personal names

A personal or possessive name — "my shake", "my chicken biryani", and the
equivalent possessive forms in Indic scripts — must never reach
`ai_unverified`, `ai_verified` or the alias set, whether it hits or misses.

1. Fuzzy-match the name against that user's own `saved_meals` rows. This runs
   client-side with the existing `foodFuzzy` helper: the rows are already
   readable under per-user RLS, so there is no server round trip and no
   `pg_trgm` involvement.
2. A match returns the saved values at no cost.
3. A miss calls the AI and shows a real estimate. The answer is served and
   nothing shared is written.
4. **Auto-save on log, not on search.** Searching a personal name saves
   nothing. If the user actually logs the item, the estimate is written into
   their own `saved_meals` under that name, so the next search of it is a free
   step-2 hit. A search without a log is not a strong enough signal to save, and
   keeps costing an AI call by design.

Detection must handle Indic script natively, not only romanised input.

## Voice and photo logs

`parseVoiceFoodLog` currently returns item names *and* macros in a single call,
so voice and photo logs bypass the search path completely and can neither feed
nor benefit from the cache.

The prompt changes to return **names and quantities only**. Each parsed name is
then routed through the normal path — bundled catalog, then `ai_flagged`, then
`ai_verified`, then AI. Cached items cost nothing, and the parse call itself
gets cheaper because it no longer emits macros. Typed composite queries use the
free `COMPOSITE_SPLIT` regex the same way, one cache lookup per split item.

## Corrections and demotion

A user editing the macros of an `ai_verified` food writes an `ai_flagged` row
for themselves. The shared `ai_verified` row is **not** removed: it continues to
serve every other user, and the flag is a signal for the weekly review rather
than a deletion. One user cannot wipe shared data or push everyone else back
onto paid calls. This mirrors the protection `main_food_db` already has, one
tier further down.

## Weekly manual review

A read-only tool over `ai_verified` and `ai_flagged` for a human to inspect:
what verified recently, what users have corrected, and where flags cluster on
one food. Promotion into the bundled catalog happens by editing
`src/data/extraFoods.ts` and committing it — a reviewable change, which is
exactly the protection the "never write to `main_food_db`" rule is asking for.
No automation writes to the catalog, ever.

## Error handling

An AI failure, a parse failure or a gate failure all behave the same way: the
user sees today's no-result path, and nothing is written. A database error on
the cache read falls through to the AI call, so a cache outage costs money but
never breaks search. A database error on the cache write is swallowed after
logging; the user already has their answer and a lost row only delays quorum.

## Testing

Pure functions in `src/lib/foodCache.ts` get unit tests beside the existing
`foodUnits.test.ts` and `foodFuzzy.test.ts`:

- canonical key and search key, including Indic script input
- the Atwater gate at the ±7.5% boundary, the 100 g mass balance, zero energy
- the quorum check, including the near-zero fibre floor
- the alias cross-check, including a single-source alias being dropped
- personal-name detection in English and in Indic script
- `food_class` disagreement forcing a miss despite a key match

## Build order

1. `pg_trgm` extension.
2. Migrations for the three tables, their indexes, RLS, and the explicit revoke
   then grant to `service_role` only.
3. `src/lib/foodCache.ts` pure functions, with tests, including the
   transliteration dependency.
4. `src/server/foodCache.ts` read and write access.
5. Cache lookup and write wired into `runFoodSearch`.
6. Quorum and consolidation.
7. Personal-name path, including auto-save on log.
8. Voice and photo names-only parse.
9. Correction writes an `ai_flagged` row.
10. Weekly review tooling.

## Accepted risks

- The three verification calls use an identical prompt. Hallucination is caught
  by the Atwater gate and the 5% cross-check, not by call diversity. Accepted.
- A food whose answers never converge retries without a cap. Cost is bounded by
  real query volume. Accepted.
- Romanisation is lossy, so two different foods can collide on `search_key`.
  Mitigated by `food_class` agreement and the stricter cross-script threshold,
  not by loosening the match.
