/**
 * On-device notification scheduling.
 *
 * The whole feature runs through @capacitor/local-notifications: the app reads
 * preferences from Supabase, cancels everything pending, and hands the OS the
 * current set. No server, no queue, no push credentials — the OS fires the
 * alarms even with the app closed and the device offline.
 *
 * THE 64-SLOT BUDGET shapes every decision here. iOS allows 64 pending local
 * notifications per app, total, not per day:
 *
 *   - Custom reminders repeat daily at a fixed time, so each costs ONE slot
 *     ({ on: { hour, minute }, repeats: true }) rather than one per day. Ten
 *     reminders, ten slots.
 *   - Morning motivation needs different body text each day, so it cannot be a
 *     single repeating alarm. It gets a rolling MOTIVATION_WINDOW_DAYS window,
 *     refilled on every app foreground.
 *
 * A user who does not open the app for a month stops receiving quotes until
 * they do. Their reminders keep firing regardless, which is the thing most
 * likely to bring them back. That is the honest cost of not running a server.
 *
 * RECONCILIATION IS A FULL REBUILD. cancelAll() then reschedule, every time.
 * The OS is the only thing that knows what actually survived a reboot, an OS
 * update or a force-quit, and it does not reliably say — so diffing pending
 * state against intended state is guesswork with a dozen edge cases, while a
 * rebuild is cheap and has one code path.
 */

import { Capacitor } from "@capacitor/core";
import {
  LocalNotifications,
  type LocalNotificationSchema,
} from "@capacitor/local-notifications";
import { quoteBody } from "@/data/motivationQuotes";
import {
  CYCLE_LENGTH,
  MOTIVATION_WINDOW_DAYS,
  motivationWindow,
  type MotivationUser,
} from "@/lib/motivation";

/** Web builds have no plugin. Everything here no-ops rather than throwing. */
export const isNative = (): boolean => Capacitor.isNativePlatform();

/**
 * Notification id ranges, kept apart so one kind can be cancelled without
 * touching the other once partial rescheduling is ever needed.
 *
 * Ids must be 32-bit integers: Android stores them as int, and a larger value
 * silently truncates into another notification's id.
 */
const MOTIVATION_ID_BASE = 100_000;
const REMINDER_ID_BASE = 200_000;

/** Action type ids registered with the OS. Referenced by scheduled payloads. */
export const SNOOZE_CATEGORY = "SNOOZE_CATEGORY";
export const FINAL_CATEGORY = "FINAL_CATEGORY";

export interface PermissionState {
  granted: boolean;
  /** True when the user has refused and the OS will not ask again. */
  blocked: boolean;
}

/**
 * Ask for permission, or report what was already decided.
 *
 * iOS shows its system dialog exactly once per install, ever. After a refusal
 * the only route back is the Settings app, which is why `blocked` is reported
 * separately from a plain absence of permission — the UI has to say different
 * things in those two cases.
 */
/**
 * The OS permission state, without asking for anything.
 *
 * Separate from requestPermission because a diagnostic that changes what it is
 * measuring is not a diagnostic.
 */
