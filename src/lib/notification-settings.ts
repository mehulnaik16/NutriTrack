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
import {
  motivationAt,
  planWindow,
  resumePosition,
  type MotivationDay,
  type MotivationProgress,
  type MotivationUser,
} from "@/lib/motivation";

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

/** Matches the CHECK constraints on custom_reminders. */
export const LABEL_MAX = 20;
export const NOTE_MAX = 40;
export const REMINDER_MAX = 10;

/**
 * Create a reminder.
 *
 * The 10-per-user cap lives in a BEFORE INSERT trigger, not here — RLS lets the
 * client insert directly, so the UI is not a trust boundary. This translates
 * the trigger's exception into something a person can read; the constraint
 * itself stays in the database where it cannot be bypassed.
 */
export async function addReminder(
  userId: string,
  reminder: { label: string; remindAt: string; note?: string | null },
  sortOrder: number,
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from("custom_reminders")
    .insert({
      user_id: userId,
      label: reminder.label.slice(0, LABEL_MAX),
      note: reminder.note?.trim() ? reminder.note.slice(0, NOTE_MAX) : null,
      remind_at: reminder.remindAt,
      sort_order: sortOrder,
    })
    .select("id")
    .single();

  if (error) {
    const friendly = error.message.includes("Reminder limit reached")
      ? `You can have up to ${REMINDER_MAX} reminders.`
      : error.message;
    return { id: null, error: friendly };
  }
  return { id: data.id, error: null };
}

export async function updateReminder(
  id: string,
  patch: Partial<{
    label: string;
    note: string | null;
    remindAt: string;
    enabled: boolean;
  }>,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("custom_reminders")
    .update({
      ...(patch.label !== undefined
        ? { label: patch.label.slice(0, LABEL_MAX) }
        : {}),
      ...(patch.note !== undefined
        ? { note: patch.note?.trim() ? patch.note.slice(0, NOTE_MAX) : null }
        : {}),
      ...(patch.remindAt !== undefined ? { remind_at: patch.remindAt } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    })
    .eq("id", id);
  return { error: error?.message ?? null };
}

export async function deleteReminder(
  id: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("custom_reminders")
    .delete()
    .eq("id", id);
  return { error: error?.message ?? null };
}

// ── Motivation progress ──────────────────────────────────────────────────────

/**
 * The last scheduled window. Kept out of NotificationPrefs on purpose: the
 * settings screen upserts its whole prefs object, and a stale copy of these
 * columns riding along would rewind the user's place in the cycle.
 *
 * Throws on a read error rather than returning "never recorded", which would
 * fall back to the calendar position and then save it — jumping the user.
 */
async function loadProgress(userId: string): Promise<MotivationProgress> {
  const { data, error } = await supabase
    .from("user_notification_preferences")
    .select("motivation_next_index, motivation_next_at, motivation_scheduled")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`load progress: ${error.message}`);
  return {
    nextIndex: data?.motivation_next_index ?? null,
    nextAt: data?.motivation_next_at ?? null,
    scheduled: data?.motivation_scheduled ?? 0,
  };
}

/**
 * Record the window just scheduled.
 *
 * Best effort: if this fails, the previous record still describes alarms that
 * fired, so the next reconcile resumes from the same place anyway.
 */
async function saveProgress(
  userId: string,
  p: MotivationProgress,
): Promise<void> {
  const { error } = await supabase.from("user_notification_preferences").upsert(
    {
      user_id: userId,
      motivation_next_index: p.nextIndex,
      motivation_next_at: p.nextAt,
      motivation_scheduled: p.scheduled,
    },
    { onConflict: "user_id" },
  );
  if (error)
    console.warn("[reconcile] could not save progress:", error.message);
}

/** The quote the user will get next, for the settings screen. */
export async function nextMotivation(
  user: MotivationUser,
  morningTime: string,
): Promise<MotivationDay> {
  const plan = planWindow(
    user,
    morningTime,
    resumePosition(await loadProgress(user.id)),
  );
  return motivationAt(user, plan.start, plan.firstKey);
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

    const [prefs, reminders, progress] = await Promise.all([
      loadPrefs(user.id),
      loadReminders(user.id),
      loadProgress(user.id),
    ]);

    await registerActionTypes(prefs.snooze_intervals);
    // Pending snoozes live only on the device, so they survive the rebuild —
    // unless reminders were switched off, in which case they should stop too.
    await cancelAll({ keepSnoozes: prefs.custom_enabled });

    // Where the cycle stands: the first quote that has not fired yet. With
    // morning quotes off the window is recorded as empty, so the position
    // freezes until they are switched back on.
    const plan = planWindow(user, prefs.morning_time, resumePosition(progress));
    const motivation = prefs.morning_enabled
      ? await scheduleMotivation(user, plan)
      : 0;
    await saveProgress(user.id, {
      nextIndex: plan.start,
      nextAt: motivation > 0 ? plan.firstAt.toISOString() : null,
      scheduled: motivation,
    });

    const scheduledReminders = prefs.custom_enabled
      ? await scheduleReminders(reminders, prefs.allow_snooze, {
          on: prefs.quiet_hours_on,
          from: prefs.quiet_from,
          to: prefs.quiet_to,
        })
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
