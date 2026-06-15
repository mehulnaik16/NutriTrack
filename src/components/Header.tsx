import { Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Dumbbell,
  LogOut,
  Moon,
  Scale,
  Sun,
  Utensils,
  User as UserIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export function Header({ name }: { name?: string }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Activity className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">FitTrack</span>
          </Link>
          {user && (
            <nav className="hidden items-center gap-1 sm:flex">
              <Link
                to="/dashboard"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors [&.active]:text-foreground [&.active]:bg-muted"
              >
                Dashboard
              </Link>
              <Link
                to="/food"
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors [&.active]:text-foreground [&.active]:bg-muted"
              >
                <Utensils className="h-3.5 w-3.5" /> Food
              </Link>
              <Link
                to="/workout"
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors [&.active]:text-foreground [&.active]:bg-muted"
              >
                <Dumbbell className="h-3.5 w-3.5" /> Workout
              </Link>
              <Link
                to="/weight"
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors [&.active]:text-foreground [&.active]:bg-muted"
              >
                <Scale className="h-3.5 w-3.5" /> Weight
              </Link>
            </nav>
          )}
        </div>

        <div className="hidden flex-col items-end text-right sm:flex">
          {name && <span className="text-sm font-medium">Hey, {name} 👋</span>}
          <span className="text-xs text-muted-foreground">{today}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleDark}
            aria-label="Toggle theme"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          {user && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate({ to: "/profile" })}
                aria-label="Profile"
              >
                <UserIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/login" });
                }}
                aria-label="Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
