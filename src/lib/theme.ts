import { useLayoutEffect } from "react";

// Keep in sync with the boot script in routes/__root.tsx and the check
// constraint on user_profiles.theme.
export const THEMES = [
  "dark",
  "light",
  "theme-ocean",
  "theme-sunset",
  "theme-forest",
  "theme-cyber",
  "theme-cyberdeck",
  "theme-isro",
];

export function getLocalTheme(): string {
  try {
    const t = localStorage.getItem("theme");
    return t && THEMES.includes(t) ? t : "light";
  } catch {
    return "light";
  }
}

// Tab icon colour per theme: each theme's --accent in styles.css. Dark and
// light keep the default green of /favicon.svg (volt reads too yellow there).
const ICON_FILL: Record<string, string> = {
  "theme-ocean": "oklch(0.78 0.14 200)",
  "theme-sunset": "oklch(0.72 0.19 45)",
  "theme-forest": "oklch(0.76 0.16 145)",
  "theme-cyber": "oklch(1 0 0)",
  "theme-cyberdeck": "oklch(0.85 0.19 210)",
  "theme-isro": "oklch(0.68 0.22 42)",
};

let iconSvg: Promise<string> | undefined;
let iconCall = 0;

/** Recolour the SVG tab icon to match the theme. */
export function syncFavicon(theme: string) {
  const link = document.querySelector<HTMLLinkElement>(
    'link[rel="icon"][type="image/svg+xml"]',
  );
  if (!link) return;
  const call = ++iconCall; // an older async recolour must not land after this
  const fill = ICON_FILL[theme];
  if (!fill) {
    link.href = "/favicon.svg";
    return;
  }
  iconSvg ??= fetch("/favicon.svg").then((r) => r.text());
  iconSvg
    .then((svg) => {
      if (call !== iconCall) return;
      link.href =
        "data:image/svg+xml," +
        encodeURIComponent(
          svg.replace(/fill="#[0-9A-Fa-f]{6}"/, `fill="${fill}"`),
        );
    })
    .catch(() => {
      iconSvg = undefined; // keep the green default; retry on next change
    });
}

/**
 * Pages that always render light, whatever theme the user picked: the landing
 * page, sign-up, and pricing. Keep in sync with the boot script in routes/__root.tsx.
 */
export const isLightOnlyPath = (path: string) =>
  /^\/(quiz|welcome|signup|signup-details|commit|plans)?$/.test(path);

/**
 * Hold the light theme while the calling page is mounted. __root.tsx skips the
 * saved theme on a hard load of a light-only path; this covers client-side
 * arrival and restores the saved theme on the way out.
 */
export function useForceLightTheme() {
  useLayoutEffect(() => {
    const c = document.documentElement.classList;
    c.remove(...THEMES);
    syncFavicon("dark"); // green brand icon
    return () => {
      const t = getLocalTheme();
      if (t !== "light") c.add(t);
      syncFavicon(t);
    };
  }, []);
}

/** Save on this device and repaint. Light-only pages keep their light look. */
export function applyTheme(theme: string) {
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // Storage blocked: the theme still applies for this page view.
  }
  if (isLightOnlyPath(location.pathname)) return;
  syncFavicon(theme);
  const c = document.documentElement.classList;
  c.remove(...THEMES);
  if (theme !== "light") c.add(theme);
}
