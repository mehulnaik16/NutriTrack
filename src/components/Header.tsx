import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import {
  Activity,
  Dumbbell,
  LogOut,
  Scale,
  Utensils,
  User as UserIcon,
  Trophy,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";

export function Header({ name }: { name?: string }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const [workoutStreak, setWorkoutStreak] = useState(0);
  const [foodStreak, setFoodStreak] = useState(0);

  useEffect(() => {
    if (!user) return;
    const computeStreak = (dates: string[]) => {
      const unique = new Set(dates);
      if (unique.size === 0) return 0;
      let s = 0;
      const check = new Date();
      const todayStr = check.toISOString().slice(0, 10);
      if (!unique.has(todayStr)) check.setDate(check.getDate() - 1);
      while (true) {
        const d = check.toISOString().slice(0, 10);
        if (unique.has(d)) { s++; check.setDate(check.getDate() - 1); }
        else break;
      }
      return s;
    };

    const fetchStreaks = async () => {
      const { data: wData } = await supabase.from("workout_logs").select("date").eq("user_id", user.id).order("date", { ascending: false });
      if (wData) setWorkoutStreak(computeStreak(wData.map((d: any) => d.date)));

      const { data: fData } = await supabase.from("food_logs").select("date").eq("user_id", user.id).order("date", { ascending: false });
      if (fData) setFoodStreak(computeStreak(fData.map((d: any) => d.date)));
    };
    fetchStreaks();
  }, [user, pathname]);

  const streakGlow = (s: number) =>
    s > 7
      ? "border-orange-500 text-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]"
      : s > 0
        ? "border-orange-400 text-orange-500"
        : "text-muted-foreground";

  const foodGlow = (s: number) =>
    s > 7
      ? "border-green-500 text-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"
      : s > 0
        ? "border-green-400 text-green-500"
        : "text-muted-foreground";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-2 sm:px-6 sm:py-3">
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Activity className="h-5 w-5" />
            </div>
            <span className="text-base font-bold tracking-tight sm:text-lg">
              FitTrack
            </span>
          </Link>
          {user && (
            <nav className="hidden items-center gap-1 md:flex">
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
              <Link
                to="/leaderboard"
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors [&.active]:text-foreground [&.active]:bg-muted"
              >
                <Trophy className="h-3.5 w-3.5" /> Rank
              </Link>
            </nav>
          )}
        </div>
        <div className="hidden flex-row items-center gap-4 md:flex">
          {user && (
            <div className="flex items-center gap-2">
              {(!pathname.includes("/food")) && (
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-9 px-3 gap-1.5 font-bold transition-all ${streakGlow(workoutStreak)}`}
                >
                  <Dumbbell className={`h-4 w-4 ${workoutStreak > 0 ? "text-orange-500" : ""}`} />
                  {workoutStreak}
                </Button>
              )}
              {(!pathname.includes("/workout")) && (
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-9 px-3 gap-1.5 font-bold transition-all ${foodGlow(foodStreak)}`}
                >
                  <Utensils className={`h-4 w-4 ${foodStreak > 0 ? "text-green-500" : ""}`} />
                  {foodStreak}
                </Button>
              )}
            </div>
          )}

          <div className="flex flex-col items-end text-right">
            {name && (
              <span className="text-sm font-medium">Hey, {name} 👋</span>
            )}
            <span className="text-xs text-muted-foreground">{today}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {user && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                onClick={() => navigate({ to: "/profile" })}
                aria-label="Profile"
              >
                <UserIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
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
      {user && (
        <div className="mx-auto flex max-w-7xl items-center justify-between px-3 pb-2 text-xs text-muted-foreground md:hidden">
          <span className="truncate">
            {name ? `Hey, ${name} 👋` : "Welcome back"}
          </span>
          <span className="shrink-0">{today}</span>
        </div>
      )}
    </header>
  );
}
