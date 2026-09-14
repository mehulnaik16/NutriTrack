/**
 * Cardio exercise categories — single source of truth for the dynamic
 * category-driven logging form and analytics charts.
 *
 * Every cardio activity maps to one of six categories. The category determines
 * which form inputs render on the Log tab and which two charts show on the
 * Analytics tab. Old logs written before categories existed still work: the
 * absence of a `category` field in exercises_done is treated as "distance"
 * (the pre-existing behaviour).
 *
 * ponytail: one file, flat data, no classes, no factories.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type CardioCategory =
  | "distance"
  | "ergometer"
  | "mind_body"
  | "sports"
  | "dance"
  | "interval";

export interface ChartConfig {
  /** Key used to extract the value from mapped chart data. */
  metric: string;
  /** Human-readable label shown above the chart. */
  label: string;
  /** Unit suffix for tooltips (e.g. "min/km"). */
  unit: string;
  /** When true the Y-axis is reversed (lower = better, e.g. pace). */
  inverted: boolean;
}

export interface CategoryConfig {
  label: string;
  /** Which optional form sections to show. Duration + BPM are always present. */
  form: {
    distance?: boolean;
    /** "km" for locomotion, "meters" for rowing / SkiErg / assault bike. */
    distanceUnit?: "km" | "meters";
    intensity?: readonly string[];
    style?: readonly string[];
    protocol?: readonly string[];
    rounds?: boolean;
    workRest?: boolean;
    avgPower?: boolean;
    score?: boolean;
  };
  charts: [ChartConfig, ChartConfig];
}

export interface CardioActivity {
  name: string;
  category: CardioCategory;
}

// ── Intensity & style constants ──────────────────────────────────────────────

export const MIND_BODY_INTENSITY = ["Light", "Moderate", "Vigorous"] as const;
export const SPORTS_INTENSITY = ["Casual", "Competitive", "Training"] as const;
export const DANCE_INTENSITY = ["Light", "Moderate", "Vigorous"] as const;
export const SWIMMING_INTENSITY = ["Light", "Moderate", "Vigorous"] as const;
export const INTERVAL_INTENSITY = ["Light", "Moderate", "Vigorous"] as const;

export const MIND_BODY_STYLES = [
  "Vinyasa",
  "Hatha",
  "Power",
  "Restorative",
  "Yin",
  "Ashtanga",
  "Pilates",
  "Mat Pilates",
  "Reformer",
] as const;

export const DANCE_STYLES = [
  "Freestyle",
  "Zumba",
  "Salsa",
  "Hip-Hop",
  "Bollywood",
  "Contemporary",
  "Swing",
  "Bachata",
] as const;

export const INTERVAL_PROTOCOLS = [
  "Tabata",
  "EMOM",
  "AMRAP",
  "Custom",
] as const;

// ── Category configurations ──────────────────────────────────────────────────

export const CATEGORY_CONFIGS: Record<CardioCategory, CategoryConfig> = {
  distance: {
    label: "Distance & Locomotion",
    form: { distance: true, distanceUnit: "km" },
    charts: [
      { metric: "pace", label: "PACE (MIN/KM) — LOWER IS FASTER", unit: "min/km", inverted: true },
      { metric: "distance", label: "DISTANCE (KM)", unit: "km", inverted: false },
    ],
  },
  ergometer: {
    label: "Machine Ergometers",
    form: { distance: true, distanceUnit: "meters", avgPower: true },
    charts: [
      { metric: "pace", label: "PACE (MIN/500M) — LOWER IS FASTER", unit: "min/500m", inverted: true },
      { metric: "avgPower", label: "AVG POWER (WATTS)", unit: "W", inverted: false },
    ],
  },
  mind_body: {
    label: "Mind-Body & Flow",
    form: { intensity: MIND_BODY_INTENSITY, style: MIND_BODY_STYLES },
    charts: [
      { metric: "duration", label: "DURATION (MIN)", unit: "min", inverted: false },
      { metric: "calories", label: "CALORIES BURNED (KCAL)", unit: "kcal", inverted: false },
    ],
  },
  sports: {
    label: "Sports & Games",
    form: { intensity: SPORTS_INTENSITY, score: true },
    charts: [
      { metric: "duration", label: "DURATION (MIN)", unit: "min", inverted: false },
      { metric: "calories", label: "CALORIES BURNED (KCAL)", unit: "kcal", inverted: false },
    ],
  },
  dance: {
    label: "Dance & Choreography",
    form: { intensity: DANCE_INTENSITY, style: DANCE_STYLES },
    charts: [
      { metric: "duration", label: "DURATION (MIN)", unit: "min", inverted: false },
      { metric: "calories", label: "CALORIES BURNED (KCAL)", unit: "kcal", inverted: false },
    ],
  },
  interval: {
    label: "Interval & High-Intensity",
    form: { intensity: INTERVAL_INTENSITY, protocol: INTERVAL_PROTOCOLS, rounds: true, workRest: true },
    charts: [
      { metric: "duration", label: "TOTAL DURATION (MIN)", unit: "min", inverted: false },
      { metric: "rounds", label: "TOTAL ROUNDS / INTERVALS", unit: "", inverted: false },
    ],
  },
};

