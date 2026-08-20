import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Dumbbell,
  Library,
  Loader2,
  PencilRuler,
  Sparkles,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";
import { serverGroqChat } from "@/lib/ai";
import {
  type WorkoutPrefs,
  FITNESS_LEVELS,
  FITNESS_GOALS,
  CARDIO_OPTIONS,
  SPLIT_GUIDE,
  saveWorkoutPrefs,
  loadWorkoutPrefs,
} from "@/lib/workoutPrefs";

export const Route = createFileRoute("/workout-setup")({
  component: WorkoutSetup,
});

const TOTAL_STEPS = 8;

const STEP_TITLES = [
  "Your fitness level",
  "Your primary goal",
  "Strongest lifts",
  "Training frequency",
  "Cardio you enjoy",
  "Muscles per session",
  "Session duration",
  "Pick your path",
];

interface LiftDraft {
  weight: string;
  reps: string;
}

/* ── module-scope helpers (stable identity → inputs keep focus) ── */

function OptionCard({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all ${
        active
          ? "border-accent bg-accent/10 glow-accent-sm"
          : "border-border bg-card hover:border-muted-foreground/40"
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
          active ? "border-accent bg-accent" : "border-muted-foreground/40"
        }`}
      >
        {active && <Check className="h-3 w-3 text-accent-foreground" />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

function LiftRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: LiftDraft;
  onChange: (v: LiftDraft) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-bold">
        <Dumbbell className="h-4 w-4 text-accent" /> {label}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Weight (kg)</Label>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="e.g. 60"
            value={value.weight}
            onChange={(e) => onChange({ ...value, weight: e.target.value })}
            className="h-11 rounded-xl text-center font-bold"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Reps</Label>
          <Input
            type="number"
            inputMode="numeric"
            placeholder="e.g. 8"
            value={value.reps}
            onChange={(e) => onChange({ ...value, reps: e.target.value })}
            className="h-11 rounded-xl text-center font-bold"
          />
        </div>
      </div>
    </div>
  );
}

function WorkoutSetup() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  // Answers
  const [level, setLevel] = useState<WorkoutPrefs["fitnessLevel"]>("beginner");
  const [goal, setGoal] = useState<WorkoutPrefs["fitnessGoal"]>("build_muscle");
  const [bench, setBench] = useState<LiftDraft>({ weight: "", reps: "" });
  const [squat, setSquat] = useState<LiftDraft>({ weight: "", reps: "" });
  const [deadlift, setDeadlift] = useState<LiftDraft>({ weight: "", reps: "" });
  const [days, setDays] = useState(3);
  const [cardio, setCardio] = useState<string[]>([]);
  const [customCardio, setCustomCardio] = useState("");
  const [muscles, setMuscles] =
    useState<WorkoutPrefs["musclesPerWorkout"]>("not_sure");
  const [duration, setDuration] = useState(60);
  const [planChoice, setPlanChoice] =
    useState<WorkoutPrefs["preferredTrainingPlan"]>("ai_generated");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  // Pre-fill if the user has done this before
  useEffect(() => {
    if (!user) return;
    loadWorkoutPrefs(user.id).then((p) => {
      if (!p) return;
      setLevel(p.fitnessLevel);
      setGoal(p.fitnessGoal);
      setDays(p.trainingDaysPerWeek || 3);
      setCardio(p.cardioActivities || []);
      setMuscles(p.musclesPerWorkout ?? "not_sure");
      setDuration(p.preferredWorkoutTime || 60);
      setPlanChoice(p.preferredTrainingPlan || "ai_generated");
      const d = (l: { weight: number | null; reps: number | null }) => ({
        weight: l?.weight ? String(l.weight) : "",
        reps: l?.reps ? String(l.reps) : "",
      });
      if (p.strongestLifts) {
        setBench(d(p.strongestLifts.benchPress));
        setSquat(d(p.strongestLifts.squat));
        setDeadlift(d(p.strongestLifts.deadlift));
      }
    });
  }, [user]);

  const buildPrefs = (): WorkoutPrefs => {
    const lift = (l: LiftDraft) => ({
      weight: l.weight ? +l.weight : null,
      reps: l.reps ? +l.reps : null,
    });
    return {
      fitnessLevel: level,
      fitnessGoal: goal,
      strongestLifts: {
        benchPress: lift(bench),
        squat: lift(squat),
        deadlift: lift(deadlift),
      },
      trainingDaysPerWeek: days,
      cardioActivities: cardio,
      musclesPerWorkout: muscles,
      preferredWorkoutTime: duration,
      preferredTrainingPlan: planChoice,
    };
  };

  const generateAiPlan = async (prefs: WorkoutPrefs) => {
    if (!user) return;
    const goalLabel =
      FITNESS_GOALS.find((g) => g.value === prefs.fitnessGoal)?.label ??
      prefs.fitnessGoal;
    const lifts: string[] = [];
    const { benchPress, squat: sq, deadlift: dl } = prefs.strongestLifts;
    if (benchPress.weight)
      lifts.push(`Bench Press ${benchPress.weight}kg × ${benchPress.reps ?? "?"} reps`);
    if (sq.weight) lifts.push(`Back Squat ${sq.weight}kg × ${sq.reps ?? "?"} reps`);
    if (dl.weight) lifts.push(`Deadlift ${dl.weight}kg × ${dl.reps ?? "?"} reps`);

    const prompt = `You are an expert strength & conditioning coach. Create a ${prefs.trainingDaysPerWeek}-day-per-week gym workout plan.
User profile:
- Experience: ${prefs.fitnessLevel}
- Primary goal: ${goalLabel}
- Session length: about ${prefs.preferredWorkoutTime} minutes
- Prefers training ${prefs.musclesPerWorkout === "not_sure" ? "a coach-recommended number of" : prefs.musclesPerWorkout} muscle group(s) per session
- Enjoys cardio: ${prefs.cardioActivities.length ? prefs.cardioActivities.join(", ") : "none specified"}
${lifts.length ? `- Current strength: ${lifts.join("; ")}` : ""}
Return ONLY valid JSON, no markdown, in exactly this shape:
{
  "goal": "${goalLabel}",
  "days_per_week": ${prefs.trainingDaysPerWeek},
  "days": [
    {
      "day": "Day 1",
      "name": "Push Day",
      "focus": "Chest, Shoulders & Triceps",
      "exercises": [{ "name": "Barbell Bench Press", "sets": 4, "reps": "8-10" }]
    }
  ]
}
Rules:
- Exactly ${prefs.trainingDaysPerWeek} entries in "days", labelled "Day 1" … "Day ${prefs.trainingDaysPerWeek}".
- Use this split: ${SPLIT_GUIDE[prefs.trainingDaysPerWeek] ?? "a sensible split"}.
- ${prefs.preferredWorkoutTime <= 40 ? "4-5" : prefs.preferredWorkoutTime <= 70 ? "5-7" : "6-8"} exercises per day, matched to the session length.
- If the user enjoys cardio, finish appropriate days with one of their preferred cardio activities as an exercise (e.g. { "name": "Running", "sets": 1, "reps": "15 min" }).
- Use well-known gym exercise names only.
- "reps" is a string like "8-12", "5", or "30 sec".
- Scale intensity to a ${prefs.fitnessLevel} lifter.`;

    const { result: raw } = await serverGroqChat({
      data: {
        prompt,
        model: "openai/gpt-oss-120b",
        max_tokens: 2500,
        temperature: 0.4,
        response_format_json: true,
      },
    });
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    if (!parsed?.days || !Array.isArray(parsed.days) || parsed.days.length === 0) {
      throw new Error("The AI returned an invalid plan. Please try again.");
    }

    // Replace any previous plan
    const { data: old } = await supabase
      .from("workout_plans")
      .select("id")
      .eq("user_id", user.id);
    if (old && old.length > 0) {
      await supabase
        .from("workout_plans")
        .delete()
        .in("id", old.map((o: any) => o.id));
    }
    const { error } = await supabase.from("workout_plans").insert({
      user_id: user.id,
      goal: goalLabel, // NOT NULL column in workout_plans
      plan_json: parsed,
    } as any);
    if (error) throw error;
  };

  const finish = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const prefs = buildPrefs();
      await saveWorkoutPrefs(user.id, prefs);

      if (planChoice === "ai_generated") {
        await generateAiPlan(prefs);
        toast.success("Your personalized plan is ready! 💪");
        navigate({ to: "/workout" });
      } else if (planChoice === "library") {
        sessionStorage.setItem("workout_initial_tab", "HOME");
        toast.success("Preferences saved — browse the library!");
        navigate({ to: "/workout" });
      } else {
        toast.success("Preferences saved — build your weekly plan!");
        navigate({ to: "/custom-plan" });
      }
    } catch (e: any) {
      toast.error(e.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-36">
      {/* ── Header + progress ── */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-md items-center gap-3 px-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            disabled={busy}
            onClick={() =>
              step > 1 ? setStep(step - 1) : navigate({ to: "/workout" })
            }
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-bold">
              {STEP_TITLES[step - 1]}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Step {step} of {TOTAL_STEPS}
            </p>
          </div>
        </div>
        <div className="h-1 w-full bg-muted">
          <div
            className="h-full bg-accent transition-all duration-500 ease-out glow-accent-sm"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      <main className="mx-auto max-w-md px-4 py-6">
        <div
          key={step}
          className="animate-in fade-in slide-in-from-right-4 duration-300"
        >
          {/* ── 1. Fitness level ── */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="mb-5 text-sm text-muted-foreground">
                How long have you been training consistently?
              </p>
              {FITNESS_LEVELS.map((o) => (
                <OptionCard
                  key={o.value}
                  active={level === o.value}
                  onClick={() => setLevel(o.value)}
                >
                  <span className="block text-sm font-semibold">{o.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {o.detail}
                  </span>
                </OptionCard>
              ))}
            </div>
          )}

          {/* ── 2. Goal ── */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="mb-5 text-sm text-muted-foreground">
                What are you training for?
              </p>
              {FITNESS_GOALS.map((o) => (
                <OptionCard
                  key={o.value}
                  active={goal === o.value}
                  onClick={() => setGoal(o.value)}
                >
                  <span className="text-sm font-semibold">
                    {o.emoji} {o.label}
                  </span>
                </OptionCard>
              ))}
            </div>
          )}

          {/* ── 3. Strongest lifts ── */}
          {step === 3 && (
            <div className="space-y-3">
              <p className="mb-1 text-sm text-muted-foreground">
                We'll pre-fill these weights when you log matching exercises.
              </p>
              <p className="mb-4 text-xs font-bold uppercase tracking-wider text-accent">
                Optional — skip if unsure
              </p>
              <LiftRow label="Bench Press" value={bench} onChange={setBench} />
              <LiftRow label="Back Squat" value={squat} onChange={setSquat} />
              <LiftRow label="Deadlift" value={deadlift} onChange={setDeadlift} />
            </div>
          )}

          {/* ── 4. Training days ── */}
          {step === 4 && (
            <div className="space-y-3">
              <p className="mb-5 text-sm text-muted-foreground">
                This decides your weekly split —{" "}
                <span className="font-semibold text-foreground">
                  {SPLIT_GUIDE[days]}
                </span>
                .
              </p>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <button
                    key={n}
                    onClick={() => setDays(n)}
                    className={`flex h-16 flex-col items-center justify-center rounded-2xl border-2 font-display transition-all ${
                      days === n
                        ? "border-accent bg-accent/10 text-accent glow-accent-sm"
                        : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40"
                    }`}
                  >
                    <span className="text-xl font-bold">{n}</span>
                    <span className="text-[9px] font-bold uppercase">
                      {n === 7 ? "daily" : n === 1 ? "day" : "days"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── 5. Cardio multi-select ── */}
          {step === 5 && (() => {
            const CARDIO_EMOJI: Record<string, string> = {
              "Treadmill running": "🏃",
              "Outdoor walk": "🚶",
              "Cycling": "🚴",
              "Swimming": "🏊",
              "Jump rope": "🪢",
              "HIIT": "🔥",
              "Yoga & Pilates": "🧘",
              "Stair climbing": "🪜",
              "Elliptical": "⚙️",
              "Rowing machine": "🚣",
              "SkiErg": "⛷️",
              "Dancing": "💃",
              "Badminton": "🏸",
              "Cricket": "🏏",
              "Football": "⚽",
            };
            return (
              <div className="space-y-3">
                <p className="mb-5 text-sm text-muted-foreground">
                  Pick all that apply — we'll recommend these on your Cardio tab.
                  Leave empty if cardio isn't your thing.
                </p>
                {CARDIO_OPTIONS.map((c) => {
                  const active = cardio.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() =>
                        setCardio((prev) =>
                          active ? prev.filter((x) => x !== c) : [...prev, c],
                        )
                      }
                      className={`flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all ${
                        active
                          ? "border-accent bg-accent/10 glow-accent-sm"
                          : "border-border bg-card hover:border-muted-foreground/40"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                          active
                            ? "border-accent bg-accent"
                            : "border-muted-foreground/40"
                        }`}
                      >
                        {active && (
                          <Check className="h-3 w-3 text-accent-foreground" />
                        )}
                      </span>
                      <span className="text-sm font-semibold">
                        {CARDIO_EMOJI[c] ?? "🏅"} {c}
                      </span>
                    </button>
                  );
                })}
                {/* Custom entry */}
                <div className="rounded-2xl border-2 border-dashed border-border bg-card p-4">
                  <p className="mb-2 text-xs font-bold text-muted-foreground">Can't find what you're looking for? Type it in</p>
                  <div className="flex gap-2">
                    <Input
                      value={customCardio}
                      onChange={(e) => setCustomCardio(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && customCardio.trim()) {
                          const val = customCardio.trim();
                          if (!cardio.includes(val)) setCardio((prev) => [...prev, val]);
                          setCustomCardio("");
                        }
                      }}
                      placeholder="e.g. Rock climbing"
                      className="h-10 rounded-xl flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = customCardio.trim();
                        if (!val) return;
                        if (!cardio.includes(val)) setCardio((prev) => [...prev, val]);
                        setCustomCardio("");
                      }}
                      className="h-10 rounded-xl border-2 border-accent bg-accent/10 px-4 text-sm font-bold text-accent transition-all hover:bg-accent/20"
                    >
                      Add
                    </button>
                  </div>
                  {cardio.filter((c) => !CARDIO_OPTIONS.includes(c as any)).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {cardio.filter((c) => !CARDIO_OPTIONS.includes(c as any)).map((c) => (
                        <span
                          key={c}
                          className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent"
                        >
                          🏅 {c}
                          <button
                            type="button"
                            onClick={() => setCardio((prev) => prev.filter((x) => x !== c))}
                            className="ml-0.5 opacity-60 hover:opacity-100"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ── 6. Muscles per workout ── */}
          {step === 6 && (
            <div className="space-y-3">
              <p className="mb-5 text-sm text-muted-foreground">
                How many muscle groups do you usually hit in one session?
              </p>
              {(
                [
                  { v: 1, label: "One", detail: "Focused — e.g. chest day" },
                  { v: 2, label: "Two", detail: "Paired — e.g. chest & triceps" },
                  { v: 3, label: "Three", detail: "Big sessions — e.g. push day" },
                  { v: "not_sure", label: "Not sure", detail: "Let the plan decide" },
                ] as const
              ).map((o) => (
                <OptionCard
                  key={String(o.v)}
                  active={muscles === o.v}
                  onClick={() => setMuscles(o.v)}
                >
                  <span className="block text-sm font-semibold">{o.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {o.detail}
                  </span>
                </OptionCard>
              ))}
            </div>
          )}

          {/* ── 7. Duration slider ── */}
          {step === 7 && (
            <div className="space-y-8">
              <p className="text-sm text-muted-foreground">
                How long is a typical session for you?
              </p>
              <div className="text-center">
                <div className="inline-flex items-baseline gap-2 rounded-3xl border border-accent/30 bg-accent/5 px-8 py-5 transition-all duration-200">
                  <Timer className="h-6 w-6 self-center text-accent" />
                  <span className="font-display text-5xl font-bold tracking-tight text-accent transition-all">
                    {duration}
                  </span>
                  <span className="text-sm font-bold text-muted-foreground">
                    min
                  </span>
                </div>
              </div>
              <div className="px-2">
                <Slider
                  value={[duration]}
                  onValueChange={(v) => setDuration(v[0])}
                  min={30}
                  max={120}
                  step={10}
                  className="cursor-grab py-4 active:cursor-grabbing [&_[role=slider]]:h-8 [&_[role=slider]]:w-8 [&_[role=slider]]:border-none [&_[role=slider]]:bg-accent [&_[role=slider]]:shadow-[0_0_20px_-2px_var(--accent)] [&_[role=slider]]:transition-transform [&_[role=slider]]:duration-150 [&_[role=slider]:active]:scale-125"
                />
                <div className="mt-2 flex justify-between text-xs font-bold text-muted-foreground/60">
                  <span>30 min</span>
                  <span>1 h</span>
                  <span>1.5 h</span>
                  <span>2 h</span>
                </div>
              </div>
            </div>
          )}

          {/* ── 8. Plan choice ── */}
          {step === 8 && (
            <div className="space-y-3">
              <p className="mb-5 text-sm text-muted-foreground">
                How do you want your training plan?
              </p>
              <OptionCard
                active={planChoice === "ai_generated"}
                onClick={() => setPlanChoice("ai_generated")}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-accent" /> Let AI Pick for Me
                  <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent-foreground">
                    Recommended
                  </span>
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  A personalized plan generated from all your answers.
                </span>
              </OptionCard>
              <OptionCard
                active={planChoice === "library"}
                onClick={() => setPlanChoice("library")}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Library className="h-4 w-4 text-accent" /> Choose from Workout
                  Library
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Browse ready-made routines and start one.
                </span>
              </OptionCard>
              <OptionCard
                active={planChoice === "custom"}
                onClick={() => setPlanChoice("custom")}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <PencilRuler className="h-4 w-4 text-accent" /> Build My Own
                  Workout
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Start empty — pick muscle groups and log as you go.
                </span>
              </OptionCard>
            </div>
          )}
        </div>
      </main>

      {/* ── Sticky footer nav ── */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 pb-safe backdrop-blur-xl">
        <div className="mx-auto max-w-md px-4 py-3">
          {step < TOTAL_STEPS ? (
            <Button
              onClick={() => setStep(step + 1)}
              className="h-13 w-full gap-2 rounded-full bg-accent py-6 text-base font-bold text-accent-foreground hover:bg-accent/90"
            >
              Continue <ArrowRight className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              onClick={finish}
              disabled={busy}
              className="h-13 w-full gap-2 rounded-full bg-accent py-6 text-base font-bold text-accent-foreground glow-accent hover:bg-accent/90"
            >
              {busy ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {planChoice === "ai_generated"
                    ? "Building your plan…"
                    : "Saving…"}
                </>
              ) : planChoice === "ai_generated" ? (
                <>
                  <Sparkles className="h-5 w-5" /> Generate my plan
                </>
              ) : (
                <>
                  Finish <ArrowRight className="h-5 w-5" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
