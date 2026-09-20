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
            __html: `try{var t=localStorage.getItem('theme'),v=['dark','light','theme-ocean','theme-sunset','theme-forest'],c=document.documentElement.classList;if(v.indexOf(t)<0)t='dark';c.remove('dark','theme-ocean','theme-sunset','theme-forest');if(t!=='light')c.add(t)}catch(e){}try{if(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())document.documentElement.classList.add('native-shell')}catch(e){}`,
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
        <Toaster position="top-right" richColors />
        <SpeedInsights />
      </AuthProvider>
    </QueryClientProvider>
  );
}

/**
 * Renders nothing; exists to run the reconcile hook inside AuthProvider.
 *
 * It has to be a child rather than a call in RootComponent because the hook
 * needs the signed-in user, and useAuth only works below the provider.
 */
function NotificationReconciler() {
  const { user } = useAuth();
  useReconcileOnForeground(user?.id ?? null);
  return null;
}
