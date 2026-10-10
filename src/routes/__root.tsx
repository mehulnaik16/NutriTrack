import { SpeedInsights } from "@vercel/speed-insights/react";
import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { lazy, Suspense, useEffect } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { getLocalTheme, isLightOnlyPath, syncFavicon } from "@/lib/theme";
import { BottomNav } from "@/components/BottomNav";
import appCss from "../styles.css?url";

// Not needed to draw the first screen, so kept out of the main bundle and
// fetched right after: the toast host, and the signed-in-only notification
// hooks + permission prompt (which also pull in Capacitor and the quotes).
const Toaster = lazy(() =>
  import("sonner").then((m) => ({ default: m.Toaster })),
);
const SignedInExtras = lazy(() => import("@/components/SignedInExtras"));

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <p className="mt-2 text-muted-foreground">Page not found</p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

export const Route = createRootRoute(
  {
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        {
          name: "viewport",
          // App-like fixed scale: no pinch zoom, and no auto-zoom when an
          // input is focused on iOS.
          content:
            "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
        },
        { title: "Dombelz — Train. Track. Transform." },
        {
          name: "description",
          content:
            "AI-powered fitness & nutrition tracking. Log food by photo, voice, or barcode. Train smarter with personalized plans.",
        },
        { name: "theme-color", content: "#F6F7F5" },
        { property: "og:title", content: "Dombelz — Train. Track. Transform." },
        {
          property: "og:description",
          content:
            "AI-powered fitness & nutrition tracking. Log food by photo, voice, or barcode.",
        },
        { property: "og:type", content: "website" },
        { property: "og:image", content: "/favicon.jpg" },
        { name: "twitter:card", content: "summary" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-title", content: "Dombelz" },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        // Transparent symbol for the browser tab. Last wins in Chrome; the PNG
        // (white square, kept for the app icon) is the fallback for Safari.
        { rel: "icon", type: "image/png", href: "/icon-192.png" },
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "manifest", href: "/manifest.webmanifest" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossOrigin: "anonymous",
        },
        // The Google Fonts stylesheet itself is added by the head script in
        // RootShell, not here: a script-inserted stylesheet doesn't block the
        // first paint (~0.75 s on mobile). display=swap shows fallback text
        // until the fonts land.
      ],
    }),
    shellComponent: RootShell,
    component: RootComponent,
    notFoundComponent: NotFoundComponent,
  },
);

