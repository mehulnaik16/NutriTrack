import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Utensils, Dumbbell, Award } from "lucide-react";
import { supabase } from "@/integrations/client";
import { useAuth } from "@/lib/auth";
import { toLocalISO } from "@/lib/dates";
import {
  ACHIEVEMENT_LIST,
  computeTotalXP,
  levelFromXP,
  type Stats,
} from "@/lib/xpConfig";

/* ═══════════════════════════════════════════════════════════════════════
   RankPage — "Achievements" header: profile card (avatar, level, XP bar) and
   the food/workout streak badges. Achievements are awarded through the single
   award_achievement RPC and their XP is summed via xpConfig — no XP number is
   computed here. The leaderboard is rendered separately below (in hub.tsx).
═══════════════════════════════════════════════════════════════════════ */

/** Consecutive-day streak ending today (or yesterday). Same logic the profile
 *  Achievements page uses, kept local to avoid a cross-page dependency. */
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

const rpc = (fn: string, args?: Record<string, unknown>) => (supabase.rpc as any)(fn, args);
const initial = (n: string | null) => (n?.trim()?.[0] ?? "?").toUpperCase();

export function RankPage() {
  const { user } = useAuth();
  const [name, setName] = useState<string | null>(null);
  const [totalXP, setTotalXP] = useState(0);
  const [foodBadges, setFoodBadges] = useState(0);
  const [workoutBadges, setWorkoutBadges] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const uid = user.id;

    const [prof, food, workouts, weights, water, meals, awardedRes] = await Promise.all([
      supabase.from("user_profiles").select("full_name").eq("id", uid).maybeSingle(),
      supabase.from("food_logs").select("date, logged_at").eq("user_id", uid),
      supabase.from("workout_logs").select("date").eq("user_id", uid),
      supabase.from("weight_entries").select("date, photo_url").eq("user_id", uid),
      supabase.from("water_logs").select("amount_ml").eq("user_id", uid).gte("amount_ml", 2000),
      supabase.from("saved_meals" as any).select("id", { count: "exact", head: true }).eq("user_id", uid),
      supabase.from("user_achievements" as any).select("achievement_id"),
    ]);

    const foodRows = (food.data ?? []) as any[];
    const workoutRows = (workouts.data ?? []) as any[];
    const weightRows = (weights.data ?? []) as any[];

    // Only rows logged on their own day count toward streak and XP.
    const todayLoggedFood = foodRows.filter(
      (r) => r.logged_at && toLocalISO(new Date(r.logged_at)) === r.date
    );

    const stats: Stats = {
      foodCount: foodRows.length,
      foodStreak: computeFoodStreak(todayLoggedFood.map((r) => r.date)),
      workoutCount: workoutRows.length,
      weightCount: weightRows.length,
      photoCount: weightRows.filter((w) => w.photo_url).length,
      hydratedDays: (water.data ?? []).length,
      savedMeals: (meals as any).count ?? 0,
      earlyLogs: foodRows.filter((r) => r.logged_at && new Date(r.logged_at).getHours() < 8).length,
    };

    // A "log" for XP = one food, workout, or weight entry. Water is excluded.
    // Back-dated food logs (logged_at ≠ date) do not earn XP.
    const logCount = todayLoggedFood.length + workoutRows.length + weightRows.length;

    // Streak badge counters: total 7-day streaks' worth of distinct logged days.
    setFoodBadges(Math.floor(new Set(foodRows.map((r) => r.date)).size / 7));
    setWorkoutBadges(Math.floor(new Set(workoutRows.map((r) => r.date)).size / 7));

    // ── Award any newly-met achievements through the single RPC path ──
    const awarded = new Set(((awardedRes.data ?? []) as any[]).map((r) => r.achievement_id));
    const newly = ACHIEVEMENT_LIST.filter((a) => a.value(stats) >= a.target && !awarded.has(a.id));
    if (newly.length) {
      await Promise.all(newly.map((a) => rpc("award_achievement", { p_id: a.id })));
      newly.forEach((a) => awarded.add(a.id));
    }

    // Popup only for unlocks that happen while using the app — the very first
    // load seeds already-earned achievements silently (no flood).
    const seedKey = `ach_seeded_${uid}`;
    const firstEver = !localStorage.getItem(seedKey);
    if (!firstEver) {
      newly.forEach((a) =>
        toast(`Achievement Unlocked! ${a.title}`, {
          description: `+${a.xp} XP earned!`,
          icon: "🏅",
          duration: 4000,
        })
      );
    }
    localStorage.setItem(seedKey, "1");

    setName((prof.data as any)?.full_name ?? null);
    setTotalXP(computeTotalXP(logCount, [...awarded]));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const { level, xpIntoCurrentLevel, xpForLevel } = levelFromXP(totalXP);
  const pct = Math.min(100, Math.round((xpIntoCurrentLevel / xpForLevel) * 100));

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold tracking-tight">Achievements</h1>

      {/* ── Profile card ── */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-5">
          {/* Left: avatar + name + level */}
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-accent/60 bg-muted font-display text-3xl font-bold text-accent">
              {initial(name)}
            </div>
            <p className="font-display text-sm font-bold leading-tight text-center">{name || "Anonymous"}</p>
            <span className="inline-block rounded-full bg-muted px-3 py-0.5 text-xs font-semibold text-muted-foreground">
              Level {level}
            </span>
          </div>

          {/* Right: XP label + bar */}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-base">⚡</span>
              <span className="text-sm font-bold tabular-nums">
                {xpIntoCurrentLevel.toLocaleString()}/{xpForLevel.toLocaleString()} XP
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-accent transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{pct}% to next level</p>
          </div>
        </div>
      </div>

      {/* ── Streak badges ── */}
      <div className="grid grid-cols-2 gap-3">
        <StreakBadge
          label="Food Streak"
          count={foodBadges}
          icon={<Utensils className="h-7 w-7" />}
          color="bg-accent text-accent-foreground"
        />
        <StreakBadge
          label="Workout Streak"
          count={workoutBadges}
          icon={<Dumbbell className="h-7 w-7" />}
          color="bg-red-500 text-white"
        />
      </div>

      <div className="flex items-center gap-3 pt-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        Leaderboard
        <span className="h-px flex-1 bg-border" />
      </div>

      {loading && (
        <div className="flex justify-center py-2">
          <Award className="h-5 w-5 animate-pulse text-accent opacity-50" />
        </div>
      )}
    </div>
  );
}

function StreakBadge({
  label,
  count,
  icon,
  color,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      {count >= 1 ? (
        <>
          <div className={`flex h-14 w-14 items-center justify-center rounded-full ${color}`}>
            {icon}
          </div>
          <span className="font-display text-2xl font-bold tabular-nums">{count}</span>
        </>
      ) : (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-border text-muted-foreground/40">
            {icon}
          </div>
          <span className="text-center text-[10px] leading-tight text-muted-foreground">
            Complete a 7-day streak
          </span>
        </>
      )}
    </div>
  );
}
