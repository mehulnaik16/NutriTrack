import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getBillingSummary, type BillingSummary } from "@/lib/billing";
import { PricingPlans } from "@/components/PricingPlans";

export const Route = createFileRoute("/plans")({ component: Plans });

function Plans() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<BillingSummary | null>(null);

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

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-10">
      <div className="bg-grid bg-radial-fade absolute inset-0" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[110px]" />
      <div className="relative mx-auto max-w-6xl">
        <div className="mb-10 text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Choose your plan
          </h1>
          <p className="mt-2 text-muted-foreground">
            Built for every fitness journey.
          </p>
        </div>
        <PricingPlans
          // One trial per account, ever — so once trial_start_date exists the
          // cards offer the paid plan instead of a button that would do nothing.
          trialUsed={!!summary?.trial_start_date}
          selectedPlan={summary?.selected_plan}
          onTrialStarted={() => navigate({ to: "/welcome", replace: true })}
          onBought={() => navigate({ to: "/dashboard" })}
        />
      </div>
    </div>
  );
}
