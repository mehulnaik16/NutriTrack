/**
 * Keeping user_profiles.timezone in step with the device.
 *
 * Notifications are scheduled against a wall-clock time the user picked — 07:00
 * means 07:00 where they are. The device is the only thing that knows where
 * that is, so it reports its zone and the profile stores it.
 *
 * A user who flies to Dubai gets correct local times on their next app open,
 * with no special-case handling: the stored zone changes, and the ordinary
 * full reschedule does the rest.
 */

import { supabase } from "@/integrations/client";

/**
 * Fallback when the platform gives us nothing useful.
 *
 * India is the entire user base today, and Asia/Kolkata has no DST — which
 * quietly removes a whole class of scheduling bug rather than merely being a
 * convenient default.
 */
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

/**
 * Legacy IANA zone names, mapped to the canonical ones.
 *
 * Observed on a real device: Chrome on Android reports "Asia/Calcutta", the
 * pre-1993 name, where other platforms report "Asia/Kolkata". Both resolve to
 * the same offset in Intl and in Postgres, so nothing is *broken* by storing
 * either — but a column holding two spellings of one zone compares unequal to
 * itself, which would make the sync below rewrite the row on alternate devices
 * and show a "zones differ" warning that means nothing.
 *
 * Only the aliases plausible in this user base are listed. Anything absent
 * passes through unchanged, which is the correct behaviour for a name that is
 * already canonical.
 */
const CANONICAL_ZONES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Dacca": "Asia/Dhaka",
  "Europe/Kiev": "Europe/Kyiv",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
};

/** Canonical form of an IANA zone name. Unknown names pass through. */
export function canonicalTimezone(tz: string): string {
  return CANONICAL_ZONES[tz] ?? tz;
}

/**
 * The device's IANA zone, canonicalised, e.g. "Asia/Kolkata".
 *
 * `resolvedOptions().timeZone` is specified to return an IANA name, but older
 * WebViews have been known to return undefined or an empty string, and the
 * whole call throws where Intl is absent. Any of those degrades to the default
 * rather than writing a value the scheduler cannot interpret.
 */
export function deviceTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.length > 0 ? canonicalTimezone(tz) : DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Write the device zone to the profile if it has changed.
 *
 * Pass the stored value from a row the caller has already fetched — the auth
 * provider reads the profile on every session change anyway, so this costs a
 * write only when the zone actually moved, and no extra read ever.
 *
 * Best-effort by design. A failure here means notifications fire on a stale
 * zone until the next launch, which is not worth interrupting sign-in over.
 */
export async function syncTimezone(
  userId: string,
  storedTimezone: string | null | undefined,
): Promise<void> {
  const current = deviceTimezone();
  if (storedTimezone === current) return;

  const { error } = await supabase
    .from("user_profiles")
    .update({ timezone: current })
    .eq("id", userId);

  if (error) {
    console.warn("[timezone] could not update profile zone:", error.message);
  }
}
