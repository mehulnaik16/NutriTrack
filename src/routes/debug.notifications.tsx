/**
 * Notification preview — /debug/notifications
 *
 * Three things, each testable before the real settings screen exists:
 *
 *   1. Exactly which quote lands on which date, with the day counter and cycle
 *      number, for the same window the reconciler hands to the OS. Off-by-ones
 *      and timezone slips are visible here and nowhere else.
 *   2. On a browser: what a notification looks like, via the Web Notifications
 *      API. A different transport from the plugin, but the title, body and
 *      truncation are the platform's own — worth checking before committing
 *      100 quotes to a store build.
 *   3. On a device: the real thing. Permission, action types, the rolling
 *      window, and a 15-second test notification that proves scheduling works
 *      with the app closed. This is the P1 exit condition.
 *
 * Signed-in only, and it reads nothing but the caller's own profile. Safe to
 * leave deployed; delete it once the real settings screen exists in P3.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  BellOff,
  CalendarClock,
  Smartphone,
  TriangleAlert,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MOTIVATION_WINDOW_DAYS,
  motivationWindow,
  type MotivationDay,
  type MotivationUser,
} from "@/lib/motivation";
import { NOTIFICATION_BODY_BUDGET } from "@/data/motivationQuotes";
import { deviceTimezone } from "@/lib/timezone";
import {
  cancelAll,
  checkPermissionState,
  isNative,
  pending as pendingNotifications,
  registerActionTypes,
  requestPermission,
  scheduleMotivation,
  scheduleTestNotification,
} from "@/lib/notifications";

export const Route = createFileRoute("/debug/notifications")({
  component: NotificationDebug,
});

/** Written as a constant because inline escapes keep getting mangled by tooling. */
const NEWLINE = String.fromCharCode(10);

type Permission = "default" | "granted" | "denied" | "unsupported";

function readPermission(): Permission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission as Permission;
}

