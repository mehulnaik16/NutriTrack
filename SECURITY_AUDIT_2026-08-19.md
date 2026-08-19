# Dombelz / NutriTrack — Security Audit

**Date:** 2026-08-19
**Scope:** `claude_edits` branch (post-consolidation), live Supabase project `xadkrjfvsjdfhjcmxwbh`, production dependency tree
**Method:** source review + live database interrogation (RLS policies, function grants, storage config) + dependency audit

Findings marked **VERIFIED** were reproduced against the live project, not inferred from code.

---

## 1. Summary

| Severity | Count | IDs |
|---|---|---|
| 🔴 Critical | 1 | C-1 |
| 🟠 High | 6 | H-1 … H-6 |
| 🟡 Medium | 5 | M-1 … M-5 |

Two issues are exploitable **right now, without credentials**: the Groq API keys published in the browser bundle (C-1) and the unauthenticated dump of every user's name and health metrics (H-1).

The application's core RLS posture is genuinely good — every table in `public` has RLS enabled with sensible owner-scoped policies. The failures are concentrated at the edges: build-time secret handling, one `SECURITY DEFINER` function, storage bucket visibility, and the AI proxy's input contract.

---

## 2. Critical

### [C-1] Groq API keys compiled into the public client bundle — **VERIFIED**

**Severity:** Critical · **Impact:** Full compromise of Groq API credentials, unbounded billing

`vite.config.ts` inlines every `VITE_`-prefixed variable into both bundles via `define`:

```js
for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), "VITE_"))) {
  envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
}
```

The local `.env` still defines the Groq credentials with that prefix:

```
VITE_GROQ_KEY_1=gsk_…
VITE_GROQ_KEY_2=gsk_…
```

The keys are present in the committed build output, in a file served to every visitor:

```
dist/client/assets/groq-DpD_-jjF.js     ← client bundle, publicly served
dist/server/_ssr/groq-DTup2apL.mjs
```

**Treat both keys as fully compromised.** Anyone who loaded the deployed site could extract and reuse them. A `.vercel` directory is present, so this build was deployed.

**Compounding bug:** the server module `src/server/groq.ts` reads `process.env.GROQ_API_KEY_1…20` — a name that does not exist in `.env`. So the current code path loads **zero** keys and every AI feature fails at runtime with `No Groq API keys configured`. The secret is simultaneously leaked *and* non-functional: the refactor that moved Groq server-side renamed the variables but `.env` was never migrated.

**Fix:** rotate both keys at console.groq.com (mandatory — no code change can un-publish them), rename to `GROQ_API_KEY_*` in `.env` and in Vercel's environment settings, and purge the stale `dist/`.

---

## 3. High

### [H-1] Unauthenticated dump of every user's identity and health metrics — **VERIFIED**

**Severity:** High · **Impact:** Full-userbase PII disclosure to anonymous internet

`get_leaderboard_stats(start_date text)` is `SECURITY DEFINER`, reads `user_profiles` for **all** users, and `EXECUTE` is granted to the `anon` role. It is reachable at `POST /rest/v1/rpc/get_leaderboard_stats` using only the publishable anon key — which ships in the client bundle by design.

Reproduced against production:

```sql
set local role anon;
select count(*) from public.get_leaderboard_stats('2000-01-01');
-- → 17
```

Every row returned to an anonymous caller contains `user_id`, `full_name`, `current_streak`, `avg_calories`, `total_water`, `total_exercise_min`. Average calorie intake is health data about a named individual.

The function has no `auth.uid() is not null` guard — the sibling functions (`search_users`, `resolve_friend_code`, `get_friends`) all have one. This one was missed.

**Fix:** guard on `auth.uid()`, and `revoke execute … from anon`.

### [H-2] `SECURITY DEFINER` function with mutable `search_path` — **VERIFIED**

**Severity:** High · **Impact:** Potential privilege escalation to function owner

`get_leaderboard_stats` is the only function in `public` with `proconfig = null`:

