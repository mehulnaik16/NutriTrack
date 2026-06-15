import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";
import { calcBMI, calcBMR, calcCalorieTarget, calcMacros, calcTDEE } from "@/lib/nutrition";

export const Route = createFileRoute("/profile")({ component: Profile });

function Profile() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [weight, setWeight] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!loading && !user) navigate({ to: "/login" }); }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => {
      setProfile(data);
      if (data?.weight_kg) setWeight(String(data.weight_kg));
    });
  }, [user]);

  const updateWeight = async () => {
    if (!user || !profile) return;
    setSaving(true);
    const w = +weight;
    const bmi = calcBMI(w, profile.height_cm);
    const bmr = calcBMR(w, profile.height_cm, profile.age, profile.gender);
    const tdee = calcTDEE(bmr, profile.activity_level);
    const target = calcCalorieTarget(tdee, profile.goal);
    const m = calcMacros(target);
    const { error } = await supabase.from("user_profiles").update({
      weight_kg: w, bmi, bmr, tdee, daily_calorie_target: target,
      protein_target_g: m.protein, carbs_target_g: m.carbs, fat_target_g: m.fat,
    }).eq("id", user.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile updated");
    setProfile({ ...profile, weight_kg: w, bmi, bmr, tdee, daily_calorie_target: target,
      protein_target_g: m.protein, carbs_target_g: m.carbs, fat_target_g: m.fat });
  };

  if (!user || !profile) {
    return <div className="flex min-h-screen items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header name={profile.full_name?.split(" ")[0]} />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Your profile</h1>

        <Card className="mb-6">
          <CardHeader><CardTitle>Account</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Name" value={profile.full_name} />
            <Row label="Email" value={user.email ?? ""} />
            <Row label="User ID" value={user.id} mono />
            <Row label="Plan" value={profile.selected_plan ?? "—"} />
            <Row label="Trial started" value={profile.trial_start_date ?? "—"} />
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader><CardTitle>Metrics</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <Row label="Age" value={String(profile.age)} />
            <Row label="Gender" value={profile.gender} />
            <Row label="Height" value={`${profile.height_cm} cm`} />
            <Row label="Weight" value={`${profile.weight_kg} kg`} />
            <Row label="BMI" value={String(profile.bmi)} />
            <Row label="BMR" value={`${profile.bmr} kcal`} />
            <Row label="TDEE" value={`${profile.tdee} kcal`} />
            <Row label="Daily Target" value={`${profile.daily_calorie_target} kcal`} />
            <Row label="Activity" value={profile.activity_level} />
            <Row label="Goal" value={profile.goal} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Update weight</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label>Weight (kg)</Label>
              <Input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>
            <Button onClick={updateWeight} disabled={saving} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {saving ? "Saving…" : "Save"}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