function NotificationDebug() {
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<{
    created_at: string;
    timezone: string;
    motivation_seed: number;
  } | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [permission, setPermission] = useState<Permission>("default");
  const [fireResult, setFireResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [nativeStatus, setNativeStatus] = useState<string>("");
  const native = isNative();

  useEffect(() => setPermission(readPermission()), []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("user_profiles")
      .select("created_at, timezone, motivation_seed")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        // The most likely error here by far is "column does not exist" — the
        // migration has not been applied yet. Say so rather than showing an
        // empty list that looks like a logic bug.
        if (error) setProfileError(error.message);
        else if (data) setProfile(data);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const days: MotivationDay[] = useMemo(() => {
    if (!user || !profile) return [];
    const u: MotivationUser = {
      id: user.id,
      createdAt: profile.created_at,
      timezone: profile.timezone,
      motivationSeed: profile.motivation_seed,
    };
    return motivationWindow(u, MOTIVATION_WINDOW_DAYS);
  }, [user, profile]);

  const fire = useCallback(async (day: MotivationDay) => {
    const title = `☀️ Day ${day.dayNumber} — Rise & Shine`;
    const options: NotificationOptions = {
      body: day.quote.text,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Unique per fire, so repeated taps stack instead of silently replacing
      // one another and looking like nothing happened.
      tag: `dombelz-preview-${day.date}-${Date.now()}`,
    };

    try {
      if (!("Notification" in window)) {
        setFireResult({
          ok: false,
          message: "This browser has no Notification API.",
        });
        return;
      }

      if (Notification.permission === "default") {
        const result = await Notification.requestPermission();
        setPermission(readPermission());
        if (result !== "granted") {
          setFireResult({
            ok: false,
            message: `Permission ${result}. Nothing can be shown until you allow notifications for this site.`,
          });
          return;
        }
      } else if (Notification.permission === "denied") {
        setFireResult({
          ok: false,
          message:
            "Notifications are blocked for this site. Re-enable them in the padlock menu next to the address bar, then reload.",
        });
        return;
      }

      // Android Chrome throws "Illegal constructor" here and only ever displays
      // through a service worker. Desktop allows both, so try the direct path
      // first and fall back rather than registering a worker we may not need.
      try {
        new Notification(title, options);
        setFireResult({ ok: true, message: "Fired directly." });
        return;
      } catch {
        /* fall through to the service worker path */
      }

      if (!("serviceWorker" in navigator)) {
        setFireResult({
          ok: false,
          message:
            "Direct notifications are unsupported here and this browser has no service worker to fall back on.",
        });
        return;
      }

      const registration =
        (await navigator.serviceWorker.getRegistration("/debug/")) ??
        (await navigator.serviceWorker.register("/notification-sw.js", {
          scope: "/debug/",
        }));
      await navigator.serviceWorker.ready;
      await registration.showNotification(title, options);
      setFireResult({
        ok: true,
        message: "Fired via service worker (the Android path).",
      });
    } catch (e) {
      setFireResult({
        ok: false,
        message: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      });
    }
  }, []);

  /**
   * Every native handler goes through this.
   *
   * The plugin rejects rather than returning an error, so an unwrapped handler
   * leaves the status line untouched and the failure is indistinguishable from
   * the button doing nothing — which is exactly how this page failed to explain
   * itself the first time notifications did not arrive.
   */
  const run = async (label: string, fn: () => Promise<string>) => {
    try {
      setNativeStatus(await fn());
    } catch (e) {
      setNativeStatus(
        `${label} failed: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`,
      );
    }
  };

  const nativePermission = () =>
    run("Permission", async () => {
      const { granted, blocked } = await requestPermission();
      if (granted) await registerActionTypes();
      return granted
        ? "Permission granted, action types registered."
        : blocked
          ? "Blocked. Enable notifications for this app in system settings."
          : "Not granted.";
    });

  const nativeTest = () =>
    run("Test notification", async () => {
      const { granted, blocked } = await requestPermission();
      if (!granted) {
        return blocked
          ? "Blocked in system settings — notifications are off for this app."
          : "Permission not granted.";
      }
      await registerActionTypes();
      const id = await scheduleTestNotification(15);
      const after = await pendingNotifications();
      // Confirm the OS actually accepted it. schedule() resolving proves the
      // call was made, not that anything is queued.
      return after.some((n) => n.id === id)
        ? `Scheduled id ${id} for 15s and the OS confirms it is pending. Background the app now.`
        : `schedule() returned but the OS reports nothing pending. Notifications are probably disabled for this app.`;
    });

  const nativeReconcile = () =>
    run("Reconcile", async () => {
      if (!profile || !user) return "Profile not loaded.";
      const { granted } = await requestPermission();
      if (!granted) return "Permission not granted.";
      await registerActionTypes();
      await cancelAll();
      const { scheduled, skippedPast } = await scheduleMotivation(
        {
          id: user.id,
          createdAt: profile.created_at,
          timezone: profile.timezone,
          motivationSeed: profile.motivation_seed,
        },
        "07:00",
      );
      return `Scheduled ${scheduled}. Skipped ${skippedPast} already past today.`;
    });

  const nativeCancel = () =>
    run("Cancel", async () => {
      await cancelAll();
      return "Cancelled everything pending.";
    });

  const nativePending = () =>
    run("Pending", async () => {
      const list = await pendingNotifications();
      if (list.length === 0) return "Nothing pending.";
      const lines = [
        `${list.length} pending:`,
        ...list.slice(0, 8).map((n) => `  ${n.id}  ${n.title}`),
      ];
      if (list.length > 8) lines.push(`  … ${list.length - 8} more`);
      return lines.join(NEWLINE);
    });

  const nativeDiagnose = () =>
    run("Diagnose", async () => {
      const w = window as unknown as {
        Capacitor?: {
          isNativePlatform?: () => boolean;
          getPlatform?: () => string;
          Plugins?: Record<string, unknown>;
        };
      };
      const bridge = w.Capacitor;
      const lines = [
        `window.Capacitor present : ${Boolean(bridge)}`,
        `isNativePlatform()       : ${bridge?.isNativePlatform?.() ?? "n/a"}`,
        `getPlatform()            : ${bridge?.getPlatform?.() ?? "n/a"}`,
        `imported isNative()      : ${isNative()}`,
        `LocalNotifications bound : ${Boolean(bridge?.Plugins?.LocalNotifications)}`,
      ];
      if (isNative()) {
        const perms = await checkPermissionState();
        lines.push(`permission state         : ${perms}`);
        const list = await pendingNotifications();
        lines.push(`pending count            : ${list.length}`);
      }
      return lines.join(NEWLINE);
    });

  if (loading) return <p className="p-6 text-muted-foreground">Loading…</p>;
  if (!user) return <p className="p-6">Sign in to preview notifications.</p>;

  const overBudget = days.filter(
    (d) => d.quote.text.length > NOTIFICATION_BODY_BUDGET,
  ).length;
  const flagged = days.filter((d) => d.quote.flag).length;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4 pb-24">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Notification preview</h1>
        <p className="text-sm text-muted-foreground">
          The next {MOTIVATION_WINDOW_DAYS} days as the reconciler will schedule
          them. Nothing here is handed to an OS yet.
        </p>
      </header>

      {profileError && (
        <Card className="border-destructive/50 bg-destructive/5 p-4 text-sm">
          <p className="font-semibold">Could not read your profile</p>
          <p className="mt-1 text-muted-foreground">{profileError}</p>
          <p className="mt-2 text-muted-foreground">
            If this mentions a missing column, the notification migration has
            not been applied to this database yet.
          </p>
        </Card>
      )}

      <Card className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Device zone" value={deviceTimezone()} />
          <Stat label="Stored zone" value={profile?.timezone ?? "—"} />
          <Stat label="Over budget" value={`${overBudget} / ${days.length}`} />
          <Stat label="Flagged" value={`${flagged} / ${days.length}`} />
        </div>
        {profile && deviceTimezone() !== profile.timezone && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Zones differ — the sync writes on next sign-in, not on this page.
          </p>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {permission === "granted" ? (
            <Bell className="h-3.5 w-3.5" />
          ) : (
            <BellOff className="h-3.5 w-3.5" />
          )}
          <span>
            Browser notifications:{" "}
            {permission === "unsupported"
              ? "not supported here"
              : permission === "denied"
                ? "blocked — re-enable in site settings"
                : permission}
          </span>
        </div>

        {fireResult && (
          <p
            className={`text-xs ${
              fireResult.ok
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-destructive"
            }`}
          >
            {fireResult.ok ? "✓ " : "✗ "}
            {fireResult.message}
          </p>
        )}

        {/* The two causes that produce a permission of "granted", no error, and
            nothing on screen. Both are outside the page's control, so they have
            to be said rather than handled. */}
        {fireResult?.ok && (
          <p className="text-xs text-muted-foreground">
            Fired with no error. If nothing appeared: on Windows check Settings
            → System → Notifications (Chrome must be allowed, Do Not Disturb
            off); on Android check the app&apos;s notification permission in
            system settings. The browser reports success either way — the OS
            drops it silently.
          </p>
        )}
      </Card>

      {/* Always rendered, including on the web. Hiding this behind `native`
          meant the single most useful failure — the Capacitor bridge not being
          detected at all — displayed nothing whatsoever. */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Smartphone className="h-4 w-4" />
          On-device scheduling
          <span className="ml-auto font-mono text-xs font-normal text-muted-foreground">
            {native ? "native" : "web — plugin unavailable"}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={nativePermission}>
            Request permission
          </Button>
          <Button size="sm" variant="secondary" onClick={nativeTest}>
            Fire in 15s
          </Button>
          <Button size="sm" variant="secondary" onClick={nativeReconcile}>
            Schedule {MOTIVATION_WINDOW_DAYS} days
          </Button>
          <Button size="sm" variant="ghost" onClick={nativeCancel}>
            Cancel all
          </Button>
          <Button size="sm" variant="ghost" onClick={nativePending}>
            Show pending
          </Button>
          <Button size="sm" variant="ghost" onClick={nativeDiagnose}>
            Diagnose
          </Button>
        </div>

        {nativeStatus && (
          <p className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
            {nativeStatus}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          {native
            ? "“Fire in 15s” is the real test: background the app after tapping it, and the notification should reach the lock screen with snooze buttons. “Diagnose” reports the bridge and permission state without changing either."
            : "These need the Capacitor bridge, so they do nothing in a browser. Open this page inside the app."}
        </p>
      </Card>

      <div className="flex flex-col gap-2">
        {days.map((d) => {
          const len = d.quote.text.length;
          const over = len > NOTIFICATION_BODY_BUDGET;
          return (
            <Card key={d.date} className="flex flex-col gap-2 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" />
                <span className="font-mono">{d.date}</span>
                <Badge variant="secondary">Day {d.dayNumber}</Badge>
                {d.cycle > 0 && (
                  <Badge variant="outline">Pass {d.cycle + 1}</Badge>
                )}
                <span className={over ? "font-semibold text-destructive" : ""}>
                  {len} chars
                </span>
              </div>

              <p className="text-sm leading-snug">
                {d.quote.text}
                <span className="text-muted-foreground">
                  {" "}
                  — {d.quote.author}
                </span>
              </p>

              {d.quote.flag && (
                <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    #{d.quote.id}: {d.quote.flag}
                  </span>
                </p>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="self-start text-xs"
                onClick={() => fire(d)}
                disabled={
                  permission === "unsupported" || permission === "denied"
                }
              >
                Fire this one now
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}
