import { LogoLoader } from "@/components/LogoLoader";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  Mic,
  ScanBarcode,
  Dumbbell,
  Droplet,
  CookingPot,
  Check,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { loadQuizDraft, saveDraftPage } from "@/lib/quizDraft";
import {
  formatWeight,
  PLAN_WEEKS,
  weightPlan,
  type WeightPlan,
} from "@/lib/welcomePlan";
import { INTRO_PAGE, SignupProgress } from "@/components/SignupProgress";
import { supabase } from "@/integrations/client";

export const Route = createFileRoute("/welcome")({ component: Welcome });

// shortcut: estimates, not measured. Replace with timed runs of a real meal log
// in Dombelz and a typical tracker before relying on them.
const LOG_SECONDS = { dombelz: 5, typical: 45 };
// 3 meals a day for 30 days, rounded to whole minutes.
const MINUTES_SAVED_MONTHLY = Math.round(
  ((LOG_SECONDS.typical - LOG_SECONDS.dombelz) * 3 * 30) / 60,
);

const FEATURES = [
  { icon: Camera, label: "Photo log" },
  { icon: Mic, label: "Voice log" },
  { icon: ScanBarcode, label: "Barcode scan" },
  { icon: Dumbbell, label: "Workout log" },
  { icon: Droplet, label: "Water log" },
  { icon: CookingPot, label: "Custom meals" },
];

const TRUST = ["No ads", "Delete data anytime", "Free to start"];

// "Guessing" line: small wobble that barely moves, as a fraction of the
// planned change. Illustrative only.
const GUESS = [0, 0.1, 0.15, 0.08, 0.2, 0.25, 0.15, 0.22, 0.18];

/** Each week's height on the chart, 0 = top, 1 = bottom. */
function chartLines(direction: WeightPlan["direction"]) {
  const weeks = Array.from(
    { length: PLAN_WEEKS + 1 },
    (_, i) => i / PLAN_WEEKS,
  );
  if (direction === "maintain")
    return {
      plan: weeks.map(() => 0.5),
      guess: GUESS.map((g) => 0.5 - g * 1.6),
    };
  if (direction === "gain")
    return { plan: weeks.map((t) => 1 - t), guess: GUESS.map((g) => 1 - g) };
  return { plan: weeks, guess: GUESS };
}

const CW = 300;
const CH = 130;
const PAD = 10;
const px = (i: number) => PAD + (i * (CW - 2 * PAD)) / PLAN_WEEKS;
const py = (f: number) => PAD + f * (CH - 2 * PAD);
const toPath = (ys: number[]) =>
  ys.map((f, i) => `${i ? "L" : "M"}${px(i)} ${py(f)}`).join(" ");

function WeightChart({
  direction,
  endLabel,
}: {
  direction: WeightPlan["direction"];
  endLabel?: string;
}) {
  const { plan, guess } = chartLines(direction);
  const end = plan[PLAN_WEEKS];
  return (
    <div className="relative mt-3">
      <svg
        viewBox={`0 0 ${CW} ${CH}`}
        className="h-auto w-full text-accent"
        role="img"
        aria-label="Weight with Dombelz moves steadily to your goal; guessing barely moves"
      >
        {[0, 0.5, 1].map((f) => (
          <path
            key={f}
            d={`M0 ${py(f)} H${CW}`}
            className="stroke-border"
            strokeWidth="1"
          />
        ))}
        <path
          d={`${toPath(plan)} L${px(PLAN_WEEKS)} ${CH} L${px(0)} ${CH} Z`}
          fill="currentColor"
          fillOpacity="0.1"
        />
        <path
          d={toPath(guess)}
          fill="none"
          className="stroke-muted-foreground/50"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={toPath(plan)}
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={px(0)} cy={py(plan[0])} r="5" className="fill-foreground" />
        <circle cx={px(PLAN_WEEKS)} cy={py(end)} r="7" fill="currentColor" />
        <circle cx={px(PLAN_WEEKS)} cy={py(end)} r="3" className="fill-card" />
      </svg>
      {endLabel && (
        <span
          className="absolute right-0 rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground"
          // Sit the tag above the end dot (below it when the dot is at the top).
          style={{
            top: `calc(${(py(end) / CH) * 100}% ${end < 0.3 ? "+ 12px" : "- 40px"})`,
          }}
        >
          {endLabel}
        </span>
      )}
    </div>
  );
}

