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
import type { PartnerKind } from "@/lib/gym";

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
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
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
  /** The partner's display name: a gym's, a clinic's, or a creator's own. */
  gymName: string;
  /** Which of the three kinds of partner issued this code. */
  partnerType: PartnerKind;
}

/**
 * Look a partner up by their affiliate code — a gym, a doctor or a creator.
 *
 * Returns the partner's name and kind and nothing else — the same bounded
 * disclosure as get_referrer_name(), which is already anon-callable for friend
 * codes. A pending, paused or terminated partner resolves to null, so an
 * unapproved code verifies for nobody and a switched-off one stops working the
 * moment it is switched off. That status filter is the whole approval gate as
 * far as this side is concerned.
 */
export async function lookupGym(code: string): Promise<GymSummary | null> {
  const normalized = code.trim().toUpperCase();
  const { data, error } = await gymDb()
    .from("gym_partners")
    .select("partner_code, gym_name, partner_type")
    .eq("partner_code", normalized)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw new Error(`[gym-partner] lookup failed: ${error.message}`);
  if (!data) return null;
  return {
    partnerCode: data.partner_code as string,
    gymName: data.gym_name as string,
    // Defaulted rather than asserted: a partner row written before the
    // partner_types migration has no value, and every one of those is a gym.
    partnerType: ((data as { partner_type?: string }).partner_type ??
      "gym") as PartnerKind,
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
  });
  if (error) throw new Error(`[gym-partner] sync failed: ${error.message}`);
}

export interface RecordChargeArgs {
  userId: string;
  chargeId: string;
  amountPaise: number;
  /** The same amount with GST taken back out. What every rate is applied to. */
  basePaise: number;
  tier: string;
  /** 'razorpay' | 'google_play' | 'apple'. Decides the rate and the fee. */
  provider: string;
  /** Ordinal of this charge for this customer. 1 is a first payment. */
  seq: number;
  chargedAt?: string;
}

/**
 * Offer a charge to the partner database for commission.
 *
 * "Offer", not "pay": this is called for every linked member and the partner
 * side decides. It returns null when the member is not with a gym, when the gym
 * did not bring us the customer, when the partner is paused, or when the charge
 * was already recorded — so a replay cannot pay twice.
 *
 * base, provider and seq have no defaults on the SQL side on purpose: a caller
 * that has not been redeployed raises there rather than quietly earning a gym a
 * commission computed on a zero base or at the wrong rate.
 */
