/* ═══════════════════════════════════════════════════════════════════════
   progress — one loader for "how far along is this user", plus the two
   pure diffs that decide whether something is worth a toast.

   Lifted out of RankPage.tsx, which used to own this and could therefore
   only announce an unlocked badge to someone already standing on the
   Achievements page. Two callers now: that page, which renders the
   snapshot, and useProgressToasts, which diffs it.

   Eligibility is still NOT computed here. sync_achievements() recomputes it
   from the user's own rows server-side and returns the earned set with each
   badge's XP; this file only adds up what comes back.
═══════════════════════════════════════════════════════════════════════ */

import { supabase } from "@/integrations/client";
import { toLocalISO } from "@/lib/dates";
import { computeTotalXP, levelFromXP } from "@/lib/xpConfig";

export interface ProgressSnapshot {
  name: string | null;
  totalXP: number;
  /** Derived from totalXP, surfaced so callers don't each re-derive it. */
  level: number;
  earned: { achievement_id: string; xp: number }[];
  /** Whole 7-day streaks' worth of distinct logged days. */
  foodBadges: number;
  workoutBadges: number;
}

/** Everything the Achievements page renders and the toast hook diffs. */
export async function loadProgress(
  uid: string,
): Promise<ProgressSnapshot | null> {
  // One RPC recomputes eligibility server-side and returns the earned set with
  // xp. Water and saved-meal counts are not fetched — they were only ever
  // inputs to the client-side eligibility test that no longer exists.
  const [prof, food, workouts, weights, synced] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("full_name")
      .eq("id", uid)
      .maybeSingle(),
    supabase.from("food_logs").select("date, logged_at").eq("user_id", uid),
    supabase.from("workout_logs").select("date").eq("user_id", uid),
    supabase.from("weight_entries").select("date").eq("user_id", uid),
    supabase.rpc("sync_achievements"),
  ]);

  const foodRows = food.data ?? [];
  const workoutRows = workouts.data ?? [];
  const weightRows = weights.data ?? [];
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

  const totalXP = computeTotalXP(
    logCount,
    earned.map((e) => e.xp),
  );

  return {
    name: prof.data?.full_name ?? null,
    totalXP,
    level: levelFromXP(totalXP).level,
    earned,
    foodBadges: Math.floor(new Set(foodRows.map((r) => r.date)).size / 7),
    workoutBadges: Math.floor(new Set(workoutRows.map((r) => r.date)).size / 7),
  };
}
