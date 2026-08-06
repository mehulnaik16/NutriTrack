import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";
import { todayLocal } from "@/lib/dates";

export const Route = createFileRoute("/plans")({ component: Plans });

const plans = [
  {
    id: "starter",
    name: "Starter",
    price: 299,
    popular: false,
    features: [
      "Food logging (up to 3 meals/day)",
      "Calorie tracking",
      "Basic charts",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 599,
    popular: true,
    features: [
      "Unlimited food logging",
      "Macro tracking (protein, carbs, fats)",
      "Monthly progress graphs",
      "Meal history",
    ],
  },
  {
    id: "elite",
    name: "Elite",
    price: 999,
    popular: false,
    features: [
      "Everything in Pro",
      "AI meal suggestions",
      "Priority support",
      "Export data as PDF",
    ],
  },
];

function Plans() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const start = async (planId: string) => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    const { error } = await supabase
      .from("user_profiles")
      .update({
        selected_plan: planId,
        trial_start_date: todayLocal(),
      })
      .eq("id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Free trial started!");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-10">
      <div className="bg-grid bg-radial-fade absolute inset-0" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[110px]" />
      <div className="relative mx-auto max-w-6xl">
        <div className="mb-8 rounded-2xl border border-accent/30 bg-accent/10 p-5 text-center">
          <div className="mb-1 inline-flex items-center gap-2 text-sm font-bold text-accent">
            <Sparkles className="h-4 w-4" /> Try any plan FREE for 2 days
          </div>
          <p className="text-sm text-muted-foreground">
            No credit card required. After 2 days, choose a plan to continue.
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
          {plans.map((p) => (
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
                  <span className="text-sm text-muted-foreground">/month</span>
                </div>
                <ul className="mt-6 space-y-3 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() => start(p.id)}
                  className={`mt-6 w-full rounded-full font-bold ${p.popular ? "bg-accent text-accent-foreground hover:bg-accent/90" : ""}`}
                  variant={p.popular ? "default" : "outline"}
                >
                  Start Free Trial
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
