# Phone OTP (SMS + WhatsApp) and Referral Qualification Gate Plan

> **STATUS: PLACEHOLDER — NOT SCHEDULED, NOT STARTED.**
> Parked on 2026-08-26 at the user's request: "we will plan out, just make a
> placeholder for now." Nothing below has been agreed and no code exists.
>
> What is settled so far, from the 2026-08-25 conversation:
>   - Phone OTP is an ADDITIONAL sign-in option. It never replaces email +
>     password or Google sign-in, and no existing account is disturbed.
>   - The SMS/WhatsApp provider is deliberately NOT chosen yet.
>   - The referral rule from the brief: the referrer's 5 free days land only
>     after the referred friend verifies by OTP.
>
> Still open before this can be planned properly:
>   - Do referrals already credited under the current rule keep their days when
>     the rule tightens? (The draft below assumes yes — no retroactive revoke.)
>   - Which provider, and therefore whether WhatsApp is available at all.
>
> Everything after this line is an UNREVIEWED DRAFT kept for reference. Treat it
> as notes, not as an approved plan.

---

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add phone-number verification by one-time code — over SMS, and over WhatsApp where the provider supports it — as an **additional** way to sign in and as a verification step during onboarding, and make it the condition a referral must clear before the referrer is credited their 5 free trial days.

**Architecture:** Phone OTP is an *option*, never a replacement: email + password and Google sign-in stay exactly as they are, and no existing account is disturbed. All OTP traffic goes through Supabase's native phone auth (`signInWithOtp` / `verifyOtp`), which keeps the actual SMS vendor a **dashboard setting rather than a code decision** — that is what makes "decide the provider later" cost nothing here. One thin seam, `src/lib/otp.ts`, wraps send and verify so a fully custom provider can be swapped behind it later without touching a single call site. Verification state is mirrored from `auth.users.phone_confirmed_at` into `user_profiles.phone_verified_at` by a trigger, because RLS gives the browser no read access to the `auth` schema and both the UI and the referral logic need to see it. The referral change is the interesting half: `qualify_referral()` today fires on `trial_start_date` going non-null (`20260825101500_referrals.sql` §4), which is a single condition on a single trigger. It becomes a shared `try_qualify_referral(referee)` predicate — profile exists **and** phone verified **and** trial started — called from two triggers, so whichever of the two conditions lands last is the one that credits the referrer. Recomputation stays derived-not-accumulated, exactly as `recompute_bonus_trial_days()` already is, so the total can never drift no matter what order things happen in.

**Tech Stack:** Supabase Auth phone providers (`signInWithOtp`, `verifyOtp`, `updateUser({ phone })`), Supabase Postgres triggers + `security definer` RPCs, `input-otp` (already a dependency — `@/components/ui/input-otp`), React 19, TanStack Router.

**Spec:** This document. Source requirement: "SMS AND WHATSAPP OTP INTEGRATION AND VALIDATION WHILE LOGGING IN. (THIS OTP TO BE INTEGRATED WITH THE REFER AND EARN FEATURE WHERE THE REFERER GET THE DATA WHEN RECIEVER OF HIS REFERERAL CODE IS USED COMPLETEING THE ONBOARDING PROCESS <ONLY AFTER OTP VERIFICATION DOES THE REFERER GETS THE BENEFITS OF 5 DAYS FREE>)". Provider choice deferred by the user; flow decided as *additional option, not replacement*.

## Global Constraints

- **Additive only.** Email + password (`login.tsx:36`) and Google sign-in (`GoogleSignInButton`) must keep working unchanged. Existing users with no phone must never be blocked, prompted repeatedly, or degraded.
- **The provider is not chosen yet.** No vendor SDK, no vendor-specific API call, and no vendor name in application code. Everything vendor-shaped lives in the Supabase dashboard config plus `src/lib/otp.ts`.
- **WhatsApp is conditional.** Supabase's native WhatsApp channel (`options: { channel: 'whatsapp' }`) is Twilio-only. Build the channel choice into the UI behind a single runtime flag (`VITE_OTP_WHATSAPP_ENABLED`) so the WhatsApp button simply does not render until a provider that supports it is configured. Do not ship a button that always errors.
- **This is a money-and-fraud surface, and must be treated as one.** Paying out 5 free trial days per verified referral, gated on a phone number, is the textbook setup for burner-number farming. The mitigations in Task 4 are not optional polish; they are the reason the feature can ship.
- Every new SQL function follows the discipline already established in `20260825101500_referrals.sql` and `SECURITY_AUDIT_2026-08-19.md` (H-1, H-2): `security definer`, `set search_path = public`, and `revoke execute ... from anon, public` followed by an explicit narrow `grant`.
- **Never trust a client-reported verification.** `phone_verified_at` is written by a trigger reading `auth.users.phone_confirmed_at`, never by a client write. A column the browser can set is a column an attacker can set, and here that column is worth 5 days per forgery.
- Phone numbers are stored and sent in **E.164** (`+919876543210`). Supabase rejects other formats, and a mixed-format column makes the uniqueness constraint that blocks re-use meaningless.
- Migration files must be named with the exact version Supabase assigns when applied (confirm via `list_migrations`), so `supabase db push` never re-applies them — the same procedure used for every migration in this repo.
- No automated test runner exists; logic tests follow the runnable-`node` convention of `src/lib/referral.test.ts`. Database behaviour is verified with direct SQL.

