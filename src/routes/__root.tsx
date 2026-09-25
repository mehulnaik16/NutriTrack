import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SpeedInsights } from "@vercel/speed-insights/react";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import appCss from "../styles.css?url";

import { useReconcileOnForeground } from "@/lib/useReconcileOnForeground";
import { useProgressToasts } from "@/lib/useProgressToasts";

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

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1, viewport-fit=cover",
        },
        { title: "Dombelz — Train. Track. Transform." },
        {
          name: "description",
          content:
            "AI-powered fitness & nutrition tracking. Log food by photo, voice, or barcode. Train smarter with personalized plans.",
        },
        { name: "theme-color", content: "#101014" },
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
        { rel: "icon", type: "image/png", href: "/icon-192.png" },
        { rel: "manifest", href: "/manifest.webmanifest" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossOrigin: "anonymous",
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&family=VT323&family=Orbitron:wght@500;700;900&family=Share+Tech+Mono&display=swap",
        },
      ],
    }),
    shellComponent: RootShell,
    component: RootComponent,
    notFoundComponent: NotFoundComponent,
  },
);

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            // Theme, then the native-shell marker. Both run before first paint
            // on purpose: applying the safe-area class from a React effect
            // instead would render the header under the status bar for a frame
            // and then jump, which is more noticeable than the overlap itself.
            __html: `try{var t=localStorage.getItem('theme'),v=['dark','light','theme-ocean','theme-sunset','theme-forest','theme-cyber','theme-cyberdeck','theme-isro'],c=document.documentElement.classList;if(v.indexOf(t)<0)t='dark';c.remove('dark','theme-ocean','theme-sunset','theme-forest','theme-cyber','theme-cyberdeck','theme-isro');if(t!=='light')c.add(t)}catch(e){}try{if(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())document.documentElement.classList.add('native-shell')}catch(e){}`,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NotificationReconciler />
        <Outlet />
        <BottomNav />
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
        <SpeedInsights />
      </AuthProvider>
    </QueryClientProvider>
  );
}

/**
 * Renders nothing; exists to run the notification hooks inside AuthProvider.
 *
 * They have to be children rather than calls in RootComponent because both
 * need the signed-in user, and useAuth only works below the provider.
 *
 * Two of them, doing opposite jobs: one rebuilds the OS alarms that fire when
 * the app is closed, the other announces things that happened while the user
 * was on another screen.
 */
function NotificationReconciler() {
  const { user } = useAuth();
  useReconcileOnForeground(user?.id ?? null);
  useProgressToasts(user?.id ?? null);
  return null;
}
