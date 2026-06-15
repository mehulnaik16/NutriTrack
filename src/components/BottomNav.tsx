import { Link } from "@tanstack/react-router";
import { Activity, Dumbbell, Scale, Utensils } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function BottomNav() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-border bg-background/95 px-2 pb-safe backdrop-blur md:hidden">
      <Link
        to="/dashboard"
        className="flex flex-col items-center justify-center gap-1 w-16 h-full text-muted-foreground transition-colors [&.active]:text-accent"
      >
        <Activity className="h-5 w-5" />
        <span className="text-[10px] font-medium">Home</span>
      </Link>
      <Link
        to="/food"
        className="flex flex-col items-center justify-center gap-1 w-16 h-full text-muted-foreground transition-colors [&.active]:text-accent"
      >
        <Utensils className="h-5 w-5" />
        <span className="text-[10px] font-medium">Food</span>
      </Link>
      <Link
        to="/workout"
        className="flex flex-col items-center justify-center gap-1 w-16 h-full text-muted-foreground transition-colors [&.active]:text-accent"
      >
        <Dumbbell className="h-5 w-5" />
        <span className="text-[10px] font-medium">Workout</span>
      </Link>
      <Link
        to="/weight"
        className="flex flex-col items-center justify-center gap-1 w-16 h-full text-muted-foreground transition-colors [&.active]:text-accent"
      >
        <Scale className="h-5 w-5" />
        <span className="text-[10px] font-medium">Weight</span>
      </Link>
    </nav>
  );
}