export async function checkPermissionState(): Promise<string> {
  if (!isNative()) return "not native";
  try {
    const { display } = await LocalNotifications.checkPermissions();
    return display;
  } catch (e) {
    return `check failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export async function requestPermission(): Promise<PermissionState> {
  if (!isNative()) return { granted: false, blocked: false };

  const current = await LocalNotifications.checkPermissions();
  if (current.display === "granted") return { granted: true, blocked: false };
  if (current.display === "denied") return { granted: false, blocked: true };

  const asked = await LocalNotifications.requestPermissions();
  return {
    granted: asked.display === "granted",
    blocked: asked.display === "denied",
  };
}

/**
 * Send the user to the OS screen where notifications can be turned back on.
 *
 * Needed because a refusal is often final. iOS shows its permission dialog
 * exactly once per install; Android 13+ stops asking after two dismissals. In
 * both cases requestPermission() then returns "denied" immediately and nothing
 * the app does will produce a prompt again — so an app that keeps offering a
 * toggle which silently fails is worse than one that says "this is switched
 * off, here is where to switch it on".
 *
 * Android gets the per-app notification screen directly. iOS has no equivalent
 * deep link and can only open the app's own settings page, which is one tap
 * away from notifications; that is as close as the platform allows.
 *
 * Returns whether the screen actually opened, so the caller can fall back to
 * telling the user the path in words rather than claiming something happened.
 */
export async function openNotificationSettings(): Promise<boolean> {
  if (!isNative()) return false;

  try {
    const { AppLauncher } = await import("@capacitor/app-launcher");

    if (Capacitor.getPlatform() === "android") {
      // The documented Intent-to-URL form. APP_NOTIFICATION_SETTINGS lands on
      // the notification screen for this package specifically, rather than the
      // general settings app where the user has to go hunting.
      const pkg = "app.dombelz.mobile";
      const intent =
        `intent:#Intent;action=android.settings.APP_NOTIFICATION_SETTINGS;` +
        `S.android.provider.extra.APP_PACKAGE=${pkg};end`;
      const { completed } = await AppLauncher.openUrl({ url: intent });
      if (completed) return true;

      // Fall back to the app's own settings page. Less direct, but every
      // Android version has it, and OEM skins occasionally reject the first.
      const { completed: viaApp } = await AppLauncher.openUrl({
        url: `package:${pkg}`,
      });
      return viaApp;
    }

    const { completed } = await AppLauncher.openUrl({ url: "app-settings:" });
    return completed;
  } catch (e) {
    console.warn(
      "[notifications] could not open settings:",
      e instanceof Error ? e.message : String(e),
    );
    return false;
  }
}

/**
 * Register the snooze buttons once per app start.
 *
 * Two categories rather than one: at the snooze cap the notification is
 * scheduled against FINAL_CATEGORY, which offers only Dismiss. The spec asked
 * for a toast saying "max snoozes reached", but the button lives on the lock
 * screen where the app is usually not running and cannot show anything — so a
 * button that could not work is simply not drawn.
 */
export async function registerActionTypes(): Promise<void> {
  if (!isNative()) return;

  await LocalNotifications.registerActionTypes({
    types: [
      {
        id: SNOOZE_CATEGORY,
        actions: [
          { id: "snooze_10m", title: "🕒 +10m" },
          { id: "snooze_1h", title: "⏰ +1hr" },
          { id: "dismiss", title: "✖️", destructive: true },
        ],
      },
      {
        id: FINAL_CATEGORY,
        actions: [{ id: "dismiss", title: "✖️", destructive: true }],
      },
    ],
  });
}

/** Local wall-clock Date for a "YYYY-MM-DD" key at a given hour and minute. */
function atLocalTime(dateKey: string, hour: number, minute: number): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0);
}

export interface ScheduleResult {
  scheduled: number;
  skippedPast: number;
}

/**
 * Schedule the rolling motivation window.
 *
 * `morningTime` is "HH:MM" in the user's own zone — and the Date objects built
 * here are in the *device's* zone, which is the same thing precisely because
 * timezone.ts keeps the stored zone in step with the device. A user who flies
 * somewhere gets correct local times on their next app open, when this runs
 * again.
 */
