import { Link } from "@tanstack/react-router";
import { Activity, Dumbbell, Scale, Trophy, Utensils } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function BottomNav() {
  const { user } = useAuth();
  if (!user) return null;

  const navItems = [
    { to: "/dashboard", icon: Activity, label: "Home" },
    { to: "/food", icon: Utensils, label: "Food" },
    { to: "/workout", icon: Dumbbell, label: "Workout" },
    { to: "/weight", icon: Scale, label: "Weight" },
    { to: "/leaderboard", icon: Trophy, label: "Rank" },
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
