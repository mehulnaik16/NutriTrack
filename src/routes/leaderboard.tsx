import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/client";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, Flame, Medal, Dumbbell, Droplets, Activity, Utensils, Star } from "lucide-react";

export const Route = createFileRoute("/leaderboard")({
  component: Leaderboard,
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

function Leaderboard() {
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
        (supabase.rpc as any)("get_leaderboard_stats", { start_date: startDateStr })
      ]).then(([profilesRes, statsRes]: [any, any]) => {
        if (!isMounted) return;
        const profiles = (profilesRes.data || []) as any[];
        const stats = (statsRes.data || []) as any[];
        
        const merged: LeaderboardUser[] = profiles.map((p: any) => {
          const s = stats.find((x: any) => x.user_id === p.id) || ({} as any);
          return {
            id: p.id,
            full_name: p.full_name,
            current_streak: p.current_streak || 0,
            workouts_count: s.workouts_count || 0,
            avg_calories: s.avg_calories || 0,
            total_water: s.total_water || 0,
            total_exercise_min: s.total_exercise_min || 0,
            overall_score: s.overall_score || 0,
          };
        });

        merged.sort((a, b) => {
          if (category === "streak") return b.current_streak - a.current_streak;
          if (category === "workouts") return b.workouts_count - a.workouts_count;
          if (category === "calories") return b.avg_calories - a.avg_calories;
          if (category === "water") return b.total_water - a.total_water;
          if (category === "exercise") return b.total_exercise_min - a.total_exercise_min;
          return b.overall_score - a.overall_score; // overall
        });

        setUsers(merged.slice(0, 50));
        setLoading(false);
      });
    };

    fetchData();

    const channel = supabase.channel('leaderboard_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_logs' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'food_logs' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'water_logs' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles' }, fetchData)
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [timeFilter, category]);

  const getCategoryIcon = () => {
    if (category === "streak") return <Flame className="h-5 w-5 fill-current" />;
    if (category === "workouts") return <Dumbbell className="h-5 w-5" />;
    if (category === "calories") return <Utensils className="h-5 w-5" />;
    if (category === "water") return <Droplets className="h-5 w-5" />;
    if (category === "exercise") return <Activity className="h-5 w-5" />;
    return <Star className="h-5 w-5 fill-current" />;
  };

  const getCategoryValue = (u: LeaderboardUser) => {
    if (category === "streak") return u.current_streak;
    if (category === "workouts") return u.workouts_count;
    if (category === "calories") return Math.round(u.avg_calories) + " kcal";
    if (category === "water") return Math.round(u.total_water / 1000 * 10) / 10 + " L";
    if (category === "exercise") return u.total_exercise_min + " min";
    return Math.round(u.overall_score) + " pts";
  };

  return (
    <div className="min-h-screen bg-muted/10 pb-24">
      <Header name="Champion" />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Card className="shadow-sm border-accent/20">
          <CardHeader className="text-center pb-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--energy)]/10 text-[var(--energy)] mb-4">
              <Trophy className="h-8 w-8" />
            </div>
            <CardTitle className="text-3xl font-black tracking-tight">Leaderboard</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">See how you rank against the community!</p>
            
            <div className="grid grid-cols-2 gap-4 mt-6 text-left">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground ml-1">Time Period</label>
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
                <label className="text-xs font-bold uppercase text-muted-foreground ml-1">Category</label>
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
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="flex justify-center p-8">
                <Trophy className="h-8 w-8 animate-pulse text-[var(--energy)] opacity-50" />
              </div>
            ) : (
              <div className="space-y-4">
                {users.length === 0 && (
                  <div className="text-center p-8 text-muted-foreground">No data found for this period.</div>
                )}
                {users.map((u, i) => (
                  <div key={u.id} className="flex items-center justify-between p-4 rounded-xl border border-border bg-card shadow-sm hover:border-accent/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full font-bold text-white ${i === 0 ? 'bg-yellow-500 shadow-md shadow-yellow-500/20' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-amber-700' : 'bg-muted-foreground'}`}>
                        {i === 0 ? <Medal className="h-5 w-5" /> : i + 1}
                      </div>
                      <span className="font-semibold text-lg">{u.full_name || "Anonymous User"}</span>
                    </div>
                    <div className="flex items-center gap-2 bg-[var(--energy)]/10 px-3 py-1.5 rounded-full text-[var(--energy)]">
                      {getCategoryIcon()}
                      <span className="font-bold text-lg">{getCategoryValue(u)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
