/**
 * Verifying a gym code, and linking a member to a gym.
 *
 * Both endpoints reach the Dombelz Partner database, which means a service-role
 * key that must never reach a browser — so src/server/gym-partner.ts is
 * imported dynamically inside each handler, the same shape as billing.ts does
 * with the Razorpay module.
 *
 * Neither of these decides who is paid. The source of a link — and therefore
 * both the member's ₹150 and the gym's 20% — is derived in SQL by link_gym(),
 * from facts about the account that a caller cannot replay.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/auth-middleware";
import { checkRateLimit } from "@/lib/ai";
import { addMonths, isGymCode, isGymDuration } from "@/lib/gym";

const codeSchema = z.object({ code: z.string().min(1).max(24) });

// Attribution only. The membership window is the gym's own record and reaches
// it through serverSubmitGymDetails, where the owner confirms it.
const linkSchema = z.object({ code: z.string().min(1).max(24) });

const detailsSchema = z.object({
  planMonths: z
    .union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)])
    .nullable(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  // The same shape gym_partners.phone already enforces in SQL, so a number that
  // passes here cannot be refused by the check constraint on arrival.
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/)
    .nullable(),
});

// ponytail: one global bucket for the unauthenticated verify, since there is no
// user to key on. Blunt, but a signup makes one or two calls and this caps code
// enumeration. Per-IP is the upgrade if it ever bites a real user.
let verifyWindow = { count: 0, expiresAt: 0 };
function checkVerifyRate() {
  const now = Date.now();
  if (now > verifyWindow.expiresAt) {
    verifyWindow = { count: 1, expiresAt: now + 60_000 };
    return;
  }
  if (verifyWindow.count >= 120) {
    throw new Error("Too many code checks just now. Try again in a minute.");
  }
  verifyWindow.count++;
}

/**
 * Does this gym code exist, and what is the gym called?
 *
 * No auth middleware on purpose: the signup step runs before the account is
 * created, so this has to be callable unauthenticated. It returns a gym name
 * and nothing else — the same bounded disclosure as get_referrer_name(), which
 * is already anon-granted for friend codes.
 */
export const serverVerifyGymCode = createServerFn({ method: "POST" })
  .inputValidator(codeSchema)
  .handler(async ({ data }) => {
    const code = data.code.trim().toUpperCase();
    // Rejected before the network hop, so a typo costs nothing.
    if (!isGymCode(code)) return { gymName: null as string | null };

    checkVerifyRate();
    const { lookupGym } = await import("@/server/gym-partner");
    const gym = await lookupGym(code);
    return { gymName: gym?.gymName ?? null };
  });

/**
 * Link the caller to a gym.
 *
 * The input carries no `source`. Whether this earns anything is decided by
 * link_gym() from the account's own history — most importantly, a user who
 * already has a `referrals` row (they signed up with a friend's code) can never
 * attribute a gym, however this is called. The chosen source comes back so the
 * UI can describe what actually happened rather than what was hoped for.
 */
export const serverLinkGym = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(linkSchema)
  .handler(async ({ context, data }) => {
    const { userId } = context;
    checkRateLimit(userId);

    const code = data.code.trim().toUpperCase();
    if (!isGymCode(code)) {
      throw new Error("That doesn't look like a gym code.");
    }

    const { supabaseAdmin } = await import("@/integrations/client.server");
    const { lookupGym, syncMember } = await import("@/server/gym-partner");

    // Verified against the partner database before anything is written here.
    // link_gym() refuses a blank name for the same reason: gym_name is a
    // snapshot of a row in another database, so only a server that has actually
    // looked it up may write it.
    const gym = await lookupGym(code);
    if (!gym) {
      throw new Error(
        "We couldn't find that gym code. Check it with your gym.",
      );
    }

    // Through supabaseAdmin because link_gym is granted to service_role only —
    // it takes p_user_id, and the whole point is that no browser can reach it.
    // The id comes from the verified JWT in context, never from `data`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts leaves Functions empty
    const { data: result, error } = await (supabaseAdmin.rpc as any)(
      "link_gym",
      {
        p_user_id: userId,
        p_code: gym.partnerCode,
        p_gym_name: gym.gymName,
      },
    );
    if (error) {
      throw new Error(`Could not link your gym: ${error.message}`);
    }

    const linked = !!result?.linked;
    const source = (result?.source as string) ?? "profile";

    if (linked) {
      const { data: profile } = await supabaseAdmin
        .from("user_profiles")
        .select("full_name, access_until, selected_plan")
        .eq("id", userId)
        .maybeSingle();

      // A partner-side failure must not lose the link that is already written
      // here — the next charge syncs the member anyway.
      try {
        await syncMember({
          userId,
          code: gym.partnerCode,
          fullName: (profile as any)?.full_name ?? null,
          accessUntil: (profile as any)?.access_until ?? null,
          tier: (profile as any)?.selected_plan ?? null,
          attributed: source === "signup",
        });
      } catch (err) {
        console.error("[gym] roster sync failed", err);
      }
    }

    return {
      linked,
      source,
      gymName: (result?.gym_name as string) ?? gym.gymName,
      partnerCode: (result?.partner_code as string) ?? gym.partnerCode,
    };
  });

