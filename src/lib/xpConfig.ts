/* ═══════════════════════════════════════════════════════════════════════
   xpConfig — XP_PER_LOG, XP_PER_LEVEL and level maths.

   Per-achievement XP and eligibility USED to live here. They now live in the
   `achievements` table in the database, and sync_achievements() returns the
   earned set with its xp. Keeping them here as client constants meant the
   browser owned both "did I earn this" and "what is it worth", which is what
   let any signed-in user award themselves anything.

   What stays here is presentation (emoji, title, description) and the two
   global XP knobs, which are display maths rather than a trust boundary.
═══════════════════════════════════════════════════════════════════════ */

/** XP earned per meaningful log. A "log" = one food, workout, or weight entry.
 *  Water is deliberately excluded — it's logged many times a day and would let
 *  users farm XP with no natural ceiling. */
export const XP_PER_LOG = 20;

/** XP needed to advance one level. Level = floor(totalXP / XP_PER_LEVEL) + 1. */
export const XP_PER_LEVEL = 1000;

export interface Achievement {
  /** Stable id, matching public.achievements.id. Never change once shipped. */
  id: string;
  emoji: string;
  title: string;
  desc: string;
}

/* Keyed by semantic constant so callers reference e.g. ACHIEVEMENTS.STREAK_7_DAY.
   Thresholds and XP for each of these live in the `achievements` table — this
   map is what the UI shows, not what it awards. */
export const ACHIEVEMENTS = {
  // ── Nutrition ──
  FIRST_BITE:  { id: "first_bite",  emoji: "🍽️", title: "First Bite",      desc: "Log your first food" },
  STREAK_3:    { id: "streak_3",    emoji: "🌱", title: "Getting Warm",    desc: "3-day logging streak" },
  STREAK_7_DAY:{ id: "streak_7",    emoji: "🔥", title: "Week Warrior",    desc: "7-day logging streak" },
  STREAK_14:   { id: "streak_14",   emoji: "⚡", title: "Fortnight Force",  desc: "14-day logging streak" },
  STREAK_30:   { id: "streak_30",   emoji: "👑", title: "Iron Month",       desc: "30-day logging streak" },
  FOOD_100:    { id: "food_100",    emoji: "💯", title: "Century Club",     desc: "Log 100 foods" },
  FOOD_500:    { id: "food_500",    emoji: "🤓", title: "Nutrition Nerd",   desc: "Log 500 foods" },
  EARLY_BIRD:  { id: "early_bird",  emoji: "🌅", title: "Early Bird",       desc: "Log breakfast before 8 AM, 5×" },
  // ── Training ──
  FIRST_REP:   { id: "first_rep",   emoji: "🏋️", title: "First Rep",       desc: "Log your first workout" },
  WORKOUTS_10: { id: "workouts_10", emoji: "💪", title: "Ten Strong",       desc: "Complete 10 workouts" },
  WORKOUTS_50: { id: "workouts_50", emoji: "🦾", title: "Half Century",     desc: "Complete 50 workouts" },
  WORKOUTS_100:{ id: "workouts_100",emoji: "🐺", title: "Beast Mode",       desc: "Complete 100 workouts" },
  // ── Progress ──
  ON_SCALE:    { id: "on_scale",    emoji: "⚖️", title: "On the Scale",    desc: "Log your first weight" },
  WEIGH_20:    { id: "weigh_20",    emoji: "📈", title: "Trend Setter",     desc: "20 weight entries" },
  FIRST_PHOTO: { id: "first_photo", emoji: "📸", title: "Progress Pic",     desc: "Add your first progress photo" },
  PHOTOS_10:   { id: "photos_10",   emoji: "🎞️", title: "Transformation",  desc: "10 progress photos" },
  // ── Hydration & meals ──
  HYDRA_7:     { id: "hydra_7",     emoji: "💧", title: "Hydration Hero",   desc: "Hit 2L+ water on 7 days" },
  HYDRA_30:    { id: "hydra_30",    emoji: "🌊", title: "Aquaholic",        desc: "Hit 2L+ water on 30 days" },
  CHEF_5:      { id: "chef_5",      emoji: "👨‍🍳", title: "Chef's Special", desc: "Save 5 favorite meals" },
} satisfies Record<string, Achievement>;

/** id → achievement, for labelling the rows sync_achievements() returns. */
export const ACHIEVEMENT_BY_ID: Record<string, Achievement> = Object.fromEntries(
  Object.values(ACHIEVEMENTS).map((a) => [a.id, a])
);

/** totalXP = per-log XP + the XP the server reported for each earned badge.
 *  The xp values are passed in rather than looked up, so the client never holds
 *  a second copy of the numbers to drift from. */
export function computeTotalXP(logCount: number, achievementXp: number[]): number {
  return logCount * XP_PER_LOG + achievementXp.reduce((sum, xp) => sum + xp, 0);
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
