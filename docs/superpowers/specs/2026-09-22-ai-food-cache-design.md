# AI Food Cache — Design

Date: 2026-09-22
Status: approved for planning; amended during implementation — every reversal
is recorded, with its evidence, under "Decisions after approval" at the end,
and the sections below have been corrected to match.

## Purpose

Most food searches in Dombelz repeat a food someone has already looked up. Today
every miss against the bundled catalog costs a fresh AI call, and the answer is
thrown away the moment it is rendered. This design keeps those answers, verifies
them before trusting them, and serves them for free from then on.

Success is measured two ways: AI spend per logged food falls as the same foods
recur, and a cached answer is at least as trustworthy as the AI answer it
replaces — because nothing reaches the trusted tier without three independent
agreeing answers from at least two different people.

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
- **The bundled catalog is not purely IFCT 2017, and it carries aliases in two
  different shapes.** Of its 1,556 rows, 542 are real IFCT (codes `A`–`T`); the
  rest are a merged corpus of 490 `ASC*`, 376 `BFP*` and 148 `OSR*` rows. All
  1,014 merged rows have an empty `lang` field and keep their aliases inside
  `name`, in parentheses, slash-delimited — 384 of them do. The 430 rows that do
  populate `lang` hold aliases there instead, semicolon-delimited with language
  tags (`"A., Kash. Baajra; Kan. Sajje; Tam. Kambu"`), 423 of them. Around 630
  rows carry no aliases in either shape. An alias parser must therefore read
  **both** shapes: reading only `lang` drops every alias from two thirds of the
  catalog, and reading only `name` drops every real IFCT alias set.