| function | `SECURITY DEFINER` | `search_path` pinned |
|---|---|---|
| `award_achievement` | yes | ✅ `public` |
| `get_friends` | yes | ✅ `public` |
| `get_friend_requests` | yes | ✅ `public` |
| `resolve_friend_code` | yes | ✅ `public` |
| `search_users` | yes | ✅ `public` |
| **`get_leaderboard_stats`** | yes | ❌ **none** |

A definer-rights function that resolves object names through a caller-influenced `search_path` is the classic Postgres escalation pattern: a caller who can create objects in an earlier-resolving schema can have the function execute their code with the owner's privileges. Supabase's own linter flags this (`0011_function_search_path_mutable`).

**Fix:** `set search_path = public` on the function.

### [H-3] Progress photos in a public storage bucket — **VERIFIED**

**Severity:** High · **Impact:** Unauthenticated access to users' body/progress photographs

The `weight-photos` bucket is public:

```sql
select id, public from storage.buckets;
-- → weight-photos | true
```

Four correctly-written owner-scoped RLS policies exist on `storage.objects` for this bucket — and a public bucket bypasses the SELECT policy entirely. Object reads go through the unauthenticated public-object route.

`src/services/storage.ts` builds paths as `<userId>/<Date.now()>.<ext>` and persists `getPublicUrl(path)` into `weight_entries.photo_url`. Those URLs never expire, carry no authorization, and remain valid forever once they leak (browser history, referrer headers, shared screenshots, any CDN or crawler cache).

Body-progress photographs are among the most sensitive data this application holds.

**Fix:** flip the bucket private and resolve images through short-lived signed URLs at render time.

### [H-4] `serverGroqChat` is an unrestricted LLM proxy

**Severity:** High · **Impact:** Cost abuse, model abuse laundered through your account

```ts
export const serverGroqChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: ChatInput) => d)   // ← no validation at all
```

`ChatInput` is a bare TypeScript interface — erased at compile time, enforcing nothing at runtime. Any authenticated user (registration is open) can send an arbitrary `prompt`, select an arbitrary `model`, and set an arbitrary `max_tokens`, then receive the raw completion. There is no system prompt and no output constraint.

That is a general-purpose LLM API billed to your Groq account, with your app as an anonymizing front. Note the contrast: the food-search endpoints in the same file are carefully hardened with sanitization, XML delimiting, and Zod validation — `serverGroqChat` bypasses all of it.

**Fix:** Zod-validate the input, cap `max_tokens`, cap prompt length, and restrict `model` to an allowlist.

### [H-5] `serverGroqVision` accepts unbounded, unvalidated image payloads

**Severity:** High · **Impact:** Memory exhaustion, request-cost amplification

```ts
.inputValidator((d: VisionInput) => d)
…
const { prompt, base64, mimeType } = ctx.data;
```

No size ceiling on `base64` and no MIME allowlist. A caller can post a multi-hundred-megabyte string; the serverless function buffers it and forwards it to Groq. `mimeType` is interpolated straight into the data URL.

**Fix:** enforce a byte ceiling (~8 MB decoded), allowlist `image/jpeg|png|webp`, cap the prompt.

### [H-6] Vulnerable production dependencies — **VERIFIED**

**Severity:** High · `npm audit --omit=dev` → **16 vulnerabilities (1 critical, 10 high, 4 moderate, 1 low)**

Most significant, all reachable from the server request path:

- **`undici` ≤ 7.28.0** — response desynchronization via the retry interceptor, cross-user information disclosure via cache directives, CRLF injection, cookie attribute injection. Cross-user disclosure in an HTTP client that serves multiple tenants is directly relevant here.
- **`tar` ≤ 7.5.20** (critical) — process crash, decompression DoS, uncontrolled recursion.
- **`postcss`** — moderate.

All fixable without breaking changes via `npm audit fix`.

---

## 4. Medium

### [M-1] Rate limiting is per-instance and resets constantly