export async function scheduleMotivation(
  user: MotivationUser,
  morningTime: string,
  days: number = MOTIVATION_WINDOW_DAYS,
): Promise<ScheduleResult> {
  if (!isNative()) return { scheduled: 0, skippedPast: 0 };

  const [hour, minute] = morningTime.split(":").map(Number);
  const now = Date.now();
  const notifications: LocalNotificationSchema[] = [];
  let skippedPast = 0;

  motivationWindow(user, days).forEach((day, i) => {
    const at = atLocalTime(day.date, hour, minute);
    // Today's slot is usually already past by the time the app is opened.
    // Scheduling it would fire immediately, which reads as a bug.
    if (at.getTime() <= now) {
      skippedPast++;
      return;
    }

    notifications.push({
      id: MOTIVATION_ID_BASE + i,
      title: `☀️ Day ${day.dayNumber} — Rise & Shine`,
      body: quoteBody(day.quote),
      // largeBody is what makes the notification expandable on Android: the
      // plugin only attaches BigTextStyle when it is set, and without it the
      // shade shows a single truncated line with no way to read the rest. The
      // longest quote plus its author runs past what one line holds, and the
      // author is the part that falls off the end — which is the whole reason
      // it is there. Same string in both: collapsed shows as much as fits,
      // expanded shows all of it.
      largeBody: quoteBody(day.quote),
      summaryText: `Day ${day.dayNumber} of ${CYCLE_LENGTH}`,
      schedule: { at, allowWhileIdle: true },
      // Morning motivation carries no snooze actions: snoozing a quote by ten
      // minutes means nothing, and the buttons would be noise on the one
      // notification whose entire value is the time it arrives.
      extra: {
        type: "morning_motivation",
        day: day.dayNumber,
        quoteId: day.quote.id,
      },
    });
  });

  await LocalNotifications.schedule({ notifications });
  return { scheduled: notifications.length, skippedPast };
}

export interface ReminderInput {
  id: string;
  label: string;
  note: string | null;
  /** "HH:MM" or "HH:MM:SS" local time. */
  remindAt: string;
  enabled: boolean;
}

/**
 * Schedule custom reminders as daily repeats.
 *
 * One slot each regardless of how long they run, which is what leaves room for
 * the motivation window inside the 64.
 */
export async function scheduleReminders(
  reminders: ReminderInput[],
  allowSnooze: boolean,
): Promise<number> {
  if (!isNative()) return 0;

  const active = reminders.filter((r) => r.enabled);
  const notifications: LocalNotificationSchema[] = active.map((r, i) => {
    const [hour, minute] = r.remindAt.split(":").map(Number);
    // Spec §9.3: a blank note becomes a sentence built from the label rather
    // than an empty body.
    const body =
      r.note?.trim() || `Time for ${r.label.toLowerCase()}! Log it now.`;
    return {
      id: REMINDER_ID_BASE + i,
      title: `⏰ ${r.label}`,
      body,
      largeBody: body,
      schedule: { on: { hour, minute }, allowWhileIdle: true },
      actionTypeId: allowSnooze ? SNOOZE_CATEGORY : FINAL_CATEGORY,
      extra: { type: "custom_reminder", reminderId: r.id, snoozeCount: 0 },
    };
  });

  await LocalNotifications.schedule({ notifications });
  return notifications.length;
}

/** Everything currently handed to the OS. Used by the debug page. */
export async function pending(): Promise<LocalNotificationSchema[]> {
  if (!isNative()) return [];
  const { notifications } = await LocalNotifications.getPending();
  return notifications;
}

export async function cancelAll(): Promise<void> {
  if (!isNative()) return;
  const { notifications } = await LocalNotifications.getPending();
  if (notifications.length === 0) return;
  await LocalNotifications.cancel({
    notifications: notifications.map((n) => ({ id: n.id })),
  });
}

/**
 * Schedule one notification a few seconds out.
 *
 * Exists because waiting until 07:00 to find out whether the plugin works is
 * not a test. Proves permission, scheduling, delivery and the action buttons in
 * under a minute, with the app closed.
 */
export async function scheduleTestNotification(
  secondsFromNow = 15,
): Promise<number> {
  if (!isNative()) return 0;
  const id = 999_999;
  await LocalNotifications.schedule({
    notifications: [
      {
        id,
        title: "⏰ Test reminder",
        body: "If you can read this on the lock screen, scheduling works.",
        schedule: {
          at: new Date(Date.now() + secondsFromNow * 1000),
          allowWhileIdle: true,
        },
        actionTypeId: SNOOZE_CATEGORY,
        extra: { type: "custom_reminder", test: true, snoozeCount: 0 },
      },
    ],
  });
  return id;
}
