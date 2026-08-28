import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import {
  Activity,
  Dumbbell,
  LogOut,
  Scale,
  Utensils,
  User as UserIcon,
  Flame,
} from "lucide-react";

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
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";

const NAV_LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: null },
  { to: "/food", label: "Food", icon: Utensils },
  { to: "/workout", label: "Workout", icon: Dumbbell },
  { to: "/hub", label: "Hub", icon: HubIcon },
  { to: "/weight", label: "Weight", icon: Scale },
] as const;

/** Local YYYY-MM-DD (avoids UTC off-by-one) */
const localISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

function computeStreak(dates: Set<string>): number {
  if (dates.size === 0) return 0;
  let s = 0;
  const check = new Date();
  if (!dates.has(localISO(check))) check.setDate(check.getDate() - 1);
  while (dates.has(localISO(check))) {
    s++;
    check.setDate(check.getDate() - 1);
  }
  return s;
}

/** Last 7 days, oldest → today */
function lastSevenDays() {
  const days: { iso: string; letter: string; isToday: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      iso: localISO(d),
      letter: d.toLocaleDateString("en-US", { weekday: "narrow" }),
      isToday: i === 0,
    });
  }
  return days;
}

function StreakDialog({
  count,
  title,
  icon: Icon,
  activeDates,
  trigger,
}: {
  count: number;
  title: string;
  icon: React.ElementType;
  activeDates: Set<string>;
  trigger: React.ReactNode;
}) {
  const week = lastSevenDays();
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="border-0 bg-transparent p-0 shadow-none sm:max-w-[380px]">
        <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-accent/20 bg-card p-7 text-center shadow-2xl">
          <div className="pointer-events-none absolute left-0 top-0 h-full w-full bg-gradient-to-b from-accent/10 to-transparent" />
          <div className="relative mb-5">
            <div className="absolute inset-0 rounded-full bg-accent/25 blur-2xl" />
            <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-xl glow-accent animate-in zoom-in duration-500">
              <Icon className="absolute h-24 w-24 opacity-10" />
              <span className="z-10 font-display text-5xl font-bold">{count}</span>
            </div>
          </div>
          <DialogTitle className="mb-1 font-display text-2xl font-bold tracking-tight">
            {title}
          </DialogTitle>
          <p className="text-xs font-medium text-muted-foreground">
            {count === 0
              ? "Log something today to light the first flame."
              : count === 1
                ? "Day one down. Come back tomorrow."
                : `${count} days in a row. Keep the chain alive.`}
          </p>
          <div className="mt-5 flex w-full items-center justify-between rounded-2xl bg-muted/40 p-4">
            {week.map((d) => {
              const active = activeDates.has(d.iso);
              return (
                <div key={d.iso} className="flex flex-col items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground">
                    {d.letter}
                  </span>
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                      active
                        ? "bg-accent text-accent-foreground shadow-md glow-accent-sm"
                        : d.isToday
                          ? "border-2 border-dashed border-accent/50 text-accent"
                          : "bg-muted text-muted-foreground/40"
                    }`}
                  >
                    {active ? "✓" : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DayRow({ dates, src }: { dates: Set<string>; src: string }) {
  const week = lastSevenDays();
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: "8px 10px", display: "flex", justifyContent: "space-between" }}>
      {week.map((d) => {
        const active = dates.has(d.iso);
        return (
          <div key={d.iso} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#6B7280" }}>{d.letter}</span>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: active ? "#FFFFFF" : "#E5E7EB", border: active ? "1px solid #E5E7EB" : "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {active && <img src={src} alt="" style={{ width: 16, height: 16, objectFit: "contain" }} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DashboardStreakDialog({
  foodStreak,
  workoutStreak,
  foodDates,
  workoutDates,
  trigger,
}: {
  foodStreak: number;
  workoutStreak: number;
  foodDates: Set<string>;
  workoutDates: Set<string>;
  trigger: React.ReactNode;
}) {
  const foodSubtitle =
    foodStreak === 0 ? "Start logging food today!" : `${foodStreak} days in a row. Keep the chain alive.`;
  const workoutSubtitle =
    workoutStreak === 0 ? "Log a workout to start your streak!" : `${workoutStreak} days in a row. Amazing consistency!`;

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="border-0 bg-transparent p-0 shadow-none sm:max-w-[360px] [&>button]:text-black [&>button]:opacity-100">
        <div style={{ background: "#FFFFFF", borderRadius: 20, padding: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
          <DialogTitle style={{ fontWeight: 700, fontSize: 20, color: "#1C1C1E", margin: "0 0 3px" }}>
            A Daily Streak
          </DialogTitle>
          <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 16px" }}>
            Keep the chain alive. Consistency is progress.
          </p>

          {/* Top summary: leaf + flame side by side */}
          <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 16 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ position: "relative", width: 80, height: 80 }}>
                <img src="/leaf.png" alt="Food Streak" style={{ width: 80, height: 80, objectFit: "contain" }} />
                <span style={{ position: "absolute", top: "43%", left: "43%", transform: "translate(-50%, -50%)", fontWeight: 800, fontSize: 26, color: "#fff", lineHeight: 1, textShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>
                  {foodStreak}
                </span>
              </div>
              <span style={{ fontWeight: 700, fontSize: 13, color: "#1C1C1E" }}>Food Streak</span>
            </div>

            <div style={{ width: 1, height: 72, background: "#E5E7EB", flexShrink: 0, margin: "0 4px 22px" }} />

            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ position: "relative", width: 80, height: 80 }}>
                <img src="/fire image.png" alt="Workout Streak" style={{ width: 80, height: 80, objectFit: "contain" }} />
                <span style={{ position: "absolute", top: "52%", left: "50%", transform: "translate(-50%, -50%)", fontWeight: 800, fontSize: 26, color: "#fff", lineHeight: 1, textShadow: "0 1px 4px rgba(0,0,0,0.35)" }}>
                  {workoutStreak}
                </span>
              </div>
              <span style={{ fontWeight: 700, fontSize: 13, color: "#1C1C1E" }}>Workout Streak</span>
            </div>
          </div>

          {/* Food Streak detail card */}
          <div style={{ background: "#F4FAF4", borderRadius: 14, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <img src="/leaf.png" alt="" style={{ width: 36, height: 36, objectFit: "contain", flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1C1C1E" }}>Food Streak</div>
                <div style={{ fontSize: 11.5, color: "#6B7280" }}>{foodSubtitle}</div>
              </div>
            </div>
            <DayRow dates={foodDates} src="/leaf.png" />
          </div>

          {/* Workout Streak detail card */}
          <div style={{ background: "#FFF5EC", borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <img src="/fire image.png" alt="" style={{ width: 36, height: 36, objectFit: "contain", flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1C1C1E" }}>Workout Streak</div>
                <div style={{ fontSize: 11.5, color: "#6B7280" }}>{workoutSubtitle}</div>
              </div>
            </div>
            <DayRow dates={workoutDates} src="/fire image.png" />
          </div>

          <p style={{ textAlign: "center", fontSize: 11.5, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>
            Complete a lesson, log your food, or finish a workout to keep your streaks going and earn badges!
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Header({
  name,
  hideStreak,
}: {
  name?: string;
  hideStreak?: boolean;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  const shouldHideStreak =
    hideStreak ??
    (pathname.startsWith("/hub") || pathname.startsWith("/weight"));

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const [workoutDates, setWorkoutDates] = useState<Set<string>>(new Set());
  const [foodDates, setFoodDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const fetchDates = async () => {
      const [{ data: wData }, { data: fData }] = await Promise.all([
        supabase
          .from("workout_logs")
          .select("date")
          .eq("user_id", user.id)
          .order("date", { ascending: false })
          .limit(400),
        supabase
          .from("food_logs")
          .select("date, logged_at")
          .eq("user_id", user.id)
          .order("date", { ascending: false })
          .limit(400),
      ]);
      setWorkoutDates(new Set((wData ?? []).map((d: any) => d.date)));
      setFoodDates(
        new Set(
          (fData ?? [])
            .filter((d: any) => d.logged_at && localISO(new Date(d.logged_at)) === d.date)
            .map((d: any) => d.date)
        )
      );
    };
    fetchDates();
  }, [user, pathname]);

  const overallDates = useMemo(
    () => new Set([...workoutDates, ...foodDates]),
    [workoutDates, foodDates],
  );

  const workoutStreak = useMemo(() => computeStreak(workoutDates), [workoutDates]);
  const foodStreak = useMemo(() => computeStreak(foodDates), [foodDates]);
  const overallStreak = useMemo(() => computeStreak(overallDates), [overallDates]);

  const streakCfg = pathname.includes("/workout")
    ? { count: workoutStreak, title: "Workout Streak", icon: Dumbbell, dates: workoutDates }
    : pathname.includes("/food")
      ? { count: foodStreak, title: "Food Streak", icon: Utensils, dates: foodDates }
      : { count: overallStreak, title: "Day Streak", icon: Flame, dates: overallDates };

  const chipStyle =
    streakCfg.count > 7
      ? "border-accent/60 text-accent glow-accent-sm"
      : streakCfg.count > 0
        ? "border-accent/40 text-accent"
        : "text-muted-foreground";

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-2.5 sm:px-6">
        <div className="flex items-center gap-5">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-foreground glow-accent-sm">
              <Activity className="h-5 w-5" />
            </div>
            <span className="font-display text-base font-bold tracking-tight sm:text-lg">
              Dombelz
            </span>
          </Link>
          {user && (
            <nav className="hidden items-center gap-1 rounded-full border border-border/60 bg-card/60 p-1 md:flex">
              {NAV_LINKS.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-accent [&.active]:font-semibold [&.active]:text-accent-foreground"
                >
                  {l.icon && <l.icon className="h-3.5 w-3.5" />} {l.label}
                </Link>
              ))}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="mr-1 hidden flex-col items-end text-right lg:flex">
            {name && (
              <span className="text-sm font-semibold">
                {pathname === "/hub" ? `Welcome to Hub, ${name} 🙏` : `Hey, ${name} 👋`}
              </span>
            )}
            <span className="text-xs text-muted-foreground">{today}</span>
          </div>

          {user && (
            <>
              {!shouldHideStreak &&
                (pathname === "/dashboard" ? (
                  <DashboardStreakDialog
                    foodStreak={foodStreak}
                    workoutStreak={workoutStreak}
                    foodDates={foodDates}
                    workoutDates={workoutDates}
                    trigger={
                      <Button
                        variant="outline"
                        size="sm"
                        className={`h-9 gap-1.5 rounded-full px-3 font-bold transition-all ${chipStyle}`}
                      >
                        <Flame className="h-4 w-4" />
                        {foodStreak}
                      </Button>
                    }
                  />
                ) : (
                  <StreakDialog
                    count={streakCfg.count}
                    title={streakCfg.title}
                    icon={streakCfg.icon}
                    activeDates={streakCfg.dates}
                    trigger={
                      <Button
                        variant="outline"
                        size="sm"
                        className={`h-9 gap-1.5 rounded-full px-3 font-bold transition-all ${chipStyle}`}
                      >
                        <streakCfg.icon className="h-4 w-4" />
                        {streakCfg.count}
                      </Button>
                    }
                  />
                ))}
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full border border-border/60 bg-card/60 font-display text-sm font-bold hover:border-accent/50 hover:text-accent"
                onClick={() => navigate({ to: "/profile" })}
                aria-label="Profile"
              >
                {name ? name[0]?.toUpperCase() : <UserIcon className="h-4 w-4" />}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-full text-muted-foreground hover:text-destructive"
                    aria-label="Logout"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Log out?</AlertDialogTitle>
                    <AlertDialogDescription>
                      You'll need to sign in again to get back to your account.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        await signOut();
                        navigate({ to: "/login", replace: true });
                      }}
                    >
                      Log out
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>
      {user && (
        <div className="mx-auto flex max-w-7xl items-center justify-between px-3 pb-2 text-xs text-muted-foreground lg:hidden">
          <span className="truncate font-medium">
            {name ? (pathname === "/hub" ? `Welcome to Hub, ${name} 🙏` : `Hey, ${name} 👋`) : "Welcome back"}
          </span>
          <span className="shrink-0">{today}</span>
        </div>
      )}
    </header>
  );
}
