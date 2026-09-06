/**
 * Notification preview — /debug/notifications
 *
 * The native shell does not exist yet, so nothing here schedules anything with
 * an OS. What it does is make the two things that are hard to eyeball testable
 * today, before a store release is in the way:
 *
 *   1. Exactly which quote lands on which date, with the day counter and the
 *      cycle number, for the same 30-day window the reconciler will hand to the
 *      OS. Off-by-ones and timezone slips are visible here and nowhere else.
 *   2. What a notification actually looks like, via the Web Notifications API.
 *      That is a different transport from @capacitor/local-notifications, but
 *      the title, body and truncation behaviour are the browser's own — which is
 *      the part worth checking before committing 100 quotes to a store build.
 *
 * Signed-in only, and it reads nothing but the caller's own profile. Safe to
 * leave deployed; delete it once the real settings screen exists in P2.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, BellOff, CalendarClock, TriangleAlert } from "lucide-react";
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

export const Route = createFileRoute("/debug/notifications")({
  component: NotificationDebug,
});

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
