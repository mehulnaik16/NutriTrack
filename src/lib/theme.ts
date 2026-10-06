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
    return t && THEMES.includes(t) ? t : "dark";
  } catch {
    return "dark";
  }
}

/** Save on this device and repaint. The landing page ("/") stays light. */
export function applyTheme(theme: string) {
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // Storage blocked: the theme still applies for this page view.
  }
  if (location.pathname === "/") return;
  const c = document.documentElement.classList;
  c.remove(...THEMES);
  if (theme !== "light") c.add(theme);
}
