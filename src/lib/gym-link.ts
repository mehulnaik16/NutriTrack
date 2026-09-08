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

const linkSchema = z.object({
  code: z.string().min(1).max(24),
  // Absent at signup: the wizard only attributes the gym, and the member fills
  // in their membership window later from the profile page.
  planMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
      throw new Error("We couldn't find that gym code. Check it with your gym.");
    }

    const planMonths = isGymDuration(data.planMonths) ? data.planMonths : null;
    const startDate = data.startDate ?? null;
    const endDate =
      planMonths && startDate ? addMonths(startDate, planMonths) : null;

    // Through supabaseAdmin because link_gym is granted to service_role only —
    // it takes p_user_id, and the whole point is that no browser can reach it.
    // The id comes from the verified JWT in context, never from `data`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts leaves Functions empty
    const { data: result, error } = await (supabaseAdmin.rpc as any)("link_gym", {
      p_user_id: userId,
      p_code: gym.partnerCode,
      p_gym_name: gym.gymName,
      p_plan_months: planMonths,
      p_start_date: startDate,
      p_end_date: endDate,
    });
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
          planMonths,
          startDate,
          endDate,
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
