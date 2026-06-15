import { useCallback, useEffect, useState } from "react";
import { groqChat } from "@/lib/groq";
import { Sparkles, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/client";

interface Props {
  userId: string;
  profile: {
    full_name: string | null;
    daily_calorie_target: number | null;
    goal: string | null;
    weight_kg: number | null;
  };
}

interface WeekStats {
  avgCalories: number;
  targetCalories: number;
  daysLogged: number;
  bestDay: string;
  worstDay: string;
  workoutDays: number;
  weightChange: number | null;
}

async function buildWeekStats(
  userId: string,
  calorieTarget: number,
): Promise<WeekStats> {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 6);
  const from = weekAgo.toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);

  const [{ data: foodLogs }, { data: workoutLogs }, { data: weightEntries }] =
    await Promise.all([
      supabase
        .from("food_logs")
        .select("date,calories")
        .eq("user_id", userId)
        .gte("date", from)
        .lte("date", to),
      supabase
        .from("workout_logs")
        .select("date")
        .eq("user_id", userId)
        .gte("date", from)
        .lte("date", to),
      supabase
        .from("weight_entries")
        .select("date,weight_kg")
        .eq("user_id", userId)
        .gte("date", from)
        .lte("date", to)
        .order("date"),
    ]);

  // Aggregate calories by day
  const dayMap: Record<string, number> = {};
  for (const log of foodLogs ?? []) {
    dayMap[log.date] = (dayMap[log.date] ?? 0) + log.calories;
  }

  const days = Object.entries(dayMap);
  const daysLogged = days.length;
  const avgCalories =
    daysLogged > 0
      ? Math.round(days.reduce((s, [, c]) => s + c, 0) / daysLogged)
      : 0;

  const sorted = [...days].sort((a, b) => b[1] - a[1]);
  const bestDay = sorted[sorted.length - 1]?.[0] ?? "—";
  const worstDay = sorted[0]?.[0] ?? "—";

  const workoutDays = new Set((workoutLogs ?? []).map((w) => w.date)).size;

  let weightChange: number | null = null;
  if ((weightEntries ?? []).length >= 2) {
    const first = weightEntries![0].weight_kg;
    const last = weightEntries![weightEntries!.length - 1].weight_kg;
    weightChange = +(last - first).toFixed(1);
  }

  return {
    avgCalories,
    targetCalories: calorieTarget,
    daysLogged,
    bestDay,
    worstDay,
    workoutDays,
    weightChange,
  };
}

async function getWeeklyReport(
  profile: Props["profile"],
  stats: WeekStats,
): Promise<string> {
  const prompt = `You are a friendly, data-driven fitness coach writing a weekly summary.
User: ${profile.full_name?.split(" ")[0] ?? "there"}, goal: ${profile.goal}, current weight: ${profile.weight_kg}kg.
This week's data:
- Days food logged: ${stats.daysLogged}/7
- Avg daily calories: ${stats.avgCalories} kcal (target: ${stats.targetCalories} kcal)
- Best adherence day: ${stats.bestDay}
- Least adherence day: ${stats.worstDay}
- Workouts completed: ${stats.workoutDays}
- Weight change this week: ${stats.weightChange !== null ? `${stats.weightChange > 0 ? "+" : ""}${stats.weightChange} kg` : "not tracked"}

Write a 3-4 sentence weekly summary. Be specific, warm, and actionable. Give one concrete tip for next week based on the data. No hashtags.`;

  return await groqChat({
    model: "llama-3.3-70b-versatile",
    max_tokens: 200,
    temperature: 0.7,
    messages: [{ role: "user", content: prompt }],
  });
}

export function WeeklyReport({ userId, profile }: Props) {
  const [report, setReport] = useState<string | null>(null);
  const [stats, setStats] = useState<WeekStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isSunday = new Date().getDay() === 0;

  const generate = useCallback(async () => {
    setLoading(true);
    const s = await buildWeekStats(
      userId,
      profile.daily_calorie_target ?? 2000,
    );
    setStats(s);
    const r = await getWeeklyReport(profile, s);
    setReport(r);
    setExpanded(true);
    setLoading(false);
  }, [userId, profile]);

  // Auto-load on Sundays
  useEffect(() => {
    if (isSunday) generate();
  }, [isSunday, generate]);

  return (
    <Card className="border-[var(--navy)]/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-[var(--warn)]" />
            Weekly AI Report
            {isSunday && (
              <span className="rounded-full bg-[var(--warn)]/20 px-2 py-0.5 text-xs font-medium text-[var(--warn)]">
                Today
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={generate}
              disabled={loading}
              className="gap-1 text-xs"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Generate"
              )}
            </Button>
            {report && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setExpanded((p) => !p)}
              >
                {expanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {expanded && report && (
        <CardContent className="space-y-4 pt-0">
          {stats && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Days logged", value: `${stats.daysLogged}/7` },
                { label: "Avg calories", value: `${stats.avgCalories} kcal` },
                { label: "Workouts", value: `${stats.workoutDays} sessions` },
                {
                  label: "Weight Δ",
                  value:
                    stats.weightChange !== null
                      ? `${stats.weightChange > 0 ? "+" : ""}${stats.weightChange} kg`
                      : "—",
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg border border-border bg-muted/30 p-3"
                >
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="font-semibold text-sm">{s.value}</p>
                </div>
              ))}
            </div>
          )}
          <p className="text-sm leading-relaxed text-muted-foreground">
            {report}
          </p>
        </CardContent>
      )}
    </Card>
  );
}
