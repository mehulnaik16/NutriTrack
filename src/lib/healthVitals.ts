/**
 * Health Vitals Engine (Hypertension & Diabetes)
 *
 * Implements Indian clinical guidelines:
 * - Indian Society of Hypertension (InSH) 2023 classification
 * - Standard Indian diagnostic thresholds for plasma glucose
 *
 * All functions are pure, deterministic, and side-effect free.
 */

export type HealthCondition = "hypertension" | "diabetes";

export interface VitalsInference {
  category: string;
  color: string; // Hex color code
  meaning: string; // Clinical explanation / guidance
  pulse: boolean; // Pulsing urgency animation
  bgClass: string; // Tailwind background class for tinted card
  borderClass: string; // Tailwind border class
  textClass: string; // Tailwind text color class
}

export const HYPERTENSION_LIMITS = {
  systolic: { min: 50, max: 280, unit: "mmHg" },
  diastolic: { min: 30, max: 180, unit: "mmHg" },
} as const;

export const DIABETES_LIMITS = {
  glucose: { min: 50, max: 1800, unit: "mg/dL" },
} as const;

/**
 * Strips non-digits, minus signs, and decimal points.
 */
export function sanitizeNumericInput(raw: string): string {
  if (!raw) return "";
  return raw.replace(/[^0-9]/g, "");
}

/**
 * Validates Systolic and Diastolic inputs according to clinical home-monitoring boundaries
 * and enforces systolic > diastolic.
 */
export function validateBloodPressure(
  sysStr: string,
  diaStr: string,
): {
  ok: boolean;
  systolic?: number;
  diastolic?: number;
  systolicError?: string;
  diastolicError?: string;
} {
  const cleanSys = sanitizeNumericInput(sysStr);
  const cleanDia = sanitizeNumericInput(diaStr);

  if (!cleanSys || !cleanDia) {
    return { ok: false };
  }

  const sys = parseInt(cleanSys, 10);
  const dia = parseInt(cleanDia, 10);

  let systolicError: string | undefined;
  let diastolicError: string | undefined;

  if (
    sys < HYPERTENSION_LIMITS.systolic.min ||
    sys > HYPERTENSION_LIMITS.systolic.max
  ) {
    systolicError = `Systolic must be between ${HYPERTENSION_LIMITS.systolic.min}–${HYPERTENSION_LIMITS.systolic.max} mmHg.`;
  }

  if (
    dia < HYPERTENSION_LIMITS.diastolic.min ||
    dia > HYPERTENSION_LIMITS.diastolic.max
  ) {
    diastolicError = `Diastolic must be between ${HYPERTENSION_LIMITS.diastolic.min}–${HYPERTENSION_LIMITS.diastolic.max} mmHg.`;
  }

  // Cross-validation: Systolic must be strictly greater than diastolic
  if (!systolicError && !diastolicError && sys <= dia) {
    diastolicError = "Diastolic must be lower than systolic.";
  }

  const ok = !systolicError && !diastolicError;
  return {
    ok,
    systolic: sys,
    diastolic: dia,
    systolicError,
    diastolicError,
  };
}

/**
 * Classifies Blood Pressure based on Indian Society of Hypertension (InSH) 2023 Guidelines.
 *
 * Critical rule: If systolic and diastolic fall into different categories,
 * the higher category is displayed.
 */
export function evaluateHypertension(
  systolic: number,
  diastolic: number,
): VitalsInference {
  // Check hypotension first: sys < 90 or dia < 60
  // If one is severely elevated, hypertension takes precedence.
  const isHypotensive = systolic < 90 || diastolic < 60;
  const isHypertensive =
    systolic >= 140 || diastolic >= 90 || (systolic >= 130 && diastolic >= 85);

  if (isHypotensive && !isHypertensive) {
    return {
      category: "Low BP (Hypotension)",
      color: "#1565C0",
      meaning:
        "Low blood pressure. May cause dizziness or fainting. Stay hydrated; avoid sudden standing.",
      pulse: false,
      bgClass: "bg-card border-border",
      borderClass: "border-sky-500",
      textClass: "text-sky-400",
    };
  }

  // Determine systolic grade (1..5)
  let sysGrade = 1; // Optimal: < 120
  if (systolic >= 180) sysGrade = 6;
  else if (systolic >= 160) sysGrade = 5;
  else if (systolic >= 140) sysGrade = 4;
  else if (systolic >= 130) sysGrade = 3;
  else if (systolic >= 120) sysGrade = 2;

  // Determine diastolic grade (1..5)
  let diaGrade = 1; // Optimal: < 80
  if (diastolic >= 110) diaGrade = 6;
  else if (diastolic >= 100) diaGrade = 5;
  else if (diastolic >= 90) diaGrade = 4;
  else if (diastolic >= 85) diaGrade = 3;
  else if (diastolic >= 80) diaGrade = 2;

  // Higher category rule
  const finalGrade = Math.max(sysGrade, diaGrade);

  switch (finalGrade) {
    case 6:
      return {
        category: "Grade 3 Hypertension",
        color: "#C62828",
        meaning:
          "Grade 3 hypertension. Systolic ≥180 or diastolic ≥110. Seek immediate medical attention.",
        pulse: true,
        bgClass: "bg-card border-border",
        borderClass: "border-red-500",
        textClass: "text-red-400",
      };
    case 5:
      return {
        category: "Grade 2 Hypertension",
        color: "#C62828",
        meaning:
          "Grade 2 hypertension. Systolic 160–179 or diastolic 100–109. Medical review needed.",
        pulse: false,
        bgClass: "bg-card border-border",
        borderClass: "border-red-500",
        textClass: "text-red-400",
      };
    case 4:
      return {
        category: "Grade 1 Hypertension",
        color: "#EF6C00",
        meaning:
          "Systolic 130–139 or diastolic 90–99. Lifestyle changes and doctor consultation advised.",
        pulse: false,
        bgClass: "bg-card border-border",
        borderClass: "border-orange-500",
        textClass: "text-orange-400",
      };
    case 3:
      return {
        category: "High-Normal",
        color: "#F9A825",
        meaning: "High-normal blood pressure. Lifestyle changes recommended.",
        pulse: false,
        bgClass: "bg-card border-border",
        borderClass: "border-amber-500",
        textClass: "text-amber-400",
      };
    case 2:
      return {
        category: "Normal",
        color: "#2E7D32",
        meaning: "Normal blood pressure.",
        pulse: false,
        bgClass: "bg-card border-border",
        borderClass: "border-emerald-500",
        textClass: "text-emerald-400",
      };
    case 1:
    default:
      return {
        category: "Optimal",
        color: "#2E7D32",
        meaning: "Optimal blood pressure. Keep it up.",
        pulse: false,
        bgClass: "bg-card border-border",
        borderClass: "border-emerald-500",
        textClass: "text-emerald-400",
      };
  }
}

