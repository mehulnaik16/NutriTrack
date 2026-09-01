import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import {
  getBillingSummary,
  isTier,
  startTrial,
  subscribe,
  type BillingSummary,
} from "@/lib/billing";
import { isNativeApp } from "@/lib/platform";
import { invalidateAccess } from "@/hooks/useAccessGate";
import { todayLocal } from "@/lib/dates";
import { PLANS, PLAN_FEATURES, monthlyRate, periodLabel } from "@/lib/plans";
import { BASE_TRIAL_DAYS } from "@/lib/trial";

export const Route = createFileRoute("/plans")({ component: Plans });

function Plans() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const native = isNativeApp();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getBillingSummary()
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {
        /* the trial button is still correct without it */
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // One trial per account, ever — so once trial_start_date exists the card
  // offers the paid plan instead of a button that would silently do nothing.
  const trialUsed = !!summary?.trial_start_date;

  /**
   * Buy. The tier is all the browser sends: amount, plan id and whether the
   * ₹150 referral gift applies are decided server-side, and no day of access
   * is granted here — the webhook does that when Razorpay confirms the charge.
   */
  const buy = async (planId: string) => {
    if (!user) {
      navigate({ to: "/login", replace: true });
      return;
    }
    if (!isTier(planId)) return;
    setBusy(planId);
    try {
      await subscribe(planId);
      invalidateAccess(user.id);
      toast.success("Payment received. Your access updates within a minute.");
      navigate({ to: "/dashboard" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== "Checkout closed") toast.error(msg);
    } finally {
      setBusy(null);
    }
  };

  const start = async (planId: string) => {
    if (!user) {
      navigate({ to: "/login", replace: true });
      return;
    }
    try {
      // One trial per account, ever. start_trial() writes trial_start_date only
      // when it is still null, so clicking this again after the trial lapses
      // re-points the plan without granting a second trial.
      const state = await startTrial(planId, user.id);
      toast.success(
        state.trial_start_date === todayLocal()
          ? "Free trial started!"
          : "Plan updated.",
      );
      navigate({ to: "/welcome", replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-10">
      <div className="bg-grid bg-radial-fade absolute inset-0" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[110px]" />
      <div className="relative mx-auto max-w-6xl">
        <div className="mb-8 rounded-2xl border border-accent/30 bg-accent/10 p-5 text-center">
          <div className="mb-1 inline-flex items-center gap-2 text-sm font-bold text-accent">
            <Sparkles className="h-4 w-4" /> Try any plan FREE for{" "}
            {BASE_TRIAL_DAYS} days
          </div>
          <p className="text-sm text-muted-foreground">
            No credit card required. After {BASE_TRIAL_DAYS} days, choose a plan
            to continue.
          </p>
        </div>
        <div className="mb-10 text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Choose your plan
          </h1>
          <p className="mt-2 text-muted-foreground">
            Built for every fitness journey.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((p) => (
            <Card
              key={p.id}
              className={`card-lift relative border-border/60 ${p.popular ? "border-accent shadow-xl glow-accent-sm md:-translate-y-2" : ""}`}
            >
              {p.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent font-bold uppercase tracking-wider text-accent-foreground">
                  Most Popular
                </Badge>
              )}
              <CardContent className="p-6">
                <h3 className="font-display text-xl font-bold">{p.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="font-display text-4xl font-bold">
                    ₹{p.price}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {periodLabel(p.months)}
                  </span>
                </div>
                {p.months > 1 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Works out to ₹{monthlyRate(p)}/month
                  </p>
                )}
                <ul className="mt-6 space-y-3 text-sm">
                  {PLAN_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
                {!trialUsed ? (
                  <Button
                    onClick={() => start(p.id)}
                    className={`mt-6 w-full rounded-full font-bold ${p.popular ? "bg-accent text-accent-foreground hover:bg-accent/90" : ""}`}
                    variant={p.popular ? "default" : "outline"}
                  >
                    Start Free Trial
                  </Button>
                ) : native ? (
                  // No third-party checkout in the native shell. Entitlement
                  // bought on the website applies here the moment it lands.
                  <p className="mt-6 rounded-full border border-border px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">
                    Manage your plan on the Dombelz website
                  </p>
                ) : (
                  <Button
                    onClick={() => buy(p.id)}
                    disabled={busy !== null}
                    className={`mt-6 w-full rounded-full font-bold ${p.popular ? "bg-accent text-accent-foreground hover:bg-accent/90" : ""}`}
                    variant={p.popular ? "default" : "outline"}
                  >
                    {busy === p.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      `Subscribe · ₹${p.price}`
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
