# Dombelz — Mobile App & Store Submission Playbook

This guide takes the Dombelz web app to the **Google Play Store** and **Apple App Store** (India). The in-app compliance work (privacy policy, terms, account deletion, data export) is already built — this document covers the packaging and submission steps that must run on your machine.

---

## What's already done in the app ✅

| Store requirement | Where it lives |
|---|---|
| Privacy Policy (public URL required by both stores) | `/privacy` route |
| Terms of Service + health disclaimer | `/terms` route |
| In-app account & data deletion (Google Play "Account deletion" policy + Apple 5.1.1(v)) | Profile → Settings → Danger zone |
| Data export (DPDP/GDPR access right) | Profile → Settings → Data export |
| Age gate 16+ (child safety) | Quiz enforces age ≥ 16 |
| PWA manifest + theme color + Apple meta tags | `public/manifest.webmanifest`, `__root.tsx` |
| Signup consent line linking Terms & Privacy | Quiz footer |

---

## Step 0 — Deploy the web app (required for both paths)

The app is server-rendered (TanStack Start), so the mobile shells load your deployed HTTPS URL.

```bash
npm install
npm run build        # verify it builds clean
npx vercel --prod    # or connect the repo in the Vercel dashboard
```

Note your production URL, e.g. `https://dombelz.vercel.app`. Custom domain recommended before store submission (stores dislike changing URLs later).

**Environment variables to set in Vercel:** all `GROQ_API_KEY_*` keys (as server-only vars, not prefixed with `VITE_`) and your Supabase URL/anon key (copy from your local `.env`).

---

## Path A — Google Play via TWA (recommended for Android)

A **Trusted Web Activity** is Google's sanctioned way to ship a PWA to Play. No webview-wrapper policy risk, tiny APK, always up-to-date because it loads your site.

