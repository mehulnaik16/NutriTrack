import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/client";
import { useAuth } from "@/lib/auth";
import { mountCommitHold } from "@/lib/commitHold";
import { commitCopy } from "@/lib/signupRules";
import { COMMIT_PAGE, SignupProgress } from "@/components/SignupProgress";

export const Route = createFileRoute("/commit")({ component: Commit });

/** Hold-to-commit, between "Create an account" and pricing. */
function Commit() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const host = useRef<HTMLDivElement>(null);
  const [copy, setCopy] = useState<ReturnType<typeof commitCopy> | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/signup", replace: true });
      return;
    }
    let cancelled = false;
    supabase
      .from("user_profiles")
      .select("goal, weight_kg, full_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        // A failed read still gets the page, with the plainer wording.
        if (!cancelled)
          setCopy(
            commitCopy(
              data?.goal ?? null,
              data?.weight_kg ?? null,
              data?.full_name ?? null,
            ),
          );
      });
    return () => {
      cancelled = true;
    };
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!copy || !host.current) return;
    return mountCommitHold(host.current, {
      ...copy,
      hint: "Tap and hold to make your commitment",
      sound: "/sounds/commit-burst.mp3",
      onDone: () => navigate({ to: "/plans", replace: true }),
    });
  }, [copy, navigate]);

  if (!copy) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-white">
      <div className="mx-auto w-full max-w-md px-4 pt-4">
        <SignupProgress page={COMMIT_PAGE} label="Commitment" />
      </div>
      <div ref={host} className="mx-auto min-h-0 w-full max-w-md flex-1" />
    </div>
  );
}
