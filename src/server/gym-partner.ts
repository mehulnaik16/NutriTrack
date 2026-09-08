/**
 * The one door into the Dombelz Partner database.
 *
 * Gyms, their codes, their member rosters and their commissions live in a
 * *different* Supabase project. Its sync_gym_member(), record_gym_charge() and
 * reverse_gym_charge() are granted to `service_role` only — written for exactly
 * this caller — so reaching them needs that project's own service-role key,
 * held here as GYM_PARTNER_SERVICE_ROLE_KEY.
 *
 * The direction is one-way. Dombelz calls into the partner project; the partner
 * project holds no foreign key back and never calls us. Everything in this file
 * is server-only: it is imported dynamically inside server-function handlers so
 * the key cannot reach a client bundle.
 *
 * Nothing here decides who gets paid. record_gym_charge() refuses to pay a gym
 * that did not bring us the customer, and that check lives in the partner
 * database on purpose — a bug on this side must not be able to pay out.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function createGymPartnerClient(): SupabaseClient {
  const url = process.env.GYM_PARTNER_SUPABASE_URL;
  const key = process.env.GYM_PARTNER_SERVICE_ROLE_KEY;

  if (!url || !key) {
    const missing = [
      ...(!url ? ["GYM_PARTNER_SUPABASE_URL"] : []),
      ...(!key ? ["GYM_PARTNER_SERVICE_ROLE_KEY"] : []),
    ];
    // Named loudly, like client.server.ts: a gym feature failing because a
    // variable is unset must not read as "gym not found".
    throw new Error(
      `[gym-partner] Missing environment variable(s): ${missing.join(", ")}.`,
    );
  }

  return createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

let _client: SupabaseClient | undefined;

/** Lazily created so an unset variable fails at the call, not at import. */
function gymDb(): SupabaseClient {
  if (!_client) _client = createGymPartnerClient();
  return _client;
}

export interface GymSummary {
  partnerCode: string;
  gymName: string;
}

/**
 * Look a gym up by its affiliate code.
 *
 * Returns the gym's name and nothing else — the same bounded disclosure as
 * get_referrer_name(), which is already anon-callable for friend codes. A
 * paused or terminated partner resolves to null, so their code stops working
 * the moment they are switched off.
 */
export async function lookupGym(code: string): Promise<GymSummary | null> {
  const normalized = code.trim().toUpperCase();
  const { data, error } = await gymDb()
    .from("gym_partners")
    .select("partner_code, gym_name")
    .eq("partner_code", normalized)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw new Error(`[gym-partner] lookup failed: ${error.message}`);
  if (!data) return null;
  return {
    partnerCode: data.partner_code as string,
    gymName: data.gym_name as string,
  };
}

export interface SyncMemberArgs {
  userId: string;
  code: string;
  fullName?: string | null;
  accessUntil?: string | null;
  hasPaid?: boolean;
  tier?: string | null;
  /** Only true when the code was entered during Dombelz signup. Decided by
   *  link_gym() in SQL, never by a caller. */
  attributed: boolean;
  planMonths?: number | null;
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * Put a member on a gym's roster, or refresh the facts already there.
 *
 * Safe to call repeatedly: the partner side upserts on dombelz_user_id and
 * deliberately never updates `attributed`, so a later sync cannot turn an
 * unattributed member into a paying one.
 */
export async function syncMember(args: SyncMemberArgs): Promise<void> {
  const { error } = await gymDb().rpc("sync_gym_member", {
    p_dombelz_user_id: args.userId,
    p_code: args.code,
    p_full_name: args.fullName ?? null,
    p_access_until: args.accessUntil ?? null,
    p_has_paid: args.hasPaid ?? false,
    p_tier: args.tier ?? null,
    p_attributed: args.attributed,
    p_plan_months: args.planMonths ?? null,
    p_start_date: args.startDate ?? null,
    p_end_date: args.endDate ?? null,
  });
  if (error) throw new Error(`[gym-partner] sync failed: ${error.message}`);
}

export interface RecordChargeArgs {
  userId: string;
  chargeId: string;
  amountPaise: number;
  tier: string;
  chargedAt?: string;
}

/**
 * Offer a charge to the partner database for commission.
 *
 * "Offer", not "pay": this is called for every linked member and the partner
 * side decides. It returns null when the member is not with a gym, when the gym
 * did not bring us the customer, when the partner is paused, or when the charge
 * was already recorded — so a webhook replay cannot pay twice.
 */
export async function recordCharge(args: RecordChargeArgs): Promise<void> {
  const { error } = await gymDb().rpc("record_gym_charge", {
    p_dombelz_user_id: args.userId,
    p_dombelz_charge_id: args.chargeId,
    p_amount_paise: args.amountPaise,
    p_tier: args.tier,
    p_charged_at: args.chargedAt ?? new Date().toISOString(),
  });
  if (error) throw new Error(`[gym-partner] charge failed: ${error.message}`);
}

/** Mark a commission reversed after a refund. The row keeps its original
 *  amount — 'reversed' is what excludes it from every total. */
export async function reverseCharge(chargeId: string): Promise<void> {
  const { error } = await gymDb().rpc("reverse_gym_charge", {
    p_dombelz_charge_id: chargeId,
  });
  if (error) throw new Error(`[gym-partner] reverse failed: ${error.message}`);
}

/** Whether the integration is configured at all. Lets callers skip the whole
 *  path quietly on a deployment that has no gym keys yet. */
export function gymPartnerConfigured(): boolean {
  return !!process.env.GYM_PARTNER_SUPABASE_URL &&
    !!process.env.GYM_PARTNER_SERVICE_ROLE_KEY;
}