/**
 * Validates Blood Glucose input.
 * Minimum loggable: 50 mg/dL.
 * Maximum loggable: 1800 mg/dL (capped if exceeding).
 */
export function validateBloodGlucose(raw: string): {
  ok: boolean;
  glucose?: number;
  capped?: boolean;
  error?: string;
  warning?: string;
} {
  const clean = sanitizeNumericInput(raw);
  if (!clean) return { ok: false };

  const parsed = parseInt(clean, 10);

  if (parsed < DIABETES_LIMITS.glucose.min) {
    return {
      ok: false,
      error:
        "Values below 50 mg/dL are not loggable. Seek emergency care if you are experiencing symptoms.",
    };
  }

  if (parsed > DIABETES_LIMITS.glucose.max) {
    return {
      ok: true,
      glucose: DIABETES_LIMITS.glucose.max,
      capped: true,
      warning:
        "Maximum loggable value reached. If your reading is higher, enter 1800 and consult a doctor immediately.",
    };
  }

  return {
    ok: true,
    glucose: parsed,
  };
}

/**
 * Evaluates Blood Glucose reading according to standard Indian diagnostic thresholds.
 */
export function evaluateDiabetes(glucose: number): VitalsInference {
  if (glucose >= 1800) {
    return {
      category: "Extreme (Capped)",
      color: "#C62828",
      meaning: "Maximum loggable value. Emergency care required.",
      pulse: true,
      bgClass: "bg-card border-border",
      borderClass: "border-red-500",
      textClass: "text-red-400",
    };
  }

  if (glucose >= 400) {
    return {
      category: "Severe Hyperglycaemia",
      color: "#C62828",
      meaning: "Severe hyperglycaemia. Seek medical attention immediately.",
      pulse: true,
      bgClass: "bg-card border-border",
      borderClass: "border-red-500",
      textClass: "text-red-400",
    };
  }

  if (glucose >= 200) {
    return {
      category: "High Hyperglycaemia",
      color: "#C62828",
      meaning: "High blood sugar. Monitor closely and follow your care plan.",
      pulse: false,
      bgClass: "bg-card border-border",
      borderClass: "border-red-500",
      textClass: "text-red-400",
    };
  }

  if (glucose >= 126) {
    return {
      category: "Diabetes",
      color: "#EF6C00",
      meaning: "Diabetes range. Consult a doctor for management.",
      pulse: false,
      bgClass: "bg-card border-border",
      borderClass: "border-orange-500",
      textClass: "text-orange-400",
    };
  }

  if (glucose >= 100) {
    return {
      category: "Prediabetes",
      color: "#F9A825",
      meaning: "Prediabetes range. Lifestyle changes can reverse this.",
      pulse: false,
      bgClass: "bg-card border-border",
      borderClass: "border-amber-500",
      textClass: "text-amber-400",
    };
  }

  if (glucose >= 70) {
    return {
      category: "Normal",
      color: "#2E7D32",
      meaning: "Normal fasting glucose range.",
      pulse: false,
      bgClass: "bg-card border-border",
      borderClass: "border-emerald-500",
      textClass: "text-emerald-400",
    };
  }

  // 50–69 mg/dL
  return {
    category: "Hypoglycaemia (Low)",
    color: "#1565C0",
    meaning: "Low blood sugar. Consume 15g fast-acting carbs immediately.",
    pulse: false,
    bgClass: "bg-card border-border",
    borderClass: "border-sky-500",
    textClass: "text-sky-400",
  };
}
