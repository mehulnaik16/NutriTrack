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
import { FINAL_CATEGORY, SNOOZE_CATEGORY, isNative } from "@/lib/notifications";
import { loadPrefs } from "@/lib/notification-settings";

/** Action ids registered in registerActionTypes(). */
const SNOOZE_ACTIONS: Record<string, number> = {
  snooze_10m: 10 * 60,
  snooze_1h: 60 * 60,
};

/**
 * Snoozed notifications get their own id range.
 *
 * Reusing the original id would collide with the reconciler, which owns
 * 100000+ and 200000+ and rebuilds them wholesale on every app open — a
 * snoozed reminder would simply vanish at the next foreground.
 */
const SNOOZE_ID_BASE = 300_000;
let snoozeCounter = 0;

const nextSnoozeId = (): number => SNOOZE_ID_BASE + (snoozeCounter++ % 10_000);

interface QuietHours {
  on: boolean;
  from: string;
  to: string;
}

/**
 * Push a time out of quiet hours, if it landed inside them.
 *
 * Spec §3.2: a snooze that would fire at 22:30 inside a 22:00–06:00 window
 * moves to 06:01. Returns the original when quiet hours are off or the time is
 * already outside, so the caller can tell whether an override happened.
 *
 * Only reminders reach this. Morning motivation is exempt by construction —
 * it carries no snooze actions at all, because the time it arrives is the
 * entire point of it.
 */
export function applyQuietHours(
  at: Date,
  quiet: QuietHours,
): { at: Date; overridden: boolean } {
  if (!quiet.on) return { at, overridden: false };

  const [fromH, fromM] = quiet.from.split(":").map(Number);
  const [toH, toM] = quiet.to.split(":").map(Number);
  const minutes = at.getHours() * 60 + at.getMinutes();
  const fromMin = fromH * 60 + fromM;
  const toMin = toH * 60 + toM;

  // The window normally wraps midnight (22:00 → 06:00), so "inside" is two
  // ranges rather than one. A non-wrapping window (09:00 → 17:00) is a single
  // range, and someone will eventually configure one.
  const wraps = fromMin > toMin;
  const inside = wraps
    ? minutes >= fromMin || minutes < toMin
    : minutes >= fromMin && minutes < toMin;

  if (!inside) return { at, overridden: false };

  const out = new Date(at);
  out.setHours(toH, toM + 1, 0, 0);
  // Crossing midnight into the morning means the end of the window is tomorrow.
  if (out.getTime() <= at.getTime()) out.setDate(out.getDate() + 1);
  return { at: out, overridden: true };
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
      const seconds = SNOOZE_ACTIONS[event.actionId];
      const extra = (event.notification.extra ?? {}) as Record<string, unknown>;

      // "dismiss", or the body tapped to open the app. Record and stop.
      if (!seconds) {
        await log(userId, {
          type: (extra.type as string) ?? "custom_reminder",
          original_scheduled_at: new Date().toISOString(),
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
            extra: { ...extra, snoozeCount: count },
          },
        ],
      });

      await log(userId, {
        type: (extra.type as string) ?? "custom_reminder",
        reminder_id: (extra.reminderId as string) ?? null,
        original_scheduled_at: new Date().toISOString(),
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
