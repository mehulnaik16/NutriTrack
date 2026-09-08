/**
 * The caller's own gift state, for the pricing cards.
 *
 * Two rows decide whether someone pays ₹999 or ₹849: their `referrals` row
 * (a friend's code) and their `gym_links` row (a gym's code). Both are readable
 * by a plain select under their own RLS policy — `auth.uid() = referee_id` and
 * `auth.uid() = user_id` — so neither needs an RPC, and neither can see anybody
 * else's.
 *
 * This decides nothing. activeGift() in src/lib/plans.ts turns these two rows
 * into a verdict, and serverCreateSubscription() runs the same function over
 * the same rows to decide what is actually charged.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/client";
import { useAuth } from "@/lib/auth";
import type { GymLinkGift } from "@/lib/plans";

export interface ReferralGift {
  /** The caller's own referrals row status, or null when never referred. */
  status: string | null;
  /** The caller's own gym_links row, or null when they have no gym. */
  gymLink: GymLinkGift | null;
  loading: boolean;
}

interface GiftRows {
  status: string | null;
  gymLink: GymLinkGift | null;
}

const inFlight = new Map<string, Promise<GiftRows>>();

const EMPTY: GiftRows = { status: null, gymLink: null };

async function read(userId: string): Promise<GiftRows> {
  try {
    const [ref, gym] = await Promise.all([
      supabase
        .from("referrals")
        .select("status")
        .eq("referee_id", userId)
        .maybeSingle(),
      supabase
        .from("gym_links")
        .select("source, gift_spent_at")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    return {
      status: ((ref.data as any)?.status as string | undefined) ?? null,
      gymLink: (gym.data as GymLinkGift | null) ?? null,
    };
  } catch {
    // Drop the memo so the next mount retries, and resolve to "no gift" —
    // deliberately failing towards the higher price. Quoting ₹999 and
    // correcting down is recoverable; quoting ₹849 and charging ₹999 is not.
    inFlight.delete(userId);
    return EMPTY;
  }
}

function loadGift(userId: string): Promise<GiftRows> {
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

export function useGift(): ReferralGift {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const [rows, setRows] = useState<GiftRows>(EMPTY);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setChecked(false);
    loadGift(userId).then((r) => {
      if (cancelled) return;
      setRows(r);
      setChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Signed out is a final answer, not "still checking" — otherwise a landing
  // page would sit on a loading price forever.
  if (!authLoading && !userId)
    return { status: null, gymLink: null, loading: false };

  return { ...rows, loading: authLoading || !checked };
}