function Welcome() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  // "checking" avoids flashing the intro to a user who has already seen it,
  // before the flag read resolves and we redirect them out.
  const [checking, setChecking] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [noProfile, setNoProfile] = useState(false);
  useEffect(() => saveDraftPage("welcome"), []);
  const draft = useMemo(() => loadQuizDraft(), []);
  const plan = useMemo(
    () =>
      weightPlan(draft.d?.weightKg, draft.d?.goal, draft.loseRate, new Date()),
    [draft],
  );
  const unit = draft.unit ?? "kg";

  useEffect(() => {
    if (loading) return;
    // The intro sits between the quiz and sign-up, so it is shown signed out.
    if (!user) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    supabase
      .from("user_profiles")
      .select("has_seen_benefits_features_page")
      .eq("id", user.id)
      .maybeSingle()
      .then(
        ({ data, error }) => {
          if (cancelled) return;
          // A failed read says nothing about onboarding, so it must not be read
          // as "no row" — showing the intro once too often is the safe error.
          if (error) {
            setChecking(false);
            return;
          }
          // No row: signed in mid-flow, so this is the pre-sign-up intro.
          if (!data) {
            setNoProfile(true);
            setChecking(false);
            return;
          }
          if (data.has_seen_benefits_features_page) {
            navigate({ to: "/dashboard", replace: true });
            return;
          }
          setChecking(false);
        },
        () => {
          // Without this the spinner below never stops.
          if (!cancelled) setChecking(false);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [user, loading, navigate]);

  const goToDashboard = async () => {
    if (leaving) return;
    // Before an account (or a profile) exists, the next step is sign-up.
    if (!user || noProfile) {
      navigate({ to: "/signup" });
      return;
    }
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
        <LogoLoader className="h-10 w-10 text-accent" />
      </div>
    );
  }

  const showStudy = !plan || plan.direction === "lose";
  const endDate = plan?.endDate.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="relative min-h-screen overflow-hidden bg-background pb-36">
      <div className="pointer-events-none absolute -left-10 top-10 h-72 w-[28rem] rounded-full bg-accent/10 blur-[100px]" />

      <div className="relative mx-auto w-full max-w-lg px-5 pt-8">
        {/* Only mid-sign-up: an onboarded user reaching this page is past it. */}
        {(!user || noProfile) && (
          <SignupProgress
            page={INTRO_PAGE}
            label="Welcome"
            onBack={() =>
              navigate({
                to: "/quiz",
                search: { step: loadQuizDraft().step ?? 1 },
                replace: true,
              })
            }
          />
        )}

        {/* ── HERO: where they'll be in 8 weeks ── */}
        <p className="text-xs font-bold uppercase tracking-widest text-accent">
          Your next {PLAN_WEEKS} weeks
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold leading-[1.05] tracking-tight">
          {!plan ? (
            <>
              Small logs.
              <br />
              <span className="text-accent">Real results.</span>
            </>
          ) : plan.direction === "maintain" ? (
            <>
              Hold {formatWeight(plan.startKg, unit)}.
              <br />
              <span className="text-accent">Build muscle.</span>
            </>
          ) : (
            <>
              {formatWeight(plan.startKg, unit)} today.
              <br />
              <span className="text-accent">
                {formatWeight(plan.endKg, unit)} by {endDate}.
              </span>
            </>
          )}
        </h1>

        <div className="mt-5 rounded-3xl border border-border bg-card p-4">
          <div className="flex gap-4 text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-1 w-3.5 rounded-full bg-accent" /> With Dombelz
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1 w-3.5 rounded-full bg-muted-foreground/50" />{" "}
              Guessing
            </span>
          </div>
          <WeightChart
            direction={plan?.direction ?? "lose"}
            endLabel={plan ? formatWeight(plan.endKg, unit) : undefined}
          />
          <div className="mt-1.5 flex justify-between text-[11px] font-medium text-muted-foreground">
            <span>Today</span>
            <span>Week {PLAN_WEEKS / 2}</span>
            <span>{endDate ?? `Week ${PLAN_WEEKS}`}</span>
          </div>
          {/* The cited study is about weight loss, so only claim it there. */}
          <div className="mt-4 flex items-baseline gap-2.5 border-t border-border pt-4">
            {showStudy ? (
              <>
                <b className="font-display text-3xl font-bold text-accent">
                  2×
                </b>
                <span className="text-sm leading-snug text-foreground/80">
                  more weight lost by people who log their food daily.¹
                </span>
              </>
            ) : (
              <span className="text-sm leading-snug text-foreground/80">
                Daily logs keep you on target, so every week counts.
              </span>
            )}
          </div>
        </div>

        {/* ── TIME SAVED ── */}
        <div className="mt-3 rounded-3xl border border-border bg-card p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Time saved
          </p>
          <h2 className="mt-1.5 font-display text-2xl font-bold tracking-tight">
            Log a meal in{" "}
            <span className="text-accent">{LOG_SECONDS.dombelz} seconds.</span>
          </h2>
          <div className="mt-4 space-y-3">
            {[
              { name: "Dombelz", sec: LOG_SECONDS.dombelz, bar: "bg-accent" },
              {
                name: "Typical tracker",
                sec: LOG_SECONDS.typical,
                bar: "bg-muted-foreground/50",
              },
            ].map((r) => (
              <div key={r.name}>
                <div className="mb-1.5 flex justify-between text-sm font-semibold">
                  {r.name}
                  <span className="font-medium text-muted-foreground">
                    ~{r.sec} sec
                  </span>
                </div>
                <div className="h-3 rounded-full bg-muted">
                  <div
                    className={`h-3 rounded-full ${r.bar}`}
                    style={{
                      width: `${Math.max((r.sec / LOG_SECONDS.typical) * 100, 8)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-baseline gap-2.5 border-t border-border pt-4">
            <b className="font-display text-3xl font-bold text-accent">
              {MINUTES_SAVED_MONTHLY >= 60
                ? `${Math.round(MINUTES_SAVED_MONTHLY / 60)} hr`
                : `${MINUTES_SAVED_MONTHLY} min`}
            </b>
            <span className="text-sm text-foreground/80">
              back every month, at 3 meals a day.
            </span>
          </div>
        </div>

        {/* ── FEATURES ── */}
        <p className="mt-8 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Everything in one app
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {FEATURES.map((f) => (
            <div
              key={f.label}
              className="flex h-14 items-center gap-2.5 rounded-2xl border border-border bg-card px-3.5"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <f.icon className="h-[18px] w-[18px]" />
              </span>
              <span className="text-sm font-semibold">{f.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[10px] text-muted-foreground/70">
          {showStudy &&
            "¹ Hollis et al., American Journal of Preventive Medicine, 2008. "}
          Chart is illustrative.
        </p>
      </div>

      {/* ── STICKY CTA ── */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 px-5 pb-5 pt-3.5 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-lg">
          <Button
            onClick={goToDashboard}
            disabled={leaving}
            className="h-14 w-full rounded-full bg-accent text-base font-bold text-accent-foreground glow-accent hover:bg-accent/90"
          >
            Continue
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <div className="mt-3 flex justify-center gap-3.5 text-xs font-medium text-muted-foreground">
            {TRUST.map((t) => (
              <span key={t} className="flex items-center gap-1">
                <Check className="h-3.5 w-3.5 text-accent" strokeWidth={3} />
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
