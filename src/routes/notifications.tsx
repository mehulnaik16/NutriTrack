/**
 * Notification settings.
 *
 * Reads and writes user_notification_preferences, and reconciles the OS alarms
 * on every save so what the user just chose is what is actually scheduled.
 *
 * Laid out as grouped lists, the same pattern as Profile > Theme: one status
 * row that says whether notifications can reach the user at all, then a list
 * per concern. Works on the web too, where it saves preferences but schedules
 * nothing — the plugin only exists in the app, and the status row says so.
 */
import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlarmClock,
  BellOff,
  BellRing,
  Check,
  Loader2,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SubHeader } from "@/components/SubHeader";
import { LIST_CLASS, ReminderRows } from "@/components/ReminderRows";
import {
  DEFAULT_PREFS,
  loadPrefs,
  loadReminders,
  nextMotivation,
  reconcile,
  savePrefs,
  type NotificationPrefs,
  type Reminder,
} from "@/lib/notification-settings";
import {
  checkPermissionState,
  isNative,
  exactAlarmAllowed,
  openExactAlarmSettings,
  openNotificationSettings,
  requestPermission,
} from "@/lib/notifications";
import { CYCLE_LENGTH, type MotivationDay } from "@/lib/motivation";

export const Route = createFileRoute("/notifications")({
  component: NotificationSettings,
});

/** The intervals the snooze_intervals_known constraint allows. */
const SNOOZE_OPTIONS = [
  { seconds: 600, label: "+10m" },
  { seconds: 1800, label: "+30m" },
  { seconds: 3600, label: "+1hr" },
];

interface Profile {
  created_at: string;
  timezone: string;
  motivation_seed: number;
}

/**
 * Whether notifications can reach this user, as one state:
 * web (settings only), prompt (never asked), blocked (the OS will not ask
 * again), inexact (Android allows them but only as late-able alarms), ok.
 */
type Reach = "web" | "prompt" | "blocked" | "inexact" | "ok";

type SaveState = "idle" | "saving" | "saved";

// ── Layout pieces ────────────────────────────────────────────────────────────