/**
 * The gym card's whole state, in one call.
 *
 * `link` is attribution — who this account is credited to, and whether that
 * credit earns anything. `membership` is the gym's own record of what they pay
 * for, read live from the partner database rather than mirrored here.
 *
 * A link with no membership is not an error. It means either that details have
 * never been submitted, or that the owner removed them from the roster; the two
 * read the same from here and the UI distinguishes them by whether details were
 * ever confirmed.
 */
export const serverGetGymMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    const { supabaseAdmin } = await import("@/integrations/client.server");
    const { data: link } = await supabaseAdmin
      .from("gym_links")
      .select("partner_code, gym_name, source")
      .eq("user_id", userId)
      .maybeSingle();

    if (!link) return { link: null, membership: null };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types lag the migration
    const row = link as any;
    const summary = {
      partnerCode: row.partner_code as string,
      gymName: row.gym_name as string,
      source: row.source as string,
    };

    // A partner outage must not make the page unusable: the attribution is a
    // local fact and can still be shown, and the card says the details could
    // not be reached rather than that there are none.
    try {
      const { fetchMembership, lookupGym } =
        await import("@/server/gym-partner");
      const membership = await fetchMembership(userId);
      if (membership) return { link: summary, membership, gymGone: false };

      // No roster row has two very different causes and they must not share a
      // sentence. Either the gym took this member off their list, or the gym
      // itself is gone — deleting a partner cascades its members away, and this
      // link survives because the bridge is one-way and holds no foreign key
      // back. Asking whether the code still resolves is what tells them apart.
      const gym = await lookupGym(summary.partnerCode);
      return { link: summary, membership: null, gymGone: gym === null };
    } catch (err) {
      console.error("[gym] membership read failed", err);
      return {
        link: summary,
        membership: null,
        gymGone: false,
        unreachable: true as const,
      };
    }
  });

/**
 * Send the gym the membership details, for them to confirm.
 *
 * Deliberately not a write to anything the member can see change. What comes
 * back is "asked", not "done" — the gym decides, and until they do the card
 * keeps showing what is actually on file.
 *
 * endDate is derived here and never accepted from the browser, the same rule
 * serverLinkGym used to apply, so the date the gym is asked to approve is
 * always start + duration.
 */
export const serverSubmitGymDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(detailsSchema)
  .handler(async ({ context, data }) => {
    const { userId } = context;
    checkRateLimit(userId);

    const { supabaseAdmin } = await import("@/integrations/client.server");
    const { data: link } = await supabaseAdmin
      .from("gym_links")
      .select("partner_code")
      .eq("user_id", userId)
      .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types lag the migration
    const partnerCode = (link as any)?.partner_code as string | undefined;
    if (!partnerCode) {
      throw new Error("Add your gym's code first.");
    }

    const planMonths = isGymDuration(data.planMonths) ? data.planMonths : null;
    const startDate = data.startDate ?? null;
    const endDate =
      planMonths && startDate ? addMonths(startDate, planMonths) : null;

    const { submitMemberRequest, syncMember } =
      await import("@/server/gym-partner");

    // The roster row is what a request hangs off, and it can be missing — a
    // sync that failed when the gym was first linked leaves the local link with
    // no counterpart. Re-syncing is idempotent and never raises `attributed`,
    // so doing it here costs one call and removes a dead end.
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("full_name, access_until, selected_plan")
      .eq("id", userId)
      .maybeSingle();

    try {
      await syncMember({
        userId,
        code: partnerCode,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types omit access_until
        fullName: (profile as any)?.full_name ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ditto
        accessUntil: (profile as any)?.access_until ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ditto
        tier: (profile as any)?.selected_plan ?? null,
        attributed: false,
      });
    } catch (err) {
      console.error("[gym] roster sync before request failed", err);
    }

    await submitMemberRequest({
      userId,
      planMonths,
      startDate,
      endDate,
      phone: data.phone,
    });

    return { submitted: true as const, planMonths, startDate, endDate };
  });

/**
 * Leave the gym.
 *
 * The partner call goes first on purpose. If it fails, nothing local has
 * changed and the member can try again; the reverse order would leave an
 * account with no gym here while the gym still carried them, still earning.
 *
 * Not reversible, and the caller must say so before calling: this spends the
 * one-time ₹150 gym offer whether or not it was ever used, and burns the gym's
 * commission on this customer for good.
 */
export const serverUnlinkGym = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    checkRateLimit(userId);

    const { supabaseAdmin } = await import("@/integrations/client.server");
    const { removeMember } = await import("@/server/gym-partner");

    try {
      await removeMember(userId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Couldn't reach your gym to remove you, so nothing was changed. Please try again. (${msg})`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts leaves Functions empty
    const { error } = await (supabaseAdmin.rpc as any)("unlink_gym", {
      p_user_id: userId,
    });
    if (error) {
      throw new Error(`Could not remove your gym: ${error.message}`);
    }

    return { removed: true as const };
  });
