import { createFileRoute, useNavigate } from "@tanstack/react-router";
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

export const Route = createFileRoute("/quiz")({ component: Quiz });

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
  const { user, refreshProfile } = useAuth();
  const isOAuth = !!user;
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
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

  const set = <K extends keyof FormData>(k: K, v: FormData[K]) =>
    setD((p) => ({ ...p, [k]: v }));

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
    if (step === 1) {
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
    if (step === 2) return d.heightCm > 0 && d.weightKg > 0;
    if (step === 3) return !!d.activity;
    if (step === 4) {
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
      // The nav stays hidden until the provider knows a profile exists.
      await refreshProfile();
      toast.success("Account created!");
      navigate({ to: "/plans" });
    } catch (e: any) {
      toast.error(e.message ?? "Signup failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-8">
      <div className="mx-auto max-w-md w-full">
        {/* Top Navigation */}
        <div className="mb-8 flex items-center justify-between text-sm font-medium">
          <button className="text-accent p-2 -ml-2" onClick={() => step > 1 ? setStep(step - 1) : navigate({ to: "/login" })}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <span className="text-foreground font-bold tracking-wide">
            {step === 1 ? "Create Account (1/5)" : step === 2 ? "Body Stats (2/5)" : step === 3 ? "Activity (3/5)" : step === 4 ? "Goal (4/5)" : "Review (5/5)"}
          </span>
          {/* no skip — all steps are required */}
          <div className="w-10" />
        </div>

        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            {step === 1 && (
              <div className="space-y-6">
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

            {step === 2 && (
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

            {step === 3 && (
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

            {step === 4 && (
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

            {step === 5 && (
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

            <div className="mt-12 flex items-center justify-center">
              {step < 5 ? (
                <Button
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!canNext()}
                  className="w-full max-w-sm rounded-full h-14 bg-accent hover:bg-accent/90 text-accent-foreground font-bold text-lg disabled:opacity-50 disabled:bg-muted disabled:text-muted-foreground"
                >
                  Continue
                </Button>
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
