import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Check, CheckCircle2, ChevronDown } from "lucide-react";
import { syncFavicon } from "@/lib/theme";
import { BrandLogo } from "@/components/BrandLogo";
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
  PRICE_TAX_NOTE,
  monthlyRate,
  periodLabel,
} from "@/lib/plans";
import { BASE_TRIAL_DAYS } from "@/lib/trial";

export const Route = createFileRoute("/")({ component: Landing });

// Layout follows docs/design/landing-template.md: Hevy's structure, our light
// theme. Keep this list in sync with the theme script in __root.tsx.
const THEME_CLASSES = [
  "dark",
  "theme-ocean",
  "theme-sunset",
  "theme-forest",
  "theme-cyber",
  "theme-cyberdeck",
  "theme-isro",
];

// Each point shows a real app screenshot from public/landing/ (375x586 phone
// viewport, demo account). Click a point to show it; rows also auto-advance.
const ROWS = [
  {
    title: "Log food in seconds",
    sub: "Photo, voice, or barcode. Most meals take under ten seconds.",
    points: [
      { label: "Photo, voice, or barcode in one tap", img: "food-log" },
      { label: "Say “two rotis and a bowl of dal”", img: "food-voice" },
      { label: "3,600+ Indian foods built in", img: "food-search" },
    ],
  },
  {
    title: "Train with a plan",
    sub: "Gym, home, and cardio, all in one place.",
    points: [
      { label: "A weekly plan built for your goal", img: "workout-plan" },
      { label: "Log sets, reps, and weights", img: "workout-log" },
      { label: "Full per-exercise history", img: "workout-history" },
      { label: "15 ready-made workout splits", img: "workout-library" },
    ],
  },
  {
    title: "Measure progress",
    sub: "Staying motivated is easier when you can see how far you've come.",
    points: [
      { label: "Daily calorie and macro rings", img: "dashboard" },
      { label: "Weight trend toward your goal", img: "weight-chart" },
    ],
  },
];

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Flips to true the first time the element scrolls into view.
function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

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
  const [expandedPlans, setExpandedPlans] = useState<Record<string, boolean>>({
    [PLANS[0]?.id ?? "monthly"]: true,
  });

  // The landing page is always light. __root.tsx skips the saved theme on a
  // hard load of "/"; this covers client-side arrival and restores the saved
  // theme on the way out.
  useLayoutEffect(() => {
    const c = document.documentElement.classList;
    c.remove(...THEME_CLASSES);
    syncFavicon("dark"); // green brand icon on the landing page
    return () => {
      let t = "dark";
      try {
        t = localStorage.getItem("theme") ?? "dark";
      } catch {
        // Storage blocked: fall back to the default dark theme.
      }
      if (t !== "light") c.add(THEME_CLASSES.includes(t) ? t : "dark");
      syncFavicon(t);
    };
  }, []);

  const togglePlanFeatures = (planId: string) => {
    setExpandedPlans((prev) => ({
      ...prev,
      [planId]: !prev[planId],
    }));
  };

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
    <div className="relative isolate min-h-screen overflow-x-clip bg-card text-foreground">
      {/* Soft colour blobs behind the hero so the glass header has something
          to blur. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[46rem]"
      >
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-accent/25 blur-3xl" />
        <div className="absolute right-0 top-10 h-80 w-80 rounded-full bg-fat/20 blur-3xl" />
        <div className="absolute left-1/3 top-72 h-72 w-72 rounded-full bg-warn/15 blur-3xl" />
      </div>

      {/* ── NAV (glass) ── */}
      <header className="sticky top-0 z-50 border-b border-white/60 bg-card/55 shadow-[0_8px_32px_-12px_rgb(0_0_0/0.12)] backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <BrandLogo className="h-9 w-9 text-accent shrink-0" />
            <span className="font-display text-xl font-bold tracking-tight">
              Dombelz
            </span>
          </div>
          <nav className="hidden items-center gap-8 text-[15px] font-medium md:flex">
            <a href="#features" className="hover:text-accent">
              Features
            </a>
            <a href="#how" className="hover:text-accent">
              How it works
            </a>
            <a href="#pricing" className="hover:text-accent">
              Pricing
            </a>
            <a href="#faq" className="hover:text-accent">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost" className="rounded-lg font-medium">
                Log in
              </Button>
            </Link>
            <Link to="/quiz">
              <Button className="rounded-lg bg-accent px-5 font-medium text-accent-foreground hover:bg-accent/90">
                Start free
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-20">
        <div>
          <h1 className="font-display text-5xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
            Log Meals
            <br />
            <span className="text-accent">Train Smarter</span>
            <br />
            Stay Consistent
          </h1>
          <p className="mt-6 max-w-md text-lg text-muted-foreground">
            Dombelz is a calorie and workout tracker built for Indian food. Get
            a personalized plan and log meals in seconds.
          </p>
          <StoreBadges className="mt-8" />
        </div>
        <TiltPhone />
      </section>

      {/* ── STATS STRIP ── */}
      <section className="border-y border-border">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-y-8 px-4 py-10 text-center sm:px-6 md:grid-cols-4 md:divide-x md:divide-border">
          {[
            { big: "3,600+", small: "Indian foods" },
            { big: "300+", small: "exercises with tutorials" },
            { big: "3 ways", small: "to log: photo, voice, barcode" },
            { big: `${BASE_TRIAL_DAYS} days`, small: "free, no card needed" },
          ].map((s) => (
            <div key={s.small} className="px-4">
              <dt className="sr-only">{s.small}</dt>
              <dd className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                {s.big}
              </dd>
              <dd className="mt-1 text-sm text-muted-foreground">{s.small}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── FEATURE ROWS ── */}
      <div id="features">
        {ROWS.map((r, i) => (
          <FeatureRow key={r.title} row={r} flip={i % 2 === 1} />
        ))}
      </div>

      {/* ── CTA BAND ── */}
      <section className="bg-background">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-16 text-center sm:px-6">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            The easiest way to stay consistent
          </h2>
          <Link to="/quiz" className="mt-8">
            <Button className="h-auto rounded-lg bg-accent px-6 py-3.5 text-base font-medium text-accent-foreground hover:bg-accent/90">
              Start {BASE_TRIAL_DAYS}-day free trial{" "}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          <StoreBadges className="mt-6 justify-center" />
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section
        id="how"
        className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28"
      >
        <h2 className="mb-12 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          From zero to dialed-in, in minutes
        </h2>
        <div className="grid gap-8 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n}>
              <span className="font-display text-4xl font-semibold text-accent">
                {s.n}
              </span>
              <h3 className="mt-3 font-display text-lg font-semibold">
                {s.title}
              </h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="bg-background">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <div className="mb-12 text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Simple plans. Serious results.
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">
              Try any plan free for {BASE_TRIAL_DAYS} days — no credit card
              required.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {PLANS.map((p) => (
              <div
                key={p.id}
                className={`relative rounded-lg border-2 bg-card p-7 ${
                  p.popular ? "border-accent" : "border-transparent"
                }`}
              >
                {p.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-md bg-accent px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-foreground">
                    Most popular
                  </span>
                )}
                <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="font-display text-4xl font-semibold">
                    ₹{p.price}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {periodLabel(p.months)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {PRICE_TAX_NOTE}
                </p>
                {p.months > 1 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Works out to ₹{monthlyRate(p)}/month
                  </p>
                )}
                {/* Mobile dropdown toggle */}
                <button
                  type="button"
                  onClick={() => togglePlanFeatures(p.id)}
                  className="mt-4 flex w-full items-center justify-between py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground md:hidden"
                  aria-expanded={!!expandedPlans[p.id]}
                >
                  <span>Features</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${
                      expandedPlans[p.id] ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <ul
                  className={`space-y-3 text-sm md:mt-6 md:block ${
                    expandedPlans[p.id] ? "mt-3 block" : "hidden"
                  }`}
                >
                  {PLAN_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/quiz" className="mt-4 block md:mt-7">
                  <Button
                    className={`w-full rounded-lg font-medium ${
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
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <h2 className="mb-10 text-center font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Need help?
        </h2>
        <Accordion type="single" collapsible className="w-full">
          {FAQS.map((f, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-left text-base font-semibold">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-background">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-12 md:grid-cols-[2fr_1fr_1fr_1fr]">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">
                Ready to get started?
              </h2>
              <p className="mt-2 max-w-sm text-muted-foreground">
                Log your meals and workouts, and watch the trend bend.
              </p>
              <StoreBadges className="mt-6" />
            </div>
            {[
              {
                h: "Product",
                links: [
                  <a href="#features">Features</a>,
                  <a href="#pricing">Pricing</a>,
                ],
              },
              {
                h: "Company",
                links: [
                  <Link to="/privacy">Privacy</Link>,
                  <Link to="/terms">Terms</Link>,
                  <a href="/refund">Refunds</a>,
                  <a href="/help">Contact</a>,
                ],
              },
              {
                h: "Account",
                links: [
                  <Link to="/login">Log in</Link>,
                  <Link to="/quiz">Start free</Link>,
                ],
              },
            ].map((col) => (
              <div key={col.h}>
                <p className="font-semibold">{col.h}</p>
                <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                  {col.links.map((l, i) => (
                    <li key={i} className="hover:text-foreground">
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-12 flex items-center gap-2.5 border-t border-border pt-8 text-xs text-muted-foreground">
            <BrandLogo className="h-6 w-6 text-accent shrink-0" />©{" "}
            {new Date().getFullYear()} Dombelz · Train. Track. Transform.
          </div>
        </div>
      </footer>
    </div>
  );
}

// Official Apple/Google artwork. Not links until the store listings are live.
function StoreBadges({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-4 ${className}`}>
      <div aria-label="Coming soon on the App Store" role="img">
        <img src="/badges/app-store.svg" alt="" className="h-10" />
      </div>
      <div aria-label="Coming soon on Google Play" role="img">
        {/* Google's PNG has built-in padding; the negative margin trims it so
            the visible badge matches Apple's 40px height. */}
        <img
          src="/badges/google-play.png"
          alt=""
          className="-m-[9px] h-[58px]"
        />
      </div>
    </div>
  );
}

// Phone frame around real app screenshots. All shots stack and crossfade, so
// switching never waits on a network fetch. The bottom fades out because the
// captures are a short (375x586) phone viewport.
function Phone({ shots, active = 0 }: { shots: string[]; active?: number }) {
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[2.5rem] border-[10px] border-foreground bg-foreground shadow-2xl [mask-image:linear-gradient(to_bottom,black_88%,transparent)]">
      <div className="relative aspect-[375/586] overflow-hidden rounded-[1.9rem] bg-card">
        {shots.map((s, i) => (
          <img
            key={s}
            src={`/landing/${s}.jpg`}
            alt=""
            loading={i === 0 ? "eager" : "lazy"}
            className={`absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-500 ${
              i === active ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// Hero phone: floats, and tilts toward the mouse. Writes the transform
// straight to the DOM so pointer moves don't re-render.
function TiltPhone() {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || reducedMotion()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `rotateY(${x * 14}deg) rotateX(${-y * 14}deg)`;
  };
  return (
    <div
      className="[perspective:1000px]"
      onPointerMove={move}
      onPointerLeave={() => ref.current?.style.removeProperty("transform")}
    >
      <div ref={ref} className="transition-transform duration-200 ease-out">
        <div className="animate-float motion-reduce:animate-none">
          <Phone shots={["dashboard"]} />
        </div>
      </div>
    </div>
  );
}

const AUTOPLAY_MS = 4000;

function FeatureRow({
  row,
  flip,
}: {
  row: (typeof ROWS)[number];
  flip: boolean;
}) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [ref, seen] = useInView<HTMLElement>();
  const n = row.points.length;

  useEffect(() => {
    if (!seen || paused || reducedMotion()) return;
    const id = setInterval(() => setActive((a) => (a + 1) % n), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [seen, paused, n]);

  return (
    <section
      ref={ref}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 transition lg:gap-12 lg:py-16 duration-700 ease-out motion-reduce:transition-none sm:px-6 lg:grid-cols-2 ${
        seen ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
      } motion-reduce:translate-y-0 motion-reduce:opacity-100`}
    >
      <div className={flip ? "lg:order-2" : ""}>
        <Phone shots={row.points.map((p) => p.img)} active={active} />
      </div>
      <div>
        <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {row.title}
        </h2>
        <p className="mt-3 text-lg text-muted-foreground">{row.sub}</p>
        <ul className="mt-6 space-y-1">
          {row.points.map((p, i) => (
            <li key={p.label}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-pressed={i === active}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-base transition-colors ${
                  i === active
                    ? "bg-muted font-semibold text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <CheckCircle2
                  className={`h-5 w-5 shrink-0 text-card transition-colors ${
                    i === active ? "fill-accent" : "fill-muted-foreground/40"
                  }`}
                />
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
