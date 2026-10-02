import { useEffect, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

/**
 * Opt-in feature tour: small pointer bubbles anchored to real controls marked
 * with `data-tour="<id>"`. Nothing here blocks the page.
 *
 * Progress: "dashboard" → "food" → "done". The dashboard offers the tour;
 * "Skip tour" anywhere jumps straight to "done".
 */
export type TourState = "dashboard" | "food" | "done";

// ponytail: per-device localStorage, so a tour started on one phone does not
// continue on another. Fine for an optional tutorial; move to a profile column
// if that ever matters.
const key = (userId: string) => `dombelz_tour_${userId}`;

export function getTour(userId: string): TourState | null {
  try {
    return localStorage.getItem(key(userId)) as TourState | null;
  } catch {
    return null;
  }
}

export function setTour(userId: string, state: TourState): void {
  try {
    localStorage.setItem(key(userId), state);
  } catch {
    // Storage blocked. The cost is a tour that does not continue.
  }
}

export interface TourStep {
  target: string;
  text: string;
}

const RING = [
  "ring-2",
  "ring-accent",
  "ring-offset-2",
  "ring-offset-background",
];

/** First visible match: desktop and mobile render different navs. */
function findTarget(id: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`);
  return [...all].find((el) => el.getClientRects().length > 0) ?? null;
}

export function Tour({
  steps,
  onDone,
}: {
  steps: TourStep[];
  /** `skipped` is true when the user chose "Skip tour". */
  onDone: (skipped: boolean) => void;
}) {
  const [i, setI] = useState(0);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  const next = () => (last ? onDone(false) : setI(i + 1));

  // Targets can mount late (data loads, dialogs close), so poll briefly. A
  // target that never shows up is skipped rather than hanging the tour.
  useEffect(() => {
    if (!step) return;
    setEl(null);
    let tries = 0;
    const id = setInterval(() => {
      const found = findTarget(step.target);
      if (found) {
        clearInterval(id);
        found.scrollIntoView({ block: "center", behavior: "smooth" });
        setEl(found);
      } else if (++tries >= 10) {
        clearInterval(id);
        if (last) onDone(false);
        else setI((n) => n + 1);
      }
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  useEffect(() => {
    if (!el) return;
    el.classList.add(...RING);
    return () => el.classList.remove(...RING);
  }, [el]);

  if (!step || !el) return null;

  return (
    <Popover open modal={false}>
      <PopoverAnchor virtualRef={{ current: el }} />
      <PopoverContent
        side="bottom"
        collisionPadding={16}
        className="w-64 rounded-2xl border-accent/40 p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={() => onDone(true)}
      >
        <PopoverPrimitive.Arrow className="fill-accent" width={14} height={7} />
        <p className="text-sm leading-snug">{step.text}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            {i + 1}/{steps.length}
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => onDone(true)}
            >
              Skip tour
            </Button>
            <Button size="sm" className="h-8 text-xs" onClick={next}>
              {last ? "Got it" : "Next"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The one-time ask. Small and above the bottom nav, never a full modal. */
export function TourOffer({
  onYes,
  onNo,
}: {
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-accent/30 bg-card py-3 pl-4 pr-3 shadow-lg md:bottom-6">
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold leading-tight">New here?</p>
        <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
          Take a 30-second tour of the features.
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-stretch gap-1">
        <Button size="sm" className="h-8 rounded-full px-4" onClick={onYes}>
          Show me
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 rounded-full px-3 text-xs text-muted-foreground"
          onClick={onNo}
        >
          No thanks
        </Button>
      </div>
    </div>
  );
}
