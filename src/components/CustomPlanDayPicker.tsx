import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * One horizontally-scrolling line of day pills.
 *
 * Touch swipe scrolls this natively and is left completely alone. A mouse has
 * nothing to grab (the scrollbar is hidden by design), so three things are
 * added for it: click-and-drag, the wheel, and auto-scrolling the day of
 * interest into view.
 */
export function ScrollableDayRow({
  activeIdx,
  children,
}: {
  activeIdx: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Mouse-drag bookkeeping. A ref, not state — this changes on every
  // mousemove and must not re-render the row while it's being dragged.
  const drag = useRef({ down: false, startX: 0, startScroll: 0, moved: false });

  // Wheel → horizontal scroll, without stealing the page's vertical scroll.
  // Bound natively with { passive: false } because React binds wheel
  // passively at the root, where preventDefault() is ignored.
  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const onWheel = (e: WheelEvent) => {
      if (row.scrollWidth <= row.clientWidth) return; // nothing to scroll
      const delta =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const atStart = row.scrollLeft <= 0 && delta < 0;
      const atEnd =
        row.scrollLeft + row.clientWidth >= row.scrollWidth - 1 && delta > 0;
      if (atStart || atEnd) return; // let the page take it
      e.preventDefault();
      row.scrollLeft += delta;
    };
    row.addEventListener("wheel", onWheel, { passive: false });
    return () => row.removeEventListener("wheel", onWheel);
  }, []);

  // Bring the day of interest into view: the current day on load, and
  // whichever day the user taps (so tapping a half-visible pill at the edge
  // pulls it and its neighbours into frame).
  useEffect(() => {
    const row = ref.current;
    const pill = row?.children[activeIdx] as HTMLElement | undefined;
    if (!row || !pill) return;
    // scrollLeft directly, never scrollIntoView — the latter can scroll the
    // page vertically when this row is below the fold.
    const target =
      pill.offsetLeft - row.clientWidth / 2 + pill.clientWidth / 2;
    row.scrollTo({ left: target, behavior: "smooth" });
    // Keyed on activeIdx alone — adding `children` would re-run this on every
    // parent render and fight the user mid-drag.
  }, [activeIdx]);

  return (
    <div
      ref={ref}
      className="no-scrollbar flex cursor-grab select-none gap-2 overflow-x-auto pb-1 active:cursor-grabbing"
      onPointerDown={(e) => {
        // Touch/pen already scroll natively — only the mouse needs help.
        if (e.pointerType !== "mouse") return;
        const row = ref.current;
        if (!row) return;
        drag.current = {
          down: true,
          startX: e.clientX,
          startScroll: row.scrollLeft,
          moved: false,
        };
      }}
      onPointerMove={(e) => {
        const row = ref.current;
        if (!drag.current.down || !row) return;
        const dx = e.clientX - drag.current.startX;
        // Small threshold so a slightly-shaky click still counts as a click.
        if (Math.abs(dx) > 4) drag.current.moved = true;
        row.scrollLeft = drag.current.startScroll - dx;
      }}
      onPointerUp={() => {
        drag.current.down = false;
      }}
      onPointerLeave={() => {
        drag.current.down = false;
      }}
      onClickCapture={(e) => {
        // Swallow the click that follows a drag, so dragging across the row
        // never selects whichever day you happened to let go over.
        if (drag.current.moved) {
          e.preventDefault();
          e.stopPropagation();
          drag.current.moved = false;
        }
      }}
    >
      {children}
    </div>
  );
}

/**
 * Re-phase the repeating cycle: pick which day of the split you're actually
 * on today. Tapping a pill only stages the choice — nothing is written until
 * Confirm, and a rejected write leaves the choice staged so it can be retried.
 *
 * `onConfirm` returns whether the change was committed.
 */
export function CustomPlanDayPicker({
  days,
  todayIdx,
  onConfirm,
}: {
  days: { day: string }[];
  todayIdx: number;
  onConfirm: (i: number) => Promise<boolean>;
}) {
  // A day the user tapped but hasn't confirmed. Local only — never written.
  const [pendingDayIdx, setPendingDayIdx] = useState<number | null>(null);

  return (
    <>
      {/* Day selector — tap to stage, then confirm below. The row
          follows whichever day you tap, falling back to today's. */}
      <ScrollableDayRow activeIdx={pendingDayIdx ?? todayIdx}>
        {days.map((d, i) => {
          const isToday = i === todayIdx;
          const isPending = i === pendingDayIdx && !isToday;
          return (
            <button
              key={i}
              onClick={() =>
                setPendingDayIdx((prev) =>
                  prev === i || i === todayIdx ? null : i,
                )
              }
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
                isToday
                  ? "bg-accent text-accent-foreground glow-accent-sm"
                  : isPending
                    ? "border-2 border-accent text-accent"
                    : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {d.day}
            </button>
          );
        })}
      </ScrollableDayRow>

      {/* Confirm bar — only while a different day is staged */}
      {pendingDayIdx !== null && pendingDayIdx !== todayIdx && (
        <div className="animate-in fade-in slide-in-from-top-1 flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/5 p-3 duration-200">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            Make{" "}
            <span className="font-bold text-foreground">
              {days[pendingDayIdx].day}
            </span>{" "}
            today? Your plan continues from there.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 text-xs"
            onClick={() => setPendingDayIdx(null)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 shrink-0 bg-accent text-xs text-accent-foreground hover:bg-accent/90"
            onClick={async () => {
              if (await onConfirm(pendingDayIdx)) setPendingDayIdx(null);
            }}
          >
            Confirm
          </Button>
        </div>
      )}
    </>
  );
}