function Section({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex min-h-6 items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const TIME_INPUT = "h-9 w-28 text-center tabular-nums";

function StatusRow({
  reach,
  onAsk,
  onOpenSettings,
}: {
  reach: Reach;
  onAsk: () => void;
  onOpenSettings: () => void;
}) {
  const view = {
    web: {
      icon: <Smartphone className="h-5 w-5 text-muted-foreground" />,
      title: "Settings sync to the phone app",
      body: "Reminders are delivered by the Dombelz app, not the website.",
      button: null,
    },
    prompt: {
      icon: <BellOff className="h-5 w-5 text-muted-foreground" />,
      title: "Notifications are off",
      body: "Allow them so reminders and quotes can reach you.",
      button: { label: "Turn on", onClick: onAsk },
    },
    blocked: {
      icon: <BellOff className="h-5 w-5 text-destructive" />,
      title: "Blocked in phone settings",
      body: "Dombelz can't ask again. Turn them on in system settings.",
      button: { label: "Open settings", onClick: onOpenSettings },
    },
    inexact: {
      icon: <AlarmClock className="h-5 w-5 text-destructive" />,
      title: "Reminders may arrive late",
      body: "Allow “Alarms & reminders” so they fire on the minute.",
      button: {
        label: "Allow",
        onClick: () => void openExactAlarmSettings(),
      },
    },
    ok: {
      icon: <BellRing className="h-5 w-5 text-accent" />,
      title: "Notifications are on",
      body: "Delivered on time, even with the app closed.",
      button: null,
    },
  }[reach];

  return (
    <div className={LIST_CLASS}>
      <div className="flex items-center gap-3 px-4 py-3.5">
        {view.icon}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{view.title}</p>
          <p className="text-xs text-muted-foreground">{view.body}</p>
        </div>
        {view.button && (
          <Button size="sm" onClick={view.button.onClick} className="shrink-0">
            {view.button.label}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function NotificationSettings() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      navigate({ to: "/profile", replace: true });
    }
  };

  const native = isNative();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  // The latest prefs, for persist(). Reading `prefs` from the render that
  // created a handler let two quick edits overwrite each other.
  const prefsRef = useRef(prefs);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [busy, setBusy] = useState(true);
  const [reach, setReach] = useState<Reach>(native ? "ok" : "web");
  const [save, setSave] = useState<SaveState>("idle");
  const inFlight = useRef(0);

  const checkReach = async () => {
    if (!native) return;
    const state = await checkPermissionState();
    if (state === "denied") setReach("blocked");
    else if (state !== "granted") setReach("prompt");
    else setReach((await exactAlarmAllowed()) ? "ok" : "inexact");
  };

  // Re-read whenever the screen comes back into view: every fix happens in
  // system settings, and the status should change the moment the user returns.
  useEffect(() => {
    if (!native) return;
    void checkReach();
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkReach();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // checkReach only reads `native`, which never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const [loaded, rows, { data }] = await Promise.all([
        loadPrefs(user.id),
        loadReminders(user.id),
        supabase
          .from("user_profiles")
          .select("created_at, timezone, motivation_seed")
          .eq("id", user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      prefsRef.current = loaded;
      setPrefs(loaded);
      setReminders(rows);
      if (data) setProfile(data);
      setBusy(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // The next quote the user will get, from their recorded place in the cycle
  // (which pauses while they are away) — see src/lib/motivation.ts.
  const [upcoming, setUpcoming] = useState<MotivationDay | null>(null);
  useEffect(() => {
    if (!user || !profile) return;
    let cancelled = false;
    nextMotivation(
      {
        id: user.id,
        createdAt: profile.created_at,
        timezone: profile.timezone,
        motivationSeed: profile.motivation_seed,
      },
      prefs.morning_time,
    )
      .then((day) => {
        if (!cancelled) setUpcoming(day);
      })
      .catch(() => {
        /* the preview row just stays hidden */
      });
    return () => {
      cancelled = true;
    };
  }, [user, profile, prefs.morning_time]);

  const rescheduleNow = async () => {
    if (!user || !profile || !native) return;
    const result = await reconcile({
      id: user.id,
      createdAt: profile.created_at,
      timezone: profile.timezone,
      motivationSeed: profile.motivation_seed,
    });
    if (!result.ran && result.reason?.startsWith("permission")) {
      toast.error("Saved, but notifications are switched off for the app.");
    }
  };

  const persist = async (
    update: (p: NotificationPrefs) => NotificationPrefs,
  ) => {
    if (!user) return;
    const next = update(prefsRef.current);
    prefsRef.current = next;
    setPrefs(next);
    inFlight.current++;
    setSave("saving");

    const { error } = await savePrefs(user.id, next);
    if (error) toast.error(`Could not save: ${error}`);
    // Reschedule immediately. A settings screen that saves a preference but
    // leaves yesterday's alarms in place is worse than one that does nothing,
    // because the user has been told it took effect.
    else await rescheduleNow();

    if (--inFlight.current === 0) {
      setSave(error ? "idle" : "saved");
      if (!error) {
        setTimeout(() => setSave((s) => (s === "saved" ? "idle" : s)), 2000);
      }
    }
  };

  /**
   * Re-read the reminders and reschedule. Reads back from the database rather
   * than trusting local state: the 10-reminder cap is a database trigger, so
   * what was actually written is the only thing worth rendering.
   */
  const refreshReminders = async () => {
    if (!user) return;
    setReminders(await loadReminders(user.id));
    await rescheduleNow();
  };

  const openSettings = async () => {
    const opened = await openNotificationSettings();
    if (!opened) {
      toast.info(
        "Open Settings > Apps > Dombelz > Notifications and turn them on.",
        { duration: 10000 },
      );
    }
  };

  /**
   * Ask at the moment the user turns something on, not on app launch. True
   * when notifications can be delivered (or on the web, where there is
   * nothing to ask).
   */
  const ensurePermission = async (): Promise<boolean> => {
    if (!native) return true;
    const { granted, blocked } = await requestPermission();
    await checkReach();
    if (granted) return true;
    if (blocked) {
      // The OS has stopped asking. Take them to the screen that can change it
      // rather than leaving a switch that silently refuses to stay on.
      toast.error("Notifications are switched off for Dombelz.", {
        action: { label: "Open settings", onClick: () => openSettings() },
        duration: 10000,
      });
    } else {
      toast.error("Permission is needed to send reminders.");
    }
    return false;
  };

  const switchOn = async (
    key: "morning_enabled" | "custom_enabled",
    on: boolean,
  ) => {
    if (on && !(await ensurePermission())) return;
    await persist((p) => ({ ...p, [key]: on }));
  };

  if (loading || busy) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <SubHeader
        title="Notifications"
        onBack={goBack}
        action={
          save === "idle" ? null : (
            <span
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
              aria-live="polite"
            >
              {save === "saving" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5 text-accent" />
              )}
              {save === "saving" ? "Saving" : "Saved"}
            </span>
          )
        }
      />

      <main className="mx-auto flex max-w-lg flex-col gap-7 px-4 py-6">
        <StatusRow
          reach={reach}
          onAsk={() => void ensurePermission()}
          onOpenSettings={() => void openSettings()}
        />

        <Section label="Morning quote">
          <div className={LIST_CLASS}>
            <Row label="Daily quote" hint="One line to start the day.">
              <Switch
                checked={prefs.morning_enabled}
                onCheckedChange={(on) => void switchOn("morning_enabled", on)}
                aria-label="Daily quote"
              />
            </Row>

            {prefs.morning_enabled && (
              <>
                <Row label="Time">
                  {/* A native time input: it opens the OS picker the user
                      already knows, respects their 12/24-hour setting, and is
                      reachable by a screen reader. */}
                  <Input
                    type="time"
                    value={prefs.morning_time}
                    onChange={(e) => {
                      const t = e.target.value;
                      if (t) void persist((p) => ({ ...p, morning_time: t }));
                    }}
                    className={TIME_INPUT}
                    aria-label="Quote time"
                  />
                </Row>

                {upcoming && (
                  <figure className="px-4 py-4">
                    <blockquote className="text-sm leading-relaxed">
                      &ldquo;{upcoming.quote.text}&rdquo;
                    </blockquote>
                    <figcaption className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span className="truncate">
                        &mdash; {upcoming.quote.author}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        Next &middot; Day {upcoming.dayNumber} of {CYCLE_LENGTH}
                        {upcoming.cycle > 0 && ` · Round ${upcoming.cycle + 1}`}
                      </span>
                    </figcaption>
                  </figure>
                )}
              </>
            )}
          </div>
        </Section>

        <Section
          label="Reminders"
          action={
            <Switch
              checked={prefs.custom_enabled}
              onCheckedChange={(on) => void switchOn("custom_enabled", on)}
              aria-label="All reminders"
            />
          }
        >
          {user && (
            <ReminderRows
              userId={user.id}
              reminders={reminders}
              disabled={!prefs.custom_enabled}
              onChanged={refreshReminders}
            />
          )}
        </Section>

        <Section label="Quiet hours">
          <div className={LIST_CLASS}>
            <Row
              label="Quiet hours"
              hint="Reminders in this window wait until it ends. The morning quote is not affected."
            >
              <Switch
                checked={prefs.quiet_hours_on}
                onCheckedChange={(on) =>
                  void persist((p) => ({ ...p, quiet_hours_on: on }))
                }
                aria-label="Quiet hours"
              />
            </Row>
            {prefs.quiet_hours_on && (
              <>
                <Row label="From">
                  <Input
                    type="time"
                    value={prefs.quiet_from}
                    onChange={(e) => {
                      const t = e.target.value;
                      if (t) void persist((p) => ({ ...p, quiet_from: t }));
                    }}
                    className={TIME_INPUT}
                    aria-label="Quiet hours start"
                  />
                </Row>
                <Row label="Until">
                  <Input
                    type="time"
                    value={prefs.quiet_to}
                    onChange={(e) => {
                      const t = e.target.value;
                      if (t) void persist((p) => ({ ...p, quiet_to: t }));
                    }}
                    className={TIME_INPUT}
                    aria-label="Quiet hours end"
                  />
                </Row>
              </>
            )}
          </div>
        </Section>

        <Section label="Snooze">
          <div className={LIST_CLASS}>
            <Row
              label="Allow snooze"
              hint="Adds snooze buttons to reminders, never to the morning quote."
            >
              <Switch
                checked={prefs.allow_snooze}
                onCheckedChange={(on) =>
                  void persist((p) => ({ ...p, allow_snooze: on }))
                }
                aria-label="Allow snooze"
              />
            </Row>
            {prefs.allow_snooze && (
              <>
                <Row label="Buttons">
                  <ToggleGroup
                    type="multiple"
                    variant="outline"
                    size="sm"
                    value={prefs.snooze_intervals.map(String)}
                    onValueChange={(values) => {
                      // At least one must stay on (DB check: 1 to 3 intervals).
                      if (values.length === 0) return;
                      void persist((p) => ({
                        ...p,
                        snooze_intervals: values
                          .map(Number)
                          .sort((a, b) => a - b),
                      }));
                    }}
                    aria-label="Snooze buttons"
                  >
                    {SNOOZE_OPTIONS.map(({ seconds, label }) => (
                      <ToggleGroupItem
                        key={seconds}
                        value={String(seconds)}
                        className="px-2.5 text-xs"
                      >
                        {label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Row>
                <Row label="Snoozes per reminder">
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    value={String(prefs.max_snooze_cycles)}
                    onValueChange={(v) => {
                      if (v) {
                        void persist((p) => ({
                          ...p,
                          max_snooze_cycles: Number(v),
                        }));
                      }
                    }}
                    aria-label="Snoozes per reminder"
                  >
                    {[1, 2, 3].map((n) => (
                      <ToggleGroupItem
                        key={n}
                        value={String(n)}
                        className="w-9 text-xs"
                      >
                        {n}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Row>
              </>
            )}
          </div>
        </Section>

        {/* The diagnostics page, still the only way to prove an alarm actually
            reaches the lock screen. The app has no address bar, so this link
            is the only route to it. Goes when the feature is verified. */}
        {native && (
          <Link
            to="/debug/notifications"
            className="self-center text-xs text-muted-foreground underline underline-offset-4"
          >
            Diagnostics
          </Link>
        )}
      </main>
    </div>
  );
}
