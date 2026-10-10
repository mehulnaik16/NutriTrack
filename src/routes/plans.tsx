import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getBillingSummary, type BillingSummary } from "@/lib/billing";
import { PricingPlans } from "@/components/PricingPlans";
import { PRICING_PAGE, SignupProgress } from "@/components/SignupProgress";

export const Route = createFileRoute("/plans")({ component: Plans });

function Plans() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getBillingSummary()
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {
        /* the trial button is still correct without it */
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-10">
      <div className="bg-grid bg-radial-fade absolute inset-0" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[110px]" />
      <div className="relative mx-auto max-w-6xl animate-in fade-in duration-700">
        {/* Only during sign-up: no trial or plan yet. */}
        {checked && !summary?.trial_start_date && !summary?.selected_plan && (
          <div className="mx-auto max-w-md">
            <SignupProgress
              page={PRICING_PAGE}
              label="Choose your plan"
              onBack={() => navigate({ to: "/commit", replace: true })}
            />
          </div>
        )}
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
          // Unknown until the summary answers, so a used trial is never offered.
          trialUsed={checked ? !!summary?.trial_start_date : undefined}
          selectedPlan={summary?.selected_plan}
          // /dashboard decides what is still due: the phone number for anyone
          // who has not given one yet, otherwise the app.
          onTrialStarted={() => navigate({ to: "/dashboard", replace: true })}
          onBought={() => navigate({ to: "/dashboard", replace: true })}
        />
      </div>
    </div>
  );
}
