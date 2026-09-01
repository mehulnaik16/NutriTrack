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