const FONTS_CSS =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&family=VT323&family=Orbitron:wght@500;700;900&family=Share+Tech+Mono&display=swap";

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            // Theme, then the native-shell marker. Both run before first paint
            // on purpose: applying the safe-area class from a React effect
            // instead would render the header under the status bar for a frame
            // and then jump, which is more noticeable than the overlap itself.
            // The landing page ("/") is always light; see routes/index.tsx.
            // On "/", a stored Supabase session adds .has-session so a
            // returning user sees the redirect spinner, not the landing page.
            __html: `try{var t=localStorage.getItem('theme'),v=['dark','light','theme-ocean','theme-sunset','theme-forest','theme-cyber','theme-cyberdeck','theme-isro'],c=document.documentElement.classList;if(v.indexOf(t)<0)t='dark';c.remove('dark','theme-ocean','theme-sunset','theme-forest','theme-cyber','theme-cyberdeck','theme-isro');if(t!=='light'&&location.pathname!=='/')c.add(t);if(location.pathname==='/'&&Object.keys(localStorage).some(function(k){return /^sb-.+-auth-token$/.test(k)}))c.add('has-session')}catch(e){}var f=document.createElement('link');f.rel='stylesheet';f.href='${FONTS_CSS}';document.head.appendChild(f);try{if(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())document.documentElement.classList.add('native-shell')}catch(e){}try{var d=document.documentElement;if(!d.classList.contains('native-shell')&&matchMedia('(display-mode: standalone)').matches&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&!sessionStorage.getItem('splash')&&!/^\\/(privacy|terms|refund)/.test(location.pathname)){sessionStorage.setItem('splash','1');d.classList.add('show-splash')}}catch(e){}`,
          }}
        />
        {/* Launch splash styles live here, not in styles.css: until the
            stylesheet arrives the splash would otherwise show as a blank box
            above the page. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `#boot-splash{display:none;position:fixed;inset:0;z-index:9999;background:#F6F8F8;transition:opacity .3s}html.show-splash #boot-splash{display:block}html.splash-done #boot-splash{display:none}#boot-splash video{width:100%;height:100%;object-fit:contain}`,
          }}
        />
      </head>
      <body>
        {/* Launch splash for the installed web app (head script decides). It
            plays over the page while React loads underneath, and is hidden,
            never removed, so hydration sees the same DOM. Only 0.4–2.45 s of the
            video plays (#t=): the tiles filling, without the blank lead-in or
            the shine after. */}
        <div id="boot-splash" aria-hidden="true">
          <video id="boot-video" muted playsInline preload="none" />
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var d=document.documentElement;if(!d.classList.contains('show-splash'))return;var s=document.getElementById('boot-splash'),v=document.getElementById('boot-video'),P='/images/splash/splash-portrait-v1',over=0,done=function(){if(over)return;over=1;v.pause();s.style.opacity=0;setTimeout(function(){d.classList.add('splash-done')},300)};var portrait=matchMedia('(orientation: portrait)').matches;var T='#t=0.4,2.45';v.src=(portrait?(v.canPlayType('video/webm')?P+'.webm':P+'.mp4'):'/images/splash/splash-landscape-v1.mp4')+T;v.onended=v.onpause=done;(function w(){if(over)return;if(v.currentTime>=2.4)done();else requestAnimationFrame(w)})();v.onerror=function(){if(/webm/.test(v.src)){v.src=P+'.mp4'+T;v.play().catch(done)}else done()};var p=v.play();if(p&&p.catch)p.catch(done);setTimeout(done,8000)})()`,
          }}
        />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  // The landing page keeps the green brand icon; routes/index.tsx swaps it on
  // the way in and out.
  useEffect(
    () =>
      syncFavicon(
        isLightOnlyPath(location.pathname) ? "dark" : getLocalTheme(),
      ),
    [],
  );
  // iOS Safari ignores user-scalable=no, so block its pinch gesture directly.
  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", block);
    return () => document.removeEventListener("gesturestart", block);
  }, []);
  return (
    <AuthProvider>
      <Suspense fallback={null}>
        <SignedInOnly />
      </Suspense>
      <Outlet />
      <BottomNav />
      <Suspense fallback={null}>
        <Toaster
          position="top-right"
          toastOptions={{
            // sonner's built-in icons are currentColor, so without richColors
            // they would go monochrome. Scope the colour to the icon element
            // only — the title stays --popover-foreground.
            //
            // Fixed colours rather than --primary on purpose: --primary is volt
            // green in dark, near-black in light, pure white in theme-cyber and
            // yellow in theme-cyberdeck. A tick that turns black stops meaning
            // "success".
            classNames: {
              success: "[&_[data-icon]]:text-emerald-400",
              error: "[&_[data-icon]]:text-red-400",
              warning: "[&_[data-icon]]:text-amber-400",
              info: "[&_[data-icon]]:text-sky-300",
            },
          }}
          // What makes toasts follow all eight themes. sonner draws its surface
          // from these three custom properties; pointing them at the app's own
          // tokens means each theme class re-skins the toast for free.
          //
          // richColors is deliberately gone: it forces its own light-tinted
          // cards and overrides --normal-bg, so the two cannot coexist.
          // --popover rather than --background, to match the app's other
          // floating panels.
          style={
            {
              "--normal-bg": "var(--popover)",
              "--normal-text": "var(--popover-foreground)",
              "--normal-border": "var(--border)",
            } as React.CSSProperties
          }
        />
      </Suspense>
      <SpeedInsights />
    </AuthProvider>
  );
}

/** Loads the notification hooks and prompt only once someone is signed in. */
function SignedInOnly() {
  const { user } = useAuth();
  return user ? <SignedInExtras /> : null;
}
