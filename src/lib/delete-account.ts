/**
 * Server function to permanently delete a user's account.
 *
 * Uses the service-role admin client to call auth.admin.deleteUser(),
 * which cascades to all public tables via ON DELETE CASCADE FKs.
 * Storage objects (photos) are cleaned up manually first since
 * Supabase Storage is not part of the FK cascade.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/auth-middleware";
import { checkRateLimit } from "@/lib/ai";

export const serverDeleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    // The only service-role endpoint in the app, and the only one that was
    // unthrottled. Same limiter the AI functions use.
    checkRateLimit(userId);

    // Dynamic import keeps service-role client out of client bundle
    const { supabaseAdmin } = await import("@/integrations/client.server");

    // 1. Remove storage objects (not cascade-deleted).
    //
    // Listed by the user's own prefix rather than derived from
    // weight_entries.photo_url: every object is keyed <userId>/<timestamp>.<ext>
    // (services/storage.ts buildPath), and objects exist that no row points at —
    // a replaced photo whose best-effort cleanup was swallowed, or an upload
    // whose DB write failed. Deriving paths from rows leaves those behind after
    // the user has been told their data is permanently deleted.
    const PAGE = 100;
    const paths: string[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data: page } = await supabaseAdmin.storage
        .from("weight-photos")
        .list(userId, { limit: PAGE, offset });
      if (!page?.length) break;
      paths.push(...page.map((o) => `${userId}/${o.name}`));
      if (page.length < PAGE) break;
    }

    if (paths.length > 0) {
      await supabaseAdmin.storage.from("weight-photos").remove(paths);
    }

    // 2. Delete auth user — CASCADE handles all public tables
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    const { sendAlert } = await import("@/server/telegram");

    if (error) {
      // Half-deleted: the photos are gone but the account is not. Worth a page,
      // because the user has been told their data was removed and it was not.
      await sendAlert({
        severity: "critical",
        title: "Account deletion failed after photos were removed",
        detail: { user: userId, photos: paths.length, error: error.message },
        throttleKey: "delete-account-failed",
      });
      throw new Error(`Account deletion failed: ${error.message}`);
    }

    // Churn signal. Not throttled by user, so two deletions in a day still read
    // as two — the volume is low enough that each one is worth seeing.
    await sendAlert({
      severity: "warning",
      title: "Account deleted",
      detail: { user: userId, photos: paths.length },
      throttleKey: `account-deleted:${userId}`,
    });

    return { success: true };
  });
