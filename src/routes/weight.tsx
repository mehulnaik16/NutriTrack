import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { serverGroqChat } from "@/lib/ai";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Scale,
  TrendingDown,
  TrendingUp,
  Minus as TrendFlat,
  Camera,
  Upload,
  Loader2,
  Target,
  ChevronLeft,
  ChevronRight,
  CalendarIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  GOAL_WEIGHT_KG,
  WEIGHT_KG,
  validateMeasurement,
} from "@/lib/measurements";
import { getCachedWorkoutPrefs } from "@/lib/workoutPrefs";
import { type WeightUnit, kgToWeight, weightToKg, round1 } from "@/lib/units";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";
import { uploadWeightPhoto, deleteWeightPhoto, replaceWeightPhoto } from "@/services/storage";
import { SignedPhoto } from "@/components/SignedPhoto";
import { PremiumGate } from "@/components/PremiumGate";
import { todayLocal } from "@/lib/dates";

export const Route = createFileRoute("/weight")({ component: WeightPage });

interface WeightEntry {
  id: string;
  date: string;
  weight_kg: number;
  photo_url: string | null;
  note: string | null;
}

interface Profile {
  weight_kg: number;
  goal: string;
  full_name: string | null;
  goal_weight_kg: number | null;
  height_cm: number | null;
}

async function getGroqMotivation(
  name: string,
  currentWeight: number,
  startWeight: number,
  goalWeight: number | null,
  goal: string,
  streak: number,
): Promise<string> {
  const prompt = `You are a motivational fitness coach. Write ONE short (2-3 sentences max), genuine, personalized motivational message.
User: ${name}, goal: ${goal}, current weight: ${currentWeight}kg, starting weight: ${startWeight}kg, goal weight: ${goalWeight ?? "not set"}kg, logging streak: ${streak} days.
Be specific to their numbers. Be warm and real — not generic or cheesy. No hashtags.`;

  const { result } = await serverGroqChat({
    data: {
      prompt,
      model: "openai/gpt-oss-120b",
      max_tokens: 300,
      temperature: 0.8,
    },
  });
  return result;
}

function WeightPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  // Body weight is stored canonically in kg (BMI/calorie math needs it). The page
  // DISPLAYS the current unit; its chart plots the original unit. Helpers below.
  const unitPrefs = user ? getCachedWorkoutPrefs(user.id) : null;
  const weightUnit = unitPrefs?.weightUnit ?? "kg";
  const origWeightUnit = unitPrefs?.origWeightUnit ?? "kg";
  const disp = (kg: number) => round1(kgToWeight(kg, weightUnit)); // kg → shown value
  const wu = weightUnit;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [weight, setWeight] = useState("");
  const [goalWeight, setGoalWeight] = useState("");
  const [note, setNote] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<WeightEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [motivation, setMotivation] = useState<string | null>(null);
  const [loadingMotivation, setLoadingMotivation] = useState(false);
  const [compareIdx, setCompareIdx] = useState(0);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [loading, user, navigate]);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: p }, { data: e }] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("weight_kg,goal,full_name,goal_weight_kg,height_cm")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("weight_entries")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: true }),
    ]);
    // No profile row means onboarding was never finished — the guard below
    // waits on `profile`, so without this the page spins forever.
    if (!p) {
      navigate({ to: "/quiz", replace: true });
      return;
    }

    setProfile(p as Profile);
    setEntries((e as WeightEntry[]) ?? []);
    if (p?.weight_kg) setWeight(String(disp(p.weight_kg)));
    if (p?.goal_weight_kg) setGoalWeight(String(disp(p.goal_weight_kg)));
  }, [user, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const fetchMotivation = async () => {
    if (!profile || entries.length === 0) return;
    setLoadingMotivation(true);
    const streak = entries.length;
    const startW = entries[0].weight_kg;
    const currentW = entries[entries.length - 1].weight_kg;
    const msg = await getGroqMotivation(
      profile.full_name?.split(" ")[0] ?? "champ",
      currentW,
      startW,
      profile.goal_weight_kg,
      profile.goal,
      streak,
    );
    setMotivation(msg);
    setLoadingMotivation(false);
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const logWeight = async () => {
    if (!user || !weight) return;

    // Inputs are in the display unit; validate + store in kg.
    const w = validateMeasurement(String(weightToKg(parseFloat(weight) || 0, wu)), WEIGHT_KG);
    if (!w.ok) {
      toast.error(w.error);
      return;
    }
    // The goal field is optional here, but if it has been typed into it is
    // written by the same update below and has to clear the same bar.
    const g = goalWeight ? validateMeasurement(String(weightToKg(parseFloat(goalWeight) || 0, wu)), GOAL_WEIGHT_KG) : null;
    if (g && !g.ok) {
      toast.error(g.error);
      return;
    }

    setSaving(true);
    try {
      let photo_url: string | null = null;

      if (photoFile) {
        const result = await uploadWeightPhoto(photoFile, user.id);
        if (result.error || !result.data) {
          throw new Error(result.error ?? "Upload failed");
        }
        photo_url = result.data.publicUrl;
      }

      const payload: any = {
        user_id: user.id,
        date: todayLocal(),
        weight_kg: w.value,
      };
      
      if (photo_url) payload.photo_url = photo_url;
      if (note) payload.note = note;

      const { error } = await supabase.from("weight_entries").upsert(
        payload,
        { onConflict: "user_id,date" },
      );
      if (error) throw error;

      // Update profile weight + goal weight
      await supabase
        .from("user_profiles")
        .update({
          weight_kg: w.value,
          ...(g?.ok ? { goal_weight_kg: g.value } : {}),
        })
        .eq("id", user.id);

      toast.success("Weight logged!");
      setNote("");
      setPhotoFile(null);
      setPhotoPreview(null);
      await load();
      fetchMotivation();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveModal = async (updated: WeightEntry, newPhoto: File | null) => {
    if (!user) return;
    try {
      let finalPhotoUrl = updated.photo_url;
      const originalEntry = entries.find(e => e.id === updated.id);
      
      if (newPhoto) {
        const result = await replaceWeightPhoto(
          originalEntry?.photo_url ?? null,
          newPhoto,
          user.id,
        );
        if (result.error || !result.data) {
          throw new Error(result.error ?? "Upload failed");
        }
        finalPhotoUrl = result.data.publicUrl;
      } else if (originalEntry?.photo_url && !updated.photo_url) {
        // Photo was removed (not replaced)
        await deleteWeightPhoto(originalEntry.photo_url);
        finalPhotoUrl = null;
      }

      const { error } = await supabase
        .from("weight_entries")
        .update({
          date: updated.date,
          weight_kg: updated.weight_kg,
          note: updated.note || null,
          photo_url: finalPhotoUrl
        })
        .eq("id", updated.id);

      if (error) throw error;

      toast.success("Entry updated!");
      
      const finalEntry = { ...updated, photo_url: finalPhotoUrl };
      setEntries(prev => prev.map(e => e.id === finalEntry.id ? finalEntry : e));
      setSelectedEntry(finalEntry);
      
      load();
    } catch (e: any) {
      toast.error(e.message);
      throw e;
    }
  };

  const handleDeleteModal = async (id: string) => {
    if (!confirm("Are you sure you want to delete this entry?")) return;
    try {
      const entryToDelete = entries.find(e => e.id === id);
      
      // Delete photo first — if it fails, don't delete the DB row
      if (entryToDelete?.photo_url) {
        const result = await deleteWeightPhoto(entryToDelete.photo_url);
        if (result.error) {
          throw new Error(result.error);
        }
      }

      const { error } = await supabase
        .from("weight_entries")
        .delete()
        .eq("id", id);
      if (error) throw error;

      toast.success("Entry deleted!");
      setSelectedEntry(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const saveGoalWeight = async () => {
    if (!user || !goalWeight) return;

    const g = validateMeasurement(String(weightToKg(parseFloat(goalWeight) || 0, wu)), GOAL_WEIGHT_KG);
    if (!g.ok) {
      toast.error(g.error);
      return;
    }

    const { error } = await supabase
      .from("user_profiles")
      .update({ goal_weight_kg: g.value })
      .eq("id", user.id);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Goal weight saved!");
    await load();
  };

  if (!user || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  const latest = entries[entries.length - 1];
  const first = entries[0];
  const totalChange =
    latest && first ? +(latest.weight_kg - first.weight_kg).toFixed(1) : 0;
  const toGoal =
    latest && profile.goal_weight_kg
      ? +Math.abs(profile.goal_weight_kg - latest.weight_kg).toFixed(1)
      : null;

  // ── BMI insights ──
  const currentWeight = latest?.weight_kg ?? profile.weight_kg;
  const heightM = profile.height_cm ? profile.height_cm / 100 : null;
  const bmi =
    heightM && currentWeight
      ? +(currentWeight / (heightM * heightM)).toFixed(1)
      : null;
  const bmiCategory =
    bmi === null
      ? null
      : bmi < 18.5
        ? { label: "Underweight", color: "text-fat" }
        : bmi < 25
          ? { label: "Healthy", color: "text-[var(--energy)]" }
          : bmi < 30
            ? { label: "Overweight", color: "text-warn" }
            : { label: "Obese", color: "text-destructive" };
  const healthyMin = heightM ? +(18.5 * heightM * heightM).toFixed(1) : null;
  const healthyMax = heightM ? +(24.9 * heightM * heightM).toFixed(1) : null;
  // Position of current BMI on a 15–40 scale for the gauge bar
  const bmiPct =
    bmi === null ? 0 : Math.min(100, Math.max(0, ((bmi - 15) / 25) * 100));

  const chartData = entries.map((e) => ({
    date: e.date.slice(5),
    weight: round1(kgToWeight(e.weight_kg, origWeightUnit)),
  }));

  // Photos with images for comparison
  const photoEntries = entries.filter((e) => e.photo_url);
  const compareA = photoEntries[compareIdx];
  const compareB =
    photoEntries[Math.min(compareIdx + 1, photoEntries.length - 1)];

  return (
    <div className="min-h-screen bg-background pb-24">
      <Header name={profile.full_name?.split(" ")[0]} />
      <main className="mx-auto max-w-4xl space-y-6 px-3 py-5 sm:px-6 sm:py-6">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Weight Tracker
        </h1>

        {/* ── Summary cards ── */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="card-lift">
            <CardContent className="p-5">
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <Scale className="h-4 w-4 text-accent" /> Current
              </div>
              <p className="font-display text-2xl font-bold">
                {disp(latest?.weight_kg ?? profile.weight_kg)} {wu}
              </p>
            </CardContent>
          </Card>
          <Card className="card-lift">
            <CardContent className="p-5">
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {totalChange < 0 ? (
                  <TrendingDown className="h-4 w-4 text-[var(--energy)]" />
                ) : totalChange > 0 ? (
                  <TrendingUp className="h-4 w-4 text-destructive" />
                ) : (
                  <TrendFlat className="h-4 w-4" />
                )}
                Total change
              </div>
              <p
                className={`font-display text-2xl font-bold ${totalChange < 0 ? "text-[var(--energy)]" : totalChange > 0 ? "text-destructive" : ""}`}
              >
                {totalChange > 0 ? "+" : ""}
                {round1(kgToWeight(totalChange, wu))} {wu}
              </p>
            </CardContent>
          </Card>
          <Card className="card-lift">
            <CardContent className="p-5">
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <Target className="h-4 w-4 text-accent" /> To goal
              </div>
              <p className="font-display text-2xl font-bold">
                {toGoal !== null ? `${round1(kgToWeight(toGoal, wu))} ${wu}` : "—"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── BMI insights ── */}
        {bmi !== null && bmiCategory && (
          <Card className="card-lift">
            <CardContent className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Body Mass Index
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-3xl font-bold">{bmi}</span>
                    <span className={`text-sm font-bold ${bmiCategory.color}`}>
                      {bmiCategory.label}
                    </span>
                  </div>
                  {healthyMin && healthyMax && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Healthy range for your height: {disp(healthyMin)}–{disp(healthyMax)} {wu}
                    </p>
                  )}
                </div>
                <div className="w-full sm:w-64">
                  {/* Gauge: 15 → 40 BMI */}
                  <div className="relative h-2.5 overflow-hidden rounded-full"
                    style={{
                      background:
                        "linear-gradient(90deg, var(--fat) 0%, var(--fat) 14%, var(--energy) 14%, var(--energy) 40%, var(--warn) 40%, var(--warn) 60%, var(--destructive) 60%)",
                    }}
                  />
                  <div
                    className="relative -mt-[13px] h-4 w-4 -translate-x-1/2 rounded-full border-2 border-background bg-foreground shadow"
                    style={{ marginLeft: `${bmiPct}%` }}
                  />
                  <div className="mt-1 flex justify-between text-[9px] font-bold text-muted-foreground">
                    <span>15</span>
                    <span>18.5</span>
                    <span>25</span>
                    <span>30</span>
                    <span>40</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── AI Motivation ── */}
        {entries.length > 0 && (
          <Card className="border-[var(--energy)]/20 bg-[var(--energy)]/5">
            <CardContent className="p-5">
              {motivation ? (
                <p className="text-sm leading-relaxed">{motivation}</p>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchMotivation}
                  disabled={loadingMotivation}
                  className="gap-2 text-muted-foreground"
                >
                  {loadingMotivation ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Getting your
                      message…
                    </>
                  ) : (
                    "✨ Get today's motivation"
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Log weight ── */}
        <Card>
          <CardHeader>
            <CardTitle>Log today's weight</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Weight ({wu})</Label>
                <Input
                  type="number"
                  step="0.1"
                  min={disp(WEIGHT_KG.min)}
                  max={disp(WEIGHT_KG.max)}
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="e.g. 82.5"
                />
              </div>
              <div className="space-y-2">
                <Label>Goal weight ({wu})</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    type="number"
                    step="0.1"
                    min={disp(GOAL_WEIGHT_KG.min)}
                    max={disp(GOAL_WEIGHT_KG.max)}
                    value={goalWeight}
                    onChange={(e) => setGoalWeight(e.target.value)}
                    placeholder="e.g. 75"
                  />
                  <Button variant="outline" onClick={saveGoalWeight}>
                    Set
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. after morning workout"
              />
            </div>

            {/* Photo upload — the one locked control on this page. Logging a
                weight stays free; the progress-photo pipeline does not. */}
            <PremiumGate
              variant="inline"
              title="Progress photos are premium"
              message="Logging your weight stays free. Pick a plan to add progress photos and compare them over time."
              placeholder={
                <div className="space-y-2">
                  <Label>Progress photo (optional)</Label>
                  <div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6">
                    <Camera className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Tap to add a progress photo
                    </p>
                  </div>
                </div>
              }
            >
            <div className="space-y-2">
              <Label>Progress photo (optional)</Label>
              <div
                onClick={() => fileRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 hover:border-accent transition-colors"
              >
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt="preview"
                    className="h-32 w-32 rounded-lg object-cover"
                  />
                ) : (
                  <>
                    <Camera className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Tap to add a progress photo
                    </p>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhoto}
              />
            </div>
            </PremiumGate>

            <Button
              onClick={logWeight}
              disabled={saving || !weight}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Log Weight
            </Button>
          </CardContent>
        </Card>

        {/* ── Weight chart ── */}
        {entries.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Progress chart ({origWeightUnit})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="date"
                      stroke="var(--muted-foreground)"
                      fontSize={11}
                    />
                    <YAxis
                      stroke="var(--muted-foreground)"
                      fontSize={11}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      stroke="var(--accent)"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                    {profile.goal_weight_kg && (
                      <ReferenceLine
                        y={round1(kgToWeight(profile.goal_weight_kg, origWeightUnit))}
                        stroke="var(--energy)"
                        strokeDasharray="5 5"
                        label={{
                          value: `Goal (${origWeightUnit})`,
                          fill: "var(--energy)",
                          fontSize: 11,
                        }}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Photo comparison ── */}
        {photoEntries.length >= 2 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Photo comparison</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCompareIdx(Math.max(0, compareIdx - 1))}
                    disabled={compareIdx === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      setCompareIdx(
                        Math.min(photoEntries.length - 2, compareIdx + 1),
                      )
                    }
                    disabled={compareIdx >= photoEntries.length - 2}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[compareA, compareB].map(
                  (entry, i) =>
                    entry && (
                      <div key={i} className="space-y-1">
                        <SignedPhoto
                          src={entry.photo_url!}
                          alt={entry.date}
                          className="w-full rounded-lg object-cover aspect-[3/4]"
                        />
                        <p className="text-center text-xs text-muted-foreground">
                          {entry.date} · {disp(entry.weight_kg)} {wu}
                        </p>
                      </div>
                    ),
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Entry history ── */}
        {entries.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {[...entries]
                  .reverse()
                  .slice(0, 20)
                  .map((e, i) => {

                    return (
                      <div
                        key={e.id}
                        className="group grid grid-cols-2 sm:grid-cols-[90px_1fr_auto_60px] gap-2 sm:gap-4 items-center rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                      >
                        {/* 1. Date (Mobile: TL, Desktop: Col 1) */}
                        <div className="text-muted-foreground">
                          {e.date}
                        </div>
                        
                        {/* 2. Note (Mobile: BL, Desktop: Col 2) */}
                        <div className="truncate text-muted-foreground col-start-1 row-start-2 sm:col-start-2 sm:row-start-1">
                          {e.note || "—"}
                        </div>
                        
                        {/* 3. Weight (Mobile: TR, Desktop: Col 3) */}
                        <div className="font-bold text-right col-start-2 row-start-1 sm:col-start-3 sm:row-start-1">
                          {disp(e.weight_kg)} {wu}
                        </div>
                        
                        {/* 4. View Button (Mobile: BR, Desktop: Col 4) */}
                        <div className="flex justify-end col-start-2 row-start-2 sm:col-start-4 sm:row-start-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs font-medium text-primary hover:text-primary hover:bg-primary/10"
                            onClick={() => setSelectedEntry(e)}
                            disabled={!e}
                          >
                            View
                          </Button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── View / Edit Entry Modal ── */}
        <WeightEntryModal
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          onSave={handleSaveModal}
          onDelete={handleDeleteModal}
          weightUnit={weightUnit}
        />
      </main>
    </div>
  );
}

function WeightEntryModal({
  entry,
  onClose,
  onSave,
  onDelete,
  weightUnit,
}: {
  entry: WeightEntry | null;
  onClose: () => void;
  onSave: (updated: WeightEntry, newPhoto: File | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  weightUnit: WeightUnit;
}) {
  const disp = (kg: number) => round1(kgToWeight(kg, weightUnit));
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editWeight, setEditWeight] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (entry) {
      setEditDate(entry.date);
      setEditWeight(String(disp(entry.weight_kg)));
      setEditNote(entry.note || "");
      setEditPhotoPreview(entry.photo_url);
      setEditPhotoFile(null);
    }
  }, [entry, isEditing]);

  const handleCancel = () => {
    setIsEditing(false);
    setEditPhotoFile(null);
  };

  const hasChanged = entry && (
    editDate !== entry.date ||
    editWeight !== String(disp(entry.weight_kg)) ||
    editNote !== (entry.note || "") ||
    editPhotoPreview !== entry.photo_url ||
    editPhotoFile !== null
  );

  const handleSave = async () => {
    if (!entry) return;
    setIsSaving(true);
    try {
      await onSave({
        ...entry,
        date: editDate,
        weight_kg: round1(weightToKg(Number(editWeight) || 0, weightUnit)),
        note: editNote,
        photo_url: editPhotoPreview
      }, editPhotoFile);
      setIsEditing(false);
      setEditPhotoFile(null);
    } catch (e) {
      // Parent handles error toast
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isEditing) return;
    if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
      e.preventDefault();
      if (hasChanged) handleSave();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      handleCancel();
    }
  };

  return (
    <Dialog open={!!entry} onOpenChange={(open) => {
      if (!open && !isEditing) {
        onClose();
      } else if (!open && isEditing) {
        setIsEditing(false);
        onClose();
      }
    }}>
      <DialogContent 
        className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border/50 transition-all duration-200 max-h-[90vh] overflow-y-auto"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase tracking-wider text-center mb-2 flex items-center justify-center gap-2">
            Weight Entry
            {isEditing && <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full uppercase tracking-widest animate-in fade-in zoom-in">Editing</span>}
          </DialogTitle>
        </DialogHeader>
        {entry && (
          <div className="space-y-6">
            {/* PROGRESS PHOTO */}
            {(isEditing || editPhotoPreview) && (
              <div className="flex justify-center">
                {editPhotoPreview ? (
                  <div className="relative group rounded-lg overflow-hidden max-h-[50vh] w-full flex justify-center bg-black/5 transition-all">
                    <SignedPhoto
                      src={editPhotoPreview}
                      alt={`Weight on ${editDate}`}
                      className="w-full h-full object-contain"
                    />
                    {isEditing && (
                      <div className="absolute inset-0 bg-black/50 opacity-100 md:bg-black/60 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                          Change Photo
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => setEditPhotoPreview(null)}>
                          Remove Photo
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  isEditing && (
                    <div 
                      onClick={() => fileRef.current?.click()}
                      className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-8 hover:border-accent transition-colors w-full"
                    >
                      <Camera className="h-8 w-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Tap to add a progress photo</p>
                    </div>
                  )
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setEditPhotoFile(file);
                      setEditPhotoPreview(URL.createObjectURL(file));
                    }
                  }}
                />
              </div>
            )}
            
            {/* DATE & WEIGHT */}
            <div className="flex justify-between items-center text-sm transition-all">
              <div className="text-muted-foreground flex items-center gap-2">
                Date: 
                {isEditing ? (
                  <div className="relative flex items-center">
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
                    />
                    <div className="font-semibold text-foreground flex items-center gap-1 border-b border-dashed border-primary/50 pb-0.5">
                      {new Date(editDate).toLocaleDateString("en-GB", {
                        day: "numeric", month: "short", year: "numeric"
                      })}
                      <CalendarIcon className="w-3 h-3 text-primary ml-1" />
                    </div>
                  </div>
                ) : (
                  <span className="font-semibold text-foreground">
                    {new Date(entry.date).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric"
                    })}
                  </span>
                )}
              </div>
              <div className="text-muted-foreground flex items-center gap-1">
                Weight: 
                {isEditing ? (
                  <span className="font-semibold text-foreground flex items-center">
                    [
                    <input
                      type="number"
                      value={editWeight}
                      onChange={(e) => setEditWeight(e.target.value)}
                      className="w-[5ch] bg-transparent text-center font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary rounded px-0.5 mx-1 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    ] {weightUnit}
                  </span>
                ) : (
                  <span className="font-semibold text-foreground">{disp(entry.weight_kg)} {weightUnit}</span>
                )}
              </div>
            </div>

            {/* NOTES */}
            <div className="space-y-1 transition-all">
              <div className="text-sm text-muted-foreground">Notes</div>
              {isEditing ? (
                <textarea
                  value={editNote}
                  onChange={(e) => {
                    setEditNote(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }}
                  placeholder="Add notes..."
                  className="w-full bg-background border border-border rounded-md p-2 text-sm min-h-[80px] focus:outline-none focus:ring-1 focus:ring-primary resize-none overflow-hidden"
                  onFocus={(e) => {
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }}
                />
              ) : (
                <p className="text-sm whitespace-pre-wrap">
                  {entry.note ? entry.note : <span className="text-muted-foreground italic">No notes provided.</span>}
                </p>
              )}
            </div>

            {/* BUTTONS */}
            <div className="flex justify-end gap-2 pt-2 transition-all">
              {isEditing ? (
                <>
                  <Button variant="secondary" size="sm" onClick={handleCancel} disabled={isSaving}>
                    Cancel
                  </Button>
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={handleSave}
                    disabled={!hasChanged || isSaving}
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                    Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => onDelete(entry.id)}>
                    Delete
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
