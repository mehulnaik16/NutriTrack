import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AppleMark,
  GoogleMark,
  useOAuthSignIn,
} from "@/components/SocialSignInButtons";
import { supabase } from "@/integrations/client";
import { useAuth } from "@/lib/auth";
import { authErrorMessage, isAlreadyRegistered } from "@/lib/authErrors";
import { loadQuizDraft } from "@/lib/quizDraft";
import { saveQuizProfile } from "@/lib/quizProfile";
import { useForceLightTheme } from "@/lib/theme";
import { ACCOUNT_PAGE, SignupProgress } from "@/components/SignupProgress";

export const Route = createFileRoute("/signup")({ component: Signup });

/** The tick boxes, parked across the Google/Apple round trip (sessionStorage). */
const CONSENT_KEY = "dombelz.signupConsent";

const nameOf = (u: User) =>
  (u.user_metadata?.full_name as string | undefined) ??
  (u.user_metadata?.name as string | undefined) ??
  "";

/**
 * "Save your plan": the last step of sign-up. The quiz answers wait in the
 * local draft; the account is created here (Google, Apple or email) and the
 * answers are written to it, then the user goes on to the commitment.
 */
function Signup() {
  useForceLightTheme();
  const { user, loading, hasProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const [draft] = useState(loadQuizDraft);
  const [terms, setTerms] = useState(false);
  const [tips, setTips] = useState(false);
  const [mode, setMode] = useState<"choose" | "email">("choose");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [busy, setBusy] = useState(false);
  const savingRef = useRef(false);
  const oauth = useOAuthSignIn();

  const finish = async (uid: string, name: string, optIn: boolean) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setBusy(true);
    try {
      await saveQuizProfile(uid, name, optIn, draft);
      await refreshProfile();
      toast.success("Account created!");
      // Then the commitment, pricing, and the phone number last.
      navigate({ to: "/commit", replace: true });
    } catch (e) {
      toast.error(authErrorMessage((e as Error | undefined)?.message));
      savingRef.current = false;
      setBusy(false);
    }
  };

  // Signed in: back from Google/Apple, or arriving with a session already.
  useEffect(() => {
    // Mid-save, finish() owns the next page: its own refreshProfile() flips
    // hasProfile to true, which must not send the user on to /dashboard (and
    // from there /plans), skipping the final question.
    if (loading || !user || hasProfile === null || savingRef.current) return;
    if (hasProfile) {
      navigate({ to: "/dashboard", replace: true });
      return;
    }
    // A Google sign-in from the login page, with no quiz answered yet.
    if (!draft.d) {
      navigate({ to: "/quiz", replace: true });
      return;
    }
    let consent: { tips?: boolean } | null = null;
    try {
      consent = JSON.parse(sessionStorage.getItem(CONSENT_KEY) ?? "null");
      sessionStorage.removeItem(CONSENT_KEY);
    } catch {
      // Storage blocked: they tick the boxes again and press Save my plan.
    }
    if (consent) finish(user.id, nameOf(user), !!consent.tips);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, hasProfile]);

  const startOAuth = (p: "google" | "apple") => {
    try {
      sessionStorage.setItem(CONSENT_KEY, JSON.stringify({ tips }));
    } catch {
      // Storage blocked: the signed-in view asks for the ticks again.
    }
    oauth.signIn(p);
  };

  const emailOk =
    form.name.trim() !== "" &&
    form.email.trim() !== "" &&
    form.password.length >= 8 &&
    form.password.length <= 72 &&
    form.password === form.confirm;

  const signUpWithEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terms || !emailOk) return;
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: form.name.trim() },
      },
    });
    if (error || !data.user) {
      setBusy(false);
      toast.error(authErrorMessage(error?.message));
      if (isAlreadyRegistered(error?.message)) navigate({ to: "/login" });
      return;
    }
    finish(data.user.id, form.name.trim(), tips);
  };

  const inputClass =
    "h-12 rounded-xl border-0 bg-card text-foreground focus-visible:ring-accent";
  const pill = "h-14 w-full rounded-full text-base font-semibold gap-3";

  if (loading || (user && hasProfile !== false) || savingRef.current) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background px-4 py-8 text-foreground">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <SignupProgress
          page={ACCOUNT_PAGE}
          label="Create an account"
          onBack={() =>
            mode === "email" ? setMode("choose") : router.history.back()
          }
        />

        <h1 className="text-3xl font-semibold">Create an account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {user
            ? `Signed in as ${user.email}. Save your plan to continue.`
            : "Save your plan and get started."}
        </p>

        <div className="flex flex-1 flex-col justify-center space-y-4 py-10">
          {user ? (
            <Button
              disabled={!terms || busy}
              onClick={() => finish(user.id, nameOf(user), tips)}
              className={`${pill} bg-accent text-accent-foreground hover:bg-accent/90`}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Save my plan
            </Button>
          ) : mode === "choose" ? (
            <>
              <Button
                disabled={!terms || oauth.loading !== null}
                onClick={() => startOAuth("google")}
                className={`${pill} bg-foreground text-background hover:bg-foreground/90 [&_svg]:size-5`}
              >
                {oauth.loading === "google" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <GoogleMark />
                )}
                Continue with Google
              </Button>
              <Button
                variant="outline"
                disabled={!terms || oauth.loading !== null}
                onClick={() => startOAuth("apple")}
                className={`${pill} [&_svg]:size-5`}
              >
                {oauth.loading === "apple" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <AppleMark />
                )}
                Continue with Apple
              </Button>
              <Button
                variant="outline"
                disabled={!terms || oauth.loading !== null}
                onClick={() => setMode("email")}
                className={`${pill} [&_svg]:size-5`}
              >
                <Mail />
                Continue with Email
              </Button>
            </>
          ) : (
            <form onSubmit={signUpWithEmail} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="su-name">Full Name</Label>
                <Input
                  id="su-name"
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="su-email">Email</Label>
                <Input
                  id="su-email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="su-pass">Password</Label>
                <Input
                  id="su-pass"
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  className={inputClass}
                />
                {form.password !== "" &&
                  (form.password.length < 8 || form.password.length > 72) && (
                    <p className="text-xs text-red-500">
                      Use 8 to 72 characters.
                    </p>
                  )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="su-confirm">Confirm Password</Label>
                <Input
                  id="su-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={form.confirm}
                  onChange={(e) =>
                    setForm({ ...form, confirm: e.target.value })
                  }
                  className={inputClass}
                />
                {form.confirm !== "" && form.confirm !== form.password && (
                  <p className="text-xs text-red-500">Passwords don't match.</p>
                )}
              </div>
              <Button
                type="submit"
                disabled={!terms || !emailOk || busy}
                className={`${pill} bg-accent text-accent-foreground hover:bg-accent/90`}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Create account
              </Button>
            </form>
          )}

          <div className="space-y-4 pt-4">
            <label className="flex items-start gap-3 text-xs leading-relaxed text-foreground/80">
              <Checkbox
                checked={terms}
                onCheckedChange={(v) => setTerms(v === true)}
                className="h-5 w-5 rounded-[4px] border-foreground/60 data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background"
              />
              <span>
                By continuing, you agree to Dombelz's{" "}
                <a
                  href="/terms"
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  Terms and Conditions
                </a>{" "}
                and{" "}
                <a
                  href="/privacy"
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  Privacy Policy
                </a>
              </span>
            </label>
            <label className="flex items-start gap-3 text-xs leading-relaxed text-foreground/80">
              <Checkbox
                checked={tips}
                onCheckedChange={(v) => setTips(v === true)}
                className="h-5 w-5 rounded-[4px] border-foreground/60 data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background"
              />
              <span>
                Send me tips, new features, and personalized offers from Dombelz
                (optional)
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
