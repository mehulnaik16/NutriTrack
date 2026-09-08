/**
 * Is the ₹150 referral gift still available to this user?
 *
 * Only pricing display depends on this. What is actually charged is decided in
 * serverCreateSubscription() from the same `referrals` row and the same
 * giftApplies() predicate, so a tampered client can misprice a card it is
 * looking at and nothing else.
 *
 * No RPC and no migration: the referrals RLS policy already grants a user their
 * own row on either side — `auth.uid() = referrer_id or auth.uid() = referee_id`
 * — so a plain select is both readable and bounded to the caller.
 *
 * Shape follows useAccessGate: one read per user per page load shared by every
 * card on screen, and a `loading` state kept distinct from "not eligible" so a
 * referred user does not watch ₹849 appear as a correction. While loading,
 * callers render the list price — quoting full price and correcting downwards is
 * the safe direction; the reverse would be a promise we then take back.
 */

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";

export interface ReferralGift {
  /** The caller's own referrals row status, or null when never referred. */
  status: string | null;
  loading: boolean;
}

const inFlight = new Map<string, Promise<string | null>>();

async function read(userId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("referrals")
      .select("status")
      .eq("referee_id", userId)
      .maybeSingle();
    return (data?.status as string | undefined) ?? null;
  } catch {
    // A network blip must not invent an entitlement. Forget the attempt so the
    // next mount retries, and report "not referred" meanwhile — that shows the
    // list price, which is the safe direction to be wrong in.
    inFlight.delete(userId);
    return null;
  }
}

function loadStatus(userId: string): Promise<string | null> {
  const cached = inFlight.get(userId);
  if (cached) return cached;
  const p = read(userId);
  inFlight.set(userId, p);
  return p;
}

/** Drop the cached answer so the next card re-reads. Call after a purchase. */
export function invalidateReferralGift(userId?: string | null): void {
  if (userId) inFlight.delete(userId);
  else inFlight.clear();
}

export function useReferralGift(): ReferralGift {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const [status, setStatus] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setChecked(false);
    loadStatus(userId).then((s) => {
      if (cancelled) return;
      setStatus(s);
      setChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Signed out is not "still checking" — a visitor reading the landing page has
  // a final answer already, and it is the list price.
  if (!authLoading && !userId) return { status: null, loading: false };

  return { status, loading: authLoading || !checked };
}
