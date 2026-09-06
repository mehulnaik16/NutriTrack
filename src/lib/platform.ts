/**
 * Is this the native shell rather than the website?
 *
 * The only thing this gates today is Razorpay checkout. A reachable
 * third-party checkout for digital goods is what gets Play and App Store
 * submissions rejected, so the native build must not show one — entitlement
 * bought on the web still applies inside the app.
 *
 * Capacitor injects `window.Capacitor` into the WebView. This build loads the
 * deployed site over https rather than a capacitor:// URL (see
 * capacitor.config.ts), so the protocol tells us nothing and the bridge object
 * is the signal. Absent bridge means web, which is the safe default: the worst
 * case is showing checkout on a browser that can handle it.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (
    window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean };
    }
  ).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

/**
 * Mark the document as running inside the native shell, so CSS can inset the
 * app chrome out from under the system bars.
 *
 * Android 15 forces edge-to-edge on anything targeting SDK 35, so the WebView
 * starts at y=0 behind the clock and battery. The correct fix is
 * env(safe-area-inset-top) — but Android WebView frequently reports 0 for it
 * even with viewport-fit=cover, which leaves the header overlapped anyway. The
 * `.native-shell` class lets styles.css apply a floor via max(), taking
 * whichever is larger rather than adding them, so a device that does report a
 * real inset (a tall notch) still wins.
 *
 * Idempotent, and a no-op on the web where the same markup is served.
 */
export function markNativeShell(): void {
  if (typeof document === "undefined" || !isNativeApp()) return;
  document.documentElement.classList.add("native-shell");
}
