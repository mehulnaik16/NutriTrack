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

export const serverDeleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    // Dynamic import keeps service-role client out of client bundle
    const { supabaseAdmin } = await import("@/integrations/client.server");

    // 1. Remove storage objects (not cascade-deleted)
    const { data: entries } = await supabaseAdmin
      .from("weight_entries")
      .select("photo_url")
      .eq("user_id", userId)
      .not("photo_url", "is", null);

    const paths = (entries ?? [])
      .map((e: any) => {
        const tail = String(e.photo_url).split("/weight-photos/")[1];
        return tail ? tail.split("?")[0] : null;
      })
      .filter(Boolean) as string[];

    if (paths.length > 0) {
      await supabaseAdmin.storage.from("weight-photos").remove(paths);
    }

    // 2. Delete auth user — CASCADE handles all public tables
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      throw new Error(`Account deletion failed: ${error.message}`);
    }

    return { success: true };
  });
