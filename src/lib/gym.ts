/**
 * Gym partner codes — the pure half.
 *
 * A gym code is issued by the Dombelz Partner app and looks like
 * GYM-IRONVAULT-123. Where a user enters it decides money: at signup it earns
 * them ₹150 off Yearly and earns the gym 20%; anywhere else it earns nobody
 * anything and only puts the member on that gym's roster. That decision is made
 * in SQL by link_gym(), never here — nothing in this file grants anything.
 *
 * Kept free of server imports so the self-check script can build it alone. The
 * createServerFn wrappers live in gym-link.ts.
 */
import { todayLocal } from "@/lib/dates";

/**
 * GYM- then up to twelve letters, then exactly three digits.
 *
 * Mirrors public.generate_partner_code() in the partner database
 * (`'GYM-' || partner_code_prefix(gym_name) || '-' || lpad(3 digits)`), which is
 * the authority — this copy is a pre-flight check so a typo does not cost a
 * round trip, exactly as isValidCode() mirrors referral_code_prefix().
 *
 * Disjoint from the friend pattern /^[A-Z]{3}\d{5}$/ by construction: that one
 * is anchored and contains no hyphen, so one input box can tell the two kinds of
 * code apart by shape alone. src/lib/gym.test.ts pins that they never overlap.
 */
export const GYM_CODE_PATTERN = /^GYM-[A-Z]{1,12}-\d{3}$/;

export function isGymCode(code: string | null | undefined): boolean {
  return !!code && GYM_CODE_PATTERN.test(code);
}

/**
 * DR- then up to six letters, then three digits: DR-ANANYA304.
 *
 * Mirrors generate_doctor_code() in the partner database. The letters are the
 * doctor's own given name with any honorific stripped, so "Dr. Ananya" is
 * ANANYA and not DR.
 */
export const DOCTOR_CODE_PATTERN = /^DR-[A-Z]{1,6}\d{3}$/;

/**
 * A creator's handle in letters, then 60: PRIYAFITQUEEN60. The three-digit
 * ending is the collision fallback, used only when every supplied handle is
 * already taken.
 *
 * Mirrors generate_ugc_code(). The partner database strips handles to LETTERS
 * rather than alphanumerics, and that is what keeps this disjoint from the
 * friend pattern below: keep the digits and @abc123 becomes ABC123 + '60' =
 * ABC12360, which is /^[A-Z]{3}\d{5}$/ exactly — a friend code's shape. Since
 * both quiz.tsx and GymLink.tsx route a pasted code by shape with no round
 * trip, that collision would send a creator's code into claim_referral().
 * gym.test.ts pins the disjointness.
 */
export const UGC_CODE_PATTERN = /^[A-Z]{1,20}(?:60|\d{3})$/;

export type PartnerKind = "gym" | "doctor" | "ugc";

/** Which kind of partner issued this code, or null if no partner did. */
export function partnerKindOf(
  code: string | null | undefined,
): PartnerKind | null {
  if (!code) return null;
  if (GYM_CODE_PATTERN.test(code)) return "gym";
  if (DOCTOR_CODE_PATTERN.test(code)) return "doctor";
  if (UGC_CODE_PATTERN.test(code)) return "ugc";
  return null;
}

/**
 * Any of the three partner codes.
 *
 * `isGymCode` still exists and still means only a gym — the gym-shaped screens
 * (a roster, a membership window, an owner to confirm details) ask that
 * narrower question, and a doctor has no answer to it.
 */
export function isPartnerCode(code: string | null | undefined): boolean {
  return partnerKindOf(code) !== null;
}

/** What to call this kind of partner in a sentence the member reads. */
export function partnerKindLabel(kind: PartnerKind): string {
  if (kind === "gym") return "gym";
  if (kind === "doctor") return "doctor";
  return "creator";
}

/** The membership lengths a member can pick. Durations only — gym pricing
 *  differs per gym and is not modelled anywhere, so no card shows a price. */
export const GYM_DURATIONS = [1, 3, 6, 12] as const;
export type GymDuration = (typeof GYM_DURATIONS)[number];

export function isGymDuration(n: unknown): n is GymDuration {
  return (GYM_DURATIONS as readonly unknown[]).includes(n);
}

/**
 * Add whole months to a YYYY-MM-DD date, clamping rather than overflowing.
 *
 * Date.setMonth rolls 31 Jan + 1 month forward into 3 March, which would hand a
 * member two extra days and put the end date in the wrong month on their card.
 * The last day of a short month is the honest answer.
 */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const targetMonth = m - 1 + months;
  const year = y + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  // Day 0 of the following month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export type MembershipStatus = "upcoming" | "active" | "expired" | "unknown";

/**
 * Where today sits in a gym membership window.
 *
 * Purely informational. A lapsed gym membership never touches Dombelz access —
 * that is access_until's job and nothing here feeds it.
 */
export function membershipStatus(
  start: string | null | undefined,
  end: string | null | undefined,
  // Local, not toISOString(): that is UTC, so for an IST member between
  // midnight and 05:30 it answers with yesterday and a membership that ended
  // today still reads as active.
  today: string = todayLocal(),
): MembershipStatus {
  if (!start || !end) return "unknown";
  if (start > today) return "upcoming";
  if (end < today) return "expired";
  return "active";
}

/** The label shown beside the status, matching membershipStatus(). */
export function membershipStatusLabel(s: MembershipStatus): string {
  if (s === "upcoming") return "⏳ Upcoming";
  if (s === "active") return "✅ Active";
  if (s === "expired") return "⏹ Expired";
  return "—";
}
