import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { supabase } from "@/integrations/client";
import {
  activityMultipliers,
  bmiCategory,
  calcBMI,
  calcBMR,
  calcCalorieTarget,
  calcMacros,
  calcTDEE,
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
    goal: "Maintain Weight",
  });
  const [unit, setUnit] = useState<"kg" | "lb">("kg");

  const set = <K extends keyof FormData>(k: K, v: FormData[K]) =>
    setD((p) => ({ ...p, [k]: v }));

  const bmi = useMemo(
    () => calcBMI(d.weightKg, d.heightCm),
    [d.weightKg, d.heightCm],
  );
  const bmr = useMemo(
    () => calcBMR(d.weightKg, d.heightCm, d.age, d.gender),
    [d.weightKg, d.heightCm, d.age, d.gender],
  );
  const tdee = useMemo(() => calcTDEE(bmr, d.activity), [bmr, d.activity]);
  const target = useMemo(() => calcCalorieTarget(tdee, d.goal), [tdee, d.goal]);
  const macros = useMemo(() => calcMacros(target), [target]);

  const canNext = () => {
    if (step === 1)
      return d.fullName && d.email && d.password.length >= 6 && d.password.length <= 72 && d.password === d.repeatPassword && d.age > 0;
    if (step === 2) return d.heightCm > 0 && d.weightKg > 0;
    if (step === 3) return !!d.activity;
    if (step === 4) return !!d.goal;
    return true;
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data: signup, error } = await supabase.auth.signUp({
        email: d.email,
        password: d.password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: { full_name: d.fullName },
        },
      });
      if (error) throw error;
      const userId = signup.user?.id;
      if (!userId) throw new Error("No user created");

      const { error: pErr } = await supabase.from("user_profiles").upsert({
        id: userId,
        full_name: d.fullName,
        age: d.age,
        gender: d.gender,
        height_cm: d.heightCm,
        weight_kg: d.weightKg,
        activity_level: d.activity,
        goal: d.goal,
        bmi,
        bmr,
        tdee,
        daily_calorie_target: target,
        protein_target_g: macros.protein,
        carbs_target_g: macros.carbs,
        fat_target_g: macros.fat,
      });
      if (pErr) throw pErr;
      toast.success("Account created!");
      navigate({ to: "/plans" });
    } catch (e: any) {
      toast.error(e.message ?? "Signup failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111317] text-white px-4 py-8 font-sans">
      <div className="mx-auto max-w-md w-full">
        {/* Top Navigation */}
        <div className="mb-8 flex items-center justify-between text-sm font-medium">
          <button className="text-[#E2FF00] p-2 -ml-2" onClick={() => step > 1 ? setStep(step - 1) : navigate({ to: "/login" })}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <span className="text-white font-bold tracking-wide">
            {step === 1 ? "Create Account (1/5)" : step === 2 ? "Body Stats (2/5)" : step === 3 ? "Activity (3/5)" : step === 4 ? "Goal (4/5)" : "Review (5/5)"}
          </span>
          <button className="text-white/60 hover:text-white" onClick={() => step < 5 ? setStep(step + 1) : null}>
            Skip
          </button>
        </div>

        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            {step === 1 && (
              <div className="space-y-6">
                <h2 className="text-3xl font-semibold mb-2">Tell us about you</h2>
                <p className="text-[#a0a4ab] mb-8 text-sm">
                  Create your account to get started on your journey.
                </p>
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-white/80">Full Name</Label>
                    <Input
                      value={d.fullName}
                      onChange={(e) => set("fullName", e.target.value)}
                      className="bg-[#1c1f26] border-0 focus-visible:ring-[#E2FF00] text-white h-12 rounded-xl"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-white/80">Email</Label>
                      <Input
                        type="email"
                        value={d.email}
                        onChange={(e) => set("email", e.target.value)}
                        className="bg-[#1c1f26] border-0 focus-visible:ring-[#E2FF00] text-white h-12 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white/80">Password</Label>
                      <Input
                        type="password"
                        value={d.password}
                        onChange={(e) => set("password", e.target.value)}
                        className={`bg-[#1c1f26] border-0 focus-visible:ring-[#E2FF00] text-white h-12 rounded-xl ${d.password.length > 72 ? 'ring-2 ring-red-500' : ''}`}
                      />
                      {d.password.length > 72 && (
                        <p className="text-xs text-red-500">Password cannot be longer than 72 characters</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white/80">Repeat Password</Label>
                      <Input
                        type="password"
                        value={d.repeatPassword}
                        onChange={(e) => set("repeatPassword", e.target.value)}
                        className="bg-[#1c1f26] border-0 focus-visible:ring-[#E2FF00] text-white h-12 rounded-xl"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white/80">Age</Label>
                    <Input
                      type="number"
                      value={d.age || ""}
                      onChange={(e) => set("age", +e.target.value)}
                      className="bg-[#1c1f26] border-0 focus-visible:ring-[#E2FF00] text-white h-12 rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white/80">Gender</Label>
                    <RadioGroup
                      value={d.gender}
                      onValueChange={(v) => set("gender", v)}
                      className="flex gap-4 text-white"
                    >
                      {["Male", "Female", "Other"].map((g) => (
                        <div key={g} className="flex items-center gap-2">
                          <RadioGroupItem value={g} id={g} className="border-[#E2FF00] text-[#E2FF00]" />
                          <Label htmlFor={g} className="text-white/80">{g}</Label>
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
                <p className="text-[#a0a4ab] mb-8 text-sm self-start">
                  We use your weight to personalize workouts and training calculations.
                </p>

                {/* Toggle */}
                <div className="flex bg-[#1c1f26] rounded-xl p-1 w-full max-w-sm mb-6 cursor-pointer">
                  <div 
                    onClick={() => setUnit("kg")}
                    className={`flex-1 text-center py-2 rounded-lg font-bold text-sm transition-colors ${unit === 'kg' ? 'bg-[#E2FF00] text-black' : 'text-white/50'}`}
                  >
                    Kilograms (kg)
                  </div>
                  <div 
                    onClick={() => setUnit("lb")}
                    className={`flex-1 text-center py-2 rounded-lg font-bold text-sm transition-colors ${unit === 'lb' ? 'bg-[#E2FF00] text-black' : 'text-white/50'}`}
                  >
                    Pounds (lb)
                  </div>
                </div>

                {/* Big Number */}
                <div className="text-7xl font-bold tracking-tight mb-8">
                  {unit === 'kg' ? d.weightKg : Math.round(d.weightKg * 2.20462)} <span className="text-3xl text-white/50 font-normal">{unit}</span>
                </div>

                {/* Robust Native Slider for Weight */}
                <div className="w-full max-w-sm mt-4 px-2">
                   <Slider 
                      value={[d.weightKg]} 
                      onValueChange={(v) => set("weightKg", v[0])} 
                      min={30} max={200} step={1} 
                      className="py-4 cursor-grab active:cursor-grabbing [&_[role=slider]]:h-8 [&_[role=slider]]:w-8 [&_[role=slider]]:bg-[#E2FF00] [&_[role=slider]]:border-[#E2FF00] [&_[role=slider]]:shadow-[0_0_20px_rgba(226,255,0,0.5)] [&_.relative]:bg-[#1c1f26] [&_.relative>div]:bg-[#E2FF00]"
                    />
                    <div className="flex justify-between text-xs text-white/30 mt-2 font-medium">
                      <span>30 kg</span>
                      <span>200 kg</span>
                    </div>
                </div>

                {/* Height Input */}
                <div className="w-full max-w-sm mt-12 space-y-4">
                  <Label className="text-white/80 text-lg">Height (cm)</Label>
                   <Slider 
                      value={[d.heightCm]} 
                      onValueChange={(v) => set("heightCm", v[0])} 
                      min={100} max={250} step={1} 
                      className="py-4 cursor-grab active:cursor-grabbing [&_[role=slider]]:h-8 [&_[role=slider]]:w-8 [&_[role=slider]]:bg-[#E2FF00] [&_[role=slider]]:border-[#E2FF00] [&_[role=slider]]:shadow-[0_0_20px_rgba(226,255,0,0.5)] [&_.relative]:bg-[#1c1f26] [&_.relative>div]:bg-[#E2FF00]"
                    />
                    <div className="flex justify-between text-xs text-white/30 mt-2 font-medium">
                      <span>100 cm</span>
                      <span className="text-lg text-white font-bold">{d.heightCm} cm</span>
                      <span>250 cm</span>
                    </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <h2 className="text-3xl font-semibold mb-2">Activity level</h2>
                <p className="text-[#a0a4ab] mb-8 text-sm">
                  How active are you on an average week?
                </p>
                <RadioGroup
                  value={d.activity}
                  onValueChange={(v) => set("activity", v)}
                  className="grid gap-3"
                >
                  <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors ${d.activity === 'Sedentary' ? 'border-[#E2FF00] bg-[#E2FF00]/10' : 'border-[#1c1f26] bg-[#1c1f26] hover:border-white/20'}`}>
                    <RadioGroupItem value="Sedentary" className="border-[#E2FF00] text-[#E2FF00]" />
                    <span className="font-medium">Sedentary (little or no exercise)</span>
                  </label>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors ${d.activity === 'Lightly Active' ? 'border-[#E2FF00] bg-[#E2FF00]/10' : 'border-[#1c1f26] bg-[#1c1f26] hover:border-white/20'}`}>
                    <RadioGroupItem value="Lightly Active" className="border-[#E2FF00] text-[#E2FF00]" />
                    <span className="font-medium">Lightly Active (1–3 days/week)</span>
                  </label>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors ${d.activity === 'Moderately Active' ? 'border-[#E2FF00] bg-[#E2FF00]/10' : 'border-[#1c1f26] bg-[#1c1f26] hover:border-white/20'}`}>
                    <RadioGroupItem value="Moderately Active" className="border-[#E2FF00] text-[#E2FF00]" />
                    <span className="font-medium">Moderately Active (3–5 days/week)</span>
                  </label>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors ${d.activity === 'Very Active' ? 'border-[#E2FF00] bg-[#E2FF00]/10' : 'border-[#1c1f26] bg-[#1c1f26] hover:border-white/20'}`}>
                    <RadioGroupItem value="Very Active" className="border-[#E2FF00] text-[#E2FF00]" />
                    <span className="font-medium">Very Active (6–7 days/week)</span>
                  </label>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors ${d.activity === 'Super Active' ? 'border-[#E2FF00] bg-[#E2FF00]/10' : 'border-[#1c1f26] bg-[#1c1f26] hover:border-white/20'}`}>
                    <RadioGroupItem value="Super Active" className="border-[#E2FF00] text-[#E2FF00]" />
                    <span className="font-medium">Super Active (twice/day or physical job)</span>
                  </label>
                </RadioGroup>
                {bmr > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2 mt-8 animate-in slide-in-from-bottom-2 duration-300">
                    <div className="rounded-xl border border-white/10 bg-[#1c1f26] p-4 text-center">
                      <div className="text-xs text-[#a0a4ab] uppercase tracking-wider font-bold mb-1">BMR (Baseline)</div>
                      <div className="text-2xl font-bold">
                        {bmr} <span className="text-sm font-normal text-white/50">kcal</span>
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#E2FF00]/30 bg-[#E2FF00]/10 p-4 text-center">
                      <div className="text-xs text-[#E2FF00] uppercase tracking-wider font-bold mb-1">TDEE (With Activity)</div>
                      <div className="text-2xl font-bold text-[#E2FF00]">
                        {tdee} <span className="text-sm font-normal text-[#E2FF00]/70">kcal</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <h2 className="text-3xl font-semibold mb-2">Your goal</h2>
                <p className="text-[#a0a4ab] mb-8 text-sm">
                  What are you trying to achieve?
                </p>
                <RadioGroup
                  value={d.goal}
                  onValueChange={(v) => set("goal", v)}
                  className="grid gap-3"
                >
                  {["Lose Weight", "Maintain Weight", "Gain Muscle"].map(
                    (g) => (
                      <label
                        key={g}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors ${d.goal === g ? 'border-[#E2FF00] bg-[#E2FF00]/10' : 'border-[#1c1f26] bg-[#1c1f26] hover:border-white/20'}`}
                      >
                        <RadioGroupItem value={g} className="border-[#E2FF00] text-[#E2FF00]" />
                        <span className="font-medium text-white">{g}</span>
                      </label>
                    ),
                  )}
                </RadioGroup>
                {target > 0 && (
                  <div className="rounded-xl border border-[#E2FF00]/30 bg-[#E2FF00]/10 p-4 mt-8">
                    <div className="text-xs text-[#E2FF00] font-bold uppercase tracking-wider text-center mb-1">
                      Daily Calorie Target
                    </div>
                    <div className="text-4xl font-bold text-center text-[#E2FF00]">{target} <span className="text-lg font-normal text-[#E2FF00]/70">kcal</span></div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm pt-4 border-t border-[#E2FF00]/20">
                      <div>
                        <div className="font-semibold text-white">{macros.protein}g</div>
                        <div className="text-xs text-[#a0a4ab]">Protein</div>
                      </div>
                      <div>
                        <div className="font-semibold text-white">{macros.carbs}g</div>
                        <div className="text-xs text-[#a0a4ab]">Carbs</div>
                      </div>
                      <div>
                        <div className="font-semibold text-white">{macros.fat}g</div>
                        <div className="text-xs text-[#a0a4ab]">Fats</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <h2 className="text-3xl font-semibold mb-2">Review & confirm</h2>
                <p className="text-[#a0a4ab] mb-8 text-sm">
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
                <div className="rounded-xl border border-[#E2FF00]/30 bg-[#E2FF00]/10 p-4 mt-8">
                  <div className="text-xs text-[#E2FF00] font-bold uppercase tracking-wider text-center mb-1">
                    Daily macro split
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                    <div>
                      <div className="font-semibold text-white text-lg">{macros.protein}g</div>
                      <div className="text-xs text-[#a0a4ab]">Protein</div>
                    </div>
                    <div>
                      <div className="font-semibold text-white text-lg">{macros.carbs}g</div>
                      <div className="text-xs text-[#a0a4ab]">Carbs</div>
                    </div>
                    <div>
                      <div className="font-semibold text-white text-lg">{macros.fat}g</div>
                      <div className="text-xs text-[#a0a4ab]">Fats</div>
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
                  className="w-full max-w-sm rounded-full h-14 bg-[#E2FF00] hover:bg-[#cde600] text-black font-bold text-lg disabled:opacity-50 disabled:bg-gray-700 disabled:text-gray-400"
                >
                  Continue
                </Button>
              ) : (
                <Button
                  onClick={submit}
                  disabled={submitting}
                  className="w-full max-w-sm rounded-full h-14 bg-[#E2FF00] hover:bg-[#cde600] text-black font-bold text-lg disabled:opacity-50 disabled:bg-gray-700 disabled:text-gray-400"
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
      className={`flex items-center justify-between rounded-lg px-3 py-2 ${highlight ? "bg-[#E2FF00]/10 border border-[#E2FF00]/30" : "bg-[#1c1f26] border-0"}`}
    >
      <span className="text-[#a0a4ab]">{label}</span>
      <span className={`font-medium ${highlight ? 'text-[#E2FF00]' : 'text-white'}`}>{value}</span>
    </div>
  );
}
