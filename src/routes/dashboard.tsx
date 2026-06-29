import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  Flame,
  Target,
  Utensils,
  Dumbbell,
  Trash2,
  UtensilsCrossed,
  Scale,
  Activity,
  Plus,
  TrendingDown,
  TrendingUp,
  Minus as TrendFlat,
  Camera,
  Loader2,
  ChevronRight,
  ChevronLeft,
  X,
  Droplets,
} from "lucide-react";
import { toast } from "sonner";
import {
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FoodSearch, FoodSearchRef } from "@/components/FoodSearch";
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
  activity_level: string | null;
}

interface FoodLog {
  id: string;
  date: string;
  meal_type: string;
  food_name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

interface WeightEntry {
  id: string;
  date: string;
  weight_kg: number;
  photo_url: string | null;
}

interface WorkoutDay {
  day: string;
  name: string;
  focus: string;
  exercises: any[];
}

interface WorkoutPlan {
  goal: string;
  days_per_week: number;
  days: WorkoutDay[];
}

const today = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const date = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${date}`;
};

const thirtyDaysAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const date = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${date}`;
};

const shiftDate = (iso: string, days: number) => {
  const [y, m, date] = iso.split("-").map(Number);
  const d = new Date(y, m - 1, date + days);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
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
    if (d === expected) {
      streak++;
      check.setDate(check.getDate() - 1);
    } else break;
  }
  return streak;
}

function Dashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<FoodSearchRef>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [todayLogs, setTodayLogs] = useState<FoodLog[]>([]);
  const [monthLogs, setMonthLogs] = useState<FoodLog[]>([]);
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([]);
  const [workoutPlan, setWorkoutPlan] = useState<WorkoutPlan | null>(null);

  const [chartMetric, setChartMetric] = useState<
    "calories" | "protein_g" | "carbs_g" | "fat_g"
  >("calories");
  const [selectedDate, setSelectedDate] = useState<string>(today());
  const [streak, setStreak] = useState(0);

  // Weight logging state
  const [newWeight, setNewWeight] = useState("");
  const [savingWeight, setSavingWeight] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: p }, { data: t }, { data: m }, { data: w }, { data: wp }] =
      await Promise.all([
        supabase
          .from("user_profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("food_logs")
          .select("*")
          .eq("user_id", user.id)
          .eq("date", selectedDate)
          .order("logged_at"),
        supabase
          .from("food_logs")
          .select("*")
          .eq("user_id", user.id)
          .gte("date", thirtyDaysAgo())
          .lte("date", today()),
        supabase
          .from("weight_entries")
          .select("*")
          .eq("user_id", user.id)
          .order("date", { ascending: true }),
        supabase
          .from("workout_plans")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    setProfile(p as Profile);
    setTodayLogs((t as FoodLog[]) ?? []);
    setMonthLogs((m as FoodLog[]) ?? []);
    setWeightEntries((w as WeightEntry[]) ?? []);
    if (wp?.plan_json) setWorkoutPlan(wp.plan_json as unknown as WorkoutPlan);

    const s = await computeStreak(user.id);
    setStreak(s);
  }, [user, selectedDate]);

  useEffect(() => {
    load();
  }, [load]);

  const saveWeight = async () => {
    if (!user || !newWeight) return;
    setSavingWeight(true);
    try {
      let photo_url = null;
      if (photoFile) {
        const ext = photoFile.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("weight-photos")
          .upload(path, photoFile, { upsert: true });
        if (!upErr) {
          const { data: urlData } = supabase.storage
            .from("weight-photos")
            .getPublicUrl(path);
          photo_url = urlData.publicUrl;
        }
      }

      const { error } = await supabase
        .from("weight_entries")
        .upsert(
          { user_id: user.id, date: today(), weight_kg: +newWeight, photo_url },
          { onConflict: "user_id,date" },
        );
      if (error) throw error;

      await supabase
        .from("user_profiles")
        .update({ weight_kg: +newWeight })
        .eq("id", user.id);

      toast.success("Weight logged!");
      setNewWeight("");
      setPhotoFile(null);
      setPhotoPreview(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingWeight(false);
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const totals = useMemo(
    () =>
      todayLogs.reduce(
        (a, l) => ({
          calories: a.calories + l.calories,
          protein: a.protein + l.protein_g,
          carbs: a.carbs + l.carbs_g,
          fat: a.fat + l.fat_g,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    [todayLogs],
  );

  const target = profile?.daily_calorie_target ?? 0;
  const remaining = target - totals.calories;
  const pct = target
    ? Math.min(100, Math.round((totals.calories / target) * 100))
    : 0;

  const deleteLog = async (id: string) => {
    const { error } = await supabase.from("food_logs").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Removed");
    load();
  };

  if (!user || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  const firstName = profile.full_name?.split(" ")[0] || "there";
  const meals = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;

  // Chart Data
  const donutData = [
    {
      name: "Consumed",
      value: Math.min(totals.calories, target || totals.calories),
    },
    { name: "Remaining", value: Math.max(0, target - totals.calories) },
  ];
  const donutColor = remaining < 0 ? "var(--destructive)" : "var(--energy)";

  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const monthMap: Record<string, number> = {};
  for (const l of monthLogs)
    monthMap[l.date] = (monthMap[l.date] ?? 0) + (l[chartMetric] as number);
  const monthTarget =
    chartMetric === "calories"
      ? target
      : chartMetric === "protein_g"
        ? (profile.protein_target_g ?? 0)
        : chartMetric === "carbs_g"
          ? (profile.carbs_target_g ?? 0)
          : (profile.fat_target_g ?? 0);
  const monthData = days.map((d) => ({
    date: d.slice(5),
    Consumed: Math.round(monthMap[d] ?? 0),
    Target: monthTarget,
  }));

  const weightTrendData = weightEntries.map((e) => ({
    date: e.date.slice(5),
    weight: e.weight_kg,
    target: profile.goal_weight_kg,
  }));
  const lastWeight = weightEntries[weightEntries.length - 1]?.weight_kg;
  const prevWeight = weightEntries[weightEntries.length - 2]?.weight_kg;
  const weightDiff = lastWeight && prevWeight ? lastWeight - prevWeight : null;

  return (
    <div className="min-h-screen bg-muted/10 pb-24">
      <Header name={firstName} />

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        {/* ── HERO: DAILY SUMMARY ── */}
        <Card className="border-accent/20 bg-card shadow-sm overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
            <Target className="h-32 w-32" />
          </div>
          <CardContent className="p-6 sm:p-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  Today's Overview
                </h2>
                <p className="text-sm text-muted-foreground">
                  Stay on track, {firstName}.
                </p>
              </div>
              <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-md relative z-10">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs font-bold min-w-[70px] text-center uppercase tracking-wider">
                  {selectedDate === today() ? "Today" : selectedDate.slice(5)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={selectedDate >= today()}
                  onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12 relative z-10">
              {/* Calories Ring */}
              <div className="relative h-48 w-48 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      innerRadius={70}
                      outerRadius={90}
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                    >
                      <Cell fill={donutColor} />
                      <Cell fill="var(--muted)" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <Flame
                    className={`h-6 w-6 mb-1 ${remaining < 0 ? "text-destructive" : "text-energy"}`}
                  />
                  <span className="text-4xl font-black tracking-tighter leading-none">
                    {Math.round(totals.calories)}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground mt-1">
                    / {target} kcal
                  </span>
                </div>
              </div>

              {/* Macros Breakdown */}
              <div className="flex-1 w-full space-y-5">
                <MacroProgress
                  label="Protein"
                  current={totals.protein}
                  target={profile.protein_target_g ?? 0}
                  color="bg-[var(--energy)]"
                />
                <MacroProgress
                  label="Carbs"
                  current={totals.carbs}
                  target={profile.carbs_target_g ?? 0}
                  color="bg-[var(--warn)]"
                />
                <MacroProgress
                  label="Fats"
                  current={totals.fat}
                  target={profile.fat_target_g ?? 0}
                  color="bg-[var(--fat)]"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── PRIMARY LOGGING (FOOD & WORKOUT) ── */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left/Top Column: Food & Water */}
          <div className="lg:col-span-7 space-y-6 flex flex-col">
            {/* Food Logging */}
            <Card className="border-accent/10 shadow-sm flex-1">
              <CardHeader className="pb-3 border-b bg-muted/5">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Utensils className="h-5 w-5 text-accent" /> Log Food
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                <FoodSearch
                  ref={searchRef}
                  userId={user.id}
                  date={selectedDate}
                  onLogged={load}
                />

                {todayLogs.length > 0 ? (
                  <div className="mt-8 space-y-5">
                    {meals.map((m) => {
                      const items = todayLogs.filter((l) => l.meal_type === m);
                      if (!items.length) return null;
                      const sub = items.reduce(
                        (a, x) => ({
                          cal: a.cal + x.calories,
                          p: a.p + x.protein_g,
                        }),
                        { cal: 0, p: 0 },
                      );

                      return (
                        <div key={m} className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                              {m}
                            </h3>
                            <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                              {Math.round(sub.cal)} kcal
                            </span>
                          </div>
                          <div className="divide-y rounded-xl border bg-card overflow-hidden">
                            {items.map((l) => (
                              <div
                                key={l.id}
                                className="flex items-center justify-between p-3.5 hover:bg-muted/30 transition-colors"
                              >
                                <div>
                                  <div className="text-sm font-semibold">
                                    {l.food_name}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground mt-0.5">
                                    {l.quantity_g}g · {Math.round(l.calories)}{" "}
                                    kcal · {Math.round(l.protein_g)}g protein
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs text-muted-foreground hover:text-accent hover:bg-accent/10 font-medium px-2"
                                    onClick={() => searchRef.current?.editLog(l)}
                                  >
                                    Modify
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => deleteLog(l.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-8 py-12 flex flex-col items-center justify-center text-center border-2 border-dashed rounded-xl bg-muted/10">
                    <UtensilsCrossed className="h-8 w-8 text-muted-foreground/50 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">
                      No meals logged yet.
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Search or scan above to get started.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Water Tracker */}
            <WaterStreak userId={user.id} streak={streak} />
          </div>

          {/* Right/Bottom Column: Workout & Weight */}
          <div className="lg:col-span-5 space-y-6 flex flex-col">
            {/* Workout Plan */}
            <Card className="border-accent/10 shadow-sm overflow-hidden">
              <div className="bg-accent/5 p-5 border-b border-accent/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="bg-accent/20 p-2 rounded-lg">
                    <Dumbbell className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground leading-none">
                      Today's Workout
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 tracking-wide uppercase">
                      {workoutPlan?.goal || "No Plan"}
                    </p>
                  </div>
                </div>
                <Link to="/workout">
                  <Button
                    size="sm"
                    className="h-8 rounded-full text-xs font-bold px-4 bg-accent text-accent-foreground shadow-sm"
                  >
                    Open
                  </Button>
                </Link>
              </div>
              <CardContent className="p-5">
                {workoutPlan ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-end">
                      <div>
                        <div className="text-lg font-black">
                          {workoutPlan.days[0]?.name}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {workoutPlan.days[0]?.focus}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-black text-accent">
                          {workoutPlan.days[0]?.exercises.length}
                        </div>
                        <div className="text-[10px] uppercase font-bold text-muted-foreground">
                          Exercises
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1.5 pt-2">
                      {workoutPlan.days.slice(0, 5).map((d, i) => (
                        <div
                          key={i}
                          className={`flex-1 h-2 rounded-full ${i === 0 ? "bg-accent" : "bg-muted"}`}
                          title={d.name}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-sm text-muted-foreground mb-4">
                      You haven't generated a workout plan yet.
                    </p>
                    <Link to="/workout">
                      <Button variant="outline" className="w-full">
                        Generate AI Plan
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Weight Log */}
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-3 pt-5">
                <CardTitle className="text-base flex items-center gap-2">
                  <Scale className="h-5 w-5 text-muted-foreground" /> Weight
                  Tracker
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-5 p-4 rounded-xl bg-muted/20 border">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground">
                      Current
                    </p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-black">
                        {lastWeight || profile.weight_kg || "--"}
                      </span>
                      <span className="text-sm text-muted-foreground font-medium">
                        kg
                      </span>
                    </div>
                  </div>
                  {weightDiff !== null && (
                    <div
                      className={`text-right ${weightDiff > 0 ? "text-destructive" : weightDiff < 0 ? "text-energy" : "text-muted-foreground"}`}
                    >
                      <p className="text-[10px] uppercase font-bold">Trend</p>
                      <div className="flex items-center justify-end gap-0.5 font-bold">
                        {weightDiff > 0 ? (
                          <TrendingUp className="h-4 w-4" />
                        ) : weightDiff < 0 ? (
                          <TrendingDown className="h-4 w-4" />
                        ) : (
                          <TrendFlat className="h-4 w-4" />
                        )}
                        {Math.abs(weightDiff).toFixed(1)}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type="number"
                      placeholder="Enter today's weight"
                      value={newWeight}
                      onChange={(e) => setNewWeight(e.target.value)}
                      className="pr-8 bg-background"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                      kg
                    </span>
                  </div>
                  <Button
                    size="icon"
                    variant="outline"
                    className={`shrink-0 ${photoFile ? "border-energy text-energy bg-energy/5" : ""}`}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Camera className="h-4 w-4" />
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                  <Button
                    onClick={saveWeight}
                    disabled={savingWeight || !newWeight}
                    className="shrink-0 bg-foreground text-background hover:bg-foreground/90"
                  >
                    {savingWeight ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
                {photoPreview && (
                  <div className="mt-3 relative h-24 w-24 rounded-xl overflow-hidden border-2 border-border shadow-sm">
                    <img
                      src={photoPreview}
                      alt="weight preview"
                      className="h-full w-full object-cover"
                    />
                    <button
                      onClick={() => {
                        setPhotoFile(null);
                        setPhotoPreview(null);
                      }}
                      className="absolute top-1 right-1 bg-black/60 backdrop-blur-sm rounded-full p-1 hover:bg-black"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* AI Weekly Report */}
            <WeeklyReport userId={user.id} profile={profile} />
          </div>
        </div>

        {/* ── REPORTS & TRENDS (BOTTOM) ── */}
        <section className="space-y-6 pt-8 mt-8 border-t border-border/50">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-xl font-bold tracking-tight">
              Trends & History
            </h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Nutrition Trends */}
            <Card className="shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <CardTitle className="text-base">
                    Nutrition (30 Days)
                  </CardTitle>
                  <Tabs
                    value={chartMetric}
                    onValueChange={(v) => setChartMetric(v as any)}
                  >
                    <TabsList className="h-8">
                      <TabsTrigger
                        value="calories"
                        className="text-[10px] px-3"
                      >
                        Cals
                      </TabsTrigger>
                      <TabsTrigger
                        value="protein_g"
                        className="text-[10px] px-3"
                      >
                        Prot
                      </TabsTrigger>
                      <TabsTrigger value="carbs_g" className="text-[10px] px-3">
                        Carb
                      </TabsTrigger>
                      <TabsTrigger value="fat_g" className="text-[10px] px-3">
                        Fat
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={monthData}
                      margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="var(--border)"
                      />
                      <XAxis
                        dataKey="date"
                        fontSize={9}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "var(--muted-foreground)" }}
                      />
                      <YAxis
                        fontSize={9}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "var(--muted-foreground)" }}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "8px",
                          border: "none",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="Consumed"
                        stroke="var(--energy)"
                        strokeWidth={3}
                        dot={false}
                        activeDot={{
                          r: 6,
                          fill: "var(--energy)",
                          strokeWidth: 0,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="Target"
                        stroke="var(--muted-foreground)"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Weight Trends */}
            <Card className="shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Weight Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={weightTrendData}
                      margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="var(--border)"
                      />
                      <XAxis
                        dataKey="date"
                        fontSize={9}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "var(--muted-foreground)" }}
                      />
                      <YAxis
                        domain={["dataMin - 2", "dataMax + 2"]}
                        fontSize={9}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "var(--muted-foreground)" }}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "8px",
                          border: "none",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="weight"
                        stroke="var(--accent)"
                        strokeWidth={3}
                        connectNulls
                        activeDot={{
                          r: 6,
                          fill: "var(--accent)",
                          strokeWidth: 0,
                        }}
                      />
                      {profile.goal_weight_kg && (
                        <ReferenceLine
                          y={profile.goal_weight_kg}
                          stroke="var(--energy)"
                          strokeDasharray="3 3"
                          label={{
                            position: "insideTopLeft",
                            value: "Goal",
                            fill: "var(--energy)",
                            fontSize: 10,
                            fontWeight: "bold",
                          }}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}

// Custom Macro Progress Bar Component
function MacroProgress({
  label,
  current,
  target,
  color,
}: {
  label: string;
  current: number;
  target: number;
  color: string;
}) {
  const pct = target ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return (
    <div className="space-y-1.5 w-full">
      <div className="flex justify-between items-end">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="text-sm font-medium">
          {Math.round(current)}{" "}
          <span className="text-[10px] text-muted-foreground">
            / {Math.round(target)}g
          </span>
        </span>
      </div>
      <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
