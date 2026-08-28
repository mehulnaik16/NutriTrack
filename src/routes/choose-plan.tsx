import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { WorkoutGate } from "@/components/WorkoutGate";
import { useState } from "react";
import { Library, Loader2, PencilRuler, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { generateAiPlan } from "@/lib/aiPlan";
import { loadWorkoutPrefs } from "@/lib/workoutPrefs";

export const Route = createFileRoute("/choose-plan")({
  component: GatedChoosePlan,
});

/** Gated: every path here depends on the questionnaire the gate enforces. */
function GatedChoosePlan() {
  return (
    <WorkoutGate>
      <ChoosePlan />
    </WorkoutGate>
  );
}

type Choice = "ai_generated" | "custom" | "library";

function ChoosePlan() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!user || !choice || busy) return;
    if (choice === "custom") {
      // replace: true so the builder's day-1 back returns to /workout, not
      // back into this chooser — an aborted build creates no plan row.
      navigate({ to: "/custom-plan", replace: true });
      return;
    }
    if (choice === "library") {
      navigate({ to: "/workout-library" });
      return;
    }
    // ai_generated — reuse the exact setup generation from the user's saved
    // workout details.
    setBusy(true);
    try {
      const prefs = await loadWorkoutPrefs(user.id);
      if (!prefs) throw new Error("Finish your workout setup first.");
      await generateAiPlan(user.id, prefs);
      toast.success("Your personalized plan is ready! 💪");
      navigate({ to: "/workout" });
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't generate a plan. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-40">
      {/* ── Header ── */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-md items-center gap-3 px-4">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate font-display text-sm font-bold">
              <PencilRuler className="h-4 w-4 text-accent" /> Choose your workout plan
            </p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Pick how you want to train
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            disabled={busy}
            onClick={() => navigate({ to: "/workout" })}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <main className="mx-auto max-w-md space-y-3 px-4 py-6">
        <OptionCard
          active={choice === "ai_generated"}
          onClick={() => setChoice("ai_generated")}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-accent" /> Let AI Pick for Me
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent-foreground">
              Recommended
            </span>
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            A personalized plan generated from your workout details.
          </span>
        </OptionCard>

        <OptionCard active={choice === "custom"} onClick={() => setChoice("custom")}>
          <span className="flex items-center gap-2 text-sm font-semibold">
            <PencilRuler className="h-4 w-4 text-accent" /> Build My Own Workout
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            Build your own day-by-day split — pick muscle groups for each day.
          </span>
        </OptionCard>

        <OptionCard active={choice === "library"} onClick={() => setChoice("library")}>
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Library className="h-4 w-4 text-accent" /> Choose from Workout Library
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            Browse ready-made routines and start one.
          </span>
        </OptionCard>
      </main>

      {/* ── Sticky confirm ── */}
      <div className="fixed bottom-16 left-0 right-0 z-40 border-t border-border bg-background/95 pb-safe backdrop-blur-xl md:bottom-0">
        <div className="mx-auto max-w-md px-4 py-3">
          <Button
            className="w-full"
            disabled={!choice || busy}
            onClick={confirm}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…
              </>
            ) : (
              "Confirm"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

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
      className={`w-full rounded-2xl border p-4 text-left transition-colors ${
        active
          ? "border-accent bg-accent/10"
          : "border-border bg-card hover:border-accent/40"
      }`}
    >
      {children}
    </button>
  );
}
