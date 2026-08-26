/**
 * Locks the workout pages until the training questionnaire has been filled.
 *
 * The page behind the lock is rendered, blurred and inert, rather than replaced
 * by an empty screen — showing what is being unlocked makes the gate read as an
 * invitation instead of a wall. The bottom navigation deliberately stays
 * reachable: a gate the user cannot leave is a worse bug than the one it fixes.
 */

import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, Loader2, Lock } from "lucide-react";
import {
  GatedPrefsCtx,
  useWorkoutPrefsGate,
} from "@/hooks/useWorkoutPrefsGate";

export function WorkoutGate({ children }: { children: ReactNode }) {
  const { state, prefs } = useWorkoutPrefsGate();
  const navigate = useNavigate();

  if (state === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  if (state === "ready") {
    return (
      <GatedPrefsCtx.Provider value={prefs}>{children}</GatedPrefsCtx.Provider>
    );
  }

  return (
    <div className="relative">
      {/* The real page, shown but unusable. aria-hidden and inert keep it out
          of the accessibility tree and the tab order, so a keyboard or screen
          reader user cannot reach controls the gate is meant to block. */}
      <div
        aria-hidden="true"
        // @ts-expect-error -- `inert` lands in React's JSX types after 19.2
        inert=""
        className="pointer-events-none select-none blur-sm saturate-50 opacity-40"
      >
        {children}
      </div>

      <div className="absolute inset-0 z-10 flex items-start justify-center px-4 pt-24">
        <div className="w-full max-w-sm rounded-3xl border border-accent/30 bg-card/95 p-6 text-center shadow-xl backdrop-blur-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground glow-accent-sm">
            <Lock className="h-6 w-6" />
          </div>

          <h2 className="mt-4 font-display text-xl font-bold tracking-tight">
            Set up your training first
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Two minutes of questions is what powers the rest of this page — your
            plan, the cardio we recommend, and the starting weights on every
            lift. Without it there is nothing here to tune.
          </p>

          <button
            onClick={() => navigate({ to: "/workout-setup" })}
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-bold text-accent-foreground transition-colors hover:bg-accent/90"
          >
            Set up my training
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
