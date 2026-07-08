import { Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Dumbbell,
  LogOut,
  Scale,
  Utensils,
  User as UserIcon,
  Trophy,
  Flame,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";

export function Header({ name }: { name?: string }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const [streak, setStreak] = useState(0);

  useEffect(() => {
    if (user) {
      supabase.from("user_profiles").select("current_streak").eq("id", user.id).single()
        .then(({ data }) => setStreak((data as any)?.current_streak || 0));
    }
  }, [user]);

  const neonGlow = streak > 7 ? 'border-orange-500 text-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)] hover:bg-orange-500/10 hover:shadow-[0_0_15px_rgba(249,115,22,0.8)]' : streak > 0 ? 'border-orange-400 text-orange-500' : 'text-muted-foreground';

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
              <Link
                to="/leaderboard"
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors [&.active]:text-foreground [&.active]:bg-muted"
              >
                <Trophy className="h-3.5 w-3.5" /> Rank
              </Link>
            </nav>
          )}
        </div>

        <div className="hidden flex-row items-center gap-4 sm:flex">
          {user && (
            <Dialog>
              <DialogTrigger asChild>
                <Button 
                   variant="outline" 
                   className={`h-9 px-3 gap-1.5 font-bold transition-all ${neonGlow}`}
                >
                  <Flame className={`h-4 w-4 ${streak > 0 ? 'fill-current' : ''}`} />
                  {streak}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[380px] p-0 border-0 bg-transparent shadow-none">
                <div className="bg-card rounded-xl border-accent/20 shadow-2xl relative overflow-hidden flex flex-col items-center justify-center text-center p-6">
                  <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-red-500/5 to-transparent pointer-events-none" />
                  
                  <div className="relative mb-4">
                    <div className="absolute inset-0 bg-red-500/20 blur-2xl rounded-full" />
                    <div className="relative flex items-center justify-center h-28 w-28 bg-gradient-to-tr from-red-600 to-orange-400 rounded-full text-white shadow-xl shadow-red-500/20 animate-in zoom-in duration-500">
                      <Flame className="absolute h-32 w-32 opacity-20" />
                      <span className="text-5xl font-black z-10">{streak}</span>
                    </div>
                  </div>

                  <h3 className="text-2xl font-black tracking-tight mb-1">Day Streak</h3>
                  <div className="flex items-center gap-2 text-muted-foreground font-medium mb-6">
                    <span className="opacity-50">🌿</span>
                    <span>Best: <span className="text-blue-500 font-bold">{Math.max(streak, parseInt(localStorage.getItem('longest_streak') || '0'))} days</span></span>
                    <span className="opacity-50">🌿</span>
                  </div>

                  <div className="flex w-full justify-between items-center bg-muted/30 rounded-2xl p-4">
                    {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => {
                      const isToday = i === new Date().getDay() - 1 || (new Date().getDay() === 0 && i === 6);
                      return (
                        <div key={i} className="flex flex-col items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground">{day}</span>
                          <div className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold ${isToday ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20' : 'bg-muted text-muted-foreground/50'}`}>
                            {isToday ? "✓" : i + 1}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}

          <div className="flex flex-col items-end text-right">
            {name && <span className="text-sm font-medium">Hey, {name} 👋</span>}
            <span className="text-xs text-muted-foreground">{today}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
