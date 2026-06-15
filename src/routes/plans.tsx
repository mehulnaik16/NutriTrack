import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";

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
        trial_start_date: new Date().toISOString().slice(0, 10),
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
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/40 px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 rounded-2xl border border-accent/30 bg-accent/10 p-5 text-center">
          <div className="mb-1 inline-flex items-center gap-2 text-sm font-semibold text-accent-foreground">
            <Sparkles className="h-4 w-4" /> Try any plan FREE for 2 days
          </div>
          <p className="text-sm text-muted-foreground">
            No credit card required. After 2 days, choose a plan to continue.
          </p>
        </div>
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
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
              className={`relative border-border/60 ${p.popular ? "border-accent shadow-xl md:scale-105" : ""}`}
            >
              {p.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground">
                  Most Popular
                </Badge>
              )}
              <CardContent className="p-6">
                <h3 className="text-xl font-bold">{p.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-bold">₹{p.price}</span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </div>
                <ul className="mt-6 space-y-3 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{" "}
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() => start(p.id)}
                  className={`mt-6 w-full ${p.popular ? "bg-accent text-accent-foreground hover:bg-accent/90" : ""}`}
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
