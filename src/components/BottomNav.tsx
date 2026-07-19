import { Link } from "@tanstack/react-router";
import { Activity, Dumbbell, Scale, Utensils } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function BottomNav() {
  const { user } = useAuth();
  if (!user) return null;

  const navItems = [
    { to: "/dashboard", icon: Activity, label: "History" },
    { to: "/food", icon: Utensils, label: "Food" },
    { to: "/workout", icon: Dumbbell, label: "Workout" },
    { to: "/weight", icon: Scale, label: "Weight" },
  ] as const;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 px-2 pb-safe backdrop-blur md:hidden">
      <div className="mx-auto flex h-16 max-w-md items-center justify-around gap-1">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-muted-foreground transition-colors hover:bg-muted/50 [&.active]:bg-accent/10 [&.active]:text-accent"
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] font-semibold">{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
