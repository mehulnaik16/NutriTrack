import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Camera,
  Dumbbell,
  Loader2,
  Mail,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { supabase } from "@/integrations/client";

export const Route = createFileRoute("/login")({ component: Login });

type Mode = "login" | "forgot" | "forgot-sent";

const PERKS = [
  { icon: Camera, text: "Log any meal with a photo, your voice, or a barcode" },
  { icon: Dumbbell, text: "300+ exercises with tutorials, sets, and history" },
  { icon: Sparkles, text: "AI weekly reports that actually coach you" },
];

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
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      {/* ── Brand panel (desktop) ── */}
      <div className="relative hidden overflow-hidden border-r border-border/60 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="bg-grid bg-radial-fade absolute inset-0" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-accent/15 blur-[110px]" />

        <Link to="/" className="relative flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground glow-accent-sm">
            <Activity className="h-5 w-5" />
          </div>
          <span className="font-display text-xl font-bold tracking-tight">
            Dombelz
          </span>
        </Link>

        <div className="relative max-w-md">
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight">
            Consistency beats intensity.
            <span className="block text-accent text-glow">Every time.</span>
          </h1>
          <p className="mt-4 text-muted-foreground">
            Pick up right where you left off — your streaks, targets, and
            progress are waiting.
          </p>
          <ul className="mt-8 space-y-4">
            {PERKS.map((p) => (
              <li key={p.text} className="flex items-center gap-3 text-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <p.icon className="h-4 w-4" />
                </span>
                <span className="text-muted-foreground">{p.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-muted-foreground">
          © {new Date().getFullYear()} Dombelz
        </p>
      </div>

      {/* ── Form panel ── */}
      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <Link
            to="/"
            className="mb-8 flex items-center justify-center gap-2 lg:hidden"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground glow-accent-sm">
              <Activity className="h-5 w-5" />
            </div>
            <span className="font-display text-2xl font-bold">Dombelz</span>
          </Link>

          {mode === "login" && (
            <>
              <h2 className="font-display text-2xl font-bold tracking-tight">
                Welcome back
              </h2>
              <p className="mb-7 mt-1 text-sm text-muted-foreground">
                Log in to continue your journey.
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
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Password</Label>
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-xs font-medium text-accent underline-offset-2 hover:underline"
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
                    className="h-11 rounded-xl"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-12 w-full gap-2 rounded-xl bg-accent text-base font-bold text-accent-foreground hover:bg-accent/90"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Logging in…
                    </>
                  ) : (
                    <>
                      Log in <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  or
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <GoogleSignInButton />
              <div className="my-7 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  New here?
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <Link to="/quiz">
                <Button
                  variant="outline"
                  className="h-12 w-full rounded-xl font-semibold"
                >
                  Take the 2-minute quiz to join
                </Button>
              </Link>
            </>
          )}

          {mode === "forgot" && (
            <>
              <button
                onClick={() => setMode("login")}
                className="mb-5 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to login
              </button>
              <h2 className="font-display text-2xl font-bold tracking-tight">
                Reset password
              </h2>
              <p className="mb-7 mt-1 text-sm text-muted-foreground">
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
                    className="h-11 rounded-xl"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-12 w-full gap-2 rounded-xl bg-accent text-base font-bold text-accent-foreground hover:bg-accent/90"
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

          {mode === "forgot-sent" && (
            <div className="space-y-4 py-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Mail className="h-7 w-7" />
              </div>
              <h2 className="font-display text-xl font-bold">
                Check your email
              </h2>
              <p className="text-sm text-muted-foreground">
                We sent a password reset link to{" "}
                <span className="font-medium text-foreground">{email}</span>.
                Check your inbox and spam folder.
              </p>
              <Button
                variant="outline"
                className="h-11 w-full rounded-xl"
                onClick={() => {
                  setMode("login");
                  setEmail("");
                }}
              >
                Back to login
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
