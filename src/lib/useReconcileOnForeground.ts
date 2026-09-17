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
import { isNative } from "@/lib/notifications";
import { reconcile } from "@/lib/notification-settings";

/** Minimum gap between reconciles, to survive rapid app switching. */
const MIN_INTERVAL_MS = 60_000;

let lastRunAt = 0;

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

    void run();

    const listener = App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) void run();
    });

    return () => {
      cancelled = true;
      listener.then((l) => l.remove());
    };
  }, [userId]);
}
