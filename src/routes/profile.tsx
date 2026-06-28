import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Moon, Sun, Monitor, Droplets, Sunset, TreePine } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";
import {
  calcBMI,
  calcBMR,
  calcCalorieTarget,
  calcMacros,
  calcTDEE,
} from "@/lib/nutrition";

export const Route = createFileRoute("/profile")({ component: Profile });

function Profile() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [goal, setGoal] = useState("");
  const [activity, setActivity] = useState("");
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<string>("light");

  useEffect(() => {
    setTheme(localStorage.getItem("theme") || "light");
  }, []);

  const changeTheme = (newTheme: string) => {
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.classList.remove("dark", "theme-ocean", "theme-sunset", "theme-forest");
    if (newTheme !== "light") {
      document.documentElement.classList.add(newTheme);
    }
  };

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setProfile(data);
        if (data?.weight_kg) setWeight(String(data.weight_kg));
        if (data?.height_cm) setHeight(String(data.height_cm));
        if (data?.full_name) setName(data.full_name);
        if (data?.age) setAge(String(data.age));
        if (data?.gender) setGender(data.gender);
        if (data?.goal) setGoal(data.goal);
        if (data?.activity_level) setActivity(data.activity_level);
      });
  }, [user]);

  const updateProfile = async () => {
    if (!user || !profile) return;
    const w = +weight || 0;
    const h = +height || 0;
    const a = +age || 0;
    
    if (!w || w <= 0 || !h || h <= 0 || !a || a <= 0) {
      toast.error("Height, weight, and age must be greater than 0");
      return;
    }
    
    setSaving(true);
    const bmi = calcBMI(w, h);
    const bmr = calcBMR(w, h, a, gender || profile.gender);
    const tdee = calcTDEE(bmr, activity || profile.activity_level);
    const target = calcCalorieTarget(tdee, goal || profile.goal);
    const m = calcMacros(target);
    const { error } = await supabase
      .from("user_profiles")
      .update({
        full_name: name,
        height_cm: h,
        weight_kg: w,
        age: a,
        gender: gender || profile.gender,
        goal: goal || profile.goal,
        activity_level: activity || profile.activity_level,
        bmi,
        bmr,
        tdee,
        daily_calorie_target: target,
        protein_target_g: m.protein,
        carbs_target_g: m.carbs,
        fat_target_g: m.fat,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profile updated");
    setProfile({
      ...profile,
      full_name: name,
      height_cm: h,
      weight_kg: w,
      age: a,
      gender: gender || profile.gender,
      goal: goal || profile.goal,
      activity_level: activity || profile.activity_level,
      bmi,
      bmr,
      tdee,
      daily_calorie_target: target,
      protein_target_g: m.protein,
      carbs_target_g: m.carbs,
      fat_target_g: m.fat,
    });
    setIsEditing(false);
  };

  if (!user || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header name={profile.full_name?.split(" ")[0]} />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 pb-24">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Your profile</h1>
          {!isEditing ? (
            <Button variant="outline" onClick={() => setIsEditing(true)}>Edit Profile</Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button onClick={updateProfile} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          )}
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            <ThemeButton active={theme === "light"} onClick={() => changeTheme("light")} icon={<Sun className="h-4 w-4" />} label="Light" />
            <ThemeButton active={theme === "dark"} onClick={() => changeTheme("dark")} icon={<Moon className="h-4 w-4" />} label="Dark" />
            <ThemeButton active={theme === "theme-ocean"} onClick={() => changeTheme("theme-ocean")} icon={<Droplets className="h-4 w-4" />} label="Ocean" />
            <ThemeButton active={theme === "theme-sunset"} onClick={() => changeTheme("theme-sunset")} icon={<Sunset className="h-4 w-4" />} label="Sunset" />
            <ThemeButton active={theme === "theme-forest"} onClick={() => changeTheme("theme-forest")} icon={<TreePine className="h-4 w-4" />} label="Forest" />
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {isEditing ? (
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground mt-2">Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} />
              </div>
            ) : (
              <Row label="Name" value={profile.full_name} />
            )}
            <Row label="Email" value={user.email ?? ""} />
            <Row label="User ID" value={user.id} mono />
            <Row label="Plan" value={profile.selected_plan ?? "—"} />
            <Row
              label="Trial started"
              value={profile.trial_start_date ?? "—"}
            />
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Metrics</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            {isEditing ? (
              <>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground mt-2">Age</Label>
                  <Input type="number" value={age} onChange={e => setAge(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground mt-2">Gender</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground mt-2">Height (cm)</Label>
                  <Input type="number" value={height} onChange={e => setHeight(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground mt-2">Weight (kg)</Label>
                  <Input type="number" value={weight} onChange={e => setWeight(e.target.value)} />
                </div>
              </>
            ) : (
              <>
                <Row label="Age" value={String(profile.age)} />
                <Row label="Gender" value={profile.gender} />
                <Row label="Height" value={`${profile.height_cm} cm`} />
                <Row label="Weight" value={`${profile.weight_kg} kg`} />
              </>
            )}
            <Row label="BMI" value={String(profile.bmi)} />
            <Row label="BMR" value={`${profile.bmr} kcal`} />
            <Row label="TDEE" value={`${profile.tdee} kcal`} />
            <Row
              label="Daily Target"
              value={`${profile.daily_calorie_target} kcal`}
            />
            {isEditing ? (
              <>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground mt-2">Activity Level</Label>
                  <Select value={activity} onValueChange={setActivity}>
                    <SelectTrigger><SelectValue placeholder="Activity level" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Sedentary">Sedentary</SelectItem>
                      <SelectItem value="Lightly Active">Lightly Active</SelectItem>
                      <SelectItem value="Moderately Active">Moderately Active</SelectItem>
                      <SelectItem value="Very Active">Very Active</SelectItem>
                      <SelectItem value="Super Active">Super Active</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground mt-2">Goal</Label>
                  <Select value={goal} onValueChange={setGoal}>
                    <SelectTrigger><SelectValue placeholder="Your goal" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Lose Weight">Lose Weight</SelectItem>
                      <SelectItem value="Maintain Weight">Maintain Weight</SelectItem>
                      <SelectItem value="Gain Muscle">Gain Muscle</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <>
                <Row label="Activity" value={profile.activity_level} />
                <Row label="Goal" value={profile.goal} />
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function ThemeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className={`justify-start gap-2 h-12 ${active ? "border-accent text-accent border-2 bg-accent/10 hover:bg-accent/20 hover:text-accent" : ""}`}
    >
      {icon} {label}
    </Button>
  );
}
