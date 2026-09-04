import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  Activity,
  ArrowRight,
  Barcode,
  Camera,
  Check,
  Dumbbell,
  Droplets,
  Flame,
  LineChart,
  Mic,
  Scale,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/lib/auth";
// The landing page used to carry its own Starter/Pro/Elite array at prices the
// product no longer sells. Pricing has one definition now.
import {
  PLANS,
  PLAN_FEATURES,
  monthlyRate,
  periodLabel,
} from "@/lib/plans";
import { BASE_TRIAL_DAYS } from "@/lib/trial";

export const Route = createFileRoute("/")({ component: Landing });

const FEATURES = [
  {
    icon: Camera,
    title: "Snap it. Logged.",
    desc: "Point your camera at any meal and AI identifies the food, portion size, and full macros in seconds.",
  },
  {
    icon: Mic,
    title: "Log food by voice",
    desc: "“Two rotis and a bowl of dal” — say it and it's tracked, with accurate Indian food nutrition built in.",
  },
  {
    icon: Barcode,
    title: "Barcode scanner",
    desc: "Scan any packaged product and pull verified nutrition data instantly from Open Food Facts.",
  },
  {
    icon: Dumbbell,
    title: "Complete workout library",
    desc: "Gym, home, and cardio — hundreds of exercises with video tutorials, set logging, and history.",
  },
  {
    icon: Scale,
    title: "Visual weight progress",
    desc: "Track your weight with progress photos, side-by-side comparisons, and goal reference lines.",
  },
  {
    icon: Sparkles,
    title: "AI coach in your corner",
    desc: "Weekly AI reports analyze your adherence and give one concrete, personalized tip for next week.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Take the 2-minute quiz",
    desc: "Tell us your stats and goal. We calculate your BMR, TDEE, calorie target, and macro split using proven formulas.",
  },
  {
    n: "02",
    title: "Log without friction",
    desc: "Photo, voice, barcode, or search 3,600+ foods. Most meals take under ten seconds to track.",
  },
  {
    n: "03",
    title: "Watch the trend bend",
    desc: "Daily rings, 30-day trends, streaks, and AI weekly reports keep you honest and improving.",
  },
];

