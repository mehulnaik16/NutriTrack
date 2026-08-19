import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wraps the deployed Dombelz web app into native Android/iOS shells.
 *
 * IMPORTANT: Dombelz is server-rendered (TanStack Start), so the native shell
 * loads your deployed HTTPS URL. Set `server.url` to your production domain
 * after deploying (e.g. https://dombelz.vercel.app).
 *
 * See MOBILE_APP_GUIDE.md for the full store-submission playbook.
 */
// The deployed origin the native shell loads. Set DOMBELZ_APP_URL when building
// for a different environment; the default is the claude_edits preview alias.
// appId and appName must never change — Play identifies the app by package name
// plus signing key, and a new appId is a new listing with no upgrade path.
const APP_URL =
  process.env.DOMBELZ_APP_URL ??
  "https://nutri-track-git-claudeedits-mehul-fitness.vercel.app";

const config: CapacitorConfig = {
  appId: "app.dombelz.mobile",
  appName: "Dombelz",
  webDir: "public", // placeholder — the app is served from server.url below
  server: {
    url: APP_URL,
    cleartext: false,
  },
  backgroundColor: "#101014",
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
