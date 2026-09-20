/**
 * Dual-HUD Telemetry Label Adapter for Cyberware HUD Theme
 * Returns in-universe sci-fi hardware labels when theme-cyberdeck is active,
 * or standard real-world labels for all other themes.
 */

const TELEMETRY_LABELS: Record<string, string> = {
  // Macros & Nutrition
  Calories: "BIO-ENERGY [CALORIES]",
  Protein: "STRUCTURAL AMINOS [PROTEIN]",
  Carbs: "GLYCOGEN FUEL [CARBS]",
  Fat: "LIPID BUFFER [FAT]",
  Fiber: "FIBER MATRIX [FIBER]",
  Water: "COOLANT INTAKE [WATER]",

  // Dashboard & Tracking
  "Today's Overview": "SYS_TELEMETRY // DAILY OVERVIEW",
  Workouts: "KINETIC OVERDRIVE [WORKOUTS]",
  Weight: "CHASSIS MASS [WEIGHT]",
  Streak: "SYS UPTIME [STREAK]",
  Summary: "DIAGNOSTIC SUMMARY",
  Target: "TARGET ALLOCATION",
  Consumed: "ACTIVE PAYLOAD",
  Remaining: "RESERVE CAPACITY",
};

export function isCyberdeckTheme(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("theme-cyberdeck");
}

export function getTelemetryLabel(defaultLabel: string): string {
  if (!isCyberdeckTheme()) return defaultLabel;
  return TELEMETRY_LABELS[defaultLabel] || defaultLabel;
}
