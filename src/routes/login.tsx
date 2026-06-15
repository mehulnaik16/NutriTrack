import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Activity, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/client";

export const Route = createFileRoute("/login")({ component: Login });

type Mode = "login" | "forgot" | "forgot-sent";

function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome back!");
    navigate({ to: "/dashboard" });
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Enter your email first.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMode("forgot-sent");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted/40 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Activity className="h-5 w-5" />
          </div>
          <span className="text-2xl font-bold">FitTrack</span>
        </div>

        <Card className="border-border/60 shadow-lg">
          <CardContent className="p-6 sm:p-8">
            {/* ── Login ── */}
            {mode === "login" && (
              <>
                <h1 className="mb-1 text-2xl font-bold">Log in</h1>
                <p className="mb-6 text-sm text-muted-foreground">
                  Welcome back. Continue your journey.
                </p>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Password</Label>
                      <button
                        type="button"
                        onClick={() => setMode("forgot")}
                        className="text-xs text-accent hover:underline underline-offset-2"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <Input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Logging in…
                      </>
                    ) : (
                      "Log in"
                    )}
                  </Button>
                </form>
                <p className="mt-6 text-center text-sm text-muted-foreground">
                  Don't have an account?{" "}
                  <Link
                    to="/quiz"
                    className="font-medium text-accent underline-offset-2 hover:underline"
                  >
                    Take the quiz
                  </Link>
                </p>
              </>
            )}

            {/* ── Forgot password ── */}
            {mode === "forgot" && (
              <>
                <button
                  onClick={() => setMode("login")}
                  className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to login
                </button>
                <h1 className="mb-1 text-2xl font-bold">Reset password</h1>
                <p className="mb-6 text-sm text-muted-foreground">
                  Enter your email and we'll send you a reset link.
                </p>
                <form onSubmit={handleForgot} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                      </>
                    ) : (
                      "Send reset link"
                    )}
                  </Button>
                </form>
              </>
            )}

            {/* ── Email sent confirmation ── */}
            {mode === "forgot-sent" && (
              <div className="text-center space-y-4 py-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--energy)]/10 mx-auto">
                  <span className="text-2xl">📧</span>
                </div>
                <h1 className="text-xl font-bold">Check your email</h1>
                <p className="text-sm text-muted-foreground">
                  We sent a password reset link to{" "}
                  <span className="font-medium text-foreground">{email}</span>.
                  Check your inbox and spam folder.
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setMode("login");
                    setEmail("");
                  }}
                >
                  Back to login
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
