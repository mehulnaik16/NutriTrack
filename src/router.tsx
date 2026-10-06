import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// A route's code chunk failed to load: a deploy replaced its hashed filename
// under an open tab, or the Vite dev server re-optimised deps. Without this the
// navigation silently does nothing (e.g. login never reaches /dashboard).
// Reload once; the 10 s window stops a genuinely missing chunk from looping.
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (e) => {
    const last = Number(sessionStorage.getItem("chunk-reload-at") ?? 0);
    if (Date.now() - last < 10_000) return;
    e.preventDefault();
    sessionStorage.setItem("chunk-reload-at", String(Date.now()));
    window.location.reload();
  });
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