export async function recordCharge(args: RecordChargeArgs): Promise<void> {
  const { error } = await gymDb().rpc("record_gym_charge", {
    p_dombelz_user_id: args.userId,
    p_dombelz_charge_id: args.chargeId,
    p_amount_paise: args.amountPaise,
    p_base_paise: args.basePaise,
    p_tier: args.tier,
    p_provider: args.provider,
    p_seq: args.seq,
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

export interface GymMembership {
  planMonths: number | null;
  startDate: string | null;
  endDate: string | null;
  phone: string | null;
  /** Set while the gym has not yet confirmed a change the member asked for. */
  pending: {
    planMonths: number | null;
    startDate: string | null;
    endDate: string | null;
    phone: string | null;
    createdAt: string;
  } | null;
}

/**
 * What the gym has on file for this member, and anything still awaiting their
 * confirmation.
 *
 * Read live rather than mirrored. The gym's own database is the record of what
 * a member pays them for, so an owner correcting a date shows up here on the
 * next load — which is the whole reason Dombelz stopped keeping a copy. A
 * mirror could only be kept current by a callback the partner project has no
 * way to make: it holds no key for us and never calls in.
 *
 * `null` means the gym is not carrying this person at all. With a gym_links row
 * still present that means the owner removed them, which the UI says plainly
 * rather than rendering a card of blanks.
 */
export async function fetchMembership(
  userId: string,
): Promise<GymMembership | null> {
  const db = gymDb();

  const { data: member, error } = await db
    .from("gym_members")
    .select("plan_months, start_date, end_date, phone")
    .eq("dombelz_user_id", userId)
    .maybeSingle();
  if (error)
    throw new Error(`[gym-partner] membership read failed: ${error.message}`);
  if (!member) return null;

  const { data: req } = await db
    .from("gym_member_requests")
    .select("plan_months, start_date, end_date, phone, created_at")
    .eq("dombelz_user_id", userId)
    .eq("status", "pending")
    .maybeSingle();

  const row = member as Record<string, unknown>;
  const pending = req as Record<string, unknown> | null;

  return {
    planMonths: (row.plan_months as number) ?? null,
    startDate: (row.start_date as string) ?? null,
    endDate: (row.end_date as string) ?? null,
    phone: (row.phone as string) ?? null,
    pending: pending
      ? {
          planMonths: (pending.plan_months as number) ?? null,
          startDate: (pending.start_date as string) ?? null,
          endDate: (pending.end_date as string) ?? null,
          phone: (pending.phone as string) ?? null,
          createdAt: pending.created_at as string,
        }
      : null,
  };
}

export interface MemberRequestArgs {
  userId: string;
  planMonths: number | null;
  startDate: string | null;
  endDate: string | null;
  phone: string | null;
}

/**
 * Ask the gym to confirm what the member says their membership is.
 *
 * Nothing is applied by this call, and that is the point: the member is making
 * a claim about somebody else's business, so it waits in the owner's
 * verification list until they decide. A second submission replaces the first
 * rather than queueing behind it.
 */
export async function submitMemberRequest(
  args: MemberRequestArgs,
): Promise<void> {
  const { error } = await gymDb().rpc("submit_member_request", {
    p_dombelz_user_id: args.userId,
    p_plan_months: args.planMonths,
    p_start_date: args.startDate,
    p_end_date: args.endDate,
    p_phone: args.phone,
  });
  if (error) throw new Error(`[gym-partner] request failed: ${error.message}`);
}

/**
 * The member has left their gym.
 *
 * Burns attribution on the partner side, permanently: that gym earns nothing on
 * this customer again, and re-adding them cannot undo it. Commission already
 * earned is untouched — it is history, not a balance.
 */
export async function removeMember(userId: string): Promise<void> {
  const { error } = await gymDb().rpc("remove_gym_member_by_customer", {
    p_dombelz_user_id: userId,
  });
  if (error) throw new Error(`[gym-partner] removal failed: ${error.message}`);
}

/** Whether the integration is configured at all. Lets callers skip the whole
 *  path quietly on a deployment that has no gym keys yet. */
export function gymPartnerConfigured(): boolean {
  return (
    !!process.env.GYM_PARTNER_SUPABASE_URL &&
    !!process.env.GYM_PARTNER_SERVICE_ROLE_KEY
  );
}

/**
 * Everything a settled payment owes the partner project, from the payment id
 * alone.
 *
 * This used to live inline in the Razorpay webhook route and be reachable from
 * nowhere else, which stopped being safe the moment checkout started recording
 * the charge itself: the later webhook for that same payment finds it already
 * recorded, reports `charged: false`, and the gym block behind that flag was
 * skipped for good. A gym could be owed money on a payment and never be
 * credited for it.
 *
 * So it lives here and both paths call it. That is safe rather than merely
 * tolerable: record_gym_charge() is keyed `on conflict (dombelz_charge_id) do
 * nothing`, so whichever path arrives first records the commission and the
 * other costs one no-op round trip.
 *
 * Best-effort by design. Entitlement has already been granted by the time this
 * runs and must not be undone by a partner-project outage, so every caller
 * wraps it and continues.
 */
export async function offerChargeToGym(paymentId: string): Promise<void> {
  if (!gymPartnerConfigured()) return;

  const { supabaseAdmin } = await import("@/integrations/client.server");

  const { data: charge } = await supabaseAdmin
    .from("subscription_charges")
    .select(
      "user_id, tier, amount_paise, base_paise, provider, seq, charged_at",
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the three new columns are not in the generated types yet
    .eq("provider_payment_id", paymentId as any)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ditto
  const row = charge as any;
  const userId = row?.user_id as string | undefined;
  if (!userId) return;

  const { data: link } = await supabaseAdmin
    .from("gym_links")
    .select("partner_code")
    .eq("user_id", userId)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- service-role-only table
  const partnerCode = (link as any)?.partner_code as string | undefined;
  if (!partnerCode) return;

  await recordCharge({
    userId,
    chargeId: paymentId,
    amountPaise: row.amount_paise ?? 0,
    basePaise: row.base_paise ?? row.amount_paise ?? 0,
    tier: row.tier,
    provider: row.provider ?? "razorpay",
    seq: row.seq ?? 1,
    chargedAt: row.charged_at,
  });

  // access_until has just moved. The partner's roster reads it to show who is
  // due to renew, and their own migration notes it must be synced on every
  // access change rather than nightly.
  await pushEntitlement(userId, { hasPaid: true, tier: row.tier });
}

/**
 * Push what the member is currently entitled to over to the partner project.
 *
 * The partner side keeps a *snapshot*, not a live view: `gym_dashboard()`
 * counts "on free trial" as members whose stored `access_until` still reads as
 * a trial. A member who links a code during signup is synced before any trial
 * exists, so that snapshot goes over as null and the partner counts them as
 * expired forever. Nothing corrected it afterwards, which is why a creator
 * could watch a member start a trial and still see zero.
 *
 * So this runs on every change to access, which is what the note above asks
 * for — at payment, and now at the moment the trial begins.
 *
 * Safe to call at any time, and safe to call often:
 *
 * - no link, no work. A member with no partner code tells nobody anything.
 * - `sync_gym_member` folds rather than overwrites — `has_paid` is OR-ed,
 *   `access_until` and the name are coalesced, and `attributed` is left alone
 *   on update. So passing the defaults here can never downgrade a paying
 *   member to unpaid, blank a name, or promote an unattributed one.
 */
export async function pushEntitlement(
  userId: string,
  extra?: { hasPaid?: boolean; tier?: string | null },
): Promise<void> {
  if (!gymPartnerConfigured()) return;

  const { supabaseAdmin } = await import("@/integrations/client.server");

  const { data: link } = await supabaseAdmin
    .from("gym_links")
    .select("partner_code, partner_type")
    .eq("user_id", userId)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- service-role-only table
  const partnerCode = (link as any)?.partner_code as string | undefined;
  if (!partnerCode) return;

  // A member who left a gym must stay left. sync_gym_member re-creates the
  // roster row it is given, so syncing here on the next trial or payment
  // would quietly put them back on a list they removed themselves from — and
  // that row is exactly what record_gym_charge looks for before paying, so
  // resurrecting it would hand the gym a commission the member cancelled.
  //
  // A creator and a doctor are the opposite case and must always be synced:
  // they count every signup their code brought, for good, and there is no
  // roster to leave.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ditto
  if (((link as any).partner_type ?? "gym") === "gym") {
    const { data: membership } = await supabaseAdmin
      .from("gym_memberships")
      .select("partner_code")
      .eq("user_id", userId)
      .maybeSingle();
    if (membership?.partner_code !== partnerCode) return;
  }

  const { data: profile } = await supabaseAdmin
    .from("user_profiles")
    .select("full_name, access_until, selected_plan")
    .eq("id", userId)
    .maybeSingle();

  await syncMember({
    userId,
    code: partnerCode,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types omit access_until
    fullName: (profile as any)?.full_name ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ditto
    accessUntil: (profile as any)?.access_until ?? null,
    hasPaid: extra?.hasPaid ?? false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ditto
    tier: extra?.tier ?? (profile as any)?.selected_plan ?? null,
    // Never raised here: sync_gym_member() keeps whatever was decided at first
    // link, so this value cannot promote an unattributed member into a paying
    // one.
    attributed: false,
  });
}

/** The refund counterpart. Idempotent for the same reason. */
export async function withdrawChargeFromGym(paymentId: string): Promise<void> {
  if (!gymPartnerConfigured()) return;
  await reverseCharge(paymentId);
}
