import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wraps the deployed FitTrack web app into native Android/iOS shells.
 *
 * IMPORTANT: FitTrack is server-rendered (TanStack Start), so the native shell
 * loads your deployed HTTPS URL. Set `server.url` to your production domain
 * after deploying (e.g. https://fittrack.vercel.app).
 *
 * See MOBILE_APP_GUIDE.md for the full store-submission playbook.
 */
const config: CapacitorConfig = {
  appId: "app.fittrack.mobile",
  appName: "FitTrack",
  webDir: "public", // placeholder — the app is served from server.url below
  server: {
    url: "https://YOUR-DEPLOYED-DOMAIN.example", // ← change after deploying
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
