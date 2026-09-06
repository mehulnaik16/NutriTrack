/**
 * Google sign-in inside the Capacitor shell.
 *
 * On the web, supabase-js redirects the page to Google and back, and the
 * library picks the session up on return. In the app that breaks in a way that
 * looks like nothing happening:
 *
 *   1. The WebView navigates to Google, which Android hands to Chrome — Google
 *      refuses OAuth inside an embedded WebView, so this part is unavoidable.
 *   2. Auth completes and redirects to the site's HTTPS origin.
 *   3. Chrome owns that URL. It renders the website, signed in.
 *   4. The app never hears about it and still shows the login screen.
 *
 * The fix is a redirect target only the app can answer: a custom scheme,
 * registered in AndroidManifest.xml, which Android routes back to us.
 *
 * BOTH OAUTH FLOWS ARE HANDLED, because which one arrives is a client setting
 * that can change without this file being touched:
 *
 *   - implicit (supabase-js 2.x default): the callback carries access_token and
 *     refresh_token in the URL fragment, and we hand them to setSession.
 *   - pkce (opt in with flowType: 'pkce'): the callback carries a short-lived
 *     `code`, exchanged here in the WebView that holds the verifier.
 *
 * PKCE is the better fit for a mobile app — an implicit-flow token travels
 * inside an Android intent, and any app registering the same custom scheme
 * could in principle receive it, whereas a code is useless without the verifier
 * held privately in this WebView. Switching means setting flowType on the
 * client in src/integrations/client.ts, which also changes the web flow, so it
 * is a deliberate change rather than something to slip in here.
 *
 * SETUP THIS DEPENDS ON, in both places or sign-in fails:
 *   - AndroidManifest.xml: an intent-filter for the AUTH_REDIRECT scheme.
 *   - Supabase dashboard → Authentication → URL Configuration → Redirect URLs:
 *     add app.dombelz.mobile://auth/callback. Supabase rejects any redirect it
 *     has not been told about, and the error only appears in the browser tab
 *     the user is about to lose.
 */

import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { supabase } from "@/integrations/client";

/** Must match the intent-filter in AndroidManifest.xml and the Supabase allowlist. */
export const AUTH_REDIRECT = "app.dombelz.mobile://auth/callback";

export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

/** How long to wait for the redirect before giving up and restoring the UI. */
const CALLBACK_TIMEOUT_MS = 3 * 60_000;

export interface NativeAuthResult {
  ok: boolean;
  /** Set when the attempt failed for a reason worth showing the user. */
  error?: string;
  /** True when the user simply closed the browser without finishing. */
  cancelled?: boolean;
}

/**
 * Run the OAuth round trip and settle when the deep link comes back.
 *
 * Resolves rather than throwing, because every outcome here — success, the user
 * backing out, a timeout — is an ordinary thing a sign-in button has to render.
 */
export async function signInWithGoogleNative(): Promise<NativeAuthResult> {
  // skipBrowserRedirect keeps supabase-js from navigating this WebView. It
  // still generates the URL and stores the PKCE verifier, which is exactly the
  // half we want; we do the opening ourselves so it lands in a Custom Tab.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true },
  });

  if (error) return { ok: false, error: error.message };
  if (!data?.url) return { ok: false, error: "No sign-in URL was returned." };

  return new Promise<NativeAuthResult>((resolve) => {
    let settled = false;

    const finish = async (result: NativeAuthResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      urlListener.then((l) => l.remove());
      closeListener.then((l) => l.remove());
      // Best-effort: on Android the Custom Tab usually closes itself when the
      // deep link fires, and closing an already-closed browser throws.
      await Browser.close().catch(() => {});
      resolve(result);
    };

    const timer = setTimeout(
      () => finish({ ok: false, error: "Sign-in timed out." }),
      CALLBACK_TIMEOUT_MS,
    );

    const urlListener = App.addListener("appUrlOpen", async ({ url }) => {
      if (!url.startsWith(AUTH_REDIRECT)) return;

      // Merge both sides of the URL rather than picking one: implicit puts the
      // tokens after '#', pkce puts a code after '?', and an error can arrive
      // on either. Merging removes the dependency on which flow is configured.
      const parsed = new URL(url);
      const params = new URLSearchParams(parsed.search.slice(1));
      new URLSearchParams(parsed.hash.slice(1)).forEach((v, k) =>
        params.set(k, v),
      );

      const oauthError = params.get("error_description") ?? params.get("error");
      if (oauthError) return finish({ ok: false, error: oauthError });

      // PKCE.
      const code = params.get("code");
      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        return finish(
          exchangeError
            ? { ok: false, error: exchangeError.message }
            : { ok: true },
        );
      }

      // Implicit — the supabase-js 2.x default, and what actually arrives here.
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (access_token && refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        return finish(
          sessionError
            ? { ok: false, error: sessionError.message }
            : { ok: true },
        );
      }

      // Neither shape. Naming the keys that did arrive turns "sign-in failed"
      // into something diagnosable without a USB cable and logcat.
      finish({
        ok: false,
        error: `Callback had no code or tokens. Received: ${
          [...params.keys()].join(", ") || "nothing"
        }`,
      });
    });

    // Fires when the user dismisses the Custom Tab. Harmless after a successful
    // deep link because `settled` has already been set.
    const closeListener = Browser.addListener("browserFinished", () =>
      finish({ ok: false, cancelled: true }),
    );

    void Browser.open({ url: data.url, presentationStyle: "popover" });
  });
}
