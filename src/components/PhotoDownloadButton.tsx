import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/client";
import { isNativeApp } from "@/lib/platform";

/**
 * Download one progress photo with its date in the bottom-right corner.
 * Web only (the app gets its own save flow later). 31 per calendar month,
 * counted by claim_photo_download() after the file is ready, so a photo that
 * fails to load never uses one up.
 */
export function PhotoDownloadButton({
  photoUrl,
  date,
}: {
  photoUrl: string;
  date: string;
}) {
  const [busy, setBusy] = useState(false);
  if (isNativeApp()) return null;

  const download = async () => {
    setBusy(true);
    try {
      const { weightPhotoFile } = await import("@/lib/weightReport");
      const file = await weightPhotoFile(photoUrl, date);
      if (!file) {
        toast.error("Couldn't load this photo. Please try again.");
        return;
      }
      const { data: ok, error } = await supabase.rpc("claim_photo_download");
      if (error) {
        toast.error("Couldn't download right now. Please try again.");
        return;
      }
      if (!ok) {
        const now = new Date();
        const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        toast(
          `You've downloaded 31 photos this month. More open up on ${next.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} 📸`,
        );
        return;
      }
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dombelz-weight-${date}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={download}
      disabled={busy}
      aria-label="Download photo"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      Download
    </Button>
  );
}
