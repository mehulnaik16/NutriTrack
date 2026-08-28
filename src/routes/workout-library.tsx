import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { WorkoutGate } from "@/components/WorkoutGate";
import { useState } from "react";
import { ArrowLeft, ChevronRight, Library, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollableDayRow } from "@/components/CustomPlanDayPicker";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";
import { loadWorkoutPrefs, saveWorkoutPrefs } from "@/lib/workoutPrefs";
import { WORKOUT_LIBRARY, type LibraryPlan } from "@/lib/workoutLibrary";

export const Route = createFileRoute("/workout-library")({
  component: GatedWorkoutLibrary,
  // Which plan is previewed lives in the URL, so hardware/browser Back pops from
  // the preview to the list (not out to /workout) — same as the in-page arrow.
  validateSearch: (s: Record<string, unknown>): { lib?: number } => {
    const n = Number(s.lib);
    return Number.isInteger(n) ? { lib: n } : {};
  },
});

function GatedWorkoutLibrary() {
  return (
    <WorkoutGate>
      <WorkoutLibrary />
    </WorkoutGate>
  );
}

/** Which plan day is "today"? Monday = Day 1 (mirrors workout.tsx). */
function todaysPlanIndex(daysCount: number): number {
  if (daysCount <= 0) return 0;
  const weekday = (new Date().getDay() + 6) % 7; // Mon = 0
  return weekday % daysCount;
}

function WorkoutLibrary() {
  const navigate = useNavigate();
  const { lib: libId } = Route.useSearch();
  const selected = WORKOUT_LIBRARY.find((l) => l.id === libId) ?? null;

  if (selected) return <PreviewView plan={selected} />;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-md items-center gap-3 px-4">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate font-display text-sm font-bold">
              <Library className="h-4 w-4 text-accent" /> Workout Library
            </p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              15 ready-made 7-day plans
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={() => navigate({ to: "/workout" })}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <main className="mx-auto max-w-md space-y-2.5 px-4 py-5">
        {WORKOUT_LIBRARY.map((l) => (
          <button
            key={l.id}
            onClick={() => navigate({ to: "/workout-library", search: { lib: l.id } })}
            className="card-lift flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-accent/40"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-xs font-bold text-accent">
              {l.id}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{l.name}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {l.blurb}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </main>
    </div>
  );
}

/** Read-only preview in the AI-plan format. Selecting persists the plan. */
function PreviewView({ plan }: { plan: LibraryPlan }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const days = plan.plan.days;
  const todayIdx = todaysPlanIndex(days.length);
  const [dayIdx, setDayIdx] = useState(todayIdx);
  const [busy, setBusy] = useState(false);
  const day = days[dayIdx] ?? days[0];

  // A workout_plans row is written ONLY here, on explicit Select. Back/close
  // writes nothing, so a user who bails has no plan (Profile derives "No plan").
  const selectPlan = async () => {
    if (!user || busy) return;
    setBusy(true);
    try {
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
        goal: plan.plan.goal,
        plan_json: plan.plan,
      } as any);
      if (error) throw error;
      const prefs = await loadWorkoutPrefs(user.id);
      if (prefs)
        await saveWorkoutPrefs(user.id, {
          ...prefs,
          preferredTrainingPlan: "library",
        });
      toast.success("Plan added! 💪");
      navigate({ to: "/workout" });
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't add the plan. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-md items-center gap-3 px-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            disabled={busy}
            onClick={() => router.history.back()}
            aria-label="Back to library"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-bold">{plan.name}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {plan.plan.days_per_week} training days/week
            </p>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-md space-y-4 px-4 py-5">
        <p className="text-xs text-muted-foreground">{plan.blurb}</p>

        {/* Day selector */}
        <ScrollableDayRow activeIdx={dayIdx}>
          {days.map((d, i) => (
            <button
              key={i}
              onClick={() => setDayIdx(i)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
                i === dayIdx
                  ? "bg-accent text-accent-foreground glow-accent-sm"
                  : i === todayIdx
                    ? "border border-accent/50 text-accent"
                    : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {d.day}
              {i === todayIdx && " · Today"}
            </button>
          ))}
        </ScrollableDayRow>

        {/* Day header */}
        <div className="rounded-2xl border border-accent/25 bg-card">
          <div className="border-b border-border/60 bg-accent/5 px-5 py-4">
            <p className="font-display text-sm font-bold uppercase tracking-wider">
              {day.name}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {day.focus} · {day.exercises.length} exercise
              {day.exercises.length === 1 ? "" : "s"}
            </p>
          </div>
          {/* Read-only exercise list (logging happens on /workout after Select) */}
          <div className="divide-y divide-border/60">
            {day.exercises.map((ex, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="truncate text-sm font-semibold">{ex.name}</span>
                </div>
                <span className="shrink-0 text-xs font-bold text-muted-foreground">
                  {ex.sets} × {ex.reps}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Sticky Select */}
      <div className="fixed bottom-16 left-0 right-0 z-40 border-t border-border bg-background/95 pb-safe backdrop-blur-xl md:bottom-0">
        <div className="mx-auto max-w-md px-4 py-3">
          <Button className="w-full" disabled={busy} onClick={selectPlan}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding…
              </>
            ) : (
              "Select this plan"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
