/**
 * Rebuild the OS alarms whenever the app comes to the foreground.
 *
 * This is what makes the rolling window in src/lib/motivation.ts actually roll.
 * Morning motivation is scheduled 30 days out because each day needs different
 * text and iOS only allows 64 pending notifications; without a top-up on every
 * open, a user would silently stop receiving quotes on day 31.
 *
 * Runs on resume as well as first mount. A phone that sits in a pocket for a
 * fortnight and is then opened has to refill from that moment, and `resume` is
 * the only event that fires for it.
 */

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { supabase } from "@/integrations/client";
import { toast } from "sonner";
import {
  checkPermissionState,
  isNative,
  openNotificationSettings,
  registerActionTypes,
  requestPermission,
} from "@/lib/notifications";
import { registerSnoozeHandlers } from "@/lib/snooze";
import { reconcile } from "@/lib/notification-settings";

/** Minimum gap between reconciles, to survive rapid app switching. */
const MIN_INTERVAL_MS = 60_000;

let lastRunAt = 0;

/**
 * Marks that the first-open permission ask has happened, so it happens once
 * per install rather than on every launch.
 */
const ASKED_KEY = "dombelz.notificationsAsked";

/**
 * Ask for notification permission the first time the app is ever opened, and
 * send the user to system settings if the answer is already a permanent no.
 *
 * Deliberately once per install. The OS dialog can only be shown a fixed
 * number of times (once on iOS, twice on Android 13+), so an app that asks on
 * every launch burns those chances on someone who was busy rather than
 * unwilling, and afterwards the only route back is the Settings app. After
 * this has run, a refusal is reported by the settings screen's banner instead,
 * where the user went looking for it.
 *
 * The scheduling in reconcile() does not depend on this — it reads permission
 * itself and does nothing without it. This exists so a new user finds out
 * their reminders need permission on day one, not on the morning the first
 * quote fails to arrive.
 */
async function primePermission(): Promise<void> {
  if (!isNative()) return;

  try {
    if (localStorage.getItem(ASKED_KEY)) return;
  } catch {
    // Private-mode or storage-blocked browsers throw on access. Asking once
    // per launch beats never asking, and this path is the rare one.
  }

  const state = await checkPermissionState();
  if (state === "granted") return;

  const { granted, blocked } = await requestPermission();
  try {
    localStorage.setItem(ASKED_KEY, new Date().toISOString());
  } catch {
    /* see above */
  }
  if (granted) return;

  // Either a refusal now, or a refusal from before this code existed. In both
  // cases the app cannot raise the dialog again, so the only useful thing left
  // is a way to the screen that can.
  toast("Turn on notifications", {
    description: blocked
      ? "Your phone is blocking them for Dombelz. They have to be switched back on in system settings."
      : "Reminders and morning motivation need notification permission.",
    duration: 12000,
    action: {
      label: "Open settings",
      onClick: () => {
        void openNotificationSettings().then((opened) => {
          if (!opened) {
            toast.info(
              "Open Settings > Apps > Dombelz > Notifications and turn them on.",
              { duration: 10000 },
            );
          }
        });
      },
    },
  });
}

export function useReconcileOnForeground(userId: string | null): void {
  useEffect(() => {
    if (!userId || !isNative()) return;

    let cancelled = false;

    const run = async () => {
      const now = Date.now();
      // Android fires appStateChange on every task-switcher glance, and a full
      // teardown-and-rebuild of 40 alarms on each one is wasted work.
      if (now - lastRunAt < MIN_INTERVAL_MS) return;
      lastRunAt = now;

      const { data } = await supabase
        .from("user_profiles")
        .select("created_at, timezone, motivation_seed")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled || !data) return;

      const result = await reconcile({
        id: userId,
        createdAt: data.created_at,
        timezone: data.timezone,
        motivationSeed: data.motivation_seed,
      });

      // Logged rather than surfaced. A user opening the app has not asked to
      // hear about scheduling, and the settings screen reports failures at the
      // moment they change something. This line is for a logcat session.
      if (!result.ran) {
        console.warn(`[reconcile] skipped: ${result.reason}`);
      } else {
        console.info(
          `[reconcile] ${result.motivation} quotes, ${result.reminders} reminders`,
        );
      }
    };

    void primePermission();
    void run();

    // Snooze taps arrive through the same app instance, so the handlers belong
    // beside the reconciler rather than on a screen the user may never open.
    // A reminder snoozed from the lock screen must reschedule whether or not
    // anyone has visited notification settings.
    let teardownSnooze: (() => void) | undefined;
    void registerActionTypes()
      .then(() =>
        registerSnoozeHandlers(userId, (title, body) =>
          // Foreground delivery shows no system notification, so without this
          // the reminder is silently swallowed for anyone using the app at the
          // time it fires.
          toast(title, { description: body, duration: 8000 }),
        ),
      )
      .then((teardown) => {
        if (cancelled) teardown();
        else teardownSnooze = teardown;
      });

    const listener = App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) void run();
    });

    return () => {
      cancelled = true;
      teardownSnooze?.();
      listener.then((l) => l.remove());
    };
  }, [userId]);
}