`src/lib/ai.ts` holds counters in a module-level `Map`. On Vercel each serverless instance has its own memory, and instances are created and destroyed continuously. The effective limit is 30/min *per instance*, and an attacker distributing requests — or simply arriving after a cold start — is not meaningfully constrained. It stops accidental loops, not deliberate abuse.

**Fix path:** a Postgres-backed counter table, or Upstash/Vercel KV.

### [M-2] `user_profiles` UPDATE policy has no `WITH CHECK`

```
cmd: UPDATE | qual: (auth.uid() = id) | with_check: NULL
```

`USING` restricts which rows may be targeted; without `WITH CHECK` the *post-update* row is unconstrained, so the `id` column itself is not protected from being rewritten. Primary-key and foreign-key constraints blunt the practical impact, but the policy is incomplete as written and should mirror its `USING` clause.

### [M-3] Weak password policy

`src/routes/quiz.tsx` enforces a 6-character minimum. Supabase's leaked-password protection (HaveIBeenPwned) is **disabled** on the project. Together these permit known-breached six-character passwords on accounts holding health data.

**Fix:** raise to 8+ in the quiz validator and enable leaked-password protection in the Supabase Auth dashboard.

### [M-4] Achievements are client-authoritative

`award_achievement(p_id text)` inserts whatever achievement id the caller names, with no server-side verification that the milestone was earned. Any authenticated user can grant themselves every achievement. `anon` also holds `EXECUTE`, though the internal `auth.uid() is not null` guard makes an anonymous call a no-op.

This is an integrity issue for a social/leaderboard feature rather than a confidentiality one — but it undermines the friends and ranking system.

### [M-5] No client-side validation on photo uploads

`uploadWeightPhoto` passes any `File` straight to Supabase Storage with no size or MIME check, and derives the extension from the user-supplied filename. Bucket-level restrictions should be configured regardless.

---

## 5. What is already done well

Worth stating plainly, because it is the reason this audit is short:

- **RLS is enabled on all 10 public tables**, each with owner-scoped policies. No table was found unprotected.
- **The `friendships` policies are genuinely well-designed** — `UPDATE` is constrained to the addressee, only from `pending`, and only into `accepted`/`blocked`. That is a correct state machine expressed in RLS, which is rare.
- **`cheers` INSERT requires a proven accepted friendship** via an `EXISTS` subquery.
- **`search_users` and `resolve_friend_code`** guard on `auth.uid()`, pin `search_path`, and deliberately refuse to reveal anything about blocked pairs.
- **The food-search AI path** is defended in three independent layers (sanitize → delimit → Zod-validate) with an all-zero-macro injection heuristic. This is a higher standard than most production code.
- **`importProtection`** in `vite.config.ts` is configured to keep `src/server/**` out of client bundles.
- **`.env` is correctly gitignored** and has never been committed — the key leak came through the build, not through git.

---

## 6. Remediation order

| # | Item | Owner | Blocking |
|---|---|---|---|
| 1 | **Rotate both Groq keys** (C-1) | manual — console.groq.com | yes |
| 2 | Rename to `GROQ_API_KEY_*` in `.env` + Vercel (C-1) | code + dashboard | yes |
| 3 | Guard + `search_path` + revoke anon on `get_leaderboard_stats` (H-1, H-2) | migration | yes |
| 4 | `weight-photos` → private + signed URLs (H-3) | migration + code | yes |
| 5 | Validate `serverGroqChat` / `serverGroqVision` inputs (H-4, H-5) | code | no |
| 6 | `npm audit fix` (H-6) | dependency | no |
| 7 | Password ≥ 8, enable leaked-password protection (M-3) | code + dashboard | no |
| 8 | `WITH CHECK` on `user_profiles` UPDATE (M-2) | migration | no |
| 9 | Durable rate limiting (M-1) | code | no |

Items 1 and the Supabase/Vercel dashboard toggles cannot be done from the repository and require manual action.
