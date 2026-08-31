/**
 * Water daily-goal / cup-size preferences.
 *
 * Local-first: if this device has a value in localStorage, use it — no DB
 * call on every load. The DB (`user_profiles.water_goal_ml`, `water_cup_ml`)
 * is only consulted when localStorage is empty (new device / cleared cache),
 * and the result is cached locally afterward. Every save writes to both, so
 * switching devices (or clearing storage) always recovers the latest value.
 * Does NOT touch `water_logs` (today's actual intake), which already syncs
 * to Supabase correctly.
 */

import { supabase } from "@/integrations/client";

export const DEFAULT_WATER_GOAL_ML = 2500;
export const DEFAULT_WATER_CUP_ML = 250;

export interface WaterPrefs {
  goalMl: number;
  cupMl: number;
}

function readLocal(): WaterPrefs | null {
  try {
    const g = localStorage.getItem("waterDailyGoal");
    const s = localStorage.getItem("waterStep");
    if (!g && !s) return null;
    const goalMl = g ? parseInt(g, 10) : DEFAULT_WATER_GOAL_ML;
    const cupMl = s ? parseInt(s, 10) : DEFAULT_WATER_CUP_ML;
    return {
      goalMl: goalMl >= 1500 ? goalMl : DEFAULT_WATER_GOAL_ML,
      cupMl: cupMl >= 25 ? cupMl : DEFAULT_WATER_CUP_ML,
    };
  } catch {
    return null;
  }
}

function writeLocal(prefs: WaterPrefs) {
  try {
    localStorage.setItem("waterDailyGoal", String(prefs.goalMl));
    localStorage.setItem("waterStep", String(prefs.cupMl));
  } catch {
    /* private mode / storage disabled */
  }
}

/**
 * Resolve water prefs. Returns the local value immediately if present (no
 * network call). Only hits the DB when local storage is empty, then caches
 * the result locally so subsequent loads on this device skip the DB too.
 */
export async function loadWaterPrefs(userId: string): Promise<WaterPrefs> {
  const local = readLocal();
  if (local) return local;

  const { data } = await supabase
    .from("user_profiles")
    .select("water_goal_ml, water_cup_ml")
    .eq("id", userId)
    .maybeSingle();

  const resolved =
    data?.water_goal_ml != null && data?.water_cup_ml != null
      ? { goalMl: data.water_goal_ml, cupMl: data.water_cup_ml }
      : { goalMl: DEFAULT_WATER_GOAL_ML, cupMl: DEFAULT_WATER_CUP_ML };

  writeLocal(resolved); // cache on this device so future loads skip the DB
  return resolved;
}

/** Persist water prefs to localStorage (for instant reads) and the DB (for other devices). */
export async function saveWaterPrefs(userId: string, prefs: WaterPrefs): Promise<void> {
  writeLocal(prefs);
  await supabase
    .from("user_profiles")
    .update({ water_goal_ml: prefs.goalMl, water_cup_ml: prefs.cupMl })
    .eq("id", userId);
}
