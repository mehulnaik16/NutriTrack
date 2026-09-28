/**
 * Notification Pre-Permission Primer Engine.
 *
 * Manages the timing and state for asking the user to enable notifications:
 *   - Trigger 1: After logging 2 foods OR 1 workout set (high engagement).
 *   - Trigger 2: On Day 5+ on app launch (after onboarding), if not already granted.
 *
 * Persisted in localStorage so no Supabase tables are touched.
 * When the user taps "Not Now", we do NOT invoke the native OS prompt,
 * preserving iOS's single-shot system permission dialog.
 */

export interface PrimerState {
  foodLogsCount: number;
  workoutLogsCount: number;
  trigger1Handled: boolean;
  trigger2Handled: boolean;
  lastDismissedAt: string | null;
  granted: boolean;
}

const STORAGE_PREFIX = "dombelz_notif_primer_";

export const PRIMER_EVENT_NAME = "dombelz:open-notification-primer";

export interface PrimerEventDetail {
  trigger: "engagement" | "day5";
}

/** Get the storage key for a user. */
function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

/** Read primer state from localStorage. */
export function getPrimerState(userId: string): PrimerState {
  if (typeof window === "undefined" || !userId) {
    return {
      foodLogsCount: 0,
      workoutLogsCount: 0,
      trigger1Handled: false,
      trigger2Handled: false,
      lastDismissedAt: null,
      granted: false,
    };
  }

  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // Ignore parse errors or blocked storage
  }

  return {
    foodLogsCount: 0,
    workoutLogsCount: 0,
    trigger1Handled: false,
    trigger2Handled: false,
    lastDismissedAt: null,
    granted: false,
  };
}

/** Save primer state to localStorage. */
function savePrimerState(userId: string, state: PrimerState): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    // Ignore storage write issues
  }
}

/** Dispatch a browser event to trigger the UI dialog. */
export function openPrimerDialog(trigger: "engagement" | "day5"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<PrimerEventDetail>(PRIMER_EVENT_NAME, {
      detail: { trigger },
    }),
  );
}

/**
 * Record a food log event.
 * If foodLogsCount reaches 2 (or 1 workout set already logged) and Trigger 1
 * has not been handled yet, triggers the primer dialog.
 */
export function recordFoodLog(userId: string): boolean {
  if (!userId) return false;
  const state = getPrimerState(userId);
  if (state.granted || state.trigger1Handled) return false;

  state.foodLogsCount += 1;
  savePrimerState(userId, state);

  const shouldTrigger = state.foodLogsCount >= 2 || state.workoutLogsCount >= 1;
  if (shouldTrigger) {
    state.trigger1Handled = true;
    savePrimerState(userId, state);
    openPrimerDialog("engagement");
    return true;
  }
  return false;
}

/**
 * Record a workout log event.
 * If 1 workout set is logged and Trigger 1 has not been handled yet,
 * triggers the primer dialog.
 */
export function recordWorkoutLog(userId: string): boolean {
  if (!userId) return false;
  const state = getPrimerState(userId);
  if (state.granted || state.trigger1Handled) return false;

  state.workoutLogsCount += 1;
  state.trigger1Handled = true;
  savePrimerState(userId, state);

  openPrimerDialog("engagement");
  return true;
}

/**
 * Check if the user is eligible for Trigger 2 (Day 5+ app open).
 * Conditions:
 * 1. Not already granted
 * 2. Trigger 2 has not been handled yet
 * 3. At least 5 calendar days since account creation
 * 4. At least 48 hours since Trigger 1 was dismissed (if dismissed)
 */
export function checkDay5Eligible(
  userId: string,
  accountCreatedAt: string | Date | null | undefined,
): boolean {
  if (!userId || !accountCreatedAt) return false;
  const state = getPrimerState(userId);
  if (state.granted || state.trigger2Handled) return false;

  const createdTime =
    typeof accountCreatedAt === "string"
      ? new Date(accountCreatedAt).getTime()
      : accountCreatedAt.getTime();

  const now = Date.now();
  const msPerDay = 86_400_000;
  const daysElapsed = Math.floor((now - createdTime) / msPerDay);

  if (daysElapsed < 5) return false;

  // If dismissed earlier, ensure at least 48 hours cooldown before re-asking
  if (state.lastDismissedAt) {
    const dismissedTime = new Date(state.lastDismissedAt).getTime();
    if (now - dismissedTime < 48 * 3600 * 1000) {
      return false;
    }
  }

  return true;
}

/** Mark Trigger 2 as handled and open the dialog. */
export function triggerDay5Primer(userId: string): void {
  if (!userId) return;
  const state = getPrimerState(userId);
  state.trigger2Handled = true;
  savePrimerState(userId, state);
  openPrimerDialog("day5");
}

/** User clicked "Not Now" — closes without calling native OS prompt. */
export function dismissPrimer(userId: string): void {
  if (!userId) return;
  const state = getPrimerState(userId);
  state.lastDismissedAt = new Date().toISOString();
  savePrimerState(userId, state);
}

/** User successfully granted notifications. */
export function markPrimerGranted(userId: string): void {
  if (!userId) return;
  const state = getPrimerState(userId);
  state.granted = true;
  savePrimerState(userId, state);
}
