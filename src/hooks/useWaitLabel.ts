import { useEffect, useState } from "react";

/**
 * Loading copy that moves on while an AI call runs long. Under 2 s the plain
 * label shows; after that a bare spinner reads as frozen, so the stages cycle
 * every 3 s and stop on the last one.
 */
export function useWaitLabel(active: boolean, first: string, stages: string[]) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    if (!active) return;
    const started = Date.now();
    const iv = setInterval(() => setElapsed(Date.now() - started), 500);
    return () => clearInterval(iv);
  }, [active]);
  if (elapsed < 2000) return { label: first, long: false };
  const i = Math.min(stages.length - 1, Math.floor((elapsed - 2000) / 3000));
  return { label: stages[i], long: true };
}
