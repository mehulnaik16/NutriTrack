import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { supabase } from "@/integrations/client";
import { useAuth } from "@/lib/auth";
import { authErrorMessage, isAlreadyRegistered } from "@/lib/authErrors";
import { isValidCode, REFEREE_DISCOUNT_RUPEES } from "@/lib/referral";
import { isGymCode } from "@/lib/gym";
import { serverLinkGym, serverVerifyGymCode } from "@/lib/gym-link";
import { findPlan, REFERRAL_DISCOUNT_PLAN_ID } from "@/lib/plans";
import {
  activityMultipliers,
  bmiCategory,
  calcBMI,
  calcBMR,
  calcCalorieTarget,
  calcMacros,
  calcTDEE,
  PRIMARY_GOALS,
  LOSE_RATE_OPTIONS,
  GAIN_RATE_OPTIONS,
  resolveGoalKey,
} from "@/lib/nutrition";

/**
 * The wizard, in order. Step numbers were hardcoded in a dozen places, so
 * inserting one meant renumbering every branch and hoping none was missed — the
 * referral step is the first time that bill came due. Everything now derives
 * from this list: the panel that renders, the header, the count, the bound
 * validateSearch clamps to, and where Continue turns into Create My Account.
 */
const STEPS = [
  { key: "account", title: "Create Account" },
  { key: "referral", title: "Invite Code" },
  { key: "body", title: "Body Stats" },
  { key: "activity", title: "Activity" },
  { key: "goal", title: "Goal" },
  { key: "review", title: "Review" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

export const Route = createFileRoute("/quiz")({
  component: Quiz,
  // `ref` carries an invite code — a friend's (RAH38291) or a gym's
  // (GYM-IRONVAULT-123). Unlisted params are stripped by the router, so leaving
  // it out here silently discards every referral and gym QR link.
  validateSearch: (s: Record<string, unknown>): { step?: number; ref?: string } => {
    const n = Number(s.step);
    const out: { step?: number; ref?: string } = {};
    if (Number.isInteger(n) && n >= 1 && n <= STEPS.length) out.step = n;
    const code = typeof s.ref === "string" ? s.ref.trim().toUpperCase() : "";
    if (isValidCode(code) || isGymCode(code)) out.ref = code;
    return out;
  },
});

const REF_STORAGE_KEY = "dombelz.referralCode";

/**
 * Google OAuth navigates away and back, which loses the search param, so the
 * code is parked in sessionStorage the moment we see it.
 */
function rememberReferralCode(code: string | undefined) {
  if (!code || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(REF_STORAGE_KEY, code);
  } catch {
    /* private mode — the in-URL code still works for a same-tab signup */
  }
}

function pendingReferralCode(fromSearch?: string): string | null {
  if (fromSearch) return fromSearch;
  if (typeof sessionStorage === "undefined") return null;
  try {
    const stored = sessionStorage.getItem(REF_STORAGE_KEY);
    return isValidCode(stored) || isGymCode(stored) ? stored : null;
  } catch {
    return null;
  }
}

interface FormData {
  fullName: string;
  email: string;
  password: string;
  repeatPassword: string;
  age: number;
  gender: string;
  heightCm: number;
  weightKg: number;
  activity: string;
  goal: string;
}

function Quiz() {
  const navigate = useNavigate();
  const routeNavigate = Route.useNavigate();
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const isOAuth = !!user;
  const { step: searchStep, ref: searchRef } = Route.useSearch();
  const step = searchStep ?? 1;
  const stepKey: StepKey = STEPS[step - 1]?.key ?? "account";
  // Each step is a real history entry: forward pushes, back pops.
  const setStep = (n: number) => routeNavigate({ search: (prev) => ({ ...prev, step: n }) });
  const [submitting, setSubmitting] = useState(false);
  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [d, setD] = useState<FormData>({
    fullName: "",
    email: "",
    password: "",
    repeatPassword: "",
    age: 0,
    gender: "Male",
    heightCm: 170,
    weightKg: 70,
    activity: "Sedentary",
    goal: "maintain",
  });
  const [loseRate, setLoseRate] = useState("lose_0_25kg");
  const [unit, setUnit] = useState<"kg" | "lb">("kg");

  // ── The referral step ──────────────────────────────────────────────────────
  //
  // `applied` is the single answer submit() uses. It is seeded from the ?ref=
  // link so someone arriving from a share sees the step already filled in and
  // green, and a code typed by hand overwrites it — the URL must not win over
  // what the user just entered.
  const [codeInput, setCodeInput] = useState(
    () => pendingReferralCode(searchRef) ?? "",
  );
  const [applied, setApplied] = useState<string | null>(
    () => pendingReferralCode(searchRef),
  );
  const [codeState, setCodeState] = useState<
    "idle" | "checking" | "valid" | "invalid"
  >(() => (pendingReferralCode(searchRef) ? "valid" : "idle"));
  const [codeError, setCodeError] = useState<string | null>(null);
  /** Which kind of code `applied` holds. submit() dispatches on it, because a
   *  friend's code and a gym's code are claimed through different calls. */
  const [appliedKind, setAppliedKind] = useState<"friend" | "gym" | null>(() =>
    isGymCode(pendingReferralCode(searchRef)) ? "gym" : pendingReferralCode(searchRef) ? "friend" : null,
  );
  /** The gym behind a valid gym code, for the success message. */
  const [gymName, setGymName] = useState<string | null>(null);
  /** Only set for an already-signed-in user; a fresh signup has no code yet. */
  const [ownCode, setOwnCode] = useState<string | null>(null);

  // An OAuth user who re-enters the quiz already owns a code. claim_referral
  // rejects a self-referral server-side, so this only stops the UI from
  // celebrating a gift that would then be silently dropped.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("user_profiles")
      .select("referral_code")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setOwnCode((data as any)?.referral_code ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  /** Clear every trace of a previous verdict. Called before each check and by
   *  Skip, so the box and the message can never describe different codes. */
  const clearCode = () => {
    setApplied(null);
    setAppliedKind(null);
    setGymName(null);
  };

  /**
   * Check a code against the database and record the verdict.
   *
   * Two shapes are accepted and they cannot be confused: a friend's code is
   * three letters then five digits, a gym's is GYM-<name>-<3 digits>. Friend
   * codes resolve through get_referrer_name(), which is granted to anon and so
   * doubles as the existence check; gym codes live in the partner project and
   * resolve through serverVerifyGymCode(), which discloses the gym's name and
   * nothing else.
   */
  const checkCode = async (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!code) {
      clearCode();
      setCodeState("idle");
      setCodeError(null);
      return;
    }
    const gym = isGymCode(code);
    if (!gym && !isValidCode(code)) {
      clearCode();
      setCodeState("invalid");
      setCodeError(
        "That code doesn't look right. A friend's code is like RAH38291; a gym's is like GYM-IRONVAULT-123.",
      );
      return;
    }
    if (!gym && ownCode && code === ownCode) {
      clearCode();
      setCodeState("invalid");
      setCodeError("That's your own code — ask a friend for theirs.");
      return;
    }
    setCodeState("checking");
    setCodeError(null);
    try {
      if (gym) {
        const { gymName: name } = await serverVerifyGymCode({ data: { code } });
        if (name) {
          setGymName(name);
          setReferrerName(null);
          setApplied(code);
          setAppliedKind("gym");
          setCodeState("valid");
          rememberReferralCode(code);
        } else {
          clearCode();
          setCodeState("invalid");
          setCodeError(
            "We couldn't find that gym code. Check it with your gym and try again.",
          );
        }
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts leaves Functions empty
      const { data } = await (supabase.rpc as any)("get_referrer_name", { code });
      if (data) {
        setReferrerName(data as string);
        setGymName(null);
        setApplied(code);
        setAppliedKind("friend");
        setCodeState("valid");
        rememberReferralCode(code);
      } else {
        clearCode();
        setCodeState("invalid");
        setCodeError(
          "We couldn't find that code. Check it with your friend and try again.",
        );
      }
    } catch {
      clearCode();
      setCodeState("invalid");
      setCodeError("Couldn't check that code just now. Try again.");
    }
  };

  const set = <K extends keyof FormData>(k: K, v: FormData[K]) =>
    setD((p) => ({ ...p, [k]: v }));

  // Park the invite code before any OAuth round-trip can drop it, then resolve
  // who sent it for the gift banner — a friend's first name, or the gym's name.
  // An unknown code resolves to null and the quiz simply renders as normal.
  useEffect(() => {
    rememberReferralCode(searchRef);
    const code = pendingReferralCode(searchRef);
    if (!code) return;
    let cancelled = false;
    if (isGymCode(code)) {
      serverVerifyGymCode({ data: { code } }).then(
        ({ gymName: name }) => {
          if (!cancelled) setGymName(name ?? null);
        },
        () => {},
      );
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts leaves Functions empty
      (supabase.rpc as any)("get_referrer_name", { code }).then(
        ({ data }: { data: string | null }) => {
          if (!cancelled) setReferrerName(data ?? null);
        },
        () => {},
      );
    }
    return () => {
      cancelled = true;
    };
  }, [searchRef]);

  useEffect(() => {
    if (!user) return;
    setD((p) => ({
      ...p,
      fullName:
        p.fullName ||
        (user.user_metadata?.full_name as string | undefined) ||
        (user.user_metadata?.name as string | undefined) ||
        "",
      email: p.email || user.email || "",
    }));
  }, [user]);

  const bmi = useMemo(
    () => calcBMI(d.weightKg, d.heightCm),
    [d.weightKg, d.heightCm],
  );
  const bmr = useMemo(
    () => calcBMR(d.weightKg, d.heightCm, d.age, d.gender),
    [d.weightKg, d.heightCm, d.age, d.gender],
  );
  const tdee    = useMemo(() => calcTDEE(bmr, d.activity), [bmr, d.activity]);
  const goalKey = useMemo(() => resolveGoalKey(d.goal, loseRate), [d.goal, loseRate]);
  const target  = useMemo(() => calcCalorieTarget(tdee, goalKey, d.gender), [tdee, goalKey, d.gender]);
  const macros  = useMemo(() => calcMacros(target, goalKey, d.weightKg), [target, goalKey, d.weightKg]);

  const canNext = () => {
    if (stepKey === "account") {
      const identityOk = d.fullName.trim() !== "" && d.email.trim() !== "";
      if (isOAuth) return identityOk && d.age >= 16;
      return (
        identityOk &&
        d.password.length >= 8 &&
        d.password.length <= 72 &&
        d.password === d.repeatPassword &&
        d.age >= 16
      );
    }
    // Optional, so an empty box passes. A code that is present but unverified
    // does not: the user fixes it, clears it, or taps Skip for now.
    if (stepKey === "referral") {
      return codeInput.trim() === "" || codeState === "valid";
    }
    if (stepKey === "body") return d.heightCm > 0 && d.weightKg > 0;
    if (stepKey === "activity") return !!d.activity;
    if (stepKey === "goal") {
      if (!d.goal) return false;
      // lose/gain goals need a rate chosen (loseRate must match the active goal)
      if (d.goal === "lose") return loseRate.startsWith("lose_");
      if (d.goal === "gain") return loseRate.startsWith("gain_");
      return true; // maintain needs no sub-selection
    }
    return true;
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      let userId = user?.id;
      if (!userId) {
        const { data: signup, error } = await supabase.auth.signUp({
          email: d.email,
          password: d.password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: d.fullName },
          },
        });
        if (error) throw error;
        userId = signup.user?.id;
      }
      if (!userId) throw new Error("No user created");

      const { error: pErr } = await supabase.from("user_profiles").upsert({
        id: userId,
        full_name: d.fullName,
        age: d.age,
        gender: d.gender,
        height_cm: d.heightCm,
        weight_kg: d.weightKg,
        activity_level: d.activity,
        goal: goalKey,
        bmi,
        bmr,
        tdee,
        daily_calorie_target: target,
        protein_target_g: macros.protein,
        carbs_target_g: macros.carbs,
        fat_target_g: macros.fat,
        fiber_target_g: macros.fiber,
      });
      if (pErr) throw pErr;

      // Attribution is best-effort by design: an unknown code, a self-referral
      // or a second attempt all come back false, and none of them may block an
      // account that has already been created.
      //
      // Whether this earns anything is decided server-side either way —
      // claim_referral() and link_gym() both derive it from the account's own
      // state, so nothing sent from here can talk them into a reward.
      const refCode = applied;
      if (refCode) {
        try {
          if (appliedKind === "gym") {
            await serverLinkGym({ data: { code: refCode } });
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts leaves Functions empty
            await (supabase.rpc as any)("claim_referral", { code: refCode });
          }
          sessionStorage.removeItem(REF_STORAGE_KEY);
        } catch (refErr) {
          console.warn("[referral] could not claim code", refErr);
        }
      }

      // The nav stays hidden until the provider knows a profile exists.
      await refreshProfile();
      toast.success("Account created!");
      navigate({ to: "/plans" });
    } catch (e: any) {
      const raw = e?.message as string | undefined;
      toast.error(authErrorMessage(raw));
      // An existing account can't be created again, and the quiz has no way
      // forward from here — the login screen does, including Google.
      if (isAlreadyRegistered(raw)) navigate({ to: "/login" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-8">
      <div className="mx-auto max-w-md w-full">
        {/* Top Navigation */}
        <div className="mb-8 flex items-center justify-between text-sm font-medium">
          <button className="text-accent p-2 -ml-2" onClick={() => step > 1 ? router.history.back() : navigate({ to: "/login" })}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <span className="text-foreground font-bold tracking-wide">
            {STEPS[step - 1]?.title} ({step}/{STEPS.length})
          </span>
          {/* the referral step carries its own Skip; the rest are required */}
          <div className="w-10" />
        </div>

        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            {stepKey === "account" && (
              <div className="space-y-6">
                {applied && (referrerName || gymName) && (
                  <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4">
                    <p className="flex items-center gap-2 font-display text-base font-bold text-accent">
                      {appliedKind === "gym"
                        ? `🏋️ ${gymName} has you covered`
                        : `🎁 ${referrerName} sent you a gift`}
                    </p>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      Sign up and you'll get ₹{REFEREE_DISCOUNT_RUPEES} off the{" "}
                      {findPlan(REFERRAL_DISCOUNT_PLAN_ID)?.name ?? "Yearly"} plan,
                      plus a free trial to explore everything.
                    </p>
                    <p className="mt-2 text-xs font-medium text-muted-foreground">
                      {appliedKind === "gym" ? "Gym code applied:" : "Gift code applied:"}{" "}
                      <span className="font-display tracking-widest text-accent">
                        {applied}
                      </span>
                    </p>
                  </div>
                )}
                <h2 className="text-3xl font-semibold mb-2">Tell us about you</h2>
                <p className="text-muted-foreground mb-8 text-sm">
                  {isOAuth
                    ? "Finish your profile to get started on your journey."
                    : "Create your account to get started on your journey."}
                </p>
                {!isOAuth && (
                  <div className="mb-8 space-y-5">
                    <GoogleSignInButton label="Sign up with Google" />
                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        or
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  </div>
                )}
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-foreground/80">Full Name</Label>
                    <Input
                      value={d.fullName}
                      onChange={(e) => set("fullName", e.target.value)}
                      className="bg-card border-0 focus-visible:ring-accent text-foreground h-12 rounded-xl"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-foreground/80">Email</Label>
                      <Input
                        type="email"
                        value={d.email}
                        disabled={isOAuth}
                        onChange={(e) => set("email", e.target.value)}
                        className="bg-card border-0 focus-visible:ring-accent text-foreground h-12 rounded-xl"
                      />
                    </div>
                    {!isOAuth && (
                    <>
                    <div className="space-y-2">
                      <Label className="text-foreground/80">Password</Label>
                      <Input
                        type="password"
                        value={d.password}
                        onChange={(e) => set("password", e.target.value)}
                        className={`bg-card border-0 focus-visible:ring-accent text-foreground h-12 rounded-xl ${d.password.length > 72 ? 'ring-2 ring-red-500' : ''}`}
                      />
                      {d.password.length > 72 && (
                        <p className="text-xs text-red-500">Password cannot be longer than 72 characters</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-foreground/80">Repeat Password</Label>
                      <Input
                        type="password"
                        value={d.repeatPassword}
                        onChange={(e) => set("repeatPassword", e.target.value)}
                        className="bg-card border-0 focus-visible:ring-accent text-foreground h-12 rounded-xl"
                      />
                    </div>
                    </>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground/80">Age</Label>
                    <Input
                      type="number"
                      value={d.age || ""}
                      onChange={(e) => set("age", +e.target.value)}
                      className="bg-card border-0 focus-visible:ring-accent text-foreground h-12 rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground/80">Gender</Label>
                    <RadioGroup
                      value={d.gender}
                      onValueChange={(v) => set("gender", v)}
                      className="flex gap-4 text-foreground"
                    >
                      {["Male", "Female", "Other"].map((g) => (
                        <div key={g} className="flex items-center gap-2">
                          <RadioGroupItem value={g} id={g} className="border-accent text-accent" />
                          <Label htmlFor={g} className="text-foreground/80">{g}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                </div>
              </div>
            )}

            {stepKey === "referral" && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <h2 className="text-3xl font-semibold mb-2">
                  Got a code?{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </h2>
                <p className="text-muted-foreground mb-8 text-sm">
                  From a friend, or from your gym. Either one gets you ₹
                  {REFEREE_DISCOUNT_RUPEES} off the{" "}
                  {findPlan(REFERRAL_DISCOUNT_PLAN_ID)?.name ?? "Yearly"} plan.
                  This is the only place a code counts, so enter it now if you
                  have one.
                </p>

                <div className="space-y-2">
                  <Label className="text-foreground/80">Friend or gym code</Label>
                  <div className="flex gap-2">
                    <Input
                      value={codeInput}
                      // Long enough for GYM- plus a twelve-letter gym name plus
                      // three digits; a friend's code is eight.
                      maxLength={20}
                      autoCapitalize="characters"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="RAH38291 or GYM-IRONVAULT-123"
                      onChange={(e) => {
                        setCodeInput(e.target.value.toUpperCase());
                        // Editing invalidates the previous verdict — the box and
                        // the message must never describe different codes.
                        setCodeState("idle");
                        setCodeError(null);
                        clearCode();
                      }}
                      onBlur={() => {
                        if (codeInput.trim() && codeState === "idle") {
                          checkCode(codeInput);
                        }
                      }}
                      className="bg-card border-0 focus-visible:ring-accent text-foreground h-12 rounded-xl font-display tracking-[0.1em]"
                    />
                    <Button
                      type="button"
                      onClick={() => checkCode(codeInput)}
                      disabled={!codeInput.trim() || codeState === "checking"}
                      className="h-12 rounded-xl px-6 font-bold"
                      variant="outline"
                    >
                      {codeState === "checking" ? "Checking…" : "Apply"}
                    </Button>
                  </div>

                  {codeState === "valid" && (
                    <p className="text-sm font-medium text-accent">
                      {appliedKind === "gym"
                        ? `🏋️ ${gymName ?? "Your gym"} verified — `
                        : `🎁 Gift from ${referrerName ?? "your friend"} applied — `}
                      ₹{REFEREE_DISCOUNT_RUPEES} off the{" "}
                      {findPlan(REFERRAL_DISCOUNT_PLAN_ID)?.name ?? "Yearly"}{" "}
                      plan.
                    </p>
                  )}
                  {codeState === "invalid" && codeError && (
                    <p className="text-sm font-medium text-red-500">
                      {codeError}
                    </p>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  No code? Carry on — you'll still get your free trial.
                </p>
              </div>
            )}

            {stepKey === "body" && (
              <div className="space-y-6 animate-in fade-in duration-300 flex flex-col items-center">
                <h2 className="text-3xl font-semibold mb-2 self-start">What's your weight?</h2>
                <p className="text-muted-foreground mb-8 text-sm self-start">
                  We use your weight to personalize workouts and training calculations.
                </p>

                {/* Toggle */}
                <div className="flex bg-card rounded-xl p-1 w-full max-w-sm mb-6 cursor-pointer">
                  <div 
                    onClick={() => setUnit("kg")}
                    className={`flex-1 text-center py-2 rounded-lg font-bold text-sm transition-colors ${unit === 'kg' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
                  >
                    Kilograms (kg)
                  </div>
                  <div 
                    onClick={() => setUnit("lb")}
                    className={`flex-1 text-center py-2 rounded-lg font-bold text-sm transition-colors ${unit === 'lb' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
                  >
                    Pounds (lb)
                  </div>
                </div>

                {/* Big Number */}
                <div className="text-7xl font-bold tracking-tight mb-8">
                  {unit === 'kg' ? d.weightKg : Math.round(d.weightKg * 2.20462)} <span className="text-3xl text-muted-foreground font-normal">{unit}</span>
                </div>

                {/* Robust Native Slider for Weight */}
                <div className="w-full max-w-sm mt-4 px-2">
                   <Slider 
                      value={[d.weightKg]} 
                      onValueChange={(v) => set("weightKg", v[0])} 
                      min={30} max={200} step={1} 
                      className="py-4 cursor-grab active:cursor-grabbing [&_[role=slider]]:h-8 [&_[role=slider]]:w-8 [&_[role=slider]]:bg-accent [&_[role=slider]]:border-accent [&_[role=slider]]:shadow-[0_0_20px_-2px_var(--accent)] [&_.relative]:bg-muted [&_.relative>div]:bg-accent"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground/60 mt-2 font-medium">
                      <span>30 kg</span>
                      <span>200 kg</span>
                    </div>
                </div>

                {/* Height Input */}
                <div className="w-full max-w-sm mt-12 space-y-4">
                  <Label className="text-foreground/80 text-lg">Height (cm)</Label>
                   <Slider 
                      value={[d.heightCm]} 
                      onValueChange={(v) => set("heightCm", v[0])} 
                      min={100} max={250} step={1} 
                      className="py-4 cursor-grab active:cursor-grabbing [&_[role=slider]]:h-8 [&_[role=slider]]:w-8 [&_[role=slider]]:bg-accent [&_[role=slider]]:border-accent [&_[role=slider]]:shadow-[0_0_20px_-2px_var(--accent)] [&_.relative]:bg-muted [&_.relative>div]:bg-accent"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground/60 mt-2 font-medium">
                      <span>100 cm</span>
                      <span className="text-lg text-foreground font-bold">{d.heightCm} cm</span>
                      <span>250 cm</span>
                    </div>
                </div>
              </div>
            )}

            {stepKey === "activity" && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <h2 className="text-3xl font-semibold mb-2">Activity level</h2>
                <p className="text-muted-foreground mb-8 text-sm">
                  How active are you on an average week?
                </p>
                <RadioGroup
                  value={d.activity}
                  onValueChange={(v) => set("activity", v)}
                  className="grid gap-3"
                >
                  <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors ${d.activity === 'Sedentary' ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-muted-foreground/30'}`}>
                    <RadioGroupItem value="Sedentary" className="border-accent text-accent" />
                    <span className="font-medium">Sedentary (little or no exercise)</span>
                  </label>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors ${d.activity === 'Lightly Active' ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-muted-foreground/30'}`}>
                    <RadioGroupItem value="Lightly Active" className="border-accent text-accent" />
                    <span className="font-medium">Lightly Active (1–3 days/week)</span>
                  </label>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors ${d.activity === 'Moderately Active' ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-muted-foreground/30'}`}>
                    <RadioGroupItem value="Moderately Active" className="border-accent text-accent" />
                    <span className="font-medium">Moderately Active (3–5 days/week)</span>
                  </label>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors ${d.activity === 'Very Active' ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-muted-foreground/30'}`}>
                    <RadioGroupItem value="Very Active" className="border-accent text-accent" />
                    <span className="font-medium">Very Active (6–7 days/week)</span>
                  </label>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors ${d.activity === 'Super Active' ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-muted-foreground/30'}`}>
                    <RadioGroupItem value="Super Active" className="border-accent text-accent" />
                    <span className="font-medium">Super Active (twice/day or physical job)</span>
                  </label>
                </RadioGroup>
                {bmr > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2 mt-8 animate-in slide-in-from-bottom-2 duration-300">
                    <div className="rounded-xl border border-border bg-card p-4 text-center">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1">BMR (Baseline)</div>
                      <div className="text-2xl font-bold">
                        {bmr} <span className="text-sm font-normal text-muted-foreground">kcal</span>
                      </div>
                    </div>
                    <div className="rounded-xl border border-accent/30 bg-accent/10 p-4 text-center">
                      <div className="text-xs text-accent uppercase tracking-wider font-bold mb-1">TDEE (With Activity)</div>
                      <div className="text-2xl font-bold text-accent">
                        {tdee} <span className="text-sm font-normal text-accent/70">kcal</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {stepKey === "goal" && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <h2 className="text-3xl font-semibold mb-2">Your goal</h2>
                <p className="text-muted-foreground mb-8 text-sm">
                  What are you trying to achieve?
                </p>

                {/* Step 1: Primary goal cards */}
                <RadioGroup
                  value={d.goal}
                  onValueChange={(v) => { set("goal", v); setLoseRate(v === "gain" ? "gain_0_25kg" : "lose_0_25kg"); }}
                  className="grid gap-3"
                >
                  {PRIMARY_GOALS.map(({ value, label, emoji }) => (
                    <label
                      key={value}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors ${
                        d.goal === value
                          ? "border-accent bg-accent/10"
                          : "border-border bg-card hover:border-muted-foreground/30"
                      }`}
                    >
                      <RadioGroupItem value={value} className="border-accent text-accent" />
                      <span className="font-medium text-foreground">
                        {emoji} {label}
                      </span>
                    </label>
                  ))}
                </RadioGroup>

                {/* Rate sub-selector — shown only when Lose Weight is chosen */}
                {d.goal === "lose" && (
                  <div className="mt-2 space-y-2 animate-in slide-in-from-top-2 duration-300">
                    <p className="text-sm text-muted-foreground font-medium">How fast do you want to lose weight?</p>
                    {LOSE_RATE_OPTIONS.map(({ value, label, detail }) => (
                      <label
                        key={value}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors ${
                          loseRate === value
                            ? "border-accent bg-accent/10"
                            : "border-border bg-card hover:border-muted-foreground/30"
                        }`}
                        onClick={() => setLoseRate(value)}
                      >
                        <div
                          className={`h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                            loseRate === value ? "border-accent" : "border-muted-foreground/40"
                          }`}
                        >
                          {loseRate === value && (
                            <div className="h-2 w-2 rounded-full bg-accent" />
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">{label}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{detail}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                {/* Rate sub-selector — shown only when Gain Muscle is chosen */}
                {d.goal === "gain" && (
                  <div className="mt-2 space-y-2 animate-in slide-in-from-top-2 duration-300">
                    <p className="text-sm text-muted-foreground font-medium">How fast do you want to gain?</p>
                    {GAIN_RATE_OPTIONS.map(({ value, label, detail }) => (
                      <label
                        key={value}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors ${
                          loseRate === value
                            ? "border-accent bg-accent/10"
                            : "border-border bg-card hover:border-muted-foreground/30"
                        }`}
                        onClick={() => setLoseRate(value)}
                      >
                        <div
                          className={`h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                            loseRate === value ? "border-accent" : "border-muted-foreground/40"
                          }`}
                        >
                          {loseRate === value && (
                            <div className="h-2 w-2 rounded-full bg-accent" />
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">{label}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{detail}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                {target > 0 && (
                  <div className="rounded-xl border border-accent/30 bg-accent/10 p-4 mt-8">
                    <div className="text-xs text-accent font-bold uppercase tracking-wider text-center mb-1">
                      Daily Calorie Target
                    </div>
                    <div className="text-4xl font-bold text-center text-accent">{target} <span className="text-lg font-normal text-accent/70">kcal</span></div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm pt-4 border-t border-accent/20">
                      <div>
                        <div className="font-semibold text-foreground">{macros.protein}g</div>
                        <div className="text-xs text-muted-foreground">Protein</div>
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">{macros.carbs}g</div>
                        <div className="text-xs text-muted-foreground">Carbs</div>
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">{macros.fat}g</div>
                        <div className="text-xs text-muted-foreground">Fats</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {stepKey === "review" && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <h2 className="text-3xl font-semibold mb-2">Review & confirm</h2>
                <p className="text-muted-foreground mb-8 text-sm">
                  Let's make sure everything looks right.
                </p>
                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  <Row label="Name" value={d.fullName} />
                  <Row label="Email" value={d.email} />
                  <Row label="Age" value={String(d.age)} />
                  <Row label="Gender" value={d.gender} />
                  <Row label="Height" value={`${d.heightCm} cm`} />
                  <Row label="Weight" value={`${unit === 'kg' ? d.weightKg : Math.round(d.weightKg * 2.20462)} ${unit}`} />
                  <Row label="Activity" value={d.activity} />
                  <Row label="Goal" value={d.goal} />
                  <Row label="BMI" value={`${bmi} (${bmiCategory(bmi)})`} />
                  <Row label="BMR" value={`${bmr} kcal`} />
                  <Row label="TDEE" value={`${tdee} kcal`} />
                  <Row
                    label="Daily Target"
                    value={`${target} kcal`}
                    highlight
                  />
                </div>
                <div className="rounded-xl border border-accent/30 bg-accent/10 p-4 mt-8">
                  <div className="text-xs text-accent font-bold uppercase tracking-wider text-center mb-1">
                    Daily macro split
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                    <div>
                      <div className="font-semibold text-foreground text-lg">{macros.protein}g</div>
                      <div className="text-xs text-muted-foreground">Protein</div>
                    </div>
                    <div>
                      <div className="font-semibold text-foreground text-lg">{macros.carbs}g</div>
                      <div className="text-xs text-muted-foreground">Carbs</div>
                    </div>
                    <div>
                      <div className="font-semibold text-foreground text-lg">{macros.fat}g</div>
                      <div className="text-xs text-muted-foreground">Fats</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-12 flex flex-col items-center justify-center gap-3">
              {step < STEPS.length ? (
                <>
                <Button
                  onClick={() => setStep(step + 1)}
                  disabled={!canNext()}
                  className="w-full max-w-sm rounded-full h-14 bg-accent hover:bg-accent/90 text-accent-foreground font-bold text-lg disabled:opacity-50 disabled:bg-muted disabled:text-muted-foreground"
                >
                  Continue
                </Button>
                {/* The one skippable step. Clearing the box as it advances is
                    what keeps a half-typed code from reaching submit(). */}
                {stepKey === "referral" && (
                  <button
                    type="button"
                    onClick={() => {
                      setCodeInput("");
                      clearCode();
                      setCodeState("idle");
                      setCodeError(null);
                      setStep(step + 1);
                    }}
                    className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Skip for now
                  </button>
                )}
                </>
              ) : (
                <Button
                  onClick={submit}
                  disabled={submitting}
                  className="w-full max-w-sm rounded-full h-14 bg-accent hover:bg-accent/90 text-accent-foreground font-bold text-lg disabled:opacity-50 disabled:bg-muted disabled:text-muted-foreground"
                >
                  {submitting ? "Creating…" : "Create My Account"}
                </Button>
              )}
            </div>
            </div>
          </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <a
            href="/login"
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            Log in
          </a>
        </p>
        <p className="mt-3 pb-6 text-center text-xs text-muted-foreground/80">
          By creating an account you agree to our{" "}
          <a href="/terms" className="text-accent underline-offset-2 hover:underline">
            Terms
          </a>{" "}
          and{" "}
          <a href="/privacy" className="text-accent underline-offset-2 hover:underline">
            Privacy Policy
          </a>
          .
        </p>
      </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg px-3 py-2 ${highlight ? "bg-accent/10 border border-accent/30" : "bg-card border-0"}`}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${highlight ? 'text-accent' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}
