/* ═══════════════════════════════════════════════════════════════════════
   xpConfig — THE single source of truth for every XP number in the app.
   XP_PER_LOG, XP_PER_LEVEL, and each achievement's `xp` live ONLY here.
   Nothing else (level math, award handler, XP bar) may hardcode an XP value;
   they import from this file. Change a number here and the whole system moves.
═══════════════════════════════════════════════════════════════════════ */

/** XP earned per meaningful log. A "log" = one food, workout, or weight entry.
 *  Water is deliberately excluded — it's logged many times a day and would let
 *  users farm XP with no natural ceiling. */
export const XP_PER_LOG = 20;

/** XP needed to advance one level. Level = floor(totalXP / XP_PER_LEVEL) + 1. */
export const XP_PER_LEVEL = 1000;

/** Stats derived from a user's logs — the inputs every achievement predicate
 *  reads. Loaded once (see RankPage) and passed to `value(stats)`. */
export interface Stats {
  foodCount: number;
  foodStreak: number;
  workoutCount: number;
  weightCount: number;
  photoCount: number;
  hydratedDays: number;
  savedMeals: number;
  earlyLogs: number;
}

export interface Achievement {
  /** Stable id stored in the user_achievements table. Never change once shipped. */
  id: string;
  emoji: string;
  title: string;
  desc: string;
  /** Threshold `value(stats)` must reach for the achievement to unlock. */
  target: number;
  /** XP granted when this achievement is awarded — the ONLY place it's defined. */
  xp: number;
  value: (s: Stats) => number;
}

/* Keyed by semantic constant so callers reference e.g. ACHIEVEMENTS.STREAK_7_DAY.
   The 7-day streak is just another entry here — it earns XP through the exact
   same award path as every other badge, never a separate bonus. */
export const ACHIEVEMENTS = {
  // ── Nutrition ──
  FIRST_BITE:  { id: "first_bite",  emoji: "🍽️", title: "First Bite",      desc: "Log your first food",              target: 1,   xp: 50,  value: (s) => s.foodCount },
  STREAK_3:    { id: "streak_3",    emoji: "🌱", title: "Getting Warm",    desc: "3-day logging streak",             target: 3,   xp: 75,  value: (s) => s.foodStreak },
  STREAK_7_DAY:{ id: "streak_7",    emoji: "🔥", title: "Week Warrior",    desc: "7-day logging streak",             target: 7,   xp: 150, value: (s) => s.foodStreak },
  STREAK_14:   { id: "streak_14",   emoji: "⚡", title: "Fortnight Force",  desc: "14-day logging streak",            target: 14,  xp: 250, value: (s) => s.foodStreak },
  STREAK_30:   { id: "streak_30",   emoji: "👑", title: "Iron Month",       desc: "30-day logging streak",            target: 30,  xp: 500, value: (s) => s.foodStreak },
  FOOD_100:    { id: "food_100",    emoji: "💯", title: "Century Club",     desc: "Log 100 foods",                    target: 100, xp: 200, value: (s) => s.foodCount },
  FOOD_500:    { id: "food_500",    emoji: "🤓", title: "Nutrition Nerd",   desc: "Log 500 foods",                    target: 500, xp: 500, value: (s) => s.foodCount },
  EARLY_BIRD:  { id: "early_bird",  emoji: "🌅", title: "Early Bird",       desc: "Log breakfast before 8 AM, 5×",    target: 5,   xp: 150, value: (s) => s.earlyLogs },
  // ── Training ──
  FIRST_REP:   { id: "first_rep",   emoji: "🏋️", title: "First Rep",       desc: "Log your first workout",           target: 1,   xp: 50,  value: (s) => s.workoutCount },
  WORKOUTS_10: { id: "workouts_10", emoji: "💪", title: "Ten Strong",       desc: "Complete 10 workouts",             target: 10,  xp: 150, value: (s) => s.workoutCount },
  WORKOUTS_50: { id: "workouts_50", emoji: "🦾", title: "Half Century",     desc: "Complete 50 workouts",             target: 50,  xp: 300, value: (s) => s.workoutCount },
  WORKOUTS_100:{ id: "workouts_100",emoji: "🐺", title: "Beast Mode",       desc: "Complete 100 workouts",            target: 100, xp: 500, value: (s) => s.workoutCount },
  // ── Progress ──
  ON_SCALE:    { id: "on_scale",    emoji: "⚖️", title: "On the Scale",    desc: "Log your first weight",            target: 1,   xp: 50,  value: (s) => s.weightCount },
  WEIGH_20:    { id: "weigh_20",    emoji: "📈", title: "Trend Setter",     desc: "20 weight entries",                target: 20,  xp: 200, value: (s) => s.weightCount },
  FIRST_PHOTO: { id: "first_photo", emoji: "📸", title: "Progress Pic",     desc: "Add your first progress photo",    target: 1,   xp: 50,  value: (s) => s.photoCount },
  PHOTOS_10:   { id: "photos_10",   emoji: "🎞️", title: "Transformation",  desc: "10 progress photos",               target: 10,  xp: 200, value: (s) => s.photoCount },
  // ── Hydration & meals ──
  HYDRA_7:     { id: "hydra_7",     emoji: "💧", title: "Hydration Hero",   desc: "Hit 2L+ water on 7 days",          target: 7,   xp: 150, value: (s) => s.hydratedDays },
  HYDRA_30:    { id: "hydra_30",    emoji: "🌊", title: "Aquaholic",        desc: "Hit 2L+ water on 30 days",         target: 30,  xp: 400, value: (s) => s.hydratedDays },
  CHEF_5:      { id: "chef_5",      emoji: "👨‍🍳", title: "Chef's Special", desc: "Save 5 favorite meals",            target: 5,   xp: 100, value: (s) => s.savedMeals },
} satisfies Record<string, Achievement>;

/** All achievements as a list — for iterating (award loop, trophy grids). */
export const ACHIEVEMENT_LIST: Achievement[] = Object.values(ACHIEVEMENTS);

/** id → achievement, for summing XP from stored award rows. */
export const ACHIEVEMENT_BY_ID: Record<string, Achievement> = Object.fromEntries(
  ACHIEVEMENT_LIST.map((a) => [a.id, a])
);

/** totalXP = per-log XP + XP from every awarded achievement (no type filter,
 *  streak achievements included). Unknown ids contribute 0. */
export function computeTotalXP(logCount: number, awardedIds: string[]): number {
  const achievementXP = awardedIds.reduce(
    (sum, id) => sum + (ACHIEVEMENT_BY_ID[id]?.xp ?? 0),
    0
  );
  return logCount * XP_PER_LOG + achievementXP;
}

export interface LevelInfo {
  level: number;
  /** XP accumulated into the current level (0 .. XP_PER_LEVEL-1). */
  xpIntoCurrentLevel: number;
  /** XP span of a level — for the progress bar denominator. */
  xpForLevel: number;
}

export function levelFromXP(totalXP: number): LevelInfo {
  return {
    level: Math.floor(totalXP / XP_PER_LEVEL) + 1,
    xpIntoCurrentLevel: totalXP % XP_PER_LEVEL,
    xpForLevel: XP_PER_LEVEL,
  };
}
