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
 * PKCE is what makes the rest work. supabase-js defaults to it, so
 * signInWithOAuth stores a code verifier in this WebView's localStorage and the
 * callback carries a short-lived `code`. Because the exchange happens back
 * here — in the WebView that holds the verifier — the session lands in the
 * right place. An implicit-flow token in the URL would have been readable by
 * the browser too; this cannot be completed anywhere but inside the app.
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

      // Supabase can answer on either side of the '#', so parse both rather
      // than assuming. An error here is usually a redirect URL missing from the
      // Supabase allowlist, and saying so beats a generic failure.
      const parsed = new URL(url);
      const params = new URLSearchParams(
        parsed.search.slice(1) || parsed.hash.slice(1),
      );

      const oauthError = params.get("error_description") ?? params.get("error");
      if (oauthError) return finish({ ok: false, error: oauthError });

      const code = params.get("code");
      if (!code) return finish({ ok: false, error: "No authorization code." });

      const { error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        return finish({ ok: false, error: exchangeError.message });
      }
      finish({ ok: true });
    });

    // Fires when the user dismisses the Custom Tab. Harmless after a successful
    // deep link because `settled` has already been set.
    const closeListener = Browser.addListener("browserFinished", () =>
      finish({ ok: false, cancelled: true }),
    );

    void Browser.open({ url: data.url, presentationStyle: "popover" });
  });
}
