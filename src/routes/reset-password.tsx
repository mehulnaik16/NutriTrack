import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Activity, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/client";

export const Route = createFileRoute("/reset-password")({ component: ResetPassword });

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  // Supabase sends the token in the URL hash — we need to let it process
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { toast.error("Passwords don't match."); return; }
    if (password.length < 6) { toast.error("Password must be at least 6 characters."); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated! Logging you in…");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted/40 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Activity className="h-5 w-5" />
          </div>
          <span className="text-2xl font-bold">FitTrack</span>
        </div>

        <Card className="border-border/60 shadow-lg">
          <CardContent className="p-6 sm:p-8">
            {!ready ? (
              <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-accent" />
                <p className="text-sm text-muted-foreground">Verifying your reset link…</p>
              </div>
            ) : (
              <>
                <h1 className="mb-1 text-2xl font-bold">New password</h1>
                <p className="mb-6 text-sm text-muted-foreground">Choose a strong password for your account.</p>
                <form onSubmit={handleReset} className="space-y-4">
                  <div className="space-y-2">
                    <Label>New password</Label>
                    <Input
                      type="password" required minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 6 characters"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Confirm password</Label>
                    <Input
                      type="password" required
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Same as above"
                    />
                  </div>
                  {confirm && password !== confirm && (
                    <p className="text-xs text-destructive">Passwords don't match</p>
                  )}
                  <Button
                    type="submit"
                    disabled={loading || password !== confirm || password.length < 6}
                    className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
                  >
                    {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Updating…</> : "Update password"}
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
