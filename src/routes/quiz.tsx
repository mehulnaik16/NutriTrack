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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/client";
import { activityMultipliers, bmiCategory, calcBMI, calcBMR, calcCalorieTarget, calcMacros, calcTDEE } from "@/lib/nutrition";

export const Route = createFileRoute("/quiz")({ component: Quiz });

interface FormData {
  fullName: string; email: string; password: string;
  age: number; gender: string;
  heightCm: number; weightKg: number;
  activity: string;
  goal: string;
}

function Quiz() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [d, setD] = useState<FormData>({
    fullName: "", email: "", password: "",
    age: 0, gender: "Male",
    heightCm: 0, weightKg: 0,
    activity: "Sedentary",
    goal: "Maintain Weight",
  });

  const set = <K extends keyof FormData>(k: K, v: FormData[K]) => setD((p) => ({ ...p, [k]: v }));

  const bmi = useMemo(() => calcBMI(d.weightKg, d.heightCm), [d.weightKg, d.heightCm]);
  const bmr = useMemo(() => calcBMR(d.weightKg, d.heightCm, d.age, d.gender), [d.weightKg, d.heightCm, d.age, d.gender]);
  const tdee = useMemo(() => calcTDEE(bmr, d.activity), [bmr, d.activity]);
  const target = useMemo(() => calcCalorieTarget(tdee, d.goal), [tdee, d.goal]);
  const macros = useMemo(() => calcMacros(target), [target]);

  const canNext = () => {
    if (step === 1) return d.fullName && d.email && d.password.length >= 6 && d.age > 0;
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
        options: { emailRedirectTo: `${window.location.origin}/dashboard`, data: { full_name: d.fullName } },
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
        bmi, bmr, tdee,
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
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/40 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Activity className="h-5 w-5" />
          </div>
          <span className="text-2xl font-bold tracking-tight">NutriTrack</span>
        </div>

        <div className="mb-6">
          <div className="mb-2 flex justify-between text-sm text-muted-foreground">
            <span>Step {step} of 5</span>
            <span>{Math.round((step / 5) * 100)}%</span>
          </div>
          <Progress value={(step / 5) * 100} className="h-2" />
        </div>

        <Card className="border-border/60 shadow-lg">
          <CardContent className="p-6 sm:p-8">
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Tell us about you</h2>
                <p className="text-sm text-muted-foreground">Create your account to get started.</p>
                <div className="space-y-2"><Label>Full Name</Label><Input value={d.fullName} onChange={(e) => set("fullName", e.target.value)} /></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Email</Label><Input type="email" value={d.email} onChange={(e) => set("email", e.target.value)} /></div>
                  <div className="space-y-2"><Label>Password</Label><Input type="password" value={d.password} onChange={(e) => set("password", e.target.value)} /></div>
                </div>
                <div className="space-y-2"><Label>Age</Label><Input type="number" value={d.age || ""} onChange={(e) => set("age", +e.target.value)} /></div>
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <RadioGroup value={d.gender} onValueChange={(v) => set("gender", v)} className="flex gap-4">
                    {["Male", "Female", "Other"].map((g) => (
                      <div key={g} className="flex items-center gap-2"><RadioGroupItem value={g} id={g} /><Label htmlFor={g}>{g}</Label></div>
                    ))}
                  </RadioGroup>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Body metrics</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Height (cm)</Label><Input type="number" value={d.heightCm || ""} onChange={(e) => set("heightCm", +e.target.value)} /></div>
                  <div className="space-y-2"><Label>Weight (kg)</Label><Input type="number" value={d.weightKg || ""} onChange={(e) => set("weightKg", +e.target.value)} /></div>
                </div>
                {bmi > 0 && (
                  <div className="rounded-xl border border-accent/30 bg-accent/10 p-4">
                    <div className="text-sm text-muted-foreground">Your BMI</div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold">{bmi}</span>
                      <span className="text-sm font-medium text-accent-foreground">{bmiCategory(bmi)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Activity level</h2>
                <Select value={d.activity} onValueChange={(v) => set("activity", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Sedentary">Sedentary (little or no exercise)</SelectItem>
                    <SelectItem value="Lightly Active">Lightly Active (1–3 days/week)</SelectItem>
                    <SelectItem value="Moderately Active">Moderately Active (3–5 days/week)</SelectItem>
                    <SelectItem value="Very Active">Very Active (6–7 days/week)</SelectItem>
                    <SelectItem value="Super Active">Super Active (twice/day or physical job)</SelectItem>
                  </SelectContent>
                </Select>
                {bmr > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border bg-muted/40 p-4">
                      <div className="text-xs text-muted-foreground">BMR</div>
                      <div className="text-2xl font-bold">{bmr} <span className="text-sm font-normal text-muted-foreground">kcal</span></div>
                    </div>
                    <div className="rounded-xl border border-accent/30 bg-accent/10 p-4">
                      <div className="text-xs text-muted-foreground">TDEE</div>
                      <div className="text-2xl font-bold">{tdee} <span className="text-sm font-normal text-muted-foreground">kcal</span></div>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Multiplier: × {activityMultipliers[d.activity]}</p>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Your goal</h2>
                <RadioGroup value={d.goal} onValueChange={(v) => set("goal", v)} className="grid gap-3">
                  {["Lose Weight", "Maintain Weight", "Gain Muscle"].map((g) => (
                    <label key={g} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-4 hover:border-accent">
                      <RadioGroupItem value={g} />
                      <span className="font-medium">{g}</span>
                    </label>
                  ))}
                </RadioGroup>
                {target > 0 && (
                  <div className="rounded-xl border border-accent/30 bg-accent/10 p-4">
                    <div className="text-xs text-muted-foreground">Daily Calorie Target</div>
                    <div className="text-3xl font-bold">{target} kcal</div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                      <div><div className="font-semibold">{macros.protein}g</div><div className="text-xs text-muted-foreground">Protein</div></div>
                      <div><div className="font-semibold">{macros.carbs}g</div><div className="text-xs text-muted-foreground">Carbs</div></div>
                      <div><div className="font-semibold">{macros.fat}g</div><div className="text-xs text-muted-foreground">Fats</div></div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Review & confirm</h2>
                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  <Row label="Name" value={d.fullName} />
                  <Row label="Email" value={d.email} />
                  <Row label="Age" value={String(d.age)} />
                  <Row label="Gender" value={d.gender} />
                  <Row label="Height" value={`${d.heightCm} cm`} />
                  <Row label="Weight" value={`${d.weightKg} kg`} />
                  <Row label="Activity" value={d.activity} />
                  <Row label="Goal" value={d.goal} />
                  <Row label="BMI" value={`${bmi} (${bmiCategory(bmi)})`} />
                  <Row label="BMR" value={`${bmr} kcal`} />
                  <Row label="TDEE" value={`${tdee} kcal`} />
                  <Row label="Daily Target" value={`${target} kcal`} highlight />
                </div>
                <div className="rounded-xl border border-accent/30 bg-accent/10 p-4">
                  <div className="text-xs text-muted-foreground">Daily macro split</div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
                    <div><div className="font-semibold">{macros.protein}g</div><div className="text-xs text-muted-foreground">Protein</div></div>
                    <div><div className="font-semibold">{macros.carbs}g</div><div className="text-xs text-muted-foreground">Carbs</div></div>
                    <div><div className="font-semibold">{macros.fat}g</div><div className="text-xs text-muted-foreground">Fats</div></div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-8 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>Back</Button>
              {step < 5 ? (
                <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext()} className="bg-accent text-accent-foreground hover:bg-accent/90">Continue</Button>
              ) : (
                <Button onClick={submit} disabled={submitting} className="bg-accent text-accent-foreground hover:bg-accent/90">
                  {submitting ? "Creating…" : "Create My Account"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <a href="/login" className="font-medium text-accent underline-offset-2 hover:underline">Log in</a>
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-lg border border-border px-3 py-2 ${highlight ? "bg-accent/10 border-accent/30" : "bg-muted/30"}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
