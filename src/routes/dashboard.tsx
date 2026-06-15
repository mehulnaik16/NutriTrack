import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Flame, Target, Utensils, Dumbbell, Trash2, UtensilsCrossed, Scale } from "lucide-react";
import { toast } from "sonner";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FoodSearch } from "@/components/FoodSearch";
import { WaterStreak } from "@/components/WaterStreak";
import { WeeklyReport } from "@/components/WeeklyReport";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

interface Profile {
  full_name: string | null;
  daily_calorie_target: number | null;
  protein_target_g: number | null;
  carbs_target_g: number | null;
  fat_target_g: number | null;
  goal: string | null;
  weight_kg: number | null;
  goal_weight_kg: number | null;
}

interface FoodLog {
  id: string; date: string; meal_type: string; food_name: string;
  quantity_g: number; calories: number; protein_g: number; carbs_g: number; fat_g: number;
}

const today = () => new Date().toISOString().slice(0, 10);
const thirtyDaysAgo = () => {
  const d = new Date(); d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
};
const shiftDate = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

async function computeStreak(userId: string): Promise<number> {
  const { data } = await supabase
    .from("food_logs")
    .select("date")
    .eq("user_id", userId)
    .order("date", { ascending: false });
  if (!data || data.length === 0) return 0;
  const uniqueDates = [...new Set(data.map((d) => d.date))].sort().reverse();
  let streak = 0;
  const check = new Date();
  for (const d of uniqueDates) {
    const expected = check.toISOString().slice(0, 10);
    if (d === expected) { streak++; check.setDate(check.getDate() - 1); }
    else break;
  }
  return streak;
}

function Dashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [todayLogs, setTodayLogs] = useState<FoodLog[]>([]);
  const [monthLogs, setMonthLogs] = useState<FoodLog[]>([]);
  const [chartMetric, setChartMetric] = useState<"calories" | "protein_g" | "carbs_g" | "fat_g">("calories");
  const [selectedDate, setSelectedDate] = useState<string>(today());
  const [streak, setStreak] = useState(0);

  useEffect(() => { if (!loading && !user) navigate({ to: "/login" }); }, [loading, user, navigate]);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: p }, { data: t }, { data: m }] = await Promise.all([
      supabase.from("user_profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("food_logs").select("*").eq("user_id", user.id).eq("date", selectedDate).order("logged_at"),
      supabase.from("food_logs").select("*").eq("user_id", user.id).gte("date", thirtyDaysAgo()).lte("date", today()),
    ]);
    setProfile(p as Profile);
    setTodayLogs((t as FoodLog[]) ?? []);
    setMonthLogs((m as FoodLog[]) ?? []);
    const s = await computeStreak(user.id);
    setStreak(s);
  }, [user, selectedDate]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => todayLogs.reduce(
    (a, l) => ({
      calories: a.calories + l.calories,
      protein: a.protein + l.protein_g,
      carbs: a.carbs + l.carbs_g,
      fat: a.fat + l.fat_g,
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 },
  ), [todayLogs]);

  const target = profile?.daily_calorie_target ?? 0;
  const remaining = target - totals.calories;
  const pct = target ? Math.min(100, Math.round((totals.calories / target) * 100)) : 0;

  const deleteLog = async (id: string) => {
    const { error } = await supabase.from("food_logs").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed");
    load();
  };

  if (!user || !profile) {
    return <div className="flex min-h-screen items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" /></div>;
  }

  const firstName = profile.full_name?.split(" ")[0];
  const meals = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;

  const donutData = [
    { name: "Consumed", value: Math.min(totals.calories, target || totals.calories) },
    { name: "Remaining", value: Math.max(0, target - totals.calories) },
  ];
  const donutColor = remaining < 0 ? "var(--destructive)" : "var(--energy)";

  const macroBarData = [
    { name: "Protein", Consumed: Math.round(totals.protein), Target: profile.protein_target_g ?? 0 },
    { name: "Carbs", Consumed: Math.round(totals.carbs), Target: profile.carbs_target_g ?? 0 },
    { name: "Fats", Consumed: Math.round(totals.fat), Target: profile.fat_target_g ?? 0 },
  ];

  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const monthMap: Record<string, number> = {};
  for (const l of monthLogs) {
    monthMap[l.date] = (monthMap[l.date] ?? 0) + (l[chartMetric] as number);
  }
  const monthTarget = chartMetric === "calories" ? target
    : chartMetric === "protein_g" ? profile.protein_target_g ?? 0
    : chartMetric === "carbs_g" ? profile.carbs_target_g ?? 0
    : profile.fat_target_g ?? 0;
  const monthData = days.map((d) => ({
    date: d.slice(5),
    Consumed: Math.round(monthMap[d] ?? 0),
    Target: monthTarget,
  }));

  return (
    <div className="min-h-screen bg-background">
      <Header name={firstName} />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">

        {/* Summary cards */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard icon={<Target className="h-5 w-5" />} label="Daily target" value={`${target} kcal`} accent />
          <MetricCard icon={<Utensils className="h-5 w-5" />} label="Consumed today" value={`${Math.round(totals.calories)} kcal`} />
          <MetricCard icon={<Flame className="h-5 w-5" />} label="Remaining" value={`${Math.round(remaining)} kcal`} danger={remaining < 0} />
          <Link to="/workout" className="block">
            <Card className="hover:border-accent/40 transition-colors cursor-pointer h-full">
              <CardContent className="p-5">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  <Dumbbell className="h-5 w-5" />
                  <span className="text-xs uppercase tracking-wide">Workout</span>
                </div>
                <div className="text-2xl font-bold">View Plan</div>
              </CardContent>
            </Card>
          </Link>
        </section>

        {/* Quick links row */}
        <div className="flex gap-3">
          <Link to="/weight" className="flex-1">
            <Card className="hover:border-accent/40 transition-colors cursor-pointer">
              <CardContent className="flex items-center gap-3 p-4">
                <Scale className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Weight Tracker</p>
                  <p className="text-xs text-muted-foreground">Log & track progress</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link to="/workout" className="flex-1">
            <Card className="hover:border-accent/40 transition-colors cursor-pointer">
              <CardContent className="flex items-center gap-3 p-4">
                <Dumbbell className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Today's Workout</p>
                  <p className="text-xs text-muted-foreground">Check your plan</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Water + Streak */}
        <WaterStreak userId={user.id} streak={streak} />

        {/* Weekly AI Report */}
        <WeeklyReport userId={user.id} profile={profile} />

        {/* Macro progress */}
        <Card>
          <CardHeader><CardTitle>Macros today</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <MacroBar label="Protein" current={totals.protein} target={profile.protein_target_g ?? 0} color="bg-[var(--energy)]" />
            <MacroBar label="Carbohydrates" current={totals.carbs} target={profile.carbs_target_g ?? 0} color="bg-[var(--warn)]" />
            <MacroBar label="Fats" current={totals.fat} target={profile.fat_target_g ?? 0} color="bg-[var(--fat)]" />
          </CardContent>
        </Card>

        {/* Food logging */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Log food</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}>‹</Button>
                <input
                  type="date"
                  value={selectedDate}
                  max={today()}
                  onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                />
                <Button variant="outline" size="sm" disabled={selectedDate >= today()} onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}>›</Button>
                {selectedDate !== today() && (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedDate(today())}>Today</Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <FoodSearch userId={user.id} date={selectedDate} onLogged={load} />
          </CardContent>
        </Card>

        {/* Today's meal log */}
        <Card>
          <CardHeader><CardTitle>{selectedDate === today() ? "Today's meals" : `Meals on ${selectedDate}`}</CardTitle></CardHeader>
          <CardContent>
            {todayLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <UtensilsCrossed className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No food logged for {selectedDate === today() ? "today" : selectedDate}.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {meals.map((m) => {
                  const items = todayLogs.filter((l) => l.meal_type === m);
                  if (!items.length) return null;
                  const sub = items.reduce((a, x) => ({
                    cal: a.cal + x.calories, p: a.p + x.protein_g, c: a.c + x.carbs_g, f: a.f + x.fat_g,
                  }), { cal: 0, p: 0, c: 0, f: 0 });
                  return (
                    <div key={m}>
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-sm font-semibold">{m}</h3>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(sub.cal)} kcal · P{Math.round(sub.p)} C{Math.round(sub.c)} F{Math.round(sub.f)}
                        </span>
                      </div>
                      <div className="overflow-hidden rounded-lg border border-border">
                        {items.map((l) => (
                          <div key={l.id} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0">
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">{l.food_name}</div>
                              <div className="text-xs text-muted-foreground">{l.quantity_g}g · {Math.round(l.calories)} kcal · P{l.protein_g.toFixed(1)} C{l.carbs_g.toFixed(1)} F{l.fat_g.toFixed(1)}</div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => deleteLog(l.id)} aria-label="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Calories progress</CardTitle></CardHeader>
            <CardContent>
              <div className="relative h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} dataKey="value" innerRadius={70} outerRadius={100} startAngle={90} endAngle={-270} stroke="none">
                      <Cell fill={donutColor} />
                      <Cell fill="var(--muted)" />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold">{pct}%</span>
                  <span className="text-xs text-muted-foreground">{Math.round(totals.calories)} / {target} kcal</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Macros vs target</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={macroBarData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Consumed" fill="var(--energy)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Target" fill="var(--navy)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Monthly chart */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Last 30 days</CardTitle>
              <Tabs value={chartMetric} onValueChange={(v) => setChartMetric(v as any)}>
                <TabsList>
                  <TabsTrigger value="calories">Calories</TabsTrigger>
                  <TabsTrigger value="protein_g">Protein</TabsTrigger>
                  <TabsTrigger value="carbs_g">Carbs</TabsTrigger>
                  <TabsTrigger value="fat_g">Fats</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="Consumed" stroke="var(--energy)" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="Target" stroke="var(--navy)" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function MetricCard({ icon, label, value, accent, danger }: { icon: React.ReactNode; label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <Card className={accent ? "border-accent/40 bg-accent/5" : ""}>
      <CardContent className="p-5">
        <div className="mb-2 flex items-center gap-2 text-muted-foreground">
          <span className={accent ? "text-accent" : ""}>{icon}</span>
          <span className="text-xs uppercase tracking-wide">{label}</span>
        </div>
        <div className={`text-2xl font-bold ${danger ? "text-destructive" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function MacroBar({ label, current, target, color }: { label: string; current: number; target: number; color: string }) {
  const pct = target ? Math.min(100, (current / target) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{Math.round(current)} / {Math.round(target)} g</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
