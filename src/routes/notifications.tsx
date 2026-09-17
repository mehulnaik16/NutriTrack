/**
 * Notification settings — the first user-facing half of the feature.
 *
 * Reads and writes user_notification_preferences, and reconciles the OS alarms
 * on every save so what the user just chose is what is actually scheduled. The
 * debug route stays for diagnostics; this is the screen people use.
 *
 * Works on the web, where it saves preferences but schedules nothing — the
 * plugin only exists in the app. Saying so plainly beats silently doing half
 * the job.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bell, Clock, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_PREFS,
  loadPrefs,
  reconcile,
  savePrefs,
  type NotificationPrefs,
} from "@/lib/notification-settings";
import { isNative, requestPermission } from "@/lib/notifications";
import { CYCLE_LENGTH, motivationFor } from "@/lib/motivation";

export const Route = createFileRoute("/notifications")({
  component: NotificationSettings,
});

interface Profile {
  created_at: string;
  timezone: string;
  motivation_seed: number;
}

function NotificationSettings() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const native = isNative();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const [loaded, { data }] = await Promise.all([
        loadPrefs(user.id),
        supabase
          .from("user_profiles")
          .select("created_at, timezone, motivation_seed")
          .eq("id", user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setPrefs(loaded);
      if (data) setProfile(data);
      setBusy(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Today's position in the cycle, and what lands tomorrow. Computed rather
  // than stored — see src/lib/motivation.ts.
  const cycle = useMemo(() => {
    if (!user || !profile) return null;
    const u = {
      id: user.id,
      createdAt: profile.created_at,
      timezone: profile.timezone,
      motivationSeed: profile.motivation_seed,
    };
    const today = motivationFor(u);
    const tomorrow = motivationFor(
      u,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );
    return { today, tomorrow };
  }, [user, profile]);

  const persist = async (next: NotificationPrefs) => {
    if (!user) return;
    setPrefs(next);
    setSaving(true);

    const { error } = await savePrefs(user.id, next);
    if (error) {
      setSaving(false);
      toast.error(`Could not save: ${error}`);
      return;
    }

    // Reschedule immediately. A settings screen that saves a preference but
    // leaves yesterday's alarms in place is worse than one that does nothing,
    // because the user has been told it took effect.
    if (profile && native) {
      const result = await reconcile({
        id: user.id,
        createdAt: profile.created_at,
        timezone: profile.timezone,
        motivationSeed: profile.motivation_seed,
      });
      if (!result.ran && result.reason === "permission not granted") {
        toast.error("Saved, but notifications are switched off for the app.");
      }
    }
    setSaving(false);
  };

  /** Ask at the moment the user turns something on, not on app launch. */
  const enableMorning = async (on: boolean) => {
    if (on && native) {
      const { granted, blocked } = await requestPermission();
      if (!granted) {
        toast.error(
          blocked
            ? "Notifications are blocked for Dombelz in system settings."
            : "Permission is needed to send reminders.",
        );
        return;
      }
    }
    persist({ ...prefs, morning_enabled: on });
  };

  if (loading || busy) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const progress = cycle
    ? Math.round((cycle.today.dayNumber / CYCLE_LENGTH) * 100)
    : 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4 pb-28">
      <header className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate({ to: "/profile" })}
          aria-label="Back to profile"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Notifications</h1>
        {saving && (
          <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </header>

      {!native && (
        <Card className="border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <p className="font-semibold">You&rsquo;re on the website</p>
          <p className="mt-1 text-muted-foreground">
            Changes here are saved to your account, but reminders are scheduled
            by the app. Open Dombelz on your phone for them to take effect.
          </p>
        </Card>
      )}

      {/* ── Morning motivation ── */}
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <div>
              <p className="font-semibold">Morning motivation</p>
              <p className="text-xs text-muted-foreground">
                One quote a day, at a time you pick.
              </p>
            </div>
          </div>
          <Switch
            checked={prefs.morning_enabled}
            onCheckedChange={enableMorning}
            aria-label="Enable morning motivation"
          />
        </div>

        {prefs.morning_enabled && (
          <>
            <label className="flex items-center justify-between gap-4 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" /> Time
              </span>
              {/* A native time input, not a custom wheel: it opens the OS
                  picker the user already knows, respects their 12/24-hour
                  setting for free, and is reachable by a screen reader. */}
              <Input
                type="time"
                value={prefs.morning_time}
                onChange={(e) =>
                  persist({ ...prefs, morning_time: e.target.value })
                }
                className="h-10 w-32 text-center"
              />
            </label>

            {cycle && (
              <div className="flex flex-col gap-2 rounded-xl bg-muted/40 p-3">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-semibold">
                    Day {cycle.today.dayNumber} / {CYCLE_LENGTH}
                  </span>
                  {cycle.today.cycle > 0 && (
                    <span className="text-xs text-muted-foreground">
                      Round {cycle.today.cycle + 1}
                    </span>
                  )}
                </div>
                <div className="h-0.5 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#4FACFE] to-[#00F2FE]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="line-clamp-3 text-xs italic text-muted-foreground">
                  Tomorrow: &ldquo;{cycle.tomorrow.quote.text}&rdquo;
                </p>
              </div>
            )}
          </>
        )}
      </Card>

      {/* ── Custom reminders ── */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-accent" />
            <div>
              <p className="font-semibold">Meal &amp; workout reminders</p>
              <p className="text-xs text-muted-foreground">
                Your own reminders, at your own times.
              </p>
            </div>
          </div>
          <Switch
            checked={prefs.custom_enabled}
            onCheckedChange={(on) => persist({ ...prefs, custom_enabled: on })}
            aria-label="Enable custom reminders"
          />
        </div>

        <p className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
          Adding and editing individual reminders is coming next. The switch
          above already controls whether any of them fire.
        </p>
      </Card>

      {/* ── Snooze ── */}
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold">Allow snooze</p>
            <p className="text-xs text-muted-foreground">
              Adds &ldquo;+10m&rdquo; and &ldquo;+1hr&rdquo; buttons to
              reminders. Morning quotes never get them — the time is the point.
            </p>
          </div>
          <Switch
            checked={prefs.allow_snooze}
            onCheckedChange={(on) => persist({ ...prefs, allow_snooze: on })}
            aria-label="Allow snooze"
          />
        </div>

        {prefs.allow_snooze && (
          <label className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground">Snoozes allowed</span>
            <select
              value={prefs.max_snooze_cycles}
              onChange={(e) =>
                persist({
                  ...prefs,
                  max_snooze_cycles: Number(e.target.value),
                })
              }
              className="h-10 rounded-xl border border-border bg-background px-3"
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </Card>

      {/* The diagnostics page, still the only way to prove an alarm actually
          reaches the lock screen. Repointing the profile link at this screen
          removed the only route to it — and the app has no address bar, so
          there was no way back. Goes when the feature is verified. */}
      {native && (
        <Link
          to="/debug/notifications"
          className="self-center text-xs text-muted-foreground underline underline-offset-4"
        >
          Diagnostics
        </Link>
      )}
    </div>
  );
}