---

## Task 1: The OTP seam

**Files:**
- Create: `src/lib/otp.ts`
- Create: `src/lib/otp.test.ts`

**Interfaces:**
- Produces:
  - `type OtpChannel = "sms" | "whatsapp"`
  - `normalizePhone(input: string, defaultCountry?: string): string | null` — to E.164, or null if unparseable
  - `sendOtp(phone: string, channel: OtpChannel, mode: "signin" | "link"): Promise<{ ok: boolean; error?: string }>`
  - `verifyOtp(phone: string, code: string, mode: "signin" | "link"): Promise<{ ok: boolean; error?: string }>`
  - `WHATSAPP_ENABLED: boolean`
  - `OTP_RESEND_SECONDS = 30`, `OTP_LENGTH = 6`

- [ ] **Step 1: Write `normalizePhone`.** Strip spaces, dashes, brackets and a leading `0`; accept an existing `+` prefix as-is; otherwise prepend the default country code (`+91`). Reject anything that is not `+` followed by 8–15 digits. Do this in one place — a normaliser copy-pasted into three forms is three subtly different normalisers.

- [ ] **Step 2: Implement the two modes.** They are genuinely different Supabase calls and conflating them is the main integration trap here:
  - `mode: "signin"` — nobody is signed in. `supabase.auth.signInWithOtp({ phone, options: { channel } })`, then `supabase.auth.verifyOtp({ phone, token, type: "sms" })`. This creates or logs into a phone-identity user.
  - `mode: "link"` — a user is already signed in with email or Google and is attaching a phone. `supabase.auth.updateUser({ phone })`, then `supabase.auth.verifyOtp({ phone, token, type: "phone_change" })`. Using the signin path here would sign them into a *different* account.

- [ ] **Step 3: Map errors to human sentences.** Supabase surfaces rate limits, invalid numbers, expired codes, and provider failures as raw strings. Translate them once, here, into copy a user can act on ("That code has expired — tap resend.").

- [ ] **Step 4: Read `WHATSAPP_ENABLED` from `import.meta.env.VITE_OTP_WHATSAPP_ENABLED`,** defaulting to false, and document the variable in `.env.example` alongside the note that WhatsApp requires a Twilio-backed configuration.

- [ ] **Step 5: Write `src/lib/otp.test.ts`** covering `normalizePhone` — bare 10-digit Indian numbers, leading zero, existing `+91`, spaces and dashes, a too-short number, a non-numeric string, and an already-normalised value passing through unchanged. Run with `node`.

**Verification:**
- [ ] The test file passes.
- [ ] No vendor name appears anywhere in `src/`.

---

## Task 2: The OTP UI component

**Files:**
- Create: `src/components/PhoneOtpForm.tsx`

**Interfaces:**
- Produces: `<PhoneOtpForm mode="signin" | "link" onVerified={(phone) => void} onCancel={() => void} />`
- Consumes: `src/lib/otp.ts`, `@/components/ui/input-otp`, `@/components/ui/button`, `@/components/ui/input`.

- [ ] **Step 1: Build the two-step form** — a phone step (country prefix + number, `inputMode="tel"`) and a code step (`input-otp`, 6 slots, `inputMode="numeric"`, `autoComplete="one-time-code"` so iOS and Android autofill the code from the notification).

- [ ] **Step 2: Add the channel choice.** Primary button "Send code by SMS"; a secondary "Send on WhatsApp" rendered **only** when `WHATSAPP_ENABLED`.

- [ ] **Step 3: Add the resend cooldown.** Disable resend for `OTP_RESEND_SECONDS` with a visible countdown. Every send costs real money and every provider rate-limits; an enabled resend button is a button users will hammer.

- [ ] **Step 4: Add an edit-number affordance** on the code step, returning to the phone step and clearing the entered code. Mistyped numbers are the single most common OTP dead end.