const FAQS = [
  {
    q: "Is Dombelz accurate for Indian food?",
    a: "Yes. Our database is built on IFCT 2017 (Indian Food Composition Tables) with 3,600+ foods, plus AI fallback tuned for Indian portions — rotis, dals, dosas, and combo meals included.",
  },
  {
    q: "Do I need a credit card to start?",
    a: `No. Every plan starts with a ${BASE_TRIAL_DAYS}-day free trial, no card required. Take the quiz, get your targets, and start logging immediately.`,
  },
  {
    q: "How does AI photo logging work?",
    a: "Snap a photo of your plate. Vision AI identifies the dish, estimates the portion weight, and fills in calories, protein, carbs, fat, and fiber. You can adjust anything before saving.",
  },
  {
    q: "Can I track workouts too?",
    a: "Absolutely. Log gym exercises with sets and weights, follow home routines, or record cardio sessions — complete with video tutorials and per-exercise history.",
  },
];

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [user, loading, navigate]);

  if (loading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── NAV ── */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-foreground glow-accent-sm">
              <Activity className="h-5 w-5" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight">
              Dombelz
            </span>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#how" className="transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#pricing" className="transition-colors hover:text-foreground">
              Pricing
            </a>
            <a href="#faq" className="transition-colors hover:text-foreground">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost" size="sm" className="font-semibold">
                Log in
              </Button>
            </Link>
            <Link to="/quiz">
              <Button
                size="sm"
                className="rounded-full bg-accent px-4 font-bold text-accent-foreground hover:bg-accent/90"
              >
                Start free
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative overflow-hidden">
        <div className="bg-grid bg-radial-fade absolute inset-0" />
        <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[120px]" />

        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:pb-28 lg:pt-24">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent">
              <Zap className="h-3.5 w-3.5" /> AI-powered tracking
            </div>
            <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              Train hard.
              <br />
              Track <span className="text-accent text-glow">effortlessly.</span>
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
              Log meals with a photo, your voice, or a barcode. Get a
              personalized calorie & macro plan, complete workouts, and let an
              AI coach keep you on track.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link to="/quiz">
                <Button className="h-13 w-full rounded-full bg-accent px-8 py-6 text-base font-bold text-accent-foreground glow-accent transition-transform hover:-translate-y-0.5 hover:bg-accent/90 sm:w-auto">
                  Get my plan — free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link to="/login">
                <Button
                  variant="outline"
                  className="h-13 w-full rounded-full px-8 py-6 text-base font-semibold sm:w-auto"
                >
                  I have an account
                </Button>
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-accent" /> {`${BASE_TRIAL_DAYS}-day free trial`}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-accent" /> No credit card
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-accent" /> 3,600+ Indian foods
              </span>
            </div>
          </div>

          {/* Mock daily ring card */}
          <div className="relative mx-auto w-full max-w-sm lg:max-w-md">
            <div className="animate-float rounded-3xl border border-border bg-card p-6 shadow-2xl">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Today
                  </p>
                  <p className="font-display text-lg font-bold">Daily Target</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <Flame className="h-4 w-4" />
                </div>
              </div>

              {/* CSS ring */}
              <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-full"
                style={{
                  background:
                    "conic-gradient(var(--accent) 0deg 252deg, var(--muted) 252deg 360deg)",
                }}
              >
                <div className="flex h-36 w-36 flex-col items-center justify-center rounded-full bg-card">
                  <span className="font-display text-4xl font-bold tracking-tight">
                    1,470
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    / 2,100 kcal
                  </span>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {[
                  { label: "Protein", val: "96 / 140g", pct: 68, color: "var(--accent)" },
                  { label: "Carbs", val: "150 / 210g", pct: 71, color: "var(--warn)" },
                  { label: "Fats", val: "38 / 62g", pct: 61, color: "var(--fat)" },
                ].map((m) => (
                  <div key={m.label}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-bold uppercase tracking-wider text-muted-foreground">
                        {m.label}
                      </span>
                      <span className="font-semibold">{m.val}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${m.pct}%`, background: m.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Floating chips */}
            <div className="absolute -left-4 top-10 hidden rounded-2xl border border-border bg-card px-4 py-3 shadow-xl sm:block">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-warn" />
                <div>
                  <p className="font-display text-sm font-bold leading-none">12 days</p>
                  <p className="text-[10px] font-medium text-muted-foreground">streak</p>
                </div>
              </div>
            </div>
            <div className="absolute -right-3 bottom-16 hidden rounded-2xl border border-border bg-card px-4 py-3 shadow-xl sm:block">
              <div className="flex items-center gap-2">
                <Droplets className="h-4 w-4 text-fat" />
                <div>
                  <p className="font-display text-sm font-bold leading-none">2.5 L</p>
                  <p className="text-[10px] font-medium text-muted-foreground">water goal hit</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <section className="border-y border-border/60 bg-card/40">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 md:grid-cols-4">
          {[
            { icon: LineChart, big: "3,600+", small: "foods in database" },
            { icon: Camera, big: "3 ways", small: "photo · voice · barcode" },
            { icon: Dumbbell, big: "300+", small: "exercises with tutorials" },
            { icon: Trophy, big: "Live", small: "community leaderboard" },
          ].map((s) => (
            <div key={s.small} className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-display text-xl font-bold leading-none">{s.big}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.small}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="mb-12 max-w-2xl">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-accent">
            Features
          </p>
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need. Nothing you don't.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Built for people who want results, not spreadsheets.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="card-lift rounded-2xl border border-border bg-card p-6"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg font-bold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="border-y border-border/60 bg-card/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <div className="mb-12 max-w-2xl">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-accent">
              How it works
            </p>
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              From zero to dialed-in, in minutes.
            </h2>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.n} className="relative">
                <div className="mb-4 flex items-center gap-4">
                  <span className="font-display text-4xl font-bold text-accent/90">
                    {s.n}
                  </span>
                  {i < STEPS.length - 1 && (
                    <div className="hidden h-px flex-1 bg-gradient-to-r from-accent/40 to-transparent md:block" />
                  )}
                </div>
                <h3 className="font-display text-lg font-bold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="mb-12 text-center">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-accent">
            Pricing
          </p>
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Simple plans. Serious results.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Try any plan free for {BASE_TRIAL_DAYS} days — no credit card
            required.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={`relative rounded-2xl border bg-card p-7 ${
                p.popular
                  ? "border-accent shadow-xl glow-accent-sm md:-translate-y-2"
                  : "border-border"
              }`}
            >
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-foreground">
                  Most popular
                </span>
              )}
              <h3 className="font-display text-lg font-bold">{p.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="font-display text-4xl font-bold">₹{p.price}</span>
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
              <Link to="/quiz" className="mt-7 block">
                <Button
                  className={`w-full rounded-full font-bold ${
                    p.popular
                      ? "bg-accent text-accent-foreground hover:bg-accent/90"
                      : ""
                  }`}
                  variant={p.popular ? "default" : "outline"}
                >
                  Start free trial
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="border-t border-border/60 bg-card/40">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <div className="mb-10 text-center">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-accent">
              FAQ
            </p>
            <h2 className="font-display text-3xl font-bold tracking-tight">
              Questions, answered.
            </h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left font-semibold">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-64 w-[36rem] rounded-full bg-accent/15 blur-[100px]" />
        </div>
        <div className="relative mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-5xl">
            Your goal won't chase itself.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-muted-foreground">
            Two minutes to a personalized plan. Ten seconds to log a meal. Zero
            excuses left.
          </p>
          <Link to="/quiz" className="mt-8 inline-block">
            <Button className="h-13 rounded-full bg-accent px-10 py-6 text-base font-bold text-accent-foreground glow-accent transition-transform hover:-translate-y-0.5 hover:bg-accent/90">
              Start your free trial
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Activity className="h-4 w-4" />
            </div>
            <span className="font-display text-sm font-bold">Dombelz</span>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Dombelz · Train. Track. Transform.
          </p>
          <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
            <Link to="/login" className="hover:text-foreground">Log in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
