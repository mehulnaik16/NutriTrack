import { useEffect, useState } from "react";
import { ArrowLeft, Award, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/client";
import { toLocalISO } from "@/lib/dates";

/* ═══════════════════════════════════════════════════
   Achievements — computed client-side from existing logs.
   No schema changes needed; badges are derived, not stored.
══════════════════════════════════════════════════════ */

interface Stats {
  foodCount: number;
  foodStreak: number;
  workoutCount: number;
  weightCount: number;
  photoCount: number;
  hydratedDays: number;
  savedMeals: number;
  earlyLogs: number;
}

interface BadgeDef {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  target: number;
  value: (s: Stats) => number;
}

const BADGES: BadgeDef[] = [
  // ── Nutrition ──
  { id: "first-bite", emoji: "🍽️", title: "First Bite", desc: "Log your first food", target: 1, value: (s) => s.foodCount },
  { id: "streak-3", emoji: "🌱", title: "Getting Warm", desc: "3-day logging streak", target: 3, value: (s) => s.foodStreak },
  { id: "streak-7", emoji: "🔥", title: "Week Warrior", desc: "7-day logging streak", target: 7, value: (s) => s.foodStreak },
  { id: "streak-14", emoji: "⚡", title: "Fortnight Force", desc: "14-day logging streak", target: 14, value: (s) => s.foodStreak },
  { id: "streak-30", emoji: "👑", title: "Iron Month", desc: "30-day logging streak", target: 30, value: (s) => s.foodStreak },
  { id: "food-100", emoji: "💯", title: "Century Club", desc: "Log 100 foods", target: 100, value: (s) => s.foodCount },
  { id: "food-500", emoji: "🤓", title: "Nutrition Nerd", desc: "Log 500 foods", target: 500, value: (s) => s.foodCount },
  { id: "early-bird", emoji: "🌅", title: "Early Bird", desc: "Log breakfast before 8 AM, 5 times", target: 5, value: (s) => s.earlyLogs },
  // ── Training ──
  { id: "first-rep", emoji: "🏋️", title: "First Rep", desc: "Log your first workout", target: 1, value: (s) => s.workoutCount },
  { id: "workouts-10", emoji: "💪", title: "Ten Strong", desc: "Complete 10 workouts", target: 10, value: (s) => s.workoutCount },
  { id: "workouts-50", emoji: "🦾", title: "Half Century", desc: "Complete 50 workouts", target: 50, value: (s) => s.workoutCount },
  { id: "workouts-100", emoji: "🐺", title: "Beast Mode", desc: "Complete 100 workouts", target: 100, value: (s) => s.workoutCount },
  // ── Progress ──
  { id: "on-scale", emoji: "⚖️", title: "On the Scale", desc: "Log your first weight", target: 1, value: (s) => s.weightCount },
  { id: "weigh-20", emoji: "📈", title: "Trend Setter", desc: "20 weight entries", target: 20, value: (s) => s.weightCount },
  { id: "first-photo", emoji: "📸", title: "Progress Pic", desc: "Add your first progress photo", target: 1, value: (s) => s.photoCount },
  { id: "photos-10", emoji: "🎞️", title: "Transformation Log", desc: "10 progress photos", target: 10, value: (s) => s.photoCount },
  // ── Hydration & meals ──
  { id: "hydra-7", emoji: "💧", title: "Hydration Hero", desc: "Hit 2L+ water on 7 days", target: 7, value: (s) => s.hydratedDays },
  { id: "hydra-30", emoji: "🌊", title: "Aquaholic", desc: "Hit 2L+ water on 30 days", target: 30, value: (s) => s.hydratedDays },
  { id: "chef-5", emoji: "👨‍🍳", title: "Chef's Special", desc: "Save 5 favorite meals", target: 5, value: (s) => s.savedMeals },
];

function computeFoodStreak(dates: string[]): number {
  const unique = new Set(dates);
  if (unique.size === 0) return 0;
  let s = 0;
  const check = new Date();
  if (!unique.has(toLocalISO(check))) check.setDate(check.getDate() - 1);
  while (unique.has(toLocalISO(check))) {
    s++;
    check.setDate(check.getDate() - 1);
  }
  return s;
}

export function AchievementsPage({
  userId,
  onBack,
}: {
  userId: string;
  onBack: () => void;
}) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const load = async () => {
      const [food, workouts, weights, water, meals] = await Promise.all([
        supabase
          .from("food_logs")
          .select("date, logged_at, meal_type")
          .eq("user_id", userId),
        supabase
          .from("workout_logs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        supabase
          .from("weight_entries")
          .select("photo_url")
          .eq("user_id", userId),
        supabase
          .from("water_logs")
          .select("amount_ml")
          .eq("user_id", userId)
          .gte("amount_ml", 2000),
        supabase
          .from("saved_meals" as any)
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
      ]);

      const foodRows = (food.data ?? []) as any[];
      const earlyLogs = foodRows.filter((r) => {
        if (!r.logged_at) return false;
        return new Date(r.logged_at).getHours() < 8;
      }).length;

      setStats({
        foodCount: foodRows.length,
        foodStreak: computeFoodStreak(foodRows.map((r) => r.date)),
        workoutCount: workouts.count ?? 0,
        weightCount: (weights.data ?? []).length,
        photoCount: (weights.data ?? []).filter((w: any) => w.photo_url).length,
        hydratedDays: (water.data ?? []).length,
        savedMeals: (meals as any).count ?? 0,
        earlyLogs,
      });
    };
    load();
  }, [userId]);

  const earned = stats
    ? BADGES.filter((b) => b.value(stats) >= b.target).length
    : 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-base font-semibold">Achievements</h2>
        </div>
        {stats && (
          <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent">
            {earned} / {BADGES.length} unlocked
          </span>
        )}
      </div>

      <main className="mx-auto max-w-lg px-4 py-6">
        {!stats ? (
          <div className="flex justify-center py-16">
            <Award className="h-8 w-8 animate-pulse text-accent opacity-60" />
          </div>
        ) : (
          <>
            {/* Progress summary */}
            <div className="mb-6 rounded-2xl border border-border bg-card p-5 text-center">
              <div className="font-display text-4xl font-bold text-accent">
                {Math.round((earned / BADGES.length) * 100)}%
              </div>
              <p className="mt-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Trophy case complete
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-700"
                  style={{ width: `${(earned / BADGES.length) * 100}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {BADGES.map((b) => {
                const val = b.value(stats);
                const isEarned = val >= b.target;
                const pct = Math.min(100, Math.round((val / b.target) * 100));
                return (
                  <div
                    key={b.id}
                    className={`relative overflow-hidden rounded-2xl border p-4 transition-all ${
                      isEarned
                        ? "border-accent/50 bg-card glow-accent-sm"
                        : "border-border bg-card/60"
                    }`}
                  >
                    <div
                      className={`mb-2 text-3xl ${isEarned ? "" : "opacity-30 grayscale"}`}
                    >
                      {b.emoji}
                    </div>
                    <p
                      className={`font-display text-sm font-bold leading-tight ${
                        isEarned ? "" : "text-muted-foreground"
                      }`}
                    >
                      {b.title}
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                      {b.desc}
                    </p>
                    {isEarned ? (
                      <span className="mt-2 inline-block rounded-full bg-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent-foreground">
                        Unlocked
                      </span>
                    ) : (
                      <div className="mt-2.5">
                        <div className="mb-1 flex items-center justify-between text-[9px] font-bold text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Lock className="h-2.5 w-2.5" /> {val}/{b.target}
                          </span>
                          <span>{pct}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-accent/60"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
