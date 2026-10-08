/**
 * Water daily-goal / cup-size preferences.
 *
 * Local-first: this device's value in localStorage shows instantly, then is
 * checked against the account (`user_profiles.water_goal_ml`, `water_cup_ml`)
 * through the validated profile cache, so a change made on another device
 * shows up on the next load. Every save writes to both.
 * Does NOT touch `water_logs` (today's actual intake), which already syncs
 * to Supabase correctly.
 */

import { supabase } from "@/integrations/client";
import { resolveWaterPrefs } from "@/lib/cacheRules";
import { getProfileRow } from "@/lib/historyCache";

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
 * Resolve water prefs. `apply` runs at once with this device's saved value (no
 * wait, no flicker), then again only if the account's value differs, e.g. it
 * was changed on another device. That check goes through the validated
 * profile cache, so when nothing changed it costs only the shared counter read
 * the page makes anyway, not a profile download.
 */
export function loadWaterPrefs(
  userId: string,
  apply: (prefs: WaterPrefs) => void,
): void {
  const local = readLocal();
  if (local) apply(local);
  getProfileRow(userId)
    .then(({ data }) => {
      const account =
        data?.water_goal_ml != null && data?.water_cup_ml != null
          ? { goalMl: data.water_goal_ml, cupMl: data.water_cup_ml }
          : null;
      const { prefs, changed } = resolveWaterPrefs(local, account, {
        goalMl: DEFAULT_WATER_GOAL_ML,
        cupMl: DEFAULT_WATER_CUP_ML,
      });
      writeLocal(prefs);
      if (changed) apply(prefs);
    })
    .catch(() => {
      if (!local)
        apply({ goalMl: DEFAULT_WATER_GOAL_ML, cupMl: DEFAULT_WATER_CUP_ML });
    });
}

/** Persist water prefs to localStorage (for instant reads) and the DB (for other devices). */
export async function saveWaterPrefs(
  userId: string,
  prefs: WaterPrefs,
): Promise<void> {
  writeLocal(prefs);
  await supabase
    .from("user_profiles")
    .update({ water_goal_ml: prefs.goalMl, water_cup_ml: prefs.cupMl })
    .eq("id", userId);
}
