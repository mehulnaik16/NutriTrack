import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/client";
import { Header } from "@/components/Header";
import { WorkoutLogHistory } from "@/components/WorkoutLogHistory";
import { FriendsPanel } from "@/components/FriendsPanel";
import { Card, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trophy,
  Flame,
  Crown,
  Dumbbell,
  Droplets,
  Activity,
  Utensils,
  Star,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/hub")({
  component: Hub,
});

interface LeaderboardUser {
  id: string;
  full_name: string | null;
  current_streak: number;
  workouts_count: number;
  avg_calories: number;
  total_water: number;
  total_exercise_min: number;
  overall_score: number;
}

function Hub() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"ANALYTICS" | "FRIENDS" | "RANK">("ANALYTICS");
  const [firstName, setFirstName] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_profiles")
      .select("full_name")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.full_name) setFirstName(data.full_name.split(" ")[0]);
      });
  }, [user]);

  // ── Leaderboard state ──────────────────────────────────────────
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState("monthly");
  const [category, setCategory] = useState("overall");

  useEffect(() => {
    let isMounted = true;

    const fetchData = () => {
      setLoading(true);
      const now = new Date();
      let startDate = new Date();
      if (timeFilter === "daily") {
        startDate.setDate(now.getDate() - 1);
      } else if (timeFilter === "monthly") {
        startDate.setDate(now.getDate() - 30);
      } else if (timeFilter === "yearly") {
        startDate.setDate(now.getDate() - 365);
      }
      const startDateStr = startDate.toISOString().slice(0, 10);

      Promise.all([
        supabase.from("user_profiles").select("id, full_name, current_streak"),
        (supabase.rpc as any)("get_leaderboard_stats", {
          start_date: startDateStr,
        }),
      ]).then(([profilesRes, statsRes]: [any, any]) => {
        if (!isMounted) return;

        if (statsRes.error) {
          console.error("[leaderboard] RPC error:", statsRes.error);
          toast.error(`Leaderboard error: ${statsRes.error.message}`);
        }
        if (profilesRes.error) {
          console.error("[leaderboard] profiles error:", profilesRes.error);
        }

        const profiles = (profilesRes.data || []) as any[];
        const stats = (statsRes.data || []) as any[];

        const merged: LeaderboardUser[] = stats.map((s: any) => {
          const p = profiles.find((x: any) => x.id === s.user_id);
          return {
            id: s.user_id,
            full_name: s.full_name ?? p?.full_name ?? null,
            current_streak: s.current_streak ?? p?.current_streak ?? 0,
            workouts_count: s.workouts_count || 0,
            avg_calories: s.avg_calories || 0,
            total_water: s.total_water || 0,
            total_exercise_min: s.total_exercise_min || 0,
            overall_score: s.overall_score || 0,
          };
        });

        for (const p of profiles) {
          if (!merged.some((m) => m.id === p.id)) {
            merged.push({
              id: p.id,
              full_name: p.full_name,
              current_streak: p.current_streak || 0,
              workouts_count: 0,
              avg_calories: 0,
              total_water: 0,
              total_exercise_min: 0,
              overall_score: 0,
            });
          }
        }

        merged.sort((a, b) => {
          if (category === "streak") return b.current_streak - a.current_streak;
          if (category === "workouts") return b.workouts_count - a.workouts_count;
          if (category === "calories") return b.avg_calories - a.avg_calories;
          if (category === "water") return b.total_water - a.total_water;
          if (category === "exercise") return b.total_exercise_min - a.total_exercise_min;
          return b.overall_score - a.overall_score;
        });

        setUsers(merged.slice(0, 50));
        setLoading(false);
      });
    };

    fetchData();

    const channel = supabase
      .channel("hub_leaderboard_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "workout_logs" }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "food_logs" }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "water_logs" }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_profiles" }, fetchData)
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [timeFilter, category]);

  // ── Leaderboard helpers ────────────────────────────────────────
  const getCategoryIcon = () => {
    if (category === "streak") return <Flame className="h-4 w-4 fill-current" />;
    if (category === "workouts") return <Dumbbell className="h-4 w-4" />;
    if (category === "calories") return <Utensils className="h-4 w-4" />;
    if (category === "water") return <Droplets className="h-4 w-4" />;
    if (category === "exercise") return <Activity className="h-4 w-4" />;
    return <Star className="h-4 w-4 fill-current" />;
  };

  const getCategoryValue = (u: LeaderboardUser) => {
    if (category === "streak") return u.current_streak;
    if (category === "workouts") return u.workouts_count;
    if (category === "calories") return Math.round(u.avg_calories) + " kcal";
    if (category === "water") return Math.round((u.total_water / 1000) * 10) / 10 + " L";
    if (category === "exercise") return u.total_exercise_min + " min";
    return Math.round(u.overall_score) + " pts";
  };

  const initial = (n: string | null) => (n?.trim()?.[0] ?? "A").toUpperCase();
  const podium = users.slice(0, 3);
  const rest = users.slice(3);
  const myRank = users.findIndex((u) => u.id === user?.id);

  const PODIUM_STYLES = [
    {
      ring: "border-yellow-400/70 text-yellow-400",
      badge: "bg-yellow-400 text-black",
      order: "order-2",
      size: "h-20 w-20 text-2xl",
      lift: "-translate-y-3",
    },
    {
      ring: "border-slate-300/60 text-slate-300",
      badge: "bg-slate-300 text-black",
      order: "order-1",
      size: "h-16 w-16 text-xl",
      lift: "",
    },
    {
      ring: "border-amber-600/60 text-amber-500",
      badge: "bg-amber-600 text-white",
      order: "order-3",
      size: "h-16 w-16 text-xl",
      lift: "",
    },
  ];

  const renderLeaderboard = () => (
    <>
      {/* ── Page header ── */}
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent glow-accent-sm">
          <Trophy className="h-8 w-8" />
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Leaderboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          See how you rank against the community
          {myRank >= 0 && (
            <span className="ml-1 font-bold text-accent">— you're #{myRank + 1}</span>
          )}
        </p>
      </div>

      {/* ── Filters ── */}
      <Card className="mb-6 border-border/60">
        <CardHeader className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="ml-1 text-xs font-bold uppercase text-muted-foreground">
              Time Period
            </label>
            <Select value={timeFilter} onValueChange={setTimeFilter}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="ml-1 text-xs font-bold uppercase text-muted-foreground">
              Category
            </label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="overall">Overall Score</SelectItem>
                <SelectItem value="streak">Daily Streak</SelectItem>
                <SelectItem value="workouts">Workouts Done</SelectItem>
                <SelectItem value="calories">Avg Calories Logged</SelectItem>
                <SelectItem value="water">Total Water Intake</SelectItem>
                <SelectItem value="exercise">Exercise Minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      {loading ? (
        <div className="flex justify-center p-12">
          <Trophy className="h-8 w-8 animate-pulse text-accent opacity-60" />
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
          No data found for this period.
        </div>
      ) : (
        <>
          {/* ── Podium ── */}
          {podium.length >= 2 && (
            <div className="mb-8 flex items-end justify-center gap-4 sm:gap-8">
              {podium.map((u, i) => {
                const s = PODIUM_STYLES[i];
                const isMe = u.id === user?.id;
                return (
                  <div key={u.id} className={`flex flex-col items-center ${s.order} ${s.lift}`}>
                    {i === 0 && <Crown className="mb-1 h-5 w-5 text-yellow-400" />}
                    <div className="relative">
                      <div
                        className={`flex items-center justify-center rounded-full border-2 bg-card font-display font-bold ${s.ring} ${s.size} ${i === 0 ? "glow-accent-sm" : ""}`}
                      >
                        {initial(u.full_name)}
                      </div>
                      <span
                        className={`absolute -bottom-2 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full text-xs font-bold ${s.badge}`}
                      >
                        {i + 1}
                      </span>
                    </div>
                    <p
                      className={`mt-4 max-w-[90px] truncate text-center text-xs font-semibold sm:max-w-[120px] sm:text-sm ${isMe ? "text-accent" : ""}`}
                    >
                      {isMe ? "You" : u.full_name || "Anonymous"}
                    </p>
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-bold text-accent">
                      {getCategoryIcon()}
                      {getCategoryValue(u)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Everyone else ── */}
          <div className="space-y-2">
            {(podium.length >= 2 ? rest : users).map((u, i) => {
              const rank = podium.length >= 2 ? i + 4 : i + 1;
              const isMe = u.id === user?.id;
              return (
                <div
                  key={u.id}
                  className={`flex items-center justify-between gap-3 rounded-2xl border p-3.5 transition-colors sm:p-4 ${
                    isMe
                      ? "border-accent/60 bg-accent/5 glow-accent-sm"
                      : "border-border bg-card hover:border-accent/40"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-7 shrink-0 text-center font-display text-sm font-bold text-muted-foreground">
                      {rank}
                    </span>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted font-display text-sm font-bold">
                      {initial(u.full_name)}
                    </div>
                    <span className="truncate text-sm font-semibold sm:text-base">
                      {u.full_name || "Anonymous User"}
                      {isMe && (
                        <span className="ml-2 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent-foreground">
                          You
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5 text-accent">
                    {getCategoryIcon()}
                    <span className="text-sm font-bold">{getCategoryValue(u)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      <Header name={firstName} />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {/* ── Custom Tabs (same style as workout.tsx) ── */}
        <div className="mb-6 flex gap-2 rounded-2xl border border-border/50 bg-muted/40 p-1.5 backdrop-blur-sm">
          {(["ANALYTICS", "FRIENDS", "RANK"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-xl py-3 text-xs font-black uppercase tracking-widest transition-all duration-300 ${
                activeTab === tab
                  ? "scale-100 bg-background text-foreground shadow-sm ring-1 ring-border/50"
                  : "scale-95 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* ── Content Area ── */}
        <div className="space-y-6">
          {activeTab === "ANALYTICS" ? (
            <WorkoutLogHistory />
          ) : activeTab === "FRIENDS" ? (
            <FriendsPanel />
          ) : (
            renderLeaderboard()
          )}
        </div>
      </main>
    </div>
  );
}
