import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  requestPermission,
  openNotificationSettings,
  isNative,
  exactAlarmAllowed,
  openExactAlarmSettings,
  permissionUndecided,
} from "@/lib/notifications";
import {
  PRIMER_EVENT_NAME,
  checkDay5Eligible,
  dismissPrimer,
  getPrimerState,
  isOnboarded,
  markPrimerGranted,
  triggerDay5Primer,
  type PrimerEventDetail,
} from "@/lib/notificationPrimer";
import { loadPrefs, reconcile, savePrefs } from "@/lib/notification-settings";
import { supabase } from "@/integrations/client";

export function NotificationPrimerDialog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [triggerType, setTriggerType] = useState<"engagement" | "day5">(
    "engagement",
  );
  const [submitting, setSubmitting] = useState(false);

  // Listen for the custom event dispatched when a trigger condition is met
  useEffect(() => {
    // Both triggers arrive through this event, so this one gate covers both:
    // a device that already allowed or blocked notifications is never primed.
    const handleOpen = async (e: Event) => {
      if (!(await permissionUndecided())) return;
      const customEvent = e as CustomEvent<PrimerEventDetail>;
      if (customEvent.detail?.trigger) {
        setTriggerType(customEvent.detail.trigger);
      }
      setOpen(true);
    };

    window.addEventListener(PRIMER_EVENT_NAME, handleOpen);

    // Dev-only preview. In production this would hand anyone with the URL a
    // prompt the trigger rules were written to ration.
    if (
      import.meta.env.DEV &&
      typeof window !== "undefined" &&
      window.location.search.includes("test_primer=1")
    ) {
      setOpen(true);
    }

    return () => window.removeEventListener(PRIMER_EVENT_NAME, handleOpen);
  }, []);

  // Trigger 2. Lives here rather than in useReconcileOnForeground, which bails
  // on anything that is not the native app — a web user is owed the same single
  // day-5 reminder. The state check runs first so the profile read only happens
  // for the few users still eligible for it.
  useEffect(() => {
    const userId = user?.id;
    if (!userId || !isOnboarded(userId)) return;
    const state = getPrimerState(userId);
    if (state.granted || state.trigger2Handled) return;

    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select("created_at")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled || !data) return;
      if (checkDay5Eligible(userId, data.created_at)) triggerDay5Primer(userId);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleDismiss = useCallback(() => {
    if (user?.id) {
      dismissPrimer(user.id);
    }
    setOpen(false);
  }, [user]);

  /**
   * Permission granted: switch the reminders on for real and put the user on the
   * screen where they can see and tune them. Relying on column defaults left a
   * user who had ever touched the settings screen with a row that said off.
   *
   * Starts from what the user already saved, not the defaults: only the two
   * on-switches change, so a chosen morning time, quiet hours or snooze setup
   * survives saying yes.
   */
  const enableAndShowSettings = useCallback(
    async (userId: string) => {
      markPrimerGranted(userId);
      setOpen(false);

      await savePrefs(userId, {
        ...(await loadPrefs(userId)),
        morning_enabled: true,
        custom_enabled: true,
      });

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("created_at, timezone, motivation_seed")
        .eq("id", userId)
        .maybeSingle();

      if (profile) {
        await reconcile({
          id: userId,
          createdAt: profile.created_at,
          timezone: profile.timezone,
          motivationSeed: profile.motivation_seed,
        });
      }

      if (await exactAlarmAllowed()) {
        toast.success("Reminders enabled! You're all set.", {
          description:
            "Morning motivation and daily habit alerts will now keep you on track.",
        });
      } else {
        // Android 13+: allowed, but only as inexact alarms that can land
        // late. One more switch makes them fire on the minute.
        toast("One more step for on-time reminders", {
          description:
            'Allow "Alarms & reminders" for Dombelz so they arrive exactly on time.',
          duration: 12000,
          action: {
            label: "Allow",
            onClick: () => void openExactAlarmSettings(),
          },
        });
      }
      void navigate({ to: "/notifications" });
    },
    [navigate],
  );

  const handleEnable = async () => {
    if (!user) {
      setOpen(false);
      return;
    }

    setSubmitting(true);
    try {
      if (isNative()) {
        const { granted, blocked } = await requestPermission();

        if (granted) {
          await enableAndShowSettings(user.id);
        } else if (blocked) {
          setOpen(false);
          toast("Turn on notifications in settings", {
            description:
              "Your phone is currently blocking notifications for Dombelz.",
            action: {
              label: "Open settings",
              onClick: () => {
                void openNotificationSettings();
              },
            },
          });
        } else {
          // User tapped cancel/don't allow on the native dialog
          handleDismiss();
        }
      } else if (
        typeof Notification !== "undefined" &&
        (await Notification.requestPermission()) === "granted"
      ) {
        await enableAndShowSettings(user.id);
      } else {
        handleDismiss();
      }
    } catch (e) {
      console.warn("[primer] permission request error:", e);
      handleDismiss();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleDismiss()}>
      <DialogContent className="max-w-md border-white/[0.08] bg-card/95 p-6 backdrop-blur-2xl sm:rounded-3xl shadow-2xl">
        <DialogHeader className="items-center text-center">
          {/* Visual Header Icon */}
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent shadow-sm">
            <Bell className="h-7 w-7 animate-bounce-gentle" />
          </div>

          <DialogTitle className="font-display text-xl font-bold tracking-tight text-foreground leading-snug">
            Never miss your morning workout motivation & meal alerts!
          </DialogTitle>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {triggerType === "day5"
              ? "5 days in! Keep the momentum strong with daily routine nudges."
              : "Consistency is key. Let Dombelz keep your streaks alive without the mental math."}
          </p>
        </DialogHeader>

        {/* Feature Highlights */}
        <div className="my-3 space-y-2.5 rounded-2xl border border-white/[0.06] bg-background/50 p-3.5 text-xs">
          <div className="flex items-start gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent font-bold">
              ☀️
            </span>
            <div>
              <p className="font-semibold text-foreground">
                Daily Morning Motivation
              </p>
              <p className="text-[11px] text-muted-foreground">
                A fresh quote every morning at your preferred time to start your
                day focused.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent font-bold">
              ⏰
            </span>
            <div>
              <p className="font-semibold text-foreground">
                Timely Habit & Meal Alerts
              </p>
              <p className="text-[11px] text-muted-foreground">
                Gentle reminders for meals and hydration so you hit your targets
                effortlessly.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent font-bold">
              🎛️
            </span>
            <div>
              <p className="font-semibold text-foreground">
                Complete Control & Zero Spam
              </p>
              <p className="text-[11px] text-muted-foreground">
                Full freedom to choose which reminders you want. Turn quotes or
                meal alerts on and off independently, anytime.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="mt-2 flex flex-col gap-2 sm:flex-row-reverse sm:items-center">
          <Button
            type="button"
            className="h-11 flex-1 rounded-xl bg-accent font-bold text-accent-foreground shadow-sm hover:bg-accent/90"
            onClick={handleEnable}
            disabled={submitting}
          >
            {submitting ? "Enabling..." : "Enable Reminders"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11 flex-1 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
            onClick={handleDismiss}
            disabled={submitting}
          >
            Not Now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