// ── Activity catalog ─────────────────────────────────────────────────────────
// 16 original activities preserved exactly + 8 new from spec.

export const CARDIO_CATALOG: CardioActivity[] = [
  // ── Category A: Distance & Locomotion ──
  { name: "Treadmill running",  category: "distance" },
  { name: "Outdoor run",        category: "distance" },
  { name: "Outdoor walk",       category: "distance" },
  { name: "Cycling",            category: "distance" },
  { name: "Swimming",           category: "distance" },
  { name: "Stair climbing",     category: "distance" },
  // ── Category B: Machine Ergometers ──
  { name: "Rowing machine",     category: "ergometer" },
  { name: "SkiErg",             category: "ergometer" },
  { name: "Elliptical",         category: "ergometer" },
  { name: "Assault Bike",       category: "ergometer" },  // NEW
  // ── Category C: Mind-Body & Flow ──
  { name: "Yoga & Pilates",     category: "mind_body" },
  { name: "Stretching",         category: "mind_body" },   // NEW
  // ── Category D: Sports & Games ──
  { name: "Badminton",          category: "sports" },
  { name: "Cricket",            category: "sports" },
  { name: "Football",           category: "sports" },
  // ── Category E: Dance & Choreography ──
  { name: "Dancing",            category: "dance" },
  { name: "Zumba",              category: "dance" },   // NEW
  { name: "Hip-Hop",            category: "dance" },   // NEW
  { name: "Dance Cardio",       category: "dance" },   // NEW
  // ── Category F: Interval & High-Intensity ──
  { name: "HIIT",               category: "interval" },
  { name: "Jump rope",          category: "interval" },
  { name: "Tabata",             category: "interval" },   // NEW
  { name: "EMOM",               category: "interval" },   // NEW
  { name: "AMRAP",              category: "interval" },   // NEW
];

/** All activity names — drop-in replacement for the old CARDIO_ACTIVITIES array. */
export const CARDIO_ACTIVITY_NAMES = CARDIO_CATALOG.map((a) => a.name);

// ── Lookup helpers (name-indexed, built once) ────────────────────────────────

const BY_NAME = new Map<string, CardioActivity>();
for (const a of CARDIO_CATALOG) BY_NAME.set(a.name.toLowerCase(), a);

/** Category for an activity name. Falls back to "distance" for unrecognised names. */
export function categoryOf(name: string): CardioCategory {
  return BY_NAME.get(name.toLowerCase())?.category ?? "distance";
}

/** Category config (form fields + chart spec) for an activity. */
export function configFor(name: string): CategoryConfig {
  const base = CATEGORY_CONFIGS[categoryOf(name)];
  if (name.toLowerCase() === "swimming") {
    return {
      ...base,
      form: { ...base.form, intensity: SWIMMING_INTENSITY },
    };
  }
  return base;
}

/** Two chart definitions for an activity's Analytics tab. */
export function chartsFor(name: string): [ChartConfig, ChartConfig] {
  return configFor(name).charts;
}

// ── Smart defaults (localStorage-first, egress-cheap) ────────────────────────

const defaultsKey = (userId: string, activity: string) =>
  `cardio_defaults_${userId}_${activity}`;

/** Read last-used values from localStorage. Returns null if nothing cached. */
export function getCardioDefaults(
  userId: string,
  activity: string,
): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(defaultsKey(userId, activity));
    return raw ? (JSON.parse(raw) as Record<string, string>) : null;
  } catch {
    return null;
  }
}

/** Persist last-used values to localStorage for instant next-open. */
export function saveCardioDefaults(
  userId: string,
  activity: string,
  defaults: Record<string, string>,
): void {
  try {
    localStorage.setItem(defaultsKey(userId, activity), JSON.stringify(defaults));
  } catch {
    /* storage full / blocked — non-critical */
  }
}

// ── Pace helpers ─────────────────────────────────────────────────────────────

/** Format numeric pace (fractional minutes) as "M:SS". */
export function formatPace(paceMinutes: number): string {
  const min = Math.floor(paceMinutes);
  const sec = Math.round((paceMinutes - min) * 60);
  if (sec === 60) return `${min + 1}:00`;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

/**
 * Compute numeric pace from a log entry.
 * - distance activities: min/km (or min/mile — same formula, unit is display-only).
 * - ergometer activities: min/500m.
 * Returns null when distance is missing or zero.
 */
export function computePaceNumeric(
  durationMin: number,
  distance: number,
  category: CardioCategory,
): number | null {
  if (!durationMin || !distance) return null;
  if (category === "ergometer") return (durationMin * 500) / distance;
  return durationMin / distance;
}

// ── Grouped catalog for the activity-picker UI ───────────────────────────────

const CATEGORY_ORDER: CardioCategory[] = [
  "distance",
  "ergometer",
  "mind_body",
  "sports",
  "dance",
  "interval",
];

export interface CategoryGroup {
  category: CardioCategory;
  label: string;
  activities: CardioActivity[];
}

/** Activities grouped and ordered by category for the picker list. */
export function groupedCatalog(): CategoryGroup[] {
  return CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_CONFIGS[cat].label,
    activities: CARDIO_CATALOG.filter((a) => a.category === cat),
  }));
}
