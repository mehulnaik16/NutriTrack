import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/client";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      const params = new URLSearchParams(window.location.search);
      const oauthError = params.get("error_description") ?? params.get("error");
      if (oauthError) {
        toast.error(oauthError);
        navigate({ to: "/login" });
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;

      if (error || !data.session) {
        toast.error("Sign-in failed. Try again.");
        navigate({ to: "/login" });
        return;
      }

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("id", data.session.user.id)
        .maybeSingle();

      if (cancelled) return;
      navigate({ to: profile ? "/dashboard" : "/quiz" });
    };

    // detectSessionInUrl resolves the OAuth response asynchronously; the
    // SIGNED_IN event is the only reliable signal that it has landed.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") finish();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-accent" />
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  );
}
