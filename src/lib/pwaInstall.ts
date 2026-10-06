/**
 * "Install web app": the browser's own install prompt for the PWA (manifest in
 * public/manifest.webmanifest), like screener.in's Install button.
 *
 * Chrome/Edge/Samsung fire `beforeinstallprompt` once, possibly before any
 * route renders, so it is captured here at startup (imported from router.tsx)
 * and replayed when the user taps Install. Safari never fires it; iOS users
 * add the app from the Share sheet instead.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep it for our button instead of Chrome's mini-bar
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export const canPromptInstall = () => deferred !== null;

export function onInstallChange(f: () => void) {
  listeners.add(f);
  return () => void listeners.delete(f);
}

/** Show the browser's install dialog. Resolves true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null; // a prompt event can only be used once
  notify();
  await e.prompt();
  return (await e.userChoice).outcome === "accepted";
}

/** Already running as the installed app (or the native shell). */
export function isInstalled(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Inside another app's built-in browser (Instagram, Facebook, LinkedIn,
 * Snapchat, any Android WebView). None of them can install a web app.
 * Our own native shell is also a WebView; callers rule it out first.
 */
export function isInAppBrowser(): boolean {
  const ua = navigator.userAgent;
  if (/Instagram|FBAN|FBAV|FB_IAB|LinkedInApp|Snapchat|Line\//i.test(ua))
    return true;
  if (/Android/.test(ua) && /; wv\)/.test(ua)) return true; // Android WebView
  // iOS WKWebViews leave "Safari/" out of the UA; real Safari, Chrome (CriOS),
  // Firefox (FxiOS) and Edge (EdgiOS) on iOS keep it or their own token.
  return isIOS() && !/Safari\/|CriOS|FxiOS|EdgiOS/.test(ua);
}

/** Android: reopen this page in Chrome, where install works. */
export function openInChrome() {
  const { host, pathname, search } = location;
  location.href = `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;end`;
}

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
