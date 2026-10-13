import { useCallback, useEffect, useState } from "react";
import { serverWeeklyReport } from "@/lib/ai";
import { toastAiError } from "@/lib/aiErrors";
import { Sparkles, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getHistory } from "@/lib/historyCache";
import { toLocalISO } from "@/lib/dates";

interface Props {
  userId: string;
  profile: {
    full_name: string | null;
    daily_calorie_target: number | null;
    protein_target_g: number | null;
    goal: string | null;
    weight_kg: number | null;
  };
}

interface WeekStats {
  avgCalories: number;
  avgProtein: number;
  targetCalories: number;
  daysLogged: number;
  missedDays: string[];
  closest: { day: string; kcal: number } | null;
  furthest: { day: string; kcal: number } | null;
  workoutDays: number;
  weightChange: number | null;
}

const weekday = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long" });
};

async function buildWeekStats(
  userId: string,
  calorieTarget: number,
): Promise<WeekStats> {
  const today = new Date();
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(toLocalISO(d));
  }
  const from = days[0];
  const to = days[6];

  const inWeek = <R extends { date: string | null }>(rows: R[]) =>
    rows.filter((r) => r.date && r.date >= from && r.date <= to);
  const [foodLogs, workoutLogs, weightEntries] = await Promise.all([
    getHistory(userId, "food_logs")
      .then(inWeek)
      .catch(() => []),
    getHistory(userId, "workout_logs")
      .then(inWeek)
      .catch(() => []),
    // Oldest first, as getHistory returns.
    getHistory(userId, "weight_entries")
      .then(inWeek)
      .catch(() => []),
  ]);

  // Calories and protein by day. Null values add nothing rather than NaN.
  const dayMap: Record<string, { kcal: number; protein: number }> = {};
  for (const log of foodLogs ?? []) {
    if (!log.date) continue;
    const t = (dayMap[log.date] ??= { kcal: 0, protein: 0 });
    t.kcal += log.calories ?? 0;
    t.protein += log.protein_g ?? 0;
  }

  const logged = Object.entries(dayMap);
  const daysLogged = logged.length;
  const avg = (pick: (t: { kcal: number; protein: number }) => number) =>
    daysLogged > 0
      ? Math.round(logged.reduce((s, [, t]) => s + pick(t), 0) / daysLogged)
      : 0;

  // Closest / furthest from the calorie target, not simply lowest / highest.
  const byGap = [...logged].sort(
    (a, b) =>
      Math.abs(a[1].kcal - calorieTarget) - Math.abs(b[1].kcal - calorieTarget),
  );
  const pick = (e: (typeof logged)[number] | undefined) =>
    e ? { day: weekday(e[0]), kcal: Math.round(e[1].kcal) } : null;

  let weightChange: number | null = null;
  if ((weightEntries ?? []).length >= 2) {
    const first = weightEntries![0].weight_kg;
    const last = weightEntries![weightEntries!.length - 1].weight_kg;
    weightChange = +(last - first).toFixed(1);
  }

  return {
    avgCalories: avg((t) => t.kcal),
    avgProtein: avg((t) => t.protein),
    targetCalories: calorieTarget,
    daysLogged,
    missedDays: days.filter((d) => !dayMap[d]).map(weekday),
    closest: pick(byGap[0]),
    furthest: byGap.length > 1 ? pick(byGap[byGap.length - 1]) : null,
    workoutDays: new Set((workoutLogs ?? []).map((w) => w.date)).size,
    weightChange,
  };
}

async function getWeeklyReport(
  profile: Props["profile"],
  stats: WeekStats,
): Promise<string> {
  const g = profile.goal ?? "";
  const goal = g.startsWith("lose")
    ? "lose"
    : g.startsWith("gain")
      ? "gain"
      : "maintain";
  const { result } = await serverWeeklyReport({
    data: {
      name: profile.full_name?.split(" ")[0] || "there",
      goal,
      weightKg: profile.weight_kg,
      kcalTarget: stats.targetCalories,
      proteinTarget: profile.protein_target_g || null,
      daysLogged: stats.daysLogged,
      missedDays: stats.missedDays,
      avgKcal: stats.avgCalories,
      avgProtein: stats.avgProtein,
      closestDay: stats.closest?.day ?? null,
      closestKcal: stats.closest?.kcal ?? null,
      furthestDay: stats.furthest?.day ?? null,
      furthestKcal: stats.furthest?.kcal ?? null,
      workouts: Math.min(stats.workoutDays, 7),
      weightChange: stats.weightChange,
    },
  });
  return result;
}

export function WeeklyReport({ userId, profile }: Props) {
  const [report, setReport] = useState<string | null>(null);
  const [stats, setStats] = useState<WeekStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isSunday = new Date().getDay() === 0;

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const s = await buildWeekStats(
        userId,
        profile.daily_calorie_target || 2000,
      );
      setStats(s);
      setReport(await getWeeklyReport(profile, s));
      setExpanded(true);
    } catch (e) {
      toastAiError(e, "weekly report");
    } finally {
      setLoading(false);
    }
  }, [userId, profile]);

  // Auto-load on Sundays
  useEffect(() => {
    if (isSunday) generate();
  }, [isSunday, generate]);

  return (
    <Card className="border-[var(--navy)]/20">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex min-w-0 items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 shrink-0 text-[var(--warn)]" />
            <span className="truncate">Weekly AI Report</span>
            {isSunday && (
              <span className="shrink-0 rounded-full bg-[var(--warn)]/20 px-2 py-0.5 text-xs font-medium text-[var(--warn)]">
                Today
              </span>
            )}
          </CardTitle>
          <div className="flex shrink-0 items-center gap-2">
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
          <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
            {report}
          </p>
          <p className="text-center text-[11px] text-muted-foreground">
            AI can make mistakes. Check important details yourself.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
