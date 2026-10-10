import { useEffect, useRef, useState } from "react";

// While an overlay is open it owns one history entry, so the phone/browser
// back gesture closes just the overlay instead of leaving the page.
function useBackClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    const id = Math.random().toString(36).slice(2);
    let pushed = false;
    // Deferred so React StrictMode's mount/unmount/mount doesn't leave a stray entry.
    const timer = setTimeout(() => {
      window.history.pushState({ ...window.history.state, __overlay: id }, "");
      pushed = true;
    }, 0);
    const onPop = () => {
      if (window.history.state?.__overlay !== id) closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("popstate", onPop);
      // Closed from the UI while our entry is still on top: drop it.
      if (pushed && window.history.state?.__overlay === id) window.history.back();
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
