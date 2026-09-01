/**
 * Does this user currently have access?
 *
 * Three states, never a boolean — the same distinction useWorkoutPrefsGate and
 * useAuth().hasProfile already draw. "Still checking" must be separable from
 * "checked, and genuinely lapsed", or every paying user sees the upsell overlay
 * flash on every page load.
 *
 * The gate reads access_until and nothing else: not the subscription status,
 * not a JWT claim, not a plan name. A halted subscription with days left keeps
 * working, and a row that was never recomputed fails closed.
 *
 * Caching an absolute timestamp in localStorage is safe in a way that caching a
 * boolean would not be: a stale cache can only grant what it already recorded,
 * because hasAccess() still compares it to now(). Under-granting is corrected by
 * the read that follows.
 *
 * This is presentation. The real boundary is requireAccess in
 * src/lib/access-middleware.ts, which re-checks the database on every metered
 * server call.
 */

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getBillingSummary } from "@/lib/billing";
import { hasAccess } from "@/lib/entitlement";

export type AccessState = "loading" | "entitled" | "lapsed";

export interface AccessGate {
  state: AccessState;
  accessUntil: string | null;
}

const CACHE_PREFIX = "dombelz.access_until.";

function readCache(userId: string): string | null {
  try {
    return localStorage.getItem(CACHE_PREFIX + userId);
  } catch {
    return null;
  }
}

function writeCache(userId: string, value: string | null): void {
  try {
    if (value) localStorage.setItem(CACHE_PREFIX + userId, value);
    else localStorage.removeItem(CACHE_PREFIX + userId);
  } catch {
    /* private mode, quota — the network read still decides */
  }
}

/**
 * One entitlement read per user per page load, shared by every gate on screen.
 * The dashboard alone mounts several; without this they would each recompute.
 */
const inFlight = new Map<string, Promise<string | null>>();

function loadAccessUntil(userId: string): Promise<string | null> {
  let p = inFlight.get(userId);
  if (!p) {
    p = getBillingSummary()
      .then((s) => {
        writeCache(userId, s.access_until);
        return s.access_until;
      })
      .catch(() => {
        // Fall back to the cached timestamp rather than to a guess. It expires
        // on its own, so a network blip cannot extend anybody's access.
        inFlight.delete(userId);
        return readCache(userId);
      });
    inFlight.set(userId, p);
  }
  return p;
}

/** Drop the cached answer so the next gate re-reads. Call after a purchase. */
export function invalidateAccess(userId?: string | null): void {
  if (userId) {
    inFlight.delete(userId);
    writeCache(userId, null);
  } else {
    inFlight.clear();
  }
}

export function useAccessGate(): AccessGate {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const [accessUntil, setAccessUntil] = useState<string | null>(() =>
    userId ? readCache(userId) : null,
  );
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setChecked(false);
    loadAccessUntil(userId).then((until) => {
      if (cancelled) return;
      setAccessUntil(until);
      setChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Signed out is the auth redirect's problem, not this gate's.
  if (authLoading || !userId) return { state: "loading", accessUntil: null };

  // A cache hit that is still in the future renders straight through, so a
  // returning subscriber never waits on the network to see their own page.
  if (hasAccess(accessUntil)) return { state: "entitled", accessUntil };

  return { state: checked ? "lapsed" : "loading", accessUntil };
}