- [ ] **Step 5: Auto-submit on the sixth digit,** and on failure clear the input and focus it. Do not make the user find a submit button after autofill has already filled the boxes.

**Verification:**
- [ ] Both steps render correctly on a narrow mobile viewport.
- [ ] The WhatsApp button is absent when the flag is off.
- [ ] The cooldown blocks a second send and the countdown is visible.

---

## Task 3: Wire the three entry points

**Files:**
- Modify: `src/routes/login.tsx`
- Modify: `src/routes/quiz.tsx`
- Modify: `src/routes/profile.tsx`

- [ ] **Step 1: `/login` — add "Continue with phone"** as a third option below `GoogleSignInButton` (line ~185), rendering `<PhoneOtpForm mode="signin" />` in place of the email form when chosen, with a "Use email instead" link back. On success, navigate as the password path does (`login.tsx:48`).

- [ ] **Step 2: Handle the profile-less phone user.** A brand-new phone signin creates an `auth.users` row with **no `user_profiles` row**. `useAuth().hasProfile` already models this exactly (`auth.tsx:22`) and the routing added in `587d1ab fix: send profileless users to the quiz from every profile-gated route` already sends such a user to `/quiz`. Confirm the phone path inherits that behaviour rather than landing on a spinner.

- [ ] **Step 3: `/quiz` — make the existing signup branch phone-aware.** `submit()` at line 194 already skips `signUp` when `user?.id` exists, so a phone-authenticated user flows through correctly. Verify: `d.email` and `d.password` must not be required in that case, and `full_name` must still reach `user_profiles` (the referral code prefix is derived from it by `set_referral_code()`).

- [ ] **Step 4: `/quiz` — add the verification step for referred signups.** When `searchRef` (or the stored `REF_STORAGE_KEY` code) is present and the user signed up by email, show a step after account creation: "Verify your number to unlock your friend's gift." Render `<PhoneOtpForm mode="link" />`. Make it **skippable** — the account must never be blocked on it — but state plainly on the skip control that the referrer's reward depends on it.

- [ ] **Step 5: `/profile` — surface and complete verification.** `profile.tsx:1041` already reads `user.phone`. Add a verified/unverified badge and, when unverified or absent, an "Add & verify phone" action rendering `<PhoneOtpForm mode="link" />`. This is the recovery path for everyone who skipped in step 4 or signed up before the feature existed.

**Verification:**
- [ ] Phone signin from `/login` creates a session and a profile-less user is routed to `/quiz`.
- [ ] An email signup with a `?ref=` code reaches the verification step, and skipping it still completes the account.
- [ ] An existing email user can add and verify a phone from Profile without being signed out.
- [ ] Google and email login are unchanged.

---

## Task 4: The database — mirror verification and re-gate qualification

**Files:**
- Create: `supabase/migrations/<assigned_version>_phone_verification_referral_gate.sql`

**Interfaces:**
- Produces: `user_profiles.phone` and `user_profiles.phone_verified_at`; `public.try_qualify_referral(referee uuid)`; two triggers; a modified `get_referral_summary()`.
- Modifies: the qualification rule established in `20260825101500_referrals.sql` §4.

- [ ] **Step 1: Add the columns.**
  ```sql
  alter table public.user_profiles
    add column phone text,
    add column phone_verified_at timestamptz;

  -- One account per number. This is the constraint that stops the same phone
  -- qualifying a second referral from a second account, which is the whole
  -- burner-farm attack. auth.users enforces its own uniqueness; this mirrors it
  -- where the referral logic can actually see it.
  create unique index user_profiles_phone_key
    on public.user_profiles (phone) where phone is not null;
  ```

- [ ] **Step 2: Mirror from `auth.users` by trigger.** An `after update of phone_confirmed_at on auth.users` trigger writes `phone` and `phone_verified_at` into the matching `user_profiles` row. `security definer`, `set search_path = public`. This is the only writer of those columns — add a `comment on column` saying so, matching the style of `bonus_trial_days`.

- [ ] **Step 3: Add an RLS guard against client writes.** `user_profiles`'s existing self-update policy would otherwise let the browser set `phone_verified_at` directly. Add a `with check` clause, or a `before update` trigger, that rejects any client-originated change to `phone_verified_at`. **Without this step the entire gate is decorative** — anyone with the anon key and a REST client could self-verify and mint referral days.

- [ ] **Step 4: Write `try_qualify_referral(referee uuid)`** — the shared predicate:
  ```
  qualify when the referee's profile row exists
        and phone_verified_at is not null
        and trial_start_date  is not null
  ```
  On success, flip the pending row to `status = 'trial'`, set `qualified_at = now()`, and call the existing `recompute_bonus_trial_days(referrer)`. Idempotent by construction — the `where status = 'pending'` guard means a second call does nothing, which is exactly what makes it safe to call from two triggers.

