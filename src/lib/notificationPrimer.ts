/**
 * Notification Pre-Permission Primer Engine.
 *
 * At most two prompts per user for the whole life of the account, and never
 * before onboarding is finished:
 *   - Trigger 1: the first food log or the first workout log. Once. A refusal
 *     is final for this trigger — later logs never re-ask.
 *   - Trigger 2: app open on day 5+, at least 48h after a refusal. Once.
 *
 * "Onboarded" is stamped by the dashboard guard (src/routes/dashboard.tsx),
 * which is already the one place that knows the profile row exists and both
 * compulsory intro screens have been seen. A user who never gets that far is
 * never prompted, which is the quiet side to fail on.
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

/**
 * Set once the dashboard guard has confirmed a finished onboarding. Separate
 * from the primer blob because it outlives it conceptually and is written from
 * a different screen.
 */
const ONBOARDED_PREFIX = "dombelz_onboarded_";

export const PRIMER_EVENT_NAME = "dombelz:open-notification-primer";

export interface PrimerEventDetail {
  trigger: "engagement" | "day5";
}

const DEFAULT_STATE: PrimerState = {
  foodLogsCount: 0,
  workoutLogsCount: 0,
  trigger1Handled: false,
  trigger2Handled: false,
  lastDismissedAt: null,
  granted: false,
};

/** Get the storage key for a user. */
function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

/**
 * Record that onboarding is complete. Called from the dashboard guard, which
 * has already read the profile row and both intro flags.
 */
export function markOnboarded(userId: string): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    localStorage.setItem(`${ONBOARDED_PREFIX}${userId}`, "1");
  } catch {
    // Storage blocked. The cost is a prompt that never fires, not a wrong one.
  }
}

/** Whether onboarding finished. Absent means no — silence is the safe default. */
export function isOnboarded(userId: string): boolean {
  if (typeof window === "undefined" || !userId) return false;
  try {
    return localStorage.getItem(`${ONBOARDED_PREFIX}${userId}`) === "1";
  } catch {
    return false;
  }
}

/** Read primer state from localStorage. */
export function getPrimerState(userId: string): PrimerState {
  if (typeof window === "undefined" || !userId) return { ...DEFAULT_STATE };

  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw) {
      // Field-by-field rather than a bare cast. A blob from an older build, or
      // a truncated one, otherwise yields undefined counters and NaN day
      // arithmetic — which would re-prompt someone who already answered.
      const p = JSON.parse(raw) as Partial<PrimerState>;
      return {
        foodLogsCount: Number.isFinite(p.foodLogsCount)
          ? Number(p.foodLogsCount)
          : 0,
        workoutLogsCount: Number.isFinite(p.workoutLogsCount)
          ? Number(p.workoutLogsCount)
          : 0,
        trigger1Handled: p.trigger1Handled === true,
        trigger2Handled: p.trigger2Handled === true,
        lastDismissedAt:
          typeof p.lastDismissedAt === "string" ? p.lastDismissedAt : null,
        granted: p.granted === true,
      };
    }
  } catch {
    // Ignore parse errors or blocked storage
  }

  return { ...DEFAULT_STATE };
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
 * Trigger 1: the user's first log of anything, once onboarding is done.
 *
 * `trigger1Handled` is set before the dialog opens, on purpose. Someone who
 * swipes it away, force-quits, or answers the OS dialog with "don't allow" has
 * answered; asking again on their next meal is exactly the noise this engine
 * exists to prevent. Day 5 is the only second chance.
 */
function recordEngagementLog(
  userId: string,
  kind: "food" | "workout",
): boolean {
  if (!userId || !isOnboarded(userId)) return false;
  const state = getPrimerState(userId);
  if (state.granted || state.trigger1Handled) return false;

  if (kind === "food") state.foodLogsCount += 1;
  else state.workoutLogsCount += 1;
  state.trigger1Handled = true;
  savePrimerState(userId, state);

  openPrimerDialog("engagement");
  return true;
}

/** Record a food log. The first one opens the primer, once ever. */
export function recordFoodLog(userId: string): boolean {
  return recordEngagementLog(userId, "food");
}

/** Record a workout log. The first one opens the primer, once ever. */
export function recordWorkoutLog(userId: string): boolean {
  return recordEngagementLog(userId, "workout");
}

/**
 * Check if the user is eligible for Trigger 2 (Day 5+ app open).
 * Conditions:
 * 1. Onboarding is finished
 * 2. Not already granted
 * 3. Trigger 2 has not been handled yet
 * 4. At least 5 calendar days since account creation
 * 5. At least 48 hours since Trigger 1 was dismissed (if dismissed)
 */
export function checkDay5Eligible(
  userId: string,
  accountCreatedAt: string | Date | null | undefined,
): boolean {
  if (!userId || !accountCreatedAt || !isOnboarded(userId)) return false;
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
