import { useEffect, useRef, useState } from "react";

// history.back() calls we made to drop a closed overlay's entry. Their popstate
// is not the user pressing back: an overlay opened in the same moment (scan
// dialog closes, quantity dialog opens) must not close on it, and must not
// push its own entry until it lands, or that back would pop the new entry.
let ownBacks = 0;
let ownPop: Event | null = null;
const afterOwnBacks: (() => void)[] = [];
if (typeof window !== "undefined") {
  // Registered at module load, so it runs before any overlay's listener.
  window.addEventListener("popstate", (e) => {
    if (!ownBacks) return;
    ownBacks--;
    ownPop = e;
    if (!ownBacks) afterOwnBacks.splice(0).forEach((f) => f());
  });
}

// While an overlay is open it owns one history entry, so the phone/browser
// back gesture closes just the overlay instead of leaving the page.
function useBackClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    const id = Math.random().toString(36).slice(2);
    let pushed = false;
    let cancelled = false;
    const push = () => {
      if (cancelled) return;
      if (ownBacks) return void afterOwnBacks.push(push);
      window.history.pushState({ ...window.history.state, __overlay: id }, "");
      pushed = true;
    };
    // Deferred so React StrictMode's mount/unmount/mount doesn't leave a stray entry.
    const timer = setTimeout(push, 0);
    const onPop = (e: PopStateEvent) => {
      if (e === ownPop) return;
      if (window.history.state?.__overlay !== id) closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("popstate", onPop);
      // Closed from the UI while our entry is still on top: drop it.
      if (pushed && window.history.state?.__overlay === id) {
        ownBacks++;
        window.history.back();
      }
    };
  }, [open]);
}

// Drop-in props for a Radix/vaul Root: works controlled or uncontrolled.
export function useBackClosingRoot(props: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [inner, setInner] = useState(props.defaultOpen ?? false);
  const open = props.open ?? inner;
  const onOpenChange = (next: boolean) => {
    setInner(next);
    props.onOpenChange?.(next);
  };
  useBackClose(open, () => onOpenChange(false));
  return { open, onOpenChange };
}
