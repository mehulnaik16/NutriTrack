/**
 * Reading and writing notification preferences, and the reconcile that turns
 * them into scheduled alarms.
 *
 * The split matters: this module owns the *intent* (what the user asked for,
 * stored in Supabase so it survives a reinstall and follows them to a new
 * phone), while src/lib/notifications.ts owns the *mechanism* (handing alarms
 * to the OS). Reconcile is the only thing that crosses between them, and it
 * runs one way — database to device, full rebuild, never the reverse.
 */

import { supabase } from "@/integrations/client";
import {
  cancelAll,
  checkPermissionState,
  isNative,
  registerActionTypes,
  scheduleMotivation,
  scheduleReminders,
  type ReminderInput,
} from "@/lib/notifications";
import type { MotivationUser } from "@/lib/motivation";

/**
 * What the app assumes before the user has ever opened settings.
 *
 * Mirrors the column defaults in 20260905120000_notification_foundations.sql.
 * Duplicated deliberately: an absent row is a real state — it means "never
 * configured" — and the UI has to render something sensible without writing a
 * row just to read one.
 */
export const DEFAULT_PREFS = {
  morning_enabled: true,
  morning_time: "07:00",
  custom_enabled: true,
  allow_snooze: true,
  max_snooze_cycles: 3,
  snooze_intervals: [600, 3600] as number[],
  quiet_hours_on: false,
  quiet_from: "22:00",
  quiet_to: "06:00",
};

export type NotificationPrefs = typeof DEFAULT_PREFS;

/** "HH:MM:SS" from Postgres, "HH:MM" in the UI and the scheduler. */
const toHHMM = (t: string): string => t.slice(0, 5);

export async function loadPrefs(userId: string): Promise<NotificationPrefs> {
  const { data, error } = await supabase
    .from("user_notification_preferences")
    .select(
      "morning_enabled, morning_time, custom_enabled, allow_snooze, max_snooze_cycles, snooze_intervals, quiet_hours_on, quiet_from, quiet_to",
    )
    .eq("user_id", userId)
    .maybeSingle();

  // An error here is a real failure, but defaults are still the right answer to
  // render — the alternative is a settings screen that shows nothing.
  if (error || !data) return { ...DEFAULT_PREFS };

  return {
    ...DEFAULT_PREFS,
    ...data,
    morning_time: toHHMM(data.morning_time),
    quiet_from: toHHMM(data.quiet_from),
    quiet_to: toHHMM(data.quiet_to),
  };
}

/**
 * Upsert the whole preference row.
 *
 * Whole-row rather than per-field: the settings screen holds all of it in state
 * anyway, and a partial update racing another partial update is a class of bug
 * worth not having for a row this small.
 */
export async function savePrefs(
  userId: string,
  prefs: NotificationPrefs,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("user_notification_preferences")
    .upsert(
      { user_id: userId, ...prefs, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  return { error: error?.message ?? null };
}

export interface Reminder extends ReminderInput {
  sortOrder: number;
}

export async function loadReminders(userId: string): Promise<Reminder[]> {
  const { data, error } = await supabase
    .from("custom_reminders")
    .select("id, label, note, remind_at, enabled, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    label: r.label,
    note: r.note,
    remindAt: toHHMM(r.remind_at),
    enabled: r.enabled,
    sortOrder: r.sort_order,
  }));
}

// ── Reconcile ────────────────────────────────────────────────────────────────

export interface ReconcileResult {
  ran: boolean;
  /** Why it did not run, when it did not. */
  reason?: string;
  motivation: number;
  reminders: number;
}

/**
 * Rebuild everything the OS has pending, from the database.
 *
 * Called on app foreground and after any settings change. Always a full
 * teardown and rebuild rather than a diff: the OS is the only thing that knows
 * what survived a reboot, an OS update or a force-quit, and it does not
 * reliably say. Rebuilding is cheap, idempotent, and has one code path instead
 * of a dozen edge cases.
 *
 * Never throws. A settings screen that cannot save is a bug worth surfacing;
 * a reconcile that fails on app open should not stop the app opening.
 */
export async function reconcile(
  user: MotivationUser,
): Promise<ReconcileResult> {
  const empty = { motivation: 0, reminders: 0 };

  if (!isNative()) {
    return { ran: false, reason: "not the native app", ...empty };
  }

  try {
    // checkPermissionState, not requestPermission — this reads, it does not
    // ask. Reconcile runs on every app open, and an OS permission dialog
    // appearing unbidden at launch is how an app trains people to deny it. On
    // iOS that dialog is also one-shot: spend it on a cold launch and there is
    // no second chance. The settings screen asks instead, at the moment the
    // user turns something on and the request makes sense to them.
    const permission = await checkPermissionState();
    if (permission !== "granted") {
      return { ran: false, reason: `permission ${permission}`, ...empty };
    }

    const [prefs, reminders] = await Promise.all([
      loadPrefs(user.id),
      loadReminders(user.id),
    ]);

    await registerActionTypes();
    await cancelAll();

    const motivation = prefs.morning_enabled
      ? (await scheduleMotivation(user, prefs.morning_time)).scheduled
      : 0;

    const scheduledReminders = prefs.custom_enabled
      ? await scheduleReminders(reminders, prefs.allow_snooze)
      : 0;

    return { ran: true, motivation, reminders: scheduledReminders };
  } catch (e) {
    return {
      ran: false,
      reason: e instanceof Error ? e.message : String(e),
      ...empty,
    };
  }
}