- **Catalog energy figures are uneven.** The median `enerc`-to-Atwater ratio is
  4.1793, which is correct, but 225 of 1,542 rows sit outside ±5% of it. Part of
  that spread is genuine divergence between measured and calculated energy, part
  is inconsistent conversion in the merged rows. Catalog rows never enter the
  verification pipeline, so the Atwater gate is unaffected — but a catalog row's
  energy figure is not reliable when it is fed to the model as a reference
  value.
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
- `pg_trgm` is not installed on the project (this feature's first migration installs it). `pgvector` is not needed.

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
   A correction exists only for a verified row, so it is read once that row is
   found, and replaces the row's numbers for this user alone.
3. **`ai_verified`** — the shared trusted tier, three independent agreeing
   answers, from at least two different people, consolidated into one row.
4. **AI call** — last resort, and its answer becomes a row in `ai_unverified`.

Before any of the server tiers, the typed search checks the user's own
`saved_meals` (see "Personal names").

Code is split so the judgement logic can be tested without a database:

- `src/lib/foodCache.ts` — pure functions only: Atwater gate, quorum check,
  consolidation, catalog alias parsing, personal-name detection. No imports
  from the server, no network, no Supabase. The client imports it, so it must
  never import the transliteration library.
- `src/server/foodCacheKeys.ts` — the pure functions that need transliteration:
  script detection, search key, alias cross-check. Kept under `src/server` so
  `importProtection` makes a client import a build error: the browser never
  romanises, and the library is ~189 KB.
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
| `user_hash` | text | SHA-256 hex of the searching user's id — counts distinct people in a group (Decisions after approval, 9) |
| `created_at` | timestamptz | |

Indexes: btree on `canonical_key`, GIN `gin_trgm_ops` on `search_key`.

### `ai_verified`

One row per verified food. The three source rows are deleted on consolidation.

| Column | Type | Notes |
|---|---|---|
| `canonical_key` | text pk | |
| `search_key` | text | |
| `food_name` | text | the most common of the three answers' names |
| `food_class` | text | one of the 13 closed values |
| `basis`, `piece_g` | | the majority basis; the median `piece_g` |
| `enerc`, `protcnt`, `fatce`, `choavldf`, `fibtg` | numeric | the mean of the three answers |
| `aliases` | text[] | only aliases that survived the 2-of-3 cross-check |
| `alias_keys` | text[] | `search_key` of the row and of every alias — what cross-script lookup matches exactly |
| `models` | text[] | the three models that produced it |
| `verified_at` | timestamptz | |

Indexes: GIN `gin_trgm_ops` on `search_key` (used by the `ai_verified_similar`
function, the same-script typo backstop), GIN on `aliases`, GIN on
`alias_keys`. The verification pipeline only ever inserts a row here, never
updates one; only the weekly manual review changes a verified row.

### `ai_flagged`

One row per user per corrected food. A correction is that user's own override
and is also the signal the weekly review reads.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid | |
| `canonical_key` | text | the `ai_verified` row corrected |
| `enerc`, `protcnt`, `fatce`, `choavldf`, `fibtg` | numeric | the user's values, per 100 g with energy in kJ, whatever the row's basis |
| `edited_at` | timestamptz | |

Unique on `(user_id, canonical_key)`.

## Matching: canonical key, search key, and script

`pg_trgm` compares characters, so "thatte idli" and "ತಟ್ಟೆ ಇಡ್ಲಿ" share nothing
and read as unrelated foods. Matching therefore never runs on raw text.

**`search_key`** is the romanised, lowercased, punctuation-stripped form of a
name, produced by an off-the-shelf transliteration library rather than
hand-written rules. `food_name` keeps the original script untouched for display
and as an alias. All lookup, dedup and similarity work uses `search_key`.

Building `search_key` and the seed alias set for the bundled catalog means
parsing both alias shapes described above — the parenthetical, slash-delimited
form inside `name` and the semicolon-delimited, language-tagged form in `lang`.
One parser, two branches, tested against a row of each kind.

**`canonical_key`** comes from the model's own answer, not from the query text.
This is what groups the three verification rows together. Grouping on the AI's
canonical key rather than fuzzy-matching the raw query before the call sidesteps
cross-script matching entirely for this step — and it costs nothing, because
under organic timing an unverified search fires an AI call regardless of what a
pre-match would have said.

The **known-food lookup** is the one place a hit must be recognised before any
AI call happens. It runs in four steps, surest first, and the first three are
exact: the query's `search_key` against `canonical_key`, then against
`search_key`, then containment in `alias_keys`. The alias step is the
cross-script path: a Kannada query and the model's own Kannada alias for the
food romanise to the same key and match exactly, with no threshold. A step
that matches two different verified rows is ambiguous and is a miss, never
settled by whichever row the database returns first.

**Similarity is only a same-script typo backstop**, the fourth step:
`pg_trgm` similarity `>= 0.7`, or `>= 0.85` when the query's script differs
from the stored name's. It cannot be the cross-script matcher, because on
`pg_trgm` true cross-script pairs score below pairs of different foods (see
"Decisions after approval"). The two numbers are deliberately strict; a
near-miss costs one AI call.

**`food_class` guards grouping, not lookup.** It is one of 13 closed values,
and only answers that agree on it count toward the same group, so three
answers about two different foods that collided on one key are never averaged
into one row. At lookup time there is nothing to compare it with — the query
carries no class, the class being part of what the model is asked for — so a
verified row is served on its key alone. It is a coarse guard: two foods in
one bucket ("curry" holds malai kofta and chicken kofta) still group together
if their keys collide.

## Per-search flow

1. The client searches the bundled catalog, then the user's own saved meals. A
   hit ends here: instant, no network, no cost.
2. On a miss, `runFoodSearch` runs server-side. Personal names branch off here
   (see below).
3. Look up `ai_verified` by the four steps above. On a hit, this user's
   `ai_flagged` correction for that row, if any, replaces its five numbers.
   A hit is served at no cost and is not marked estimated.
4. On a miss, call the AI — one call, the same prompt every time, with no
   reference whatsoever to any existing row in the group. Independence is the
   property the whole quorum rests on.
5. Run the answer through the Atwater and mass-balance gate. A failure is
   discarded: no row is written, the group does not advance, and the user is
   served whatever the normal no-result path serves today.
6. On a pass, insert the row under its `canonical_key` group and serve it
   immediately, tagged "estimated". Three exceptions are served but never
   written: a key that is already verified (its row is final), a reply that
   contained more than one JSON object (an echoed few-shot example would
   validate cleanly and could be cached under the wrong key), and a second
   item of the same key and class within one reply (not an independent
   answer). Every row records `user_hash`, the SHA-256 of the searching
   user's id; a search with no user stages nothing, and a user who already
   holds `3 − MIN_DISTINCT_USERS + 1` (today 2) rows in the open group stages
   nothing more, so any three rows come from at least `MIN_DISTINCT_USERS`
   people.
7. If the group now holds three rows, run the quorum check — which also
   re-checks that the three come from at least `MIN_DISTINCT_USERS` people,
   resetting the group if not. All five macros
   passing consolidates the group into one `ai_verified` row — the mean of
   each macro, the median `piece_g`, the majority `basis`, the most common
   name — inserted only if no row holds that key, never overwriting one — and
   deletes the three sources. Any macro failing deletes all three rows and
   empties the group; the next matching search starts again at entry one.
   This is delete-and-restart, never a sliding window.

Verification timing is **organic**: slots two and three fill only when real
users search that food again. Total spend is the same either way for foods
people actually repeat, and organic timing avoids burning three calls on typos,
junk and one-off regional dishes. Popular foods converge within hours at real
traffic; rare ones cost one call and stop.

## The gates

These are two separate checks with two separate thresholds, on purpose. The
Atwater gate tests **one answer against itself** and runs on every call. The
quorum tests **three answers against each other** and runs only once a group is
full. Neither number is derived from the other and they must not be blended.

**Atwater and mass balance — ±25%, two-tier.** The repository already gates
energy in `reconcileEnergy` (`src/lib/foodAiSchema.ts`) at `ENERGY_TOL = 0.25`
with an absolute floor of `ENERGY_FLOOR_KJ = 85`, and it *repairs* rather than
rejects: a mismatched `enerc` is recomputed from the macros, because this path
only runs when local search found nothing and rejecting leaves the user with a
blank screen. Its comment records the measurement behind 25% — against all
1,556 catalog rows, pass rates are 93.8% at 10%, 97.3% at 15%, 97.7% at 25% and
98.1% at 40%.

Those two jobs are separated rather than merged. What the user sees does not
change: `reconcileEnergy` still repairs at ±25% and an answer is always
rendered. The cache gate is a second check that decides only whether an
answer is trustworthy enough to *count toward the three* — the reported energy
must sit within **±25%** of `4·protein + 9·fat + 4·carbohydrate`, and
`protein + fat + carbohydrate + fibre` must not exceed 100 g per 100 g. An
answer that fails is shown to the user and simply not cached.

The tolerance is the same ±25% as `reconcileEnergy`, by the product owner's
decision after ±10% was measured rejecting half of all model answers (see
"Decisions after approval"): the cache learns exactly what the app is willing
to show. One asymmetry remains: the cache gate has no 85 kJ absolute floor, so
below roughly 340 kJ of implied energy it is the tighter of the two.

**Order is load-bearing.** The cache gate runs on the **raw model answer**,
before `reconcileEnergy` touches it. Run afterwards it is a no-op, because a
repaired value is Atwater-consistent by construction.

A reported energy of zero fails. The zero-energy oils in IFCT are a catalog
quirk handled by `kcalOf`, not something an AI answer should reproduce. The
mass-balance half is genuinely new: the schema caps each macro at 100
individually but never checks their sum.

This gate is free and applies only to AI answers. Catalog rows never enter this
flow.

**Quorum — mean ±5%.** For each of the five macros, take the mean of the three answers;
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

1. Fuzzy-match **every** query — possessive or not — against that user's own
   `saved_meals` rows, before any server call. This runs client-side with the
   existing `foodFuzzy` helper: the rows are already readable under per-user
   RLS, so there is no server round trip and no `pg_trgm` involvement.
2. A match returns the saved values at no cost, and the query never reaches
   the server.
3. A miss calls the AI and shows a real estimate. For a name detected as
   personal the answer is served and nothing shared is written.
4. **Auto-save on log, not on search.** Searching a personal name saves
   nothing. If the user actually logs the item, the estimate is written into
   their own `saved_meals` under **the words they typed** — never under the
   model's corrected name, which for "my shake" is "Protein Shake" and is not
   personal at all — so the next search of it is a free step-2 hit. A search
   without a log is not a strong enough signal to save, and keeps costing an
   AI call by design.

### How a personal name is detected

Detection is a pure function, no AI call. Classifying with the model would cost
the call this path exists to avoid, and a misclassification would leak a private
name into a shared table permanently. Three signals, checked in order.

**1. The user's own saved meals — language-independent, and the strongest
signal.** If the query fuzzy-matches one of this user's `saved_meals` names at
`>= 0.8`, it is personal, whatever language it is in and whether or not it
carries a possessive. This needs no linguistics at all and already covers the
common case of someone re-typing a meal they have logged before. It needs the
user's own rows, so it lives in the search component (`FoodSearch`), checked
for every query before any server call; the server-side detector
(`isPersonalName`) implements signals 2 and 3 only.

**2. A possessive marker in the original script.** Matching runs on the text as
typed, before any romanisation, because transliteration is exactly where these
short words lose their distinctiveness. The script is identified with Unicode
property escapes (`\p{Script=Devanagari}`, `\p{Script=Kannada}`, and so on), and
the first one or two tokens are compared against a fixed per-language list of
possessive forms held as one constant in `src/lib/foodCache.ts`:

| Language | Forms |
|---|---|
| Hindi / Marathi | मेरा, मेरी, मेरे, माझा, माझी |
| Kannada | ನನ್ನ |
| Tamil | என், எனது |
| Telugu | నా, నాది |
| Malayalam | എന്റെ |
| Bengali | আমার |
| Gujarati | મારું, મારી |
| Punjabi | ਮੇਰਾ, ਮੇਰੀ |
| Urdu | میرا, میری |

The possessive leads the phrase in all of these, so only the opening tokens are
examined. Exact token match, no similarity — these are closed-class words with
fixed spellings, and fuzzy-matching them would catch real food names.

**3. A possessive marker in Latin script**, for English and for romanised typing:
`my`, `mine`, `our`, plus romanised forms `mera`, `meri`, `nanna`, `enadhu`,
`amar`, `maru`, `majha`. Tokens shorter than three characters are excluded from
this list, which is why Tamil `என்` and Telugu `నా` are detected in their own
script but their romanisations `en` and `naa` are not — two-letter tokens
collide with ordinary words and food names far too often to be trusted. (`my`
is the one two-letter exception: it is unambiguous in English.)

A leading `<word>'s` or `<word>’s` possessive also marks a personal name when
the possessor is a family or relationship word — "mom's shake", "amma's rasam",
"grandma’s curry". Any other possessor reads as a food: brands (Bikaji's,
Amul's, Reese's, Haldiram's, McDonald's) and dishes whose own name is
possessive ("shepherd's pie", "baker's chocolate"). The family list is fixed
and short; a first name ("Priya's salad") is a known miss, caught by the
saved-meal signal once saved. No name in the bundled catalog is flagged.

**Ties break toward personal.** The two errors are not symmetric: a false
positive costs one user one AI call and one row the shared cache never gains,
while a false negative writes somebody's private meal name into a shared table
for good. When a marker matches ambiguously, treat the query as personal.

This is a heuristic and it will miss unusual phrasings. **The quorum is a
second line, not a full backstop.** The three answers all come from the same
model at temperature 0.1, so agreement rules out a one-off outlier, not a
consistent misreading. What it does rule out is one person promoting a name
alone: a group needs answers from at least `MIN_DISTINCT_USERS` different
people (see "Decisions after approval", item 9), so a private name one user
searches over and over never fills a group. With the threshold at 2, two
people independently searching the same missed private name could still
promote it — rare, and closed further when the threshold rises to 3.

## Voice and photo logs

`parseVoiceFoodLog` currently returns item names *and* macros in a single call,
so voice and photo logs bypass the search path completely and can neither feed
nor benefit from the cache.

The prompt changes to return **names and quantities only**, and the photo
prompt to the food's name and estimated weight only. Each name is then routed
through one resolver (`resolveFood`), shared by voice and photo — bundled
catalog, then `ai_verified` with the user's `ai_flagged` correction, then AI.
Cached items cost nothing, and the parse call itself gets cheaper because it
no longer emits macros. The resolved food is per 100 g with energy in kJ, the
same object a typed search hands over, and the review screens show its name.

The catalog step is stricter here than in typed search. A typed query shows a
list and a person picks; a spoken or photographed name is picked
automatically, so it takes a catalog row only when the name **is** that row's
name (a slash alternative counts, a parenthetical qualifier is dropped), and on
a tie the curated `extraFoods` row. Anything looser picks a different food that
merely contains the word — "coffee" was Coffee biscuit, "water" Water Chestnut,
"milk" Milk cake — so everything else goes to the server.

Typed composite queries are not split before the cache: the whole query goes
to one lookup and, on a miss, one model call that returns several items.
`COMPOSITE_SPLIT` only sizes that call's token budget and splits the query for
its reference rows.

Using that regex to split speech as well was considered and rejected: it is
weaker than the model at parsing messy spoken sentences, and the extra saving is
not worth the accuracy loss. That is the same accuracy-over-cost call made
everywhere else in this design.

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

This repository has **no test framework**. Tests are plain `node:assert`
scripts run directly — `node src/lib/foodCache.test.ts` — the convention
established by `foodUnits.test.ts` and `ai.test.ts`. Follow it; do not
introduce vitest.

Two existing helpers are reused rather than rewritten: `altNames` in
`src/lib/foodFuzzy.ts` already parses the semicolon-delimited `lang` shape, and
the same file holds a Levenshtein `similarity` function that the alias
cross-check needs. Both are currently private and get exported.

Pure functions in `src/lib/foodCache.ts` and `src/server/foodCacheKeys.ts`
get tests in `src/lib/foodCache.test.ts`, beside the existing
`foodUnits.test.ts` and `foodFuzzy.test.ts`:

- search key, including Indic script input
- the alias parser on both catalog shapes: a `lang` row and a parenthetical
  `name` row, plus a row with neither
- the Atwater gate at the ±25% boundary, the 100 g mass balance, zero energy
- the quorum check, including the near-zero fibre floor, and the consolidated
  identity (median `piece_g`, majority `basis`, most common name)
- the alias cross-check, including a single-source alias being dropped
- personal-name detection: English `my X`, a Kannada `ನನ್ನ X`, a Hindi `मेरा X`,
  a leading `<word>'s`, a food name containing the letters `en` or `naa` that
  must **not** be flagged, brand possessives that must not be flagged, and no
  name in the bundled catalog flagged

What is not a pure function is verified live against the database instead: a
`food_class` disagreement keeping an answer out of a group, a verified row
surviving a later group under its key, and an ambiguous alias being a miss.
The `saved_meals` match is component logic in `FoodSearch`.

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
  Mitigated by exact key matching with no threshold to loosen, by refusing a
  key two verified rows share, and by `food_class` agreement within a group —
  not by loosening the match.
- A personal name that detection misses can reach `ai_verified` only if at
  least `MIN_DISTINCT_USERS` (today 2) different people search it and the
  answers agree (see "Personal names"). Accepted at today's scale; the
  threshold rises to 3 as the user base grows.

## Decisions after approval

Each of these reverses or sharpens something the approved design said. The
sections above have been corrected to match; this is the record of why.

1. **Cache gate ±10% → ±25%.** Measured on live model output, 12 foods, 39
   answers: the ±10% gate rejected 19 answers (49%), and 7 of the 12 foods never
   assembled three rows. Its predicted ~6% rejection rate had been measured on
   curated IFCT rows, not model output. It also rejected correct values:
   banana at 372 kJ/100 g, the right figure, sat 10.3% below the Atwater
   estimate of 414.6, because 4/9/4 overestimates fruit and high-fibre foods.
   The product owner set the gate to ±25%, matching `reconcileEnergy`. On a
   36-food, 109-call re-run the gate rejected 8 of 117 items (6.8%).
2. **Cross-script matching moved from `pg_trgm` similarity to exact alias
   keys.** The 0.7/0.85 thresholds were calibrated on Levenshtein similarity,
   but the lookup runs on trigram similarity, which scores true cross-script
   pairs below pairs of different foods: idhli/idli 0.375 against naan/paneer
   naan 0.417 and chicken biryani/chicken pulao 0.364; tatte idli/thatte idli
   0.643. No threshold separates the two. `alias_keys` holds the normalised key
   of the row and every agreed alias, and matches exactly; live, a Kannada
   query hit an English-keyed row through it where similarity scored 0.643.
3. **Similarity demoted to a same-script typo backstop**, the last lookup step,
   with its thresholds kept deliberately strict: a near-miss costs one AI call,
   a loose threshold serves the wrong food.
4. **`food_class` became a closed 13-value list, and is a grouping guard, not
   a lookup guard.** As free text the model rephrased it per call, and 10 of 36
   foods never formed a group, 8 of them with `canonical_key` agreeing. With
   the closed list: zero cross-call disagreement across 30 calls, and 8 of those
   10 foods formed a full group. At lookup the query carries no class to
   compare, so "a key match with a disagreeing class is a miss" was never
   implementable; the guard applies where answers are grouped.
5. **Corrections are stored per 100 g, energy in kJ, whatever the basis.**
   `basis = 'piece'` says a food is countable and carries `piece_g`; it does not
   change what the numbers mean. Every reader scales cache macros by
   grams ÷ 100, so a per-piece correction would be served as if per 100 g.
6. **The pipeline never overwrites a verified row.** A later group under the
   same key replaced the row whole: a "sugar-free lassi" answered as "lassi"
   would swap in the variant's numbers, and the new group's aliases would wipe
   every earlier cross-script spelling. Answers for a verified key are not
   staged, and promotion is an insert that does nothing on conflict. Only the
   weekly manual review changes a verified row. The non-macro fields of a
   promotion — `piece_g`, `basis`, `food_name` — are no longer copied from the
   first answer: `piece_g` multiplies every pieces log permanently, so it is
   the median of the three, with the majority basis and the most common name.
7. **Ambiguous multi-object replies are served but not cached.** The model has
   echoed the prompt's reference block and could echo one of its six
   schema-valid few-shot examples before its answer; the extractor serves the
   last complete object, and a reply with more than one is never recorded,
   because an echoed example would validate cleanly and be cached under the
   wrong key and class for good.
8. **Automatic picks need an exact catalog name; saved meals are checked for
   every query; personal names are saved under the typed words.** Found in the
   final review: voice logged "coffee" as Coffee biscuit (624 kcal for a
   150 g cup); the saved-meal signal only ran after a possessive had already
   matched; and auto-save tested the model's corrected name, so it never fired
   for an AI estimate.
   Owner-authorised second round: a catalog name splits into alternatives
   only at a spaced " / " (raw IFCT rows use an unspaced "/" for a spelling
   variant of the last word), and a bracket is dropped only when it holds a
   measurement — except on curated rows, whose brackets name the default
   state ("Paneer (raw)", "Poha (cooked)"). Spoken "paratha" had logged
   Potato paratha, "lassi" Lassi (salted) at 19 kcal, "jackfruit" dry
   jackfruit at 481 kcal. The `<word>'s` possessive rule now fires only for
   family and relationship words, because it had flagged brands (Bikaji's,
   Amul's, Reese's) that then never cached. A custom food is never
   auto-saved: its "Save to My Meals" box decides.
9. **Quorum counts distinct people: `MIN_DISTINCT_USERS = 2`.** Owner
   decision. Before this, one user searching a food three times could fill
   and promote a group alone, including a private name detection missed.
   `ai_unverified.user_hash` records who staged each answer (SHA-256 hex of
   the user id, unsalted: the table is service_role-only and its readers can
   already read `auth.users`). Enforced at staging — each user holds at most
   `3 − MIN_DISTINCT_USERS + 1` rows of an open group, so any three rows span
   the required number of people and a group never stalls on one person's
   rows — and re-checked at promotion. **The threshold is scale-dependent.**
   2 is chosen for the current small user base (about 5 real users), where 3
   would stall verification because few foods are ever searched by three
   different people. It should rise to 3 once the user base is large enough
   (the owner's figure: 1k–10k users) that it is no longer a bottleneck; the
   per-user cap then becomes 1 automatically.
