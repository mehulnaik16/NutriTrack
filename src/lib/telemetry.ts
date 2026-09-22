/**
 * Dual-HUD Telemetry Label Adapter for Cyberware HUD Theme & ISRO Mission Operations
 * Returns in-universe sci-fi or aerospace mission labels when active,
 * or standard real-world labels for all other themes.
 */

const CYBERDECK_LABELS: Record<string, string> = {
  // Macros & Nutrition
  Calories: "BIO-ENERGY [CALORIES]",
  Protein: "STRUCTURAL AMINOS [PROTEIN]",
  Carbs: "GLYCOGEN FUEL [CARBS]",
  Fat: "LIPID BUFFER [FAT]",
  Fiber: "FIBER MATRIX [FIBER]",
  Water: "COOLANT INTAKE [WATER]",

  // Dashboard & Tracking
  "Today's Overview": "SYS_TELEMETRY // DAILY OVERVIEW",
  "Today's Workout": "KINETIC OVERDRIVE // WORKOUT",
  Workouts: "KINETIC OVERDRIVE [WORKOUTS]",
  Weight: "CHASSIS MASS [WEIGHT]",
  Streak: "SYS UPTIME [STREAK]",
  Summary: "DIAGNOSTIC SUMMARY",
  Target: "TARGET ALLOCATION",
  Consumed: "ACTIVE PAYLOAD",
  Remaining: "RESERVE CAPACITY",
  "Log Food": "LOG BIO-PAYLOAD",
};

const ISRO_LABELS: Record<string, string> = {
  // Macros & Nutrition
  Calories: "PROP_BURN [CALORIES]",
  Protein: "OXIDIZER [PROTEIN]",
  Carbs: "LH2 FUEL [CARBS]",
  Fat: "HYPERGOLIC [FAT]",
  Fiber: "FIBER MATRIX [FIBER]",
  Water: "ECLSS H2O [WATER]",

  // Dashboard & Tracking
  "Today's Overview": "CRYOGENIC PROPELLANT & CONSUMABLES TELEMETRY",
  "Today's Workout": "GAGANYAAN G-FORCE RECONDITIONING PROTOCOL",
  Workouts: "GAGANYAAN FLIGHT DRILLS",
  Weight: "CHANDRAYAAN ORBITAL PAYLOAD MASS",
  Streak: "MISSION ELAPSED TIME (MET)",
  Summary: "TELEMETRY DIAGNOSTICS",
  Target: "NOMINAL ALLOCATION",
  Consumed: "EXPENDED PROPELLANT",
  Remaining: "RESERVE PROPELLANT",
  "Log Food": "ISRO PAYLOAD RATIONS LOG",
  "My Plan": "GAGANYAAN FLIGHT READINESS PROTOCOL",
  GYM: "G-FORCE RESISTANCE [GYM]",
  CARDIO: "AEROBIC ENDURANCE [CARDIO]",
  "Weight Tracker": "CHANDRAYAAN ORBITAL PAYLOAD MASS",
  ANALYTICS: "FLIGHT TELEMETRY [ANALYTICS]",
  FRIENDS: "CREW SQUADRON [FRIENDS]",
  RANK: "MISSION RANKINGS [RANK]",
};

export function isCyberdeckTheme(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("theme-cyberdeck");
}

export function isIsroTheme(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("theme-isro");
}

export function getTelemetryLabel(defaultLabel: string): string {
  if (isIsroTheme()) {
    return ISRO_LABELS[defaultLabel] || defaultLabel;
  }
  if (isCyberdeckTheme()) {
    return CYBERDECK_LABELS[defaultLabel] || defaultLabel;
  }
  return defaultLabel;
}
