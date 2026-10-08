import { createRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useEffect } from "react";
import { LogoLoader } from "@/components/LogoLoader";
import { routeTree } from "./routeTree.gen";
import "./lib/pwaInstall"; // catch beforeinstallprompt before any route renders

// A route's code chunk failed to load: a deploy replaced its hashed filename
// under an open tab (or mid-rollout), or the Vite dev server re-optimised deps.
// Reload once; the 10 s window stops a genuinely missing chunk from looping.
function reloadOnce(): boolean {
  const last = Number(sessionStorage.getItem("chunk-reload-at") ?? 0);
  if (Date.now() - last < 10_000) return false;
  sessionStorage.setItem("chunk-reload-at", String(Date.now()));
  window.location.reload();
  return true;
}

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (e) => {
    if (reloadOnce()) e.preventDefault();
  });
}

// Chrome / Safari / Firefox wording for a lazy route whose file is gone.
const STALE_CHUNK =
  /dynamically imported module|Importing a module script failed/i;

function RouteError({ error }: ErrorComponentProps) {
  const stale = STALE_CHUNK.test(String((error as Error | undefined)?.message ?? error));
  useEffect(() => {
    if (stale) reloadOnce();
  }, [stale]);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <LogoLoader />
      <p className="text-sm text-muted-foreground">
        {stale ? "Updating to the latest version…" : "Something didn't load."}
      </p>
      <button
        className="rounded-xl border border-border px-4 py-2 text-sm font-semibold"
        onClick={() => window.location.reload()}
      >
        Reload
      </button>
    </div>
  );
}

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    // Start fetching a page's code on hover / touchstart, before the click.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: RouteError,
  });

  return router;
};
