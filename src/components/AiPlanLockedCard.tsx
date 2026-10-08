import { Link } from "@tanstack/react-router";
import { Lock, Sparkles } from "lucide-react";

/** "Let AI Pick for You" for a user without access: shown, not selectable. */
export function AiPlanLockedCard() {
  return (
    <div className="w-full rounded-2xl border border-dashed border-border bg-card p-4 text-left opacity-80">
      <span className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-muted-foreground" /> Let AI Pick for
        You
        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">
        Premium.{" "}
        <Link to="/plans" className="font-semibold text-accent underline">
          Pick a plan
        </Link>{" "}
        to get a personalized AI plan.
      </span>
    </div>
  );
}
