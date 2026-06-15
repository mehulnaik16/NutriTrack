import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { groqChat } from "@/lib/groq";
import { useCallback, useEffect, useState } from "react";
import {
  Dumbbell, Play, CheckCircle2, ChevronDown, ChevronUp,
  Flame, Clock, RefreshCw, X, Loader2, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";

export const Route = createFileRoute("/workout")({ component: WorkoutPage });

// ─── Types ───────────────────────────────────────────────────────────────────

interface Exercise {
  name: string;
  sets: number;
  reps: string;       // e.g. "8-12" or "30 sec"
  rest: string;       // e.g. "60s"
  muscle: string;
  calories_per_set: number;
  tips: string;
  youtube_id: string; // curated video ID
}

interface WorkoutDay {
  day: string;        // "Day 1", "Day 2" …
  name: string;       // "Upper Body Strength"
  focus: string;      // "Chest · Shoulders · Triceps"
  exercises: Exercise[];
}

interface WorkoutPlan {
  goal: string;
  days_per_week: number;
  days: WorkoutDay[];
}

// ─── Curated YouTube video IDs per exercise name (fallback map) ───────────────
// These are well-known form tutorial videos – no API key needed for embedding.
const VIDEO_MAP: Record<string, string> = {
  "Barbell Bench Press": "rT7DgCr-3pg",
  "Push-Up": "IODxDxX7oi4",
  "Incline Dumbbell Press": "8iPEnn-ltC8",
  "Overhead Press": "2yjwXTZQDDI",
  "Lateral Raise": "3VcKaXpzqRo",
  "Tricep Dip": "0326dy_-CzM",
  "Skull Crusher": "d_KZxkY_5cM",
  "Pull-Up": "eGo4IYlbE5g",
  "Barbell Row": "kBWAon7ItDw",
  "Seated Cable Row": "GZbfZ033f74",
  "Lat Pulldown": "CAwf7n6Luuc",
  "Bicep Curl": "ykJmrZ5v0Oo",
  "Hammer Curl": "zC3nLlEvin4",
  "Barbell Squat": "ultWZbUMPL8",
  "Romanian Deadlift": "JCXUYuzwNrM",
  "Leg Press": "IZxyjW7MPJQ",
  "Leg Curl": "1Tq3QdYUuHs",
  "Leg Extension": "YyvSfVjQeL0",
  "Calf Raise": "gwLzBJYoWlI",
  "Hip Thrust": "xDmFkJxPzeM",
  "Deadlift": "op9kVnSso6Q",
  "Plank": "ASdvSXg5mKs",
  "Crunch": "Xyd_fa5zoEU",
  "Russian Twist": "wkD8rjkodUI",
  "Mountain Climber": "nmwgirgXLYM",
  "Burpee": "dZgVxmf6jkA",
  "Jump Rope": "FJmRQ5iTXKE",
  "Treadmill Walk": "hnwcHF9-A6w",
  "Dumbbell Lunge": "D7KaRcUTQeE",
  "Face Pull": "rep-qVOkqgk",
};

// ─── Groq plan generation (client-side, key from env) ────────────────────────
// NOTE: In production move this to your AI proxy backend (Railway).
// For now we call Groq directly so you can test without a server.

async function generatePlanFromGroq(goal: string, weightKg: number, activityLevel: string): Promise<WorkoutPlan> {
    const systemPrompt = `You are an expert certified personal trainer. 
Return ONLY valid JSON matching this exact TypeScript type — no markdown, no explanation:
{
  goal: string,
  days_per_week: number,
  days: Array<{
    day: string,
    name: string,
    focus: string,
    exercises: Array<{
      name: string,
      sets: number,
      reps: string,
      rest: string,
      muscle: string,
      calories_per_set: number,
      tips: string,
      youtube_id: string
    }>
  }>
}
For youtube_id use ONLY these exact exercise names and map to real YouTube video IDs for proper form tutorials.
calories_per_set should be a realistic number (5-25 kcal) based on the exercise intensity and user weight.`;

  const userPrompt = `Create a ${goal === "Gain Muscle" ? "muscle gain hypertrophy" : goal === "Lose Weight" ? "fat loss with cardio" : "maintenance balanced"} workout plan.
User: ${weightKg}kg body weight, activity level: ${activityLevel}.
Goal: ${goal}.
Rules:
- ${goal === "Lose Weight" ? "4-5 days/week, mix of resistance + cardio, higher reps 12-20, shorter rest 45s, include cardio days" : goal === "Gain Muscle" ? "4-5 days/week, push/pull/legs split, reps 6-12, rest 60-90s, progressive overload focus" : "3-4 days/week, full body or upper/lower, balanced reps 10-15"}
- 4-6 exercises per day
- Use common gym exercises that have good YouTube tutorials
- For youtube_id, use real YouTube video IDs from well-known fitness educators (Jeff Nippard, Athlean-X, Alan Thrall)
- Include at least one compound lift per day
- tips should be 1 concise coaching cue`;


  const clean = raw.replace(/```json|```/g, "").trim();
  const plan: WorkoutPlan = JSON.parse(clean);

  // Patch missing youtube_ids with our curated map
  for (const day of plan.days) {
    for (const ex of day.exercises) {
      if (!ex.youtube_id || ex.youtube_id.length < 5) {
        ex.youtube_id = VIDEO_MAP[ex.name] ?? "dQw4w9WgXcQ";
      }
    }
  }

  return plan;
}

// ─── Sample plan (no API key fallback) ───────────────────────────────────────
function getSamplePlan(goal: string, weightKg: number): WorkoutPlan {
  const isLoss = goal === "Lose Weight";
  const isMuscle = goal === "Gain Muscle";

  return {
    goal,
    days_per_week: isLoss ? 5 : isMuscle ? 5 : 4,
    days: [
      {
        day: "Day 1",
        name: isLoss ? "Full Body Burn" : isMuscle ? "Push — Chest & Shoulders" : "Upper Body",
        focus: isLoss ? "Compound · Cardio" : isMuscle ? "Chest · Shoulders · Triceps" : "Chest · Back · Shoulders",
        exercises: [
          { name: "Barbell Bench Press", sets: isMuscle ? 4 : 3, reps: isMuscle ? "6-10" : "12-15", rest: isMuscle ? "90s" : "60s", muscle: "Chest", calories_per_set: Math.round(weightKg * 0.12), tips: "Keep shoulder blades pinched and drive through your heels.", youtube_id: VIDEO_MAP["Barbell Bench Press"] },
          { name: "Overhead Press", sets: 3, reps: isMuscle ? "8-10" : "12-15", rest: "60s", muscle: "Shoulders", calories_per_set: Math.round(weightKg * 0.1), tips: "Brace your core — don't hyperextend your lower back.", youtube_id: VIDEO_MAP["Overhead Press"] },
          { name: "Incline Dumbbell Press", sets: 3, reps: "10-12", rest: "60s", muscle: "Upper Chest", calories_per_set: Math.round(weightKg * 0.1), tips: "Control the eccentric — 3 seconds down.", youtube_id: VIDEO_MAP["Incline Dumbbell Press"] },
          { name: "Lateral Raise", sets: 3, reps: "15-20", rest: "45s", muscle: "Side Delts", calories_per_set: 6, tips: "Lead with your elbows, not your hands.", youtube_id: VIDEO_MAP["Lateral Raise"] },
          { name: "Tricep Dip", sets: 3, reps: "10-12", rest: "60s", muscle: "Triceps", calories_per_set: 8, tips: "Keep torso upright to hit triceps not chest.", youtube_id: VIDEO_MAP["Tricep Dip"] },
        ],
      },
      {
        day: "Day 2",
        name: isLoss ? "Cardio + Core" : isMuscle ? "Pull — Back & Biceps" : "Lower Body",
        focus: isLoss ? "Cardio · Abs" : isMuscle ? "Back · Biceps · Rear Delts" : "Quads · Hamstrings · Glutes",
        exercises: [
          { name: isLoss ? "Mountain Climber" : isMuscle ? "Pull-Up" : "Barbell Squat", sets: 4, reps: isLoss ? "30 sec" : isMuscle ? "6-10" : "6-10", rest: isLoss ? "30s" : "90s", muscle: isLoss ? "Full Body" : isMuscle ? "Back" : "Quads", calories_per_set: isLoss ? 15 : Math.round(weightKg * 0.14), tips: isLoss ? "Keep hips level, drive knees to chest." : isMuscle ? "Full dead hang at the bottom, chin over bar." : "Break at hips and knees simultaneously.", youtube_id: VIDEO_MAP[isLoss ? "Mountain Climber" : isMuscle ? "Pull-Up" : "Barbell Squat"] },
          { name: isLoss ? "Burpee" : isMuscle ? "Barbell Row" : "Romanian Deadlift", sets: 4, reps: isLoss ? "12" : "8-10", rest: "60s", muscle: isLoss ? "Full Body" : isMuscle ? "Back" : "Hamstrings", calories_per_set: isLoss ? 18 : Math.round(weightKg * 0.13), tips: isLoss ? "Jump explosively, land softly." : isMuscle ? "Pull bar to belly button, not chest." : "Push hips back, keep bar close to legs.", youtube_id: VIDEO_MAP[isLoss ? "Burpee" : isMuscle ? "Barbell Row" : "Romanian Deadlift"] },
          { name: isLoss ? "Jump Rope" : isMuscle ? "Lat Pulldown" : "Leg Press", sets: 3, reps: isLoss ? "60 sec" : "10-12", rest: "45s", muscle: isLoss ? "Cardio" : isMuscle ? "Lats" : "Quads", calories_per_set: isLoss ? 20 : Math.round(weightKg * 0.1), tips: isLoss ? "Stay on balls of feet, quick wrist rotations." : isMuscle ? "Depress scapula before pulling." : "Don't let knees cave inward.", youtube_id: VIDEO_MAP[isLoss ? "Jump Rope" : isMuscle ? "Lat Pulldown" : "Leg Press"] },
          { name: isMuscle ? "Bicep Curl" : "Leg Curl", sets: 3, reps: "10-15", rest: "45s", muscle: isMuscle ? "Biceps" : "Hamstrings", calories_per_set: 7, tips: isMuscle ? "Don't swing — isolate at the elbow." : "Curl fully, pause at peak contraction.", youtube_id: VIDEO_MAP[isMuscle ? "Bicep Curl" : "Leg Curl"] },
          { name: "Plank", sets: 3, reps: "45 sec", rest: "30s", muscle: "Core", calories_per_set: 5, tips: "Squeeze glutes and abs — don't let hips sag.", youtube_id: VIDEO_MAP["Plank"] },
        ],
      },
      {
        day: "Day 3",
        name: isLoss ? "Lower Body Burn" : isMuscle ? "Legs — Quads & Glutes" : "Push",
        focus: isLoss ? "Legs · Glutes · Core" : isMuscle ? "Quads · Glutes · Calves" : "Chest · Shoulders · Triceps",
        exercises: [
          { name: "Barbell Squat", sets: 4, reps: isMuscle ? "6-10" : "12-15", rest: isMuscle ? "90s" : "60s", muscle: "Quads", calories_per_set: Math.round(weightKg * 0.14), tips: "Hit parallel or below — depth is king.", youtube_id: VIDEO_MAP["Barbell Squat"] },
          { name: "Romanian Deadlift", sets: 3, reps: "10-12", rest: "60s", muscle: "Hamstrings", calories_per_set: Math.round(weightKg * 0.12), tips: "Feel the hamstring stretch at the bottom.", youtube_id: VIDEO_MAP["Romanian Deadlift"] },
          { name: "Hip Thrust", sets: 3, reps: "12-15", rest: "60s", muscle: "Glutes", calories_per_set: Math.round(weightKg * 0.11), tips: "Drive hips up explosively, squeeze at top.", youtube_id: VIDEO_MAP["Hip Thrust"] },
          { name: "Leg Extension", sets: 3, reps: "15", rest: "45s", muscle: "Quads", calories_per_set: 7, tips: "Full extension, hold 1 second at top.", youtube_id: VIDEO_MAP["Leg Extension"] },
          { name: "Calf Raise", sets: 4, reps: "20", rest: "30s", muscle: "Calves", calories_per_set: 5, tips: "Full range — all the way up and down.", youtube_id: VIDEO_MAP["Calf Raise"] },
        ],
      },
      {
        day: "Day 4",
        name: isLoss ? "HIIT & Core" : isMuscle ? "Pull — Deadlift Focus" : "Lower Body",
        focus: isLoss ? "HIIT · Abs" : isMuscle ? "Hamstrings · Back · Biceps" : "Quads · Hamstrings",
        exercises: [
          { name: isLoss ? "Burpee" : "Deadlift", sets: 4, reps: isLoss ? "15" : "5", rest: isLoss ? "30s" : "120s", muscle: isLoss ? "Full Body" : "Posterior Chain", calories_per_set: isLoss ? 18 : Math.round(weightKg * 0.18), tips: isLoss ? "Move with intent — quality over speed." : "Chest up, bar over mid-foot, drive floor away.", youtube_id: VIDEO_MAP[isLoss ? "Burpee" : "Deadlift"] },
          { name: "Seated Cable Row", sets: 3, reps: "10-12", rest: "60s", muscle: "Mid Back", calories_per_set: Math.round(weightKg * 0.09), tips: "Squeeze shoulder blades at the end of the pull.", youtube_id: VIDEO_MAP["Seated Cable Row"] },
          { name: "Face Pull", sets: 3, reps: "15-20", rest: "45s", muscle: "Rear Delts", calories_per_set: 6, tips: "Pull to eye level, external rotate at end.", youtube_id: VIDEO_MAP["Face Pull"] },
          { name: "Hammer Curl", sets: 3, reps: "12", rest: "45s", muscle: "Brachialis", calories_per_set: 7, tips: "Neutral grip throughout — don't pronate.", youtube_id: VIDEO_MAP["Hammer Curl"] },
          { name: "Russian Twist", sets: 3, reps: "20", rest: "30s", muscle: "Core", calories_per_set: 6, tips: "Lean back 45°, keep feet off floor for more challenge.", youtube_id: VIDEO_MAP["Russian Twist"] },
        ],
      },
      {
        day: "Day 5",
        name: isLoss ? "Active Recovery" : isMuscle ? "Shoulders & Arms" : "Full Body",
        focus: isLoss ? "Walk · Stretch" : isMuscle ? "Shoulders · Biceps · Triceps" : "Compound",
        exercises: [
          { name: isLoss ? "Treadmill Walk" : "Overhead Press", sets: isLoss ? 1 : 4, reps: isLoss ? "30 min" : "8-10", rest: isLoss ? "—" : "90s", muscle: isLoss ? "Cardio" : "Shoulders", calories_per_set: isLoss ? 120 : Math.round(weightKg * 0.1), tips: isLoss ? "Zone 2 cardio — you should be able to hold a conversation." : "Full lockout at top, don't rush.", youtube_id: VIDEO_MAP[isLoss ? "Treadmill Walk" : "Overhead Press"] },
          { name: "Lateral Raise", sets: 3, reps: "15-20", rest: "45s", muscle: "Side Delts", calories_per_set: 6, tips: "Lead with pinky, don't shrug.", youtube_id: VIDEO_MAP["Lateral Raise"] },
          { name: "Skull Crusher", sets: 3, reps: "10-12", rest: "60s", muscle: "Triceps", calories_per_set: 8, tips: "Elbows point forward, lower to forehead slowly.", youtube_id: VIDEO_MAP["Skull Crusher"] },
          { name: "Bicep Curl", sets: 3, reps: "10-12", rest: "45s", muscle: "Biceps", calories_per_set: 7, tips: "Supinate at the top for peak contraction.", youtube_id: VIDEO_MAP["Bicep Curl"] },
          { name: "Plank", sets: 3, reps: "60 sec", rest: "30s", muscle: "Core", calories_per_set: 5, tips: "Breathe steadily — don't hold your breath.", youtube_id: VIDEO_MAP["Plank"] },
        ],
      },
    ],
  };
}

// ─── Main component ───────────────────────────────────────────────────────────
function WorkoutPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [generating, setGenerating] = useState(false);
  const [activeDay, setActiveDay] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [videoEx, setVideoEx] = useState<Exercise | null>(null);
  const [logging, setLogging] = useState(false);
  const [todayLog, setTodayLog] = useState<any>(null);

  useEffect(() => { if (!loading && !user) navigate({ to: "/login" }); }, [loading, user, navigate]);

  const loadData = useCallback(async () => {
    if (!user) return;
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: p }, { data: wp }, { data: wl }] = await Promise.all([
      supabase.from("user_profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("workout_plans").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("workout_logs").select("*").eq("user_id", user.id).eq("date", today).maybeSingle(),
    ]);
    setProfile(p);
    if (wp?.plan_json) setPlan(wp.plan_json as WorkoutPlan);
    if (wl) setTodayLog(wl);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const generatePlan = async () => {
    if (!profile) return;
    setGenerating(true);
    try {
      const newPlan = await generatePlanFromGroq(profile.goal, profile.weight_kg, profile.activity_level);
      setPlan(newPlan);
      setDone({});
      setExpanded({});
      // Save to Supabase
      await supabase.from("workout_plans").upsert({
        user_id: user!.id,
        goal: profile.goal,
        plan_json: newPlan,
      });
      toast.success("Workout plan generated!");
    } catch (e: any) {
      toast.error("Could not generate plan: " + e.message);
    } finally {
      setGenerating(false);
    }
  };

  const toggleExpand = (key: string) => setExpanded((p) => ({ ...p, [key]: !p[key] }));
  const toggleDone = (key: string) => setDone((p) => ({ ...p, [key]: !p[key] }));

  const currentDay = plan?.days[activeDay];
  const doneCount = currentDay ? currentDay.exercises.filter((_, i) => done[`${activeDay}-${i}`]).length : 0;
  const totalExercises = currentDay?.exercises.length ?? 0;
  const pct = totalExercises ? Math.round((doneCount / totalExercises) * 100) : 0;

  const totalCalsBurned = currentDay
    ? currentDay.exercises.reduce((sum, ex, i) => {
        if (!done[`${activeDay}-${i}`]) return sum;
        return sum + ex.sets * ex.calories_per_set;
      }, 0)
    : 0;

  const logWorkout = async () => {
    if (!user || !currentDay || doneCount === 0) return;
    setLogging(true);
    const exercisesDone = currentDay.exercises
      .filter((_, i) => done[`${activeDay}-${i}`])
      .map((ex) => ({ name: ex.name, sets: ex.sets, reps: ex.reps }));

    const { error } = await supabase.from("workout_logs").insert({
      user_id: user.id,
      date: new Date().toISOString().slice(0, 10),
      workout_name: currentDay.name,
      exercises_done: exercisesDone,
      duration_min: Math.round(doneCount * 4.5),
      calories_burned: Math.round(totalCalsBurned),
    });
    setLogging(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Workout logged! ~${Math.round(totalCalsBurned)} kcal burned`);
    loadData();
  };

  if (!user || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  const goalColor = profile.goal === "Gain Muscle" ? "bg-[var(--energy)]/10 text-[var(--energy)] border-[var(--energy)]/30"
    : profile.goal === "Lose Weight" ? "bg-[var(--fat)]/10 text-[var(--fat)] border-[var(--fat)]/30"
    : "bg-[var(--navy)]/10 text-[var(--navy)] border-[var(--navy)]/30";

  return (
    <div className="min-h-screen bg-background">
      <Header name={profile.full_name?.split(" ")[0]} />

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">

        {/* ── Header row ── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Workout Plan</h1>
            <p className="mt-1 text-sm text-muted-foreground">Based on your goal: <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${goalColor}`}>{profile.goal}</span></p>
          </div>
          <Button onClick={generatePlan} disabled={generating} className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {plan ? "Regenerate Plan" : "Generate My Plan"}
          </Button>
        </div>

        {/* ── Today's log banner ── */}
        {todayLog && (
          <Card className="border-[var(--energy)]/30 bg-[var(--energy)]/5">
            <CardContent className="flex items-center gap-4 p-4">
              <CheckCircle2 className="h-6 w-6 shrink-0 text-[var(--energy)]" />
              <div className="flex-1">
                <p className="font-semibold text-sm">Workout logged today — {todayLog.workout_name}</p>
                <p className="text-xs text-muted-foreground">{todayLog.duration_min} min · {Math.round(todayLog.calories_burned)} kcal burned</p>
              </div>
            </CardContent>
          </Card>
        )}

        {!plan && !generating && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Dumbbell className="mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 text-lg font-semibold">No plan yet</h2>
              <p className="mb-4 max-w-sm text-sm text-muted-foreground">
                Click "Generate My Plan" and we'll build a personalized {profile.goal === "Gain Muscle" ? "hypertrophy" : profile.goal === "Lose Weight" ? "fat loss" : "balanced"} plan tailored to your body and goal.
              </p>
              <Button onClick={generatePlan} className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
                <Zap className="h-4 w-4" /> Generate My Plan
              </Button>
            </CardContent>
          </Card>
        )}

        {generating && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-accent" />
              <p className="text-sm text-muted-foreground">Building your personalised plan…</p>
            </CardContent>
          </Card>
        )}

        {plan && !generating && (
          <>
            {/* ── Day selector tabs ── */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {plan.days.map((d, i) => (
                <button
                  key={i}
                  onClick={() => { setActiveDay(i); setDone({}); }}
                  className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${activeDay === i
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-accent/40"
                    }`}
                >
                  {d.day}
                </button>
              ))}
            </div>

            {currentDay && (
              <>
                {/* ── Day overview card ── */}
                <Card>
                  <CardContent className="p-5">
                    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-xl font-bold">{currentDay.name}</h2>
                        <p className="text-sm text-muted-foreground">{currentDay.focus}</p>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><Dumbbell className="h-4 w-4" />{totalExercises} exercises</span>
                        <span className="flex items-center gap-1"><Flame className="h-4 w-4 text-[var(--fat)]" />{Math.round(totalCalsBurned)} kcal</span>
                        <span className="flex items-center gap-1"><Clock className="h-4 w-4" />~{Math.round(totalExercises * 4.5)} min</span>
                      </div>
                    </div>
                    <Progress value={pct} className="h-2" />
                    <p className="mt-1.5 text-xs text-muted-foreground">{doneCount}/{totalExercises} exercises done</p>
                  </CardContent>
                </Card>

                {/* ── Exercise list ── */}
                <div className="space-y-3">
                  {currentDay.exercises.map((ex, i) => {
                    const key = `${activeDay}-${i}`;
                    const isExpanded = expanded[key];
                    const isDone = done[key];
                    return (
                      <Card key={i} className={`transition-colors ${isDone ? "border-[var(--energy)]/40 bg-[var(--energy)]/5" : ""}`}>
                        <CardContent className="p-0">
                          {/* Exercise header row */}
                          <div className="flex items-center gap-3 px-4 py-3">
                            <button
                              onClick={() => toggleDone(key)}
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${isDone
                                ? "border-[var(--energy)] bg-[var(--energy)] text-white"
                                : "border-border hover:border-accent"
                                }`}
                            >
                              {isDone && <CheckCircle2 className="h-4 w-4" />}
                            </button>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`font-semibold ${isDone ? "line-through text-muted-foreground" : ""}`}>{ex.name}</span>
                                <Badge variant="outline" className="text-xs">{ex.muscle}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{ex.sets} sets × {ex.reps} · Rest {ex.rest}</p>
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Watch form video */}
                              <button
                                onClick={() => setVideoEx(ex)}
                                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:border-accent hover:text-foreground transition-colors"
                              >
                                <Play className="h-3 w-3" /> Form
                              </button>
                              {/* Expand tips */}
                              <button onClick={() => toggleExpand(key)} className="text-muted-foreground hover:text-foreground">
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>

                          {/* Expanded coaching tip */}
                          {isExpanded && (
                            <div className="border-t border-border bg-muted/30 px-4 py-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Coaching tip</p>
                              <p className="text-sm">{ex.tips}</p>
                              <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                                <span><Flame className="inline h-3 w-3" /> ~{ex.sets * ex.calories_per_set} kcal for this exercise</span>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* ── Log workout button ── */}
                {doneCount > 0 && (
                  <Card className="border-accent/30">
                    <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold">Ready to log?</p>
                        <p className="text-sm text-muted-foreground">
                          {doneCount}/{totalExercises} exercises · ~{Math.round(totalCalsBurned)} kcal burned · ~{Math.round(doneCount * 4.5)} min
                        </p>
                      </div>
                      <Button
                        onClick={logWorkout}
                        disabled={logging || !!todayLog}
                        className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
                      >
                        {logging ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        {todayLog ? "Already logged today" : "Log Workout"}
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* ── YouTube form video modal ── */}
      <Dialog open={!!videoEx} onOpenChange={(o) => !o && setVideoEx(null)}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <DialogTitle>{videoEx?.name} — Form Tutorial</DialogTitle>
              <button onClick={() => setVideoEx(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            {videoEx && (
              <p className="text-xs text-muted-foreground">{videoEx.sets} sets × {videoEx.reps} · Rest {videoEx.rest} · {videoEx.muscle}</p>
            )}
          </DialogHeader>
          {videoEx && (
            <div className="aspect-video w-full">
              <iframe
                src={`https://www.youtube.com/embed/${videoEx.youtube_id}?autoplay=1&rel=0&modestbranding=1`}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={`${videoEx.name} form tutorial`}
              />
            </div>
          )}
          {videoEx && (
            <div className="border-t border-border bg-muted/30 px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Coaching tip</p>
              <p className="text-sm">{videoEx.tips}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