- [ ] **Step 5: Replace the single trigger with two.** Drop `trg_qualify_referral`. Create one trigger firing when `trial_start_date` becomes non-null and one when `phone_verified_at` becomes non-null; both call `try_qualify_referral(new.id)`. Whichever condition completes last is the one that credits.

- [ ] **Step 6: Backfill deliberately, and record the decision.** Referrals already sitting at `status = 'trial'` were qualified under the *old* rule and their days are already credited. Do not retroactively revoke them — leave them qualified and apply the new rule from here forward. Write that in a comment; a future reader will otherwise assume the data is inconsistent with the code.

- [ ] **Step 7: Extend `get_referral_summary()`** to also return `phone_verified boolean`, so the referrer's list can distinguish "signed up, not verified yet" from "qualified". Keep the disclosure exactly as narrow as it is today — first name and status only, nothing else, and never the phone number itself.

**Verification (direct SQL):**
- [ ] A referee with a verified phone but no trial stays `pending`; starting a trial flips them to `trial` and the referrer's `bonus_trial_days` rises by 5.
- [ ] A referee with a trial but no verified phone stays `pending`; verifying flips them and credits.
- [ ] An attempt to `update user_profiles set phone_verified_at = now()` through the anon/authenticated client **fails**.
- [ ] A second account attempting to register an already-used phone is rejected by the unique index.
- [ ] `recompute_bonus_trial_days` still caps at 60 and still matches `MAX_FREE_DAYS` in `src/lib/referral.ts`.

---

## Task 5: Surface the new state in Refer & Earn

**Files:**
- Modify: `src/components/ReferAndEarn.tsx`
- Modify: `src/lib/referral.ts`

- [ ] **Step 1: Extend `ReferralRow`** (`referral.ts:31`) with `phone_verified: boolean` to match the widened RPC.

- [ ] **Step 2: Add a third display state** to the referral list: `pending` → "Waiting to join", *new* "Joined — waiting on phone verification", `trial` → qualified. Derive it as a pure function in `referral.ts` and cover it in `referral.test.ts`, keeping the file's existing convention that no status logic lives in JSX.

- [ ] **Step 3: Update the explanatory copy.** The reward rule has changed and the page currently states the old one. Say plainly that a friend must verify their number before the 5 days land — a referrer watching a stuck counter with no explanation is a support ticket.

- [ ] **Step 4: Give the referrer a nudge action** for a friend stuck unverified — re-send the invite message. Do not build anything that messages the friend on the referrer's behalf.

**Verification:**
- [ ] All three states render with the correct label against seeded rows.
- [ ] `node --experimental-strip-types src/lib/referral.test.ts` (or the existing invocation for that file) passes.

---

## Task 6: Rate limiting, abuse controls, and configuration

**Files:**
- Modify: `.env.example`
- Modify: `SECURITY_AUDIT.md`
- Modify: `src/routes/privacy.tsx`

- [ ] **Step 1: Configure Supabase Auth rate limits** in the dashboard — OTP sends per hour per IP and per phone. Record the chosen values in the security audit. Left at defaults, this is an SMS bill someone else gets to write.

- [ ] **Step 2: Document the fraud model in `SECURITY_AUDIT.md`** — the attack (burner numbers farming 5-day rewards), and the three controls: the unique phone index, the RLS write guard on `phone_verified_at`, and the provider-side rate limit. State plainly that the first two are structural and the third is a dial.

- [ ] **Step 3: Add the environment variables to `.env.example`** — `VITE_OTP_WHATSAPP_ENABLED`, with a comment that the SMS provider is configured in the Supabase dashboard and requires no code change.

- [ ] **Step 4: Update the privacy policy.** `privacy.tsx` enumerates the data collected and already lists Camera and Microphone. Phone numbers are personal data under India's DPDP Act; add the entry stating what is collected, why (account verification and referral integrity), and that it is shared with the SMS provider for delivery.

**Verification:**
- [ ] Rate limits are set and recorded.
- [ ] `.env.example` documents every new variable.
- [ ] The privacy page lists phone-number collection.

---

## Open item for whoever picks the provider

When the vendor is chosen, the only decisions left are: which channel is the default (SMS is the safe default in India; WhatsApp has better delivery but needs an approved template), and whether the WhatsApp template wording needs review. Neither changes any code written above — that is the point of the `src/lib/otp.ts` seam. If the eventual choice is a provider Supabase does not support natively, only `otp.ts` and one server route change; no UI, no schema, no referral logic.
