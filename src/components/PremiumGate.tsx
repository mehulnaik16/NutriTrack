/**
 * The one lock used everywhere entitlement gates something.
 *
 * Two things make this different from a CSS blur over the real page:
 *
 *  1. When the gate is closed the children are never mounted, so the queries
 *     inside them never run. What blurs is a placeholder. Removing the blur
 *     class in devtools reveals filler, not the user's data.
 *  2. The overlay appears only once the entitlement read has resolved to
 *     "lapsed". While it is loading nothing is claimed either way, so a paying
 *     user never sees the upsell flash on the way in.
 *
 * It is never a redirect. The page the user asked for stays where they left it,
 * with the reason it is locked layered on top.
 */

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, Lock, Sparkles } from "lucide-react";
import { useAccessGate } from "@/hooks/useAccessGate";

/** Grey bars standing in for whatever the locked surface would have shown. */
function Filler({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-20 rounded-2xl border border-border/60 bg-muted/60"
        />
      ))}
    </div>
  );
}

export interface PremiumGateProps {
  children: ReactNode;
  /** What blurs behind the overlay. Defaults to generic filler bars. */
  placeholder?: ReactNode;
  /** "page" locks a whole route; "inline" locks one control or panel. */
  variant?: "page" | "inline";
  title?: string;
  message?: string;
}

export function PremiumGate({
  children,
  placeholder,
  variant = "page",
  title = "Your access has ended",
  message = "Pick a plan to unlock this again. Everything you have logged is safe and comes straight back.",
}: PremiumGateProps) {
  const { state } = useAccessGate();

  if (state === "entitled") return <>{children}</>;

  if (state === "loading") {
    return variant === "page" ? (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    ) : (
      <div className="flex min-h-[8rem] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Placeholder, not the real page. aria-hidden and inert keep it out of
          the accessibility tree and the tab order. */}
      <div
        aria-hidden="true"
        // @ts-expect-error -- `inert` lands in React's JSX types after 19.2
        inert=""
        className="pointer-events-none select-none blur-sm saturate-50 opacity-40"
      >
        {placeholder ?? <Filler rows={variant === "page" ? 4 : 2} />}
      </div>

      <div
        className={`absolute inset-0 z-10 flex justify-center px-4 ${
          variant === "page" ? "items-start pt-16" : "items-center"
        }`}
      >
        <div className="w-full max-w-sm rounded-3xl border border-accent/30 bg-card/95 p-6 text-center shadow-xl backdrop-blur-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground glow-accent-sm">
            <Lock className="h-6 w-6" />
          </div>

          <h2 className="mt-4 font-display text-xl font-bold tracking-tight">
            {title}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>

          <Link
            to="/plans"
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-bold text-accent-foreground transition-colors hover:bg-accent/90"
          >
            <Sparkles className="h-4 w-4" />
            See plans
          </Link>
        </div>
      </div>
    </div>
  );
}
