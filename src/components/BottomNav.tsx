import { useEffect } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { Activity, Dumbbell, Scale, Utensils } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { HOME, tabStep } from "@/lib/tabHistory";

/** History index of the Home entry in this tab (see lib/tabHistory.ts). */
const HOME_IDX_KEY = "dombelz.homeIdx";
const historyIdx = (router: ReturnType<typeof useRouter>) =>
  (router.history.location.state as { __TSR_index?: number }).__TSR_index ?? 0;

// Full-screen routes where the nav must stay hidden — during onboarding showing
// it would let the user bypass the /welcome scroll gate by tapping a tab, and
// /profile plus all its ?page= sub-pages carry their own back arrow instead.
const HIDDEN_ON = new Set([
  "/profile",
  "/plans",
  "/quiz",
  "/welcome",
  "/commit",
  "/signup",
  "/signup-details",
  "/refer-intro",
  "/refer-how-it-works",
  "/refer-terms",
  "/calorie-calculator",
]);

function HubIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="4.5" r="2" />
      <circle cx="4.5" cy="18" r="2" />
      <circle cx="19.5" cy="18" r="2" />
      <circle cx="12" cy="12" r="2.25" fill="currentColor" />
      <line x1="12" y1="6.5" x2="12" y2="9.75" />
      <line x1="10.05" y1="13.3" x2="6.3" y2="16.4" />
      <line x1="13.95" y1="13.3" x2="17.7" y2="16.4" />
      <path d="M6.2 16.5 A8 8 0 1 1 17.8 16.5" />
    </svg>
  );
}

const TABS = ["/dashboard", "/food", "/workout", "/hub", "/weight"] as const;

export function BottomNav() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const router = useRouter();
  const navigate = useNavigate();

  // Remember where Home sits in the history, so tab taps can keep the stack
  // at [Home, tab] instead of adding an entry per tap.
  useEffect(() => {
    if (pathname !== HOME) return;
    try {
      sessionStorage.setItem(HOME_IDX_KEY, String(historyIdx(router)));
    } catch {
      // Storage blocked: tab taps fall back to swapping the entry.
    }
  }, [pathname, router]);

  const goTab = (e: React.MouseEvent, to: string) => {
    e.preventDefault();
    let home: number | null = null;
    try {
      const v = sessionStorage.getItem(HOME_IDX_KEY);
      home = v === null ? null : Number(v);
    } catch {
      /* unknown: tabStep only swaps */
    }
    const step = tabStep(pathname, to, historyIdx(router), home);
    if (step.kind === "none") return;
    if (step.kind === "push") return void navigate({ to });
    if (step.kind === "replace") return void navigate({ to, replace: true });
    if (step.then)
      window.addEventListener(
        "popstate",
        () => navigate({ to, replace: true }),
        { once: true },
      );
    router.history.go(-step.steps);
  };

  // Each tab's code is a separate file fetched on first visit — on mobile
  // data that's a visible pause after the tap. Fetch all five once the app
  // is idle so every tab opens instantly.
  useEffect(() => {
    if (!user) return;
    const go = () =>
      TABS.forEach((to) => router.preloadRoute({ to }).catch(() => {}));
    const id = window.requestIdleCallback?.(go) ?? window.setTimeout(go, 1500);
    return () =>
      window.cancelIdleCallback
        ? window.cancelIdleCallback(id)
        : clearTimeout(id);
  }, [user, router]);

  // Visibility depends on the session and the route only — never on a network
  // read. This used to also require useAuth().hasProfile === true, and that
  // flag stays null whenever the user_profiles check fails or hangs (a dropped
  // request on mobile data, a tab restored mid-fetch), with nothing to retry
  // it. The result was a phone with no navigation at all for the rest of the
  // session, because the header's tab strip only appears at md and up.
  // Onboarding stays covered: /quiz and /welcome are listed above, and every
  // tab route already redirects a profile-less user back to /quiz itself.
  if (!user) return null;
  if (HIDDEN_ON.has(pathname)) return null;

  const navItems = [
    { to: "/dashboard", icon: Activity, label: "Home" },
    { to: "/food", icon: Utensils, label: "Food" },
    { to: "/workout", icon: Dumbbell, label: "Workout" },
    { to: "/hub", icon: HubIcon, label: "Hub" },
    { to: "/weight", icon: Scale, label: "Weight" },
  ] as const;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/70 bg-background/90 px-2 pb-safe backdrop-blur-xl md:hidden">
      <div className="mx-auto flex h-16 max-w-md items-center justify-around gap-1">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            onClick={(e) => goTab(e, item.to)}
            data-tour={item.to === "/food" ? "nav-food" : undefined}
            className="group flex h-[54px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-muted-foreground transition-colors hover:text-foreground [&.active]:text-accent"
          >
            <span className="flex h-7 w-12 items-center justify-center rounded-full transition-all group-[.active]:bg-accent/15">
              <item.icon className="h-5 w-5" />
            </span>
            <span className="text-[10px] font-semibold tracking-wide">
              {item.label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