### A1. Icons
Create PNG icons (the current `favicon.jpg` isn't enough):
- `public/icon-192.png` (192×192) and `public/icon-512.png` (512×512), plus a 512×512 **maskable** version.
- Update `public/manifest.webmanifest` `icons` array to point at the PNGs (`"type": "image/png"`, add `"purpose": "maskable"` entry).
- Easy generator: https://maskable.app or `npx pwa-asset-generator`.

### A2. Build the Android app
```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://YOUR-DOMAIN/manifest.webmanifest
# answers: package id: app.dombelz.mobile · app name: Dombelz · display: standalone
bubblewrap build
```
This produces `app-release-signed.aab` + `assetlinks.json`.

### A3. Digital Asset Links (removes the browser bar)
Serve the generated `assetlinks.json` at:
```
https://YOUR-DOMAIN/.well-known/assetlinks.json
```
(put it in `public/.well-known/assetlinks.json` and redeploy).

### A4. Play Console
1. Create app → App name **Dombelz**, category **Health & Fitness**, free.
2. Upload the `.aab` to an internal testing track first.
3. Complete **Data safety** form (answers below).
4. Complete **Content rating** questionnaire (IARC) — answer honestly; a fitness tracker with no UGC/violence typically rates 3+/Everyone. Note: the app has social leaderboard names — declare "users can see others' usernames".
5. **Account deletion URL**: `https://YOUR-DOMAIN/privacy` (documents the in-app path; Play also asks for a web resource — the privacy page section 6 covers it).
6. **Privacy policy URL**: `https://YOUR-DOMAIN/privacy`.
7. Target audience: 16+ (do NOT include under-13 — avoids Families policy).
8. India pricing: app is free with future subscriptions — when payments launch, in-app purchases of digital goods must use Play Billing (UPI/cards supported automatically).

### Data safety form answers (truthful for this app)

| Question | Answer |
|---|---|
| Collects personal info? | Yes — name, email |
| Collects health & fitness info? | Yes — fitness, nutrition, weight data |
| Collects photos? | Yes — user-chosen progress photos; meal photos processed, not stored |
| Collects audio? | Voice recordings processed for food logging, not stored |
| Location / contacts / SMS? | No |
| Data shared with third parties? | Service providers only: Supabase (storage/auth), Groq (AI processing), Open Food Facts (barcode number only) |
| Data encrypted in transit? | Yes |
| Can users request deletion? | Yes — in-app + privacy page |
| Data sold? | No |

---

## Path B — Capacitor (required for iOS; optional Android alternative)

Capacitor deps and scripts are already in `package.json`, and `capacitor.config.ts` is at the repo root.

### B0. Architecture Options: Local Bundle (Recommended) vs. Hosted Web App

| Option | How it works | Vercel Required? | Bandwidth / Hosting Cost | Launch Speed |
|---|---|---|---|---|
| **Local Bundle (Recommended)** | UI (HTML/JS/CSS) bundled 100% inside the APK/IPA (`webDir: "dist/client"`). App only connects to Supabase DB & Groq AI over network. | **NO** | **$0** (zero static asset traffic) | Instant (<100ms) |
| **Hosted Web App** | Shell opens live URL (`server.url: "https://..."`). UI fetched over network on every launch. | Yes | Consumes Vercel bandwidth quota | 2-4s network load |

> 💡 **Recommendation**: Use **Local Bundle Mode** for production. It saves bandwidth costs, works offline, complies with App Store policies, and only uses Supabase for backend data.

### B1. Configure

- **For Local Standalone Bundle (Recommended)**:
  In `capacitor.config.ts`, set `webDir: "dist/client"` and remove/comment out the `server` block.
  Build command sequence: `npm run build` → `npx cap sync android` → `npx cap open android`.

- **For Hosted Mode**:
  In `capacitor.config.ts`, set `server.url` to your deployed domain.

### B2. Android
```bash
npm install
npm run mobile:add:android
npm run mobile:sync
npm run mobile:android   # opens Android Studio → Build → Generate Signed Bundle
```
Add to `android/app/src/main/AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

### B3. iOS (requires a Mac with Xcode + Apple Developer account, $99/yr)
```bash
npm run mobile:add:ios
npm run mobile:sync
npm run mobile:ios   # opens Xcode
```
In `ios/App/App/Info.plist` add (App Store rejects without these):
```xml
<key>NSCameraUsageDescription</key>
<string>Dombelz uses the camera to photograph meals for AI nutrition logging, scan barcodes, and capture progress photos.</string>
<key>NSMicrophoneUsageDescription</key>
<string>Dombelz uses the microphone so you can log food by voice.</string>
```

### B4. App Store submission notes
- App Privacy "nutrition labels": mirror the Data safety table above.
- Guideline 5.1.1(v): account deletion is in-app ✅.
- Health & Fitness guidelines (1.4.1): Dombelz gives general guidance, not medical advice — the disclaimer in `/terms` covers this; repeat it in the App Store description.
- India storefront: price tier in INR when subscriptions launch; Apple IAP mandatory for digital subscriptions.

---

## Store listing assets you'll need

- App icon 512×512 (Play) / 1024×1024 (App Store) — volt Activity bolt on carbon `#101014`.
- Feature graphic 1024×500 (Play).
- 4–8 phone screenshots (dashboard ring, AI photo logging, workout plan, achievements, leaderboard). Take at 1080×2340 in the browser device emulator.
- Short description (80 chars): *"AI food logging in 10 seconds. Workouts, streaks & progress — made for India."*

---

## Manual functional test checklist (run before submitting)

Run `npm run dev` and walk through on a phone-sized viewport (and a real phone via LAN):

**Auth:** quiz signup (all 5 steps, validation, macro preview) → lands on /plans → pick trial → dashboard. Log out → login → forgot-password email.
**Food:** search IFCT + new curated foods ("roti", "paneer butter masala", "chai") → log → edit → re-log → favorite. AI photo (needs HTTPS or localhost for camera), voice logging, barcode scan. Copy prev day. Meal categories editor.
**Workout:** AI Plan Builder generates & saves → plan card shows today's day → tap exercise → pre-filled sets from last time → rest timer (beep at 0, skip silent) → e1RM chip. Cardio auto-kcal changes with duration. Traps muscle group present.
**Weight:** log with photo + note → BMI card correct → chart/goal line → comparison → edit/delete entry.
**Dashboard:** ring + macros update after logging; date navigation; water tracker; streak dialog shows real last-7-days ticks.
**Profile:** achievements load with correct progress; exports download JSON/CSV; theme switching persists after reload (dark default); delete-account flow (test with a throwaway account!) removes data and signs out.
**Legal:** /privacy and /terms render logged-out; landing page shows for logged-out users; footer links work.
**Mobile:** bottom nav on small screens, dialogs scroll within viewport, no horizontal scroll on any page.

---

## Suggested order (what we plan next)

1. You run `npm install` + `npm run build` and fix anything environmental.
2. Deploy to Vercel with env vars → share the URL.
3. Generate PNG icons → update manifest → I can help wire assetlinks + any fixes.
4. Bubblewrap → Play internal testing (fastest store win).
5. Capacitor iOS on a Mac when ready.
6. Payments (Play Billing / Apple IAP / Razorpay for web) — separate project.
