/**
 * Notification Pre-Permission Primer Engine.
 *
 * At most two prompts per ACCOUNT, ever, and never before onboarding is done:
 *   - First log: right after the user's very first food, workout or weight
 *     log. A user who already had logs before this rule existed is never
 *     asked by it.
 *   - Day 5: the first app open 5+ days after joining (and 48h+ after a "Not
 *     now" on this device).
 *
 * Whether each prompt has been used lives on the account
 * (user_profiles.notif_primer_first_log_shown / notif_primer_day5_shown,
 * migration 20261007190000). It used to live in each browser's localStorage,
 * so every new device or cleared storage started over and the card looked
 * random. A flag is set BEFORE the card opens: someone who swipes it away or
 * force-quits has still had their turn. If the flag can't be saved, the card
 * doesn't open — better silent than repeated.
 *
 * Per-device facts stay in localStorage: "onboarded on this device" (stamped
 * by the dashboard guard), "granted here", and the last "Not now".
 * When the user taps "Not now", the native OS prompt is NOT invoked, which
 * preserves iOS's single-shot system permission dialog.
 */
import { supabase } from "@/integrations/client";
import { getProfileRow } from "@/lib/historyCache";
import { day5Due, isFirstEverLog } from "@/lib/primerRules";

export interface PrimerState {
  lastDismissedAt: string | null;
  granted: boolean;
}

const STORAGE_PREFIX = "dombelz_notif_primer_";
const ONBOARDED_PREFIX = "dombelz_onboarded_";

export const PRIMER_EVENT_NAME = "dombelz:open-notification-primer";

export interface PrimerEventDetail {
  trigger: "engagement" | "day5";
}

/** Logs older than this already existed before the current logging session. */
const SESSION_MS = 10 * 60_000;

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

/** This device's primer state (granted here, last "Not now"). */
export function getPrimerState(userId: string): PrimerState {
  const empty = { lastDismissedAt: null, granted: false };
  if (typeof window === "undefined" || !userId) return empty;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (!raw) return empty;
    // Field by field: blobs from older builds carry other fields.
    const p = JSON.parse(raw) as Partial<PrimerState>;
    return {
      lastDismissedAt:
        typeof p.lastDismissedAt === "string" ? p.lastDismissedAt : null,
      granted: p.granted === true,
    };
  } catch {
    return empty;
  }
}

function savePrimerState(userId: string, patch: Partial<PrimerState>): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    localStorage.setItem(
      `${STORAGE_PREFIX}${userId}`,
      JSON.stringify({ ...getPrimerState(userId), ...patch }),
    );
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

// ── Account-backed triggers ──────────────────────────────────────────────────

/** Mark a prompt as used on the account. False if it couldn't be saved. */
async function claim(
  userId: string,
  flag: "notif_primer_first_log_shown" | "notif_primer_day5_shown",
): Promise<boolean> {
  const { error } = await supabase
    .from("user_profiles")
    .update(
      flag === "notif_primer_first_log_shown"
        ? { notif_primer_first_log_shown: true }
        : { notif_primer_day5_shown: true },
    )
    .eq("id", userId);
  return !error;
}

let firstLogBusy = false;

/**
 * Call after any successful food, workout or weight log. Opens the primer if
 * this is the account's first-ever logging session; either way the first-log
 * prompt is then used up for good.
 */
async function afterLog(userId: string): Promise<void> {
  if (!userId || !isOnboarded(userId) || getPrimerState(userId).granted) return;
  if (firstLogBusy) return; // several items saved at once: decide once
  firstLogBusy = true;
  try {
    const { data: p, error } = await getProfileRow(userId);
    if (error || !p || p.notif_primer_first_log_shown) return;

    // Logs from before this session = the user had logged before.
    const before = new Date(Date.now() - SESSION_MS).toISOString();
    const counts = await Promise.all([
      supabase
        .from("food_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .lt("logged_at", before),
      supabase
        .from("workout_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .lt("logged_at", before),
      supabase
        .from("weight_entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .lt("created_at", before),
    ]);
    if (counts.some((c) => c.error)) return; // unknown: decide on a later log
    const older = counts.reduce((n, c) => n + (c.count ?? 0), 0);

    if (!(await claim(userId, "notif_primer_first_log_shown"))) return;
    if (isFirstEverLog(older)) openPrimerDialog("engagement");
  } finally {
    firstLogBusy = false;
  }
}

export const recordFoodLog = (userId: string) => void afterLog(userId);
export const recordWorkoutLog = (userId: string) => void afterLog(userId);
export const recordWeightLog = (userId: string) => void afterLog(userId);

/** On app open: the one day-5 prompt, if it's due and unused. */
export async function promptDay5IfDue(userId: string): Promise<void> {
  if (!userId || !isOnboarded(userId)) return;
  const local = getPrimerState(userId);
  if (local.granted) return;
  const { data: p, error } = await getProfileRow(userId);
  if (error || !p || p.notif_primer_day5_shown) return;
  if (!day5Due(p.created_at, Date.now(), local.lastDismissedAt)) return;
  if (!(await claim(userId, "notif_primer_day5_shown"))) return;
  openPrimerDialog("day5");
}

/** User clicked "Not now" — closes without calling native OS prompt. */
export function dismissPrimer(userId: string): void {
  if (userId)
    savePrimerState(userId, { lastDismissedAt: new Date().toISOString() });
}

/** User granted notifications on this device. */
export function markPrimerGranted(userId: string): void {
  if (userId) savePrimerState(userId, { granted: true });
}
