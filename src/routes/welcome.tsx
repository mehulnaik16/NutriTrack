import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Utensils,
  Dumbbell,
  Scale,
  UtensilsCrossed,
  LineChart,
  Ruler,
  Palette,
  ShieldCheck,
  Ban,
  Star,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";

export const Route = createFileRoute("/welcome")({ component: Welcome });

const BENEFITS = [
  {
    title: "Save Time. Log in Seconds.",
    body: "One-tap logging puts your food, weight, and workouts at your fingertips. No clutter. No endless forms. Just quick, easy entries.",
  },
  {
    title: "Visual History. See Your Story.",
    body: "Your progress comes alive in beautiful, easy-to-read graphs. Track weight trends, meal patterns, and workout consistency—all at a single glance.",
  },
  {
    title: "Your Daily Calorie Target.",
    body: "No more guessing. We calculate exactly how many calories your body needs each day to reach your goals—whether that's losing, gaining, or maintaining weight.",
  },
  {
    title: "Track Your Journey. Watch Yourself Grow.",
    body: "Log your meals, workouts, measurements, and weight—all in one place. See your progress update in real-time. Every small step adds up, and we show you exactly how far you've come.",
  },
  {
    title: "Zero Ads. Pure Focus.",
    body: "No interruptions. No distractions. Just you, your goals, and a clean space to focus on what truly matters—your health.",
  },
  {
    title: "Your Data. Your Control.",
    body: "Full privacy built in. View, export, or delete your data anytime. No lock-ins. No hidden strings.",
  },
];

// Priority order (left→right, top→bottom) — do not reorder.
const FEATURES = [
  { icon: Utensils, label: "Food Logging", sub: "Log meals, calories, and macros" },
  { icon: Dumbbell, label: "Workout Log", sub: "Track sets, reps, and sweat sessions" },
  { icon: Scale, label: "Weight Logging", sub: "Daily tracking with trend insights" },
  { icon: UtensilsCrossed, label: "Custom Meal", sub: "Create meals from your ingredients" },
  { icon: LineChart, label: "Smart Analytics", sub: "Visual insights across all data" },
  { icon: Ruler, label: "Measurement Log", sub: "Track body measurements over time" },
  { icon: Palette, label: "Multiple Themes", sub: "Choose the look that inspires you" },
  { icon: ShieldCheck, label: "Privacy First", sub: "Your data stays yours. Delete anytime." },
  { icon: Ban, label: "Zero Ads", sub: "No interruptions. Pure focus." },
  { icon: Star, label: "Save Favorites", sub: "One-tap access to your go-to meals" },
  { icon: Sparkles, label: "Intuitive UI", sub: "Simple, clean, and a joy to use" },
];

function Welcome() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  // "checking" avoids flashing the intro to a user who has already seen it,
  // before the flag read resolves and we redirect them out.
  const [checking, setChecking] = useState(true);
  const [canProceed, setCanProceed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login", replace: true });
      return;
    }
    let cancelled = false;
    supabase
      .from("user_profiles")
      .select("has_seen_benefits_features_page")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        // No row means onboarding was never finished — send them to the quiz.
        if (!data) {
          navigate({ to: "/quiz", replace: true });
          return;
        }
        if (data.has_seen_benefits_features_page) {
          navigate({ to: "/dashboard", replace: true });
          return;
        }
        setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, loading, navigate]);

  // Enable the CTA only once the bottom sentinel scrolls into view, i.e. the
  // user has reached the end of the page. On tall screens where everything
  // fits, it intersects immediately — nothing to scroll, already "seen".
  useEffect(() => {
    if (checking) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setCanProceed(true);
          obs.disconnect();
        }
      },
      { rootMargin: "0px 0px -40px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [checking]);

  const goToDashboard = async () => {
    if (!user || leaving) return;
    setLeaving(true);
    const { error } = await supabase
      .from("user_profiles")
      .update({ has_seen_benefits_features_page: true })
      .eq("id", user.id);
    if (error) {
      // Don't trap the user on the intro if the flag write fails; the worst
      // case is they see it once more.
      toast.error(error.message);
    }
    navigate({ to: "/dashboard", replace: true });
  };

  if (loading || checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background pb-28">
      <div className="bg-grid bg-radial-fade pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[110px]" />

      <div className="relative mx-auto w-full max-w-lg px-5 pt-12">
        {/* ── HERO ── */}
        <div className="text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent">
            <Sparkles className="h-3.5 w-3.5" /> You're all set
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Welcome to Dombelz!
          </h1>
          <p className="mt-2 text-muted-foreground">Here's how life gets easier.</p>
        </div>

        <div className="my-8 h-px bg-border/70" />

        {/* ── BENEFITS ── */}
        <div className="space-y-4">
          {BENEFITS.map((b) => (
            <div
              key={b.title}
              className="card-lift rounded-2xl border border-border bg-card p-5"
            >
              <div className="flex gap-3">
                <span className="mt-1 h-6 w-1 shrink-0 rounded-full bg-accent" />
                <div>
                  <h2 className="font-display text-lg font-semibold tracking-tight">
                    {b.title}
                  </h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {b.body}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── SECTION DIVIDER ── */}
        <div className="mt-12 text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Everything at Your Fingertips
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            All the features you need, packed into one beautifully simple app.
          </p>
        </div>

        {/* ── FEATURES GRID ── */}
        <div className="mt-6 rounded-2xl border border-border bg-card p-4">
          <p className="mb-3 px-1 text-xs font-bold uppercase tracking-widest text-accent">
            Features
          </p>
          <div className="grid grid-cols-2 gap-2">
            {FEATURES.map((f) => (
              <div
                key={f.label}
                className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-accent/5 active:bg-accent/10"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <f.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">{f.label}</p>
                  <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                    {f.sub}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom sentinel — reaching it unlocks the CTA. */}
        <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />
      </div>

      {/* ── STICKY CTA ── */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 px-5 pb-6 pt-4 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-lg">
          <Button
            onClick={goToDashboard}
            disabled={!canProceed || leaving}
            className={`h-12 w-full rounded-full text-base font-bold ${
              canProceed
                ? "bg-accent text-accent-foreground glow-accent hover:bg-accent/90"
                : "cursor-not-allowed"
            }`}
          >
            Continue
            {canProceed && <ArrowRight className="ml-2 h-5 w-5" />}
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {canProceed
              ? "Your journey starts now"
              : "Scroll to the bottom to continue"}
          </p>
        </div>
      </div>
    </div>
  );
}
