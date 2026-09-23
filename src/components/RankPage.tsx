import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Utensils, Dumbbell, Award } from "lucide-react";
import { supabase } from "@/integrations/client";
import { useAuth } from "@/lib/auth";
import { toLocalISO } from "@/lib/dates";
import { ACHIEVEMENT_BY_ID, computeTotalXP, levelFromXP } from "@/lib/xpConfig";

/* ═══════════════════════════════════════════════════════════════════════
   RankPage — "Achievements" header: profile card (avatar, level, XP bar) and
   the food/workout streak badges. The leaderboard is rendered separately below
   (in hub.tsx).

   Eligibility is NOT computed here. sync_achievements() recomputes it from the
   user's own rows server-side and returns the earned set with each badge's XP;
   this page renders what comes back. It used to decide eligibility in the
   browser and then call award_achievement once per newly-met badge, which meant
   any signed-in user could award themselves all 19.
═══════════════════════════════════════════════════════════════════════ */

const rpc = (fn: string, args?: Record<string, unknown>) =>
  (supabase.rpc as any)(fn, args);
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

    // One RPC recomputes eligibility server-side and returns the earned set with
    // xp. Water and saved-meal counts are no longer fetched here — they were
    // only ever inputs to the client-side eligibility test.
    const [prof, food, workouts, weights, synced] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("full_name")
        .eq("id", uid)
        .maybeSingle(),
      supabase.from("food_logs").select("date, logged_at").eq("user_id", uid),
      supabase.from("workout_logs").select("date").eq("user_id", uid),
      supabase.from("weight_entries").select("date").eq("user_id", uid),
      rpc("sync_achievements"),
    ]);

    const foodRows = (food.data ?? []) as any[];
    const workoutRows = (workouts.data ?? []) as any[];
    const weightRows = (weights.data ?? []) as any[];
    const earned = (synced.data ?? []) as {
      achievement_id: string;
      xp: number;
    }[];

    // A "log" for XP = one food, workout, or weight entry. Water is excluded.
    // Back-dated food logs (logged_at ≠ date) do not earn XP.
    const todayLoggedFood = foodRows.filter(
      (r) => r.logged_at && toLocalISO(new Date(r.logged_at)) === r.date,
    );
    const logCount =
      todayLoggedFood.length + workoutRows.length + weightRows.length;

    // Streak badge counters: total 7-day streaks' worth of distinct logged days.
    setFoodBadges(Math.floor(new Set(foodRows.map((r) => r.date)).size / 7));
    setWorkoutBadges(
      Math.floor(new Set(workoutRows.map((r) => r.date)).size / 7),
    );

    // Popup only for unlocks that happen while using the app — the very first
    // load seeds already-earned achievements silently (no flood). The previously
    // seen ids are the only thing kept locally, purely to diff for the toast.
    const seenKey = `ach_seen_${uid}`;
    let seen: string[] | null = null;
    try {
      const raw = localStorage.getItem(seenKey);
      seen = raw ? (JSON.parse(raw) as string[]) : null;
    } catch {
      seen = null;
    }
    if (seen) {
      const before = new Set(seen);
      earned
        .filter((e) => !before.has(e.achievement_id))
        .forEach((e) =>
          toast(
            `Achievement Unlocked! ${ACHIEVEMENT_BY_ID[e.achievement_id]?.title ?? "New badge"}`,
            {
              description: `+${e.xp} XP earned!`,
              icon: "🏅",
              duration: 4000,
            },
          ),
        );
    }
    try {
      localStorage.setItem(
        seenKey,
        JSON.stringify(earned.map((e) => e.achievement_id)),
      );
    } catch {
      /* storage full / blocked — toasts are cosmetic, carry on */
    }

    setName((prof.data as any)?.full_name ?? null);
    setTotalXP(
      computeTotalXP(
        logCount,
        earned.map((e) => e.xp),
      ),
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const { level, xpIntoCurrentLevel, xpForLevel } = levelFromXP(totalXP);
  const pct = Math.min(
    100,
    Math.round((xpIntoCurrentLevel / xpForLevel) * 100),
  );

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold tracking-tight">
        Achievements
      </h1>

      {/* ── Profile card ── */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-5">
          {/* Left: avatar + name + level */}
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-accent/60 bg-muted font-display text-3xl font-bold text-accent">
              {initial(name)}
            </div>
            <p className="font-display text-sm font-bold leading-tight text-center">
              {name || "Anonymous"}
            </p>
            <span className="inline-block rounded-full bg-muted px-3 py-0.5 text-xs font-semibold text-muted-foreground">
              Level {level}
            </span>
          </div>

          {/* Right: XP label + bar */}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-base">⚡</span>
              <span className="text-sm font-bold tabular-nums">
                {xpIntoCurrentLevel.toLocaleString()}/
                {xpForLevel.toLocaleString()} XP
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-accent transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {pct}% to next level
            </p>
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
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {count >= 1 ? (
        <>
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-full ${color}`}
          >
            {icon}
          </div>
          <span className="font-display text-2xl font-bold tabular-nums">
            {count}
          </span>
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
