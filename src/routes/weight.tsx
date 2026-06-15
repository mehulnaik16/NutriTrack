import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { groqChat } from "@/lib/groq";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Scale, TrendingDown, TrendingUp, Minus as TrendFlat,
  Camera, Upload, Loader2, Target, ChevronLeft, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";

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
}

async function getGroqMotivation(
  name: string,
  currentWeight: number,
  startWeight: number,
  goalWeight: number | null,
  goal: string,
  streak: number
): Promise<string> {
  const prompt = `You are a motivational fitness coach. Write ONE short (2-3 sentences max), genuine, personalized motivational message.
User: ${name}, goal: ${goal}, current weight: ${currentWeight}kg, starting weight: ${startWeight}kg, goal weight: ${goalWeight ?? "not set"}kg, logging streak: ${streak} days.
Be specific to their numbers. Be warm and real — not generic or cheesy. No hashtags.`;

  return await groqChat({
    model: "llama-3.3-70b-versatile",
    max_tokens: 120,
    temperature: 0.8,
    messages: [{ role: "user", content: prompt }],
  });
}

function WeightPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [weight, setWeight] = useState("");
  const [goalWeight, setGoalWeight] = useState("");
  const [note, setNote] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [motivation, setMotivation] = useState<string | null>(null);
  const [loadingMotivation, setLoadingMotivation] = useState(false);
  const [compareIdx, setCompareIdx] = useState(0);

  useEffect(() => { if (!loading && !user) navigate({ to: "/login" }); }, [loading, user, navigate]);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: p }, { data: e }] = await Promise.all([
      supabase.from("user_profiles").select("weight_kg,goal,full_name,goal_weight_kg").eq("id", user.id).maybeSingle(),
      supabase.from("weight_entries").select("*").eq("user_id", user.id).order("date", { ascending: true }),
    ]);
    setProfile(p as Profile);
    setEntries((e as WeightEntry[]) ?? []);
    if (p?.weight_kg) setWeight(String(p.weight_kg));
    if (p?.goal_weight_kg) setGoalWeight(String(p.goal_weight_kg));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const fetchMotivation = async () => {
    if (!profile || entries.length === 0) return;
    setLoadingMotivation(true);
    const streak = entries.length;
    const startW = entries[0].weight_kg;
    const currentW = entries[entries.length - 1].weight_kg;
    const msg = await getGroqMotivation(
      profile.full_name?.split(" ")[0] ?? "champ",
      currentW, startW, profile.goal_weight_kg, profile.goal, streak
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
    setSaving(true);
    try {
      let photo_url: string | null = null;

      if (photoFile) {
        const ext = photoFile.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("weight-photos")
          .upload(path, photoFile, { upsert: true });
        if (!upErr) {
          const { data: urlData } = supabase.storage.from("weight-photos").getPublicUrl(path);
          photo_url = urlData.publicUrl;
        }
      }

      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from("weight_entries").upsert(
        { user_id: user.id, date: today, weight_kg: +weight, photo_url, note: note || null },
        { onConflict: "user_id,date" }
      );
      if (error) throw error;

      // Update profile weight + goal weight
      await supabase.from("user_profiles").update({
        weight_kg: +weight,
        ...(goalWeight ? { goal_weight_kg: +goalWeight } : {}),
      }).eq("id", user.id);

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

  const saveGoalWeight = async () => {
    if (!user || !goalWeight) return;
    await supabase.from("user_profiles").update({ goal_weight_kg: +goalWeight }).eq("id", user.id);
    toast.success("Goal weight saved!");
  };

  if (!user || !profile) {
    return <div className="flex min-h-screen items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" /></div>;
  }

  const latest = entries[entries.length - 1];
  const first = entries[0];
  const totalChange = latest && first ? +(latest.weight_kg - first.weight_kg).toFixed(1) : 0;
  const toGoal = latest && profile.goal_weight_kg ? +(latest.weight_kg - profile.goal_weight_kg).toFixed(1) : null;

  const chartData = entries.map((e) => ({ date: e.date.slice(5), weight: e.weight_kg }));

  // Photos with images for comparison
  const photoEntries = entries.filter((e) => e.photo_url);
  const compareA = photoEntries[compareIdx];
  const compareB = photoEntries[Math.min(compareIdx + 1, photoEntries.length - 1)];

  return (
    <div className="min-h-screen bg-background">
      <Header name={profile.full_name?.split(" ")[0]} />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">

        <h1 className="text-3xl font-bold tracking-tight">Weight Tracker</h1>

        {/* ── Summary cards ── */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <Scale className="h-4 w-4" /> Current
              </div>
              <p className="text-2xl font-bold">{latest?.weight_kg ?? profile.weight_kg} kg</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                {totalChange < 0 ? <TrendingDown className="h-4 w-4 text-[var(--energy)]" /> : totalChange > 0 ? <TrendingUp className="h-4 w-4 text-destructive" /> : <TrendFlat className="h-4 w-4" />}
                Total change
              </div>
              <p className={`text-2xl font-bold ${totalChange < 0 ? "text-[var(--energy)]" : totalChange > 0 ? "text-destructive" : ""}`}>
                {totalChange > 0 ? "+" : ""}{totalChange} kg
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <Target className="h-4 w-4" /> To goal
              </div>
              <p className="text-2xl font-bold">
                {toGoal !== null ? `${toGoal > 0 ? "" : ""}${toGoal} kg` : "—"}
              </p>
            </CardContent>
          </Card>
        </div>

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
                  {loadingMotivation
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Getting your message…</>
                    : "✨ Get today's motivation"}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Log weight ── */}
        <Card>
          <CardHeader><CardTitle>Log today's weight</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Weight (kg)</Label>
                <Input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g. 82.5" />
              </div>
              <div className="space-y-2">
                <Label>Goal weight (kg)</Label>
                <div className="flex gap-2">
                  <Input type="number" step="0.1" value={goalWeight} onChange={(e) => setGoalWeight(e.target.value)} placeholder="e.g. 75" />
                  <Button variant="outline" onClick={saveGoalWeight}>Set</Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. after morning workout" />
            </div>

            {/* Photo upload */}
            <div className="space-y-2">
              <Label>Progress photo (optional)</Label>
              <div
                onClick={() => fileRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 hover:border-accent transition-colors"
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="preview" className="h-32 w-32 rounded-lg object-cover" />
                ) : (
                  <>
                    <Camera className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Tap to add a progress photo</p>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
            </div>

            <Button onClick={logWeight} disabled={saving || !weight} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Log Weight
            </Button>
          </CardContent>
        </Card>

        {/* ── Weight chart ── */}
        {entries.length > 1 && (
          <Card>
            <CardHeader><CardTitle>Progress chart</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={11} domain={["auto", "auto"]} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                    <Line type="monotone" dataKey="weight" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }} />
                    {profile.goal_weight_kg && (
                      <ReferenceLine y={profile.goal_weight_kg} stroke="var(--energy)" strokeDasharray="5 5" label={{ value: "Goal", fill: "var(--energy)", fontSize: 11 }} />
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
                  <Button variant="outline" size="icon" onClick={() => setCompareIdx(Math.max(0, compareIdx - 1))} disabled={compareIdx === 0}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => setCompareIdx(Math.min(photoEntries.length - 2, compareIdx + 1))} disabled={compareIdx >= photoEntries.length - 2}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {[compareA, compareB].map((entry, i) => entry && (
                  <div key={i} className="space-y-1">
                    <img src={entry.photo_url!} alt={entry.date} className="w-full rounded-lg object-cover aspect-[3/4]" />
                    <p className="text-center text-xs text-muted-foreground">{entry.date} · {entry.weight_kg} kg</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Entry history ── */}
        {entries.length > 0 && (
          <Card>
            <CardHeader><CardTitle>History</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1">
                {[...entries].reverse().slice(0, 20).map((e, i) => {
                  const prev = [...entries].reverse()[i + 1];
                  const diff = prev ? +(e.weight_kg - prev.weight_kg).toFixed(1) : null;
                  return (
                    <div key={e.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                      <div className="flex items-center gap-3">
                        {e.photo_url && <img src={e.photo_url} alt="" className="h-8 w-8 rounded object-cover" />}
                        <div>
                          <span className="font-medium">{e.weight_kg} kg</span>
                          {e.note && <span className="ml-2 text-xs text-muted-foreground">{e.note}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {diff !== null && (
                          <span className={diff < 0 ? "text-[var(--energy)]" : diff > 0 ? "text-destructive" : ""}>
                            {diff > 0 ? "+" : ""}{diff} kg
                          </span>
                        )}
                        <span>{e.date}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
