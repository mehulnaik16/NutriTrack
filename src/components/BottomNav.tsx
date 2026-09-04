import { Link, useLocation } from "@tanstack/react-router";
import { Activity, Dumbbell, Scale, Utensils } from "lucide-react";
import { useAuth } from "@/lib/auth";

// Full-screen routes where the nav must stay hidden — during onboarding showing
// it would let the user bypass the /welcome scroll gate by tapping a tab, and
// /profile plus all its ?page= sub-pages carry their own back arrow instead.
const HIDDEN_ON = new Set([
  "/profile",
  "/plans",
  "/welcome",
  "/refer-intro",
  "/refer-how-it-works",
  "/refer-terms",
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

export function BottomNav() {
  const { user, hasProfile } = useAuth();
  const { pathname } = useLocation();
  // Hidden until onboarding is finished — every tab below is profile-gated, so
  // showing them mid-quiz just offers a way to land on a loading spinner.
  if (!user || hasProfile !== true) return null;
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
