/**
 * Has this user filled the training questionnaire?
 *
 * Three states, not a boolean. "Still checking" and "checked, and genuinely
 * absent" have to be distinguishable or every returning user sees the lock
 * screen flash before the database answers — the same distinction
 * `useAuth().hasProfile` already draws in src/lib/auth.tsx.
 *
 * A `workout_profile` row is the whole question. `preferred_training_plan` of
 * 'skip' still counts as filled: the user answered every question and chose not
 * to pick a plan, which is a supported outcome of /workout-setup, not an
 * abandoned form.
 */

import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  getCachedWorkoutPrefs,
  loadWorkoutPrefs,
  type WorkoutPrefs,
} from "@/lib/workoutPrefs";

export type WorkoutGateState = "loading" | "missing" | "ready";

/**
 * The prefs WorkoutGate already loaded, handed down so the page inside does not
 * issue a second identical read — and, more importantly, so it cannot briefly
 * render its own "no preferences yet" state while that second read is in
 * flight, moments after the gate decided there were preferences.
 *
 * Lives here rather than beside the component so WorkoutGate.tsx exports only
 * components and keeps fast refresh working.
 */
export const GatedPrefsCtx = createContext<WorkoutPrefs | null>(null);

/** Non-null anywhere inside a passed WorkoutGate. */
export const useGatedWorkoutPrefs = () => useContext(GatedPrefsCtx);

export interface WorkoutPrefsGate {
  state: WorkoutGateState;
  prefs: WorkoutPrefs | null;
}

export function useWorkoutPrefsGate(): WorkoutPrefsGate {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  // Seed from the synchronous localStorage cache. A hit means a returning user
  // renders straight through and never sees the gate at all.
  const [prefs, setPrefs] = useState<WorkoutPrefs | null>(() =>
    userId ? getCachedWorkoutPrefs(userId) : null,
  );
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setChecked(false);
    loadWorkoutPrefs(userId)
      .then((p) => {
        if (cancelled) return;
        if (p) setPrefs(p);
        setChecked(true);
      })
      .catch(() => {
        // Fail open. A transient read failure must never lock someone out of
        // their own workout page; the worst case of guessing "ready" is that
        // the page renders without preference-derived defaults, which is how
        // it behaved before this gate existed.
        if (cancelled) return;
        setPrefs((current) => current ?? ({} as WorkoutPrefs));
        setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // The signed-out case belongs to the auth redirect, not to this gate.
  if (authLoading || !userId) return { state: "loading", prefs: null };
  if (prefs) return { state: "ready", prefs };
  return { state: checked ? "missing" : "loading", prefs: null };
}

/**
 * The user's prefs for display (units, mostly), read local-first: the
 * localStorage cache when it has them, with no network call; one DB read only
 * when it does not (a new device, cleared storage), which refills the cache.
 *
 * State rather than a render-time cache read, so the page re-renders when the
 * DB answer arrives. A bare getCachedWorkoutPrefs() in render fell back to kg
 * on a fresh session and stayed there, whatever unit the user had saved.
 */
export function useCachedWorkoutPrefs(
  userId: string | null | undefined,
): WorkoutPrefs | null {
  const [prefs, setPrefs] = useState<WorkoutPrefs | null>(() =>
    userId ? getCachedWorkoutPrefs(userId) : null,
  );

  useEffect(() => {
    if (!userId) return;
    const cached = getCachedWorkoutPrefs(userId);
    if (cached) {
      setPrefs(cached);
      return;
    }
    let cancelled = false;
    loadWorkoutPrefs(userId)
      .then((p) => {
        if (!cancelled && p) setPrefs(p);
      })
      .catch(() => {
        /* keep the kg/km defaults */
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return prefs;
}
