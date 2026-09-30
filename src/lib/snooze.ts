/**
 * The snooze state machine.
 *
 * A tap on "+10m" or "+1hr" happens on the lock screen, usually with the app
 * closed. Android and iOS both launch or resume the app to deliver the action,
 * so this JS runs — but only for as long as the OS keeps the process alive.
 * Everything here is therefore short and does its own work first: reschedule,
 * then record. A log row that never gets written is a lost statistic; an alarm
 * that never gets rescheduled is a broken promise.
 *
 * WHY THE COUNT LIVES IN THE NOTIFICATION. Each scheduled notification carries
 * its own snoozeCount in `extra`, and the reschedule copies it forward plus
 * one. Reading it from the database instead would mean a network round trip on
 * a process the OS may kill at any moment, and would be wrong anyway if the
 * device were offline — which is exactly when a lock-screen tap is most likely.
 * Supabase is updated afterwards, best effort, for reporting.
 */

import { LocalNotifications } from "@capacitor/local-notifications";
import { supabase } from "@/integrations/client";
import {
  FINAL_CATEGORY,
  SNOOZE_CATEGORY,
  SNOOZE_ID_BASE,
  isNative,
} from "@/lib/notifications";
import { applyQuietHours } from "@/lib/quietHours";
import { loadPrefs } from "@/lib/notification-settings";

/** Action ids are `snooze_<seconds>` (see registerActionTypes). */
const snoozeSeconds = (actionId: string): number => {
  const m = /^snooze_(\d+)$/.exec(actionId);
  return m ? Number(m[1]) : 0;
};

/**
 * Snoozed notifications get their own id range, which reconcile leaves alone.
 *
 * Derived from the clock rather than an in-memory counter: the counter reset
 * to zero on every launch, so a second snooze after a restart reused the first
 * one's id and silently replaced it. Seconds mod 100000 only repeats after
 * ~28 hours, far longer than any snooze waits.
 */
const nextSnoozeId = (): number =>
  SNOOZE_ID_BASE + (Math.floor(Date.now() / 1000) % 100_000);

/**
 * When this occurrence was originally due, for the log.
 *
 * Quotes carry it; a daily reminder carries its clock time, so the occurrence
 * is today at that time — or yesterday, if that is still ahead (a tap just
 * after midnight on last night's reminder). Falls back to now.
 */
function originalAt(extra: Record<string, unknown>): string {
  if (typeof extra.originalAt === "string") return extra.originalAt;
  if (typeof extra.remindAt === "string") {
    const [h, m] = extra.remindAt.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1);
    return d.toISOString();
  }
  return new Date().toISOString();
}

/** Best-effort record of what happened. Never blocks the reschedule. */
async function log(
  userId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from("notification_logs").insert({
      user_id: userId,
      ...fields,
    } as never);
  } catch {
    /* reporting is not worth failing a snooze over */
  }
}

/**
 * Wire up the action listeners. Call once, after registerActionTypes().
 *
 * Returns a teardown so a signed-out user's handlers do not keep running
 * against a stale id.
 */
export async function registerSnoozeHandlers(
  userId: string,
  onForeground?: (title: string, body: string) => void,
): Promise<() => void> {
  if (!isNative()) return () => {};

  const actionListener = await LocalNotifications.addListener(
    "localNotificationActionPerformed",
    async (event) => {
      const seconds = snoozeSeconds(event.actionId);
      const extra = (event.notification.extra ?? {}) as Record<string, unknown>;
      // Pinned on the first snooze and carried forward, so the log keeps the
      // time this was first due however many times it is snoozed.
      const firstDue = originalAt(extra);

      // "dismiss", or the body tapped to open the app. Record and stop.
      if (!seconds) {
        await log(userId, {
          type: (extra.type as string) ?? "custom_reminder",
          reminder_id: (extra.reminderId as string) ?? null,
          original_scheduled_at: firstDue,
          current_scheduled_at: new Date().toISOString(),
          status: event.actionId === "dismiss" ? "dismissed" : "opened",
          last_action_at: new Date().toISOString(),
        });
        return;
      }

      const prefs = await loadPrefs(userId);
      const count = Number(extra.snoozeCount ?? 0) + 1;

      // At the cap the reschedule still happens — the user asked for it — but
      // against FINAL_CATEGORY, so the next notification offers only Dismiss.
      // The spec wanted a toast saying "max snoozes reached"; that cannot work
      // from a lock screen with the app closed, so a button that would not
      // function is simply not drawn.
      const atCap = count >= prefs.max_snooze_cycles;

      const raw = new Date(Date.now() + seconds * 1000);
      const { at, overridden } = applyQuietHours(raw, {
        on: prefs.quiet_hours_on,
        from: prefs.quiet_from,
        to: prefs.quiet_to,
      });

      await LocalNotifications.schedule({
        notifications: [
          {
            id: nextSnoozeId(),
            title: event.notification.title ?? "⏰ Reminder",
            body: event.notification.body ?? "",
            schedule: { at, allowWhileIdle: true },
            actionTypeId: atCap ? FINAL_CATEGORY : SNOOZE_CATEGORY,
            extra: { ...extra, snoozeCount: count, originalAt: firstDue },
          },
        ],
      });

      await log(userId, {
        type: (extra.type as string) ?? "custom_reminder",
        reminder_id: (extra.reminderId as string) ?? null,
        original_scheduled_at: firstDue,
        current_scheduled_at: at.toISOString(),
        snooze_count: count,
        max_snooze_allowed: prefs.max_snooze_cycles,
        status: "snoozed",
        quiet_hours_override: overridden,
        last_action_at: new Date().toISOString(),
      });
    },
  );

  // Fired instead of a system notification when the app is already open. The
  // OS shows nothing in that case, so without this the reminder is silently
  // swallowed for anyone who happens to be using the app at the time.
  const receivedListener = await LocalNotifications.addListener(
    "localNotificationReceived",
    (n) => onForeground?.(n.title ?? "Reminder", n.body ?? ""),
  );

  return () => {
    void actionListener.remove();
    void receivedListener.remove();
  };
}
