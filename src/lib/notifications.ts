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
 * they do, then picks up at the first quote they missed (see
 * MotivationProgress). Their reminders keep firing regardless, which is the thing most
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
  addDaysToKey,
  motivationAt,
  type MotivationPlan,
  type MotivationUser,
} from "@/lib/motivation";
import { inQuietHours, type QuietHours } from "@/lib/quietHours";

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
/**
 * Snoozed reschedules. Outside the ranges reconcile rebuilds, so cancelAll
 * can leave them alone — otherwise opening the app after a snooze would
 * silently delete it.
 */
export const SNOOZE_ID_BASE = 300_000;
const SNOOZE_ID_END = 400_000;

/** Action type ids registered with the OS. Referenced by scheduled payloads. */
export const SNOOZE_CATEGORY = "SNOOZE_CATEGORY";
export const FINAL_CATEGORY = "FINAL_CATEGORY";

export interface PermissionState {
  granted: boolean;
  /** True when the user has refused and the OS will not ask again. */
  blocked: boolean;
}

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

/**
 * Ask for permission, or report what was already decided.
 *
 * iOS shows its system dialog exactly once per install, ever. After a refusal
 * the only route back is the Settings app, which is why `blocked` is reported
 * separately from a plain absence of permission — the UI has to say different
 * things in those two cases.
 */
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
 * Whether Android will fire our alarms at the exact minute.
 *
 * Android 12+ gates exact alarms behind "Alarms & reminders", and on 13+ it is
 * off by default for new installs. Without it the plugin quietly falls back to
 * an inexact alarm, which Doze can hold back by many minutes — the reminder
 * still arrives, just late. iOS and web have no such switch, so they report
 * true.
 */
export async function exactAlarmAllowed(): Promise<boolean> {
  if (Capacitor.getPlatform() !== "android") return true;
  try {
    const { exact_alarm } =
      await LocalNotifications.checkExactNotificationSetting();
    return exact_alarm === "granted";
  } catch {
    // Older Android without the setting: exact alarms need no permission.
    return true;
  }
}

/** Open Android's "Alarms & reminders" screen for this app. */
export async function openExactAlarmSettings(): Promise<void> {
  if (Capacitor.getPlatform() !== "android") return;
  try {
    await LocalNotifications.changeExactNotificationSetting();
  } catch (e) {
    console.warn(
      "[notifications] could not open exact alarm settings:",
      e instanceof Error ? e.message : String(e),
    );
  }
}

const SNOOZE_LABELS: Record<number, string> = {
  600: "🕒 +10m",
  1800: "🕒 +30m",
  3600: "⏰ +1hr",
};

/**
 * Register the snooze buttons. Called by reconcile with the user's chosen
 * intervals; action ids are `snooze_<seconds>` so the handler reads the
 * duration straight from the id.
 *
 * Two categories rather than one: at the snooze cap the notification is
 * scheduled against FINAL_CATEGORY, which offers only Dismiss. The spec asked
 * for a toast saying "max snoozes reached", but the button lives on the lock
 * screen where the app is usually not running and cannot show anything — so a
 * button that could not work is simply not drawn.
 */
export async function registerActionTypes(
  snoozeIntervals: number[] = [600, 3600],
): Promise<void> {
  if (!isNative()) return;

  await LocalNotifications.registerActionTypes({
    types: [
      {
        id: SNOOZE_CATEGORY,
        actions: [
          ...[...snoozeIntervals]
            .sort((a, b) => a - b)
            .map((s) => ({
              id: `snooze_${s}`,
              title: SNOOZE_LABELS[s] ?? `+${Math.round(s / 60)}m`,
            })),
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

/**
 * Schedule the rolling motivation window from a plan (see planWindow).
 *
 * Slot i fires i days after plan.firstAt at the same wall-clock time, and
 * carries the quote at position plan.start + i. The Date objects are in the
 * *device's* zone, which equals the stored zone because timezone.ts keeps
 * them in step. A user who flies somewhere gets correct local times on their
 * next app open, when this runs again.
 *
 * Returns how many were scheduled, which the caller records as the window's
 * size so the next reconcile knows how far the user got.
 */
export async function scheduleMotivation(
  user: MotivationUser,
  plan: MotivationPlan,
  days: number = MOTIVATION_WINDOW_DAYS,
): Promise<number> {
  if (!isNative()) return 0;

  const notifications: LocalNotificationSchema[] = [];

  for (let i = 0; i < days; i++) {
    const at = new Date(plan.firstAt);
    at.setDate(plan.firstAt.getDate() + i);
    const day = motivationAt(
      user,
      plan.start + i,
      addDaysToKey(plan.firstKey, i),
    );

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
        originalAt: at.toISOString(),
      },
    });
  }

  await LocalNotifications.schedule({ notifications });
  return notifications.length;
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
 *
 * A reminder set inside quiet hours is skipped, not moved: moving piled
 * every evening reminder onto the minute quiet hours end. The settings screen
 * marks those rows "Silenced by quiet hours".
 *
 * Each carries the quiet hours and snooze cap it was scheduled under, so a
 * lock-screen snooze can honour them without a network call.
 */
export async function scheduleReminders(
  reminders: ReminderInput[],
  allowSnooze: boolean,
  quiet: QuietHours,
  maxSnooze: number,
): Promise<number> {
  if (!isNative()) return 0;

  const active = reminders.filter(
    (r) => r.enabled && !inQuietHours(r.remindAt, quiet),
  );
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
      extra: {
        type: "custom_reminder",
        reminderId: r.id,
        snoozeCount: 0,
        // Clock time it fires at, so a snooze or tap can log the real
        // original time of this occurrence rather than the moment of the tap.
        remindAt: r.remindAt.slice(0, 5),
        quiet,
        maxSnooze,
      },
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

/**
 * Cancel everything pending. `keepSnoozes` spares the snooze range: reconcile
 * rebuilds quotes and reminders from the database, but a snooze exists only
 * on the device and would be lost for good. Sign-out cancels everything.
 */
export async function cancelAll({
  keepSnoozes = false,
}: { keepSnoozes?: boolean } = {}): Promise<void> {
  if (!isNative()) return;
  const { notifications } = await LocalNotifications.getPending();
  const doomed = keepSnoozes
    ? notifications.filter(
        (n) => n.id < SNOOZE_ID_BASE || n.id >= SNOOZE_ID_END,
      )
    : notifications;
  if (doomed.length === 0) return;
  await LocalNotifications.cancel({
    notifications: doomed.map((n) => ({ id: n.id })),
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
