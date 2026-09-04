/**
 * The pricing grid, shared by /plans and Profile → Pricing.
 *
 * It used to be two copies. They drifted: the profile copy offered "Start Free
 * Trial" on every card forever, so a user whose trial had already ended had no
 * way to pay from there, and the free-trial banner stayed up for accounts that
 * could never get another trial. Trial versus buy, and whether that banner
 * shows, are decided in one place now — see planCta() in src/lib/plans.ts.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { isTier, startTrial, subscribe, type TrialState } from "@/lib/billing";
import { invalidateAccess } from "@/hooks/useAccessGate";
import { isNativeApp } from "@/lib/platform";
import { todayLocal } from "@/lib/dates";
import {
  PLANS,
  PLAN_FEATURES,
  monthlyRate,
  periodLabel,
  planCta,
  showsTrialBanner,
} from "@/lib/plans";
import { BASE_TRIAL_DAYS } from "@/lib/trial";

export function PricingPlans({
  trialUsed,
  selectedPlan,
  onTrialStarted,
  onBought,
}: {
  /** True once trial_start_date exists — running or lapsed, it is spent. */
  trialUsed: boolean;
  selectedPlan?: string | null;
  onTrialStarted?: (state: TrialState) => void;
  onBought?: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const native = isNativeApp();

  const start = async (planId: string) => {
    if (!user) {
      navigate({ to: "/login", replace: true });
      return;
    }
    try {
      // One trial per account, ever. start_trial() writes trial_start_date only
      // when it is still null, so a second call re-points the plan without
      // granting another trial — hence rendering the returned state, not today.
      const state = await startTrial(planId, user.id);
      toast.success(
        state.trial_start_date === todayLocal()
          ? "Free trial started!"
          : "Plan updated.",
      );
      onTrialStarted?.(state);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  /**
   * Buy. The tier is all the browser sends: amount, plan id and whether the
   * ₹150 referral gift applies are decided server-side, and no day of access is
   * granted here — the webhook does that when Razorpay confirms the charge.
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
      onBought?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== "Checkout closed") toast.error(msg);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {showsTrialBanner(trialUsed) && (
        <div className="mb-8 rounded-2xl bg-accent p-5 text-center text-accent-foreground shadow-lg glow-accent-sm">
          <div className="mb-1 flex items-center justify-center gap-2 text-base font-bold">
            <Sparkles className="h-5 w-5" /> Try any plan FREE for{" "}
            {BASE_TRIAL_DAYS} days
          </div>
          <p className="text-sm font-medium opacity-90">
            No credit card required. After {BASE_TRIAL_DAYS} days, choose a plan
            to continue.
          </p>
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-3">
        {PLANS.map((p) => {
          const cta = planCta({
            planId: p.id,
            trialUsed,
            selectedPlan,
            native,
          });
          return (
            <Card
              key={p.id}
              className={`card-lift relative border-border/60 ${p.popular ? "border-accent shadow-xl glow-accent-sm" : ""}`}
            >
              {p.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent font-bold uppercase tracking-wider text-accent-foreground">
                  Most Popular
                </Badge>
              )}
              {selectedPlan === p.id && (
                <Badge className="absolute -top-3 right-4 bg-foreground text-background">
                  Current
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
                {cta === "native" ? (
                  // No third-party checkout in the native shell. Entitlement
                  // bought on the website applies here the moment it lands.
                  <p className="mt-6 rounded-full border border-border px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">
                    Manage your plan on the Dombelz website
                  </p>
                ) : (
                  <Button
                    onClick={() => (cta === "buy" ? buy(p.id) : start(p.id))}
                    disabled={cta === "current" || busy !== null}
                    className={`mt-6 w-full rounded-full font-bold ${p.popular ? "bg-accent text-accent-foreground hover:bg-accent/90" : ""}`}
                    variant={p.popular ? "default" : "outline"}
                  >
                    {busy === p.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : cta === "buy" ? (
                      `Buy · ₹${p.price}`
                    ) : cta === "current" ? (
                      "Your current plan"
                    ) : (
                      "Start Free Trial"
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
