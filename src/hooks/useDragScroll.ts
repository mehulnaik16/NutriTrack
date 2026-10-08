import { useRef, type PointerEvent, type MouseEvent } from "react";

/**
 * Click-and-drag sideways scrolling for a horizontal row, for mouse users
 * (touch already swipes natively). Spread the result onto the scrolling
 * element. A drag that ends over a button doesn't click it, and scroll
 * snapping is paused while dragging so the row follows the mouse.
 */
export function useDragScroll() {
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const reset = (row: HTMLElement) => {
    row.style.scrollSnapType = "";
    row.style.cursor = "";
  };
  return {
    onPointerDown: (ev: PointerEvent<HTMLElement>) => {
      if (ev.pointerType !== "mouse" || ev.button !== 0) return;
      drag.current = {
        x: ev.clientX,
        left: ev.currentTarget.scrollLeft,
        moved: false,
      };
    },
    onPointerMove: (ev: PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d) return;
      const dx = ev.clientX - d.x;
      if (!d.moved && Math.abs(dx) < 5) return;
      const row = ev.currentTarget;
      if (!d.moved) {
        d.moved = true;
        // Snapping fights a manual scroll; it comes back on release.
        row.style.scrollSnapType = "none";
        row.style.cursor = "grabbing";
        row.setPointerCapture(ev.pointerId);
      }
      row.scrollLeft = d.left - dx;
    },
    onPointerUp: (ev: PointerEvent<HTMLElement>) => {
      reset(ev.currentTarget);
      // Keep `moved` until the click it would fire is swallowed.
      if (!drag.current?.moved) drag.current = null;
    },
    onPointerCancel: (ev: PointerEvent<HTMLElement>) => {
      reset(ev.currentTarget);
      drag.current = null;
    },
    onClickCapture: (ev: MouseEvent<HTMLElement>) => {
      if (drag.current?.moved) {
        ev.stopPropagation();
        ev.preventDefault();
      }
      drag.current = null;
    },
    onDragStart: (ev: MouseEvent<HTMLElement>) => ev.preventDefault(),
  };
}
