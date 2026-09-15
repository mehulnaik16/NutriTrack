/**
 * Strength calorie calculator — a what-if tool, not a logger.
 *
 * Pick an exercise, enter the sets you did, get a calorie range. Nothing here
 * writes to workout_logs: saved results live in this page's own History tab,
 * in localStorage, so a calculation can never land among logged workouts or
 * move a daily total.
 *
 * Two formulas, chosen by whether a heart rate was entered. Both live in
 * calorieEngine.ts alongside the cardio paths; this file only collects inputs.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { WorkoutGate } from "@/components/WorkoutGate";
import { useAuth } from "@/lib/auth";
import { useGatedWorkoutPrefs } from "@/hooks/useWorkoutPrefsGate";
import { supabase } from "@/integrations/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronLeft, Search, X, Plus, Minus, Flame, History, Calculator,
  Heart, ChevronDown, Trash2, Pencil,
} from "lucide-react";
import { EXERCISES_DB, MUSCLE_SUBCATEGORIES, COMPOUND_EXERCISES } from "@/lib/exercises";
import { exerciseKind } from "@/lib/exerciseKind";
import {
  calculateCalories,
  calorieRange,
  confidenceTier,
  isStrengthExercise,
  summarizeStrength,
  strengthDurationMin,
  type StrengthSet,
} from "@/lib/calorieEngine";
import { weightToKg, type WeightUnit } from "@/lib/units";

export const Route = createFileRoute("/calorie-calculator")({
  component: GatedCalculator,
});

// Same nine tiles as the workout page grid, so the picker looks like the place
// the user came from.
const MUSCLES = [
  { id: "chest",     name: "Chest",      img: "/images/chestfinal.png" },
  { id: "back",      name: "Back",       img: "/images/backfinal.png" },
  { id: "shoulders", name: "Shoulders",  img: "/images/shouldersfinal.png" },
  { id: "biceps",    name: "Biceps",     img: "/images/biceps%20final.png" },
  { id: "triceps",   name: "Triceps",    img: "/images/tricepsfinal.png" },
  { id: "abs",       name: "Core & Abs", img: "/images/corefinal.png" },
  { id: "legs",      name: "Legs",       img: "/images/legs.png" },
  { id: "compound",  name: "Compound",   img: "/images/compoundfinal.png" },
  { id: "forearms",  name: "Forearms",   img: "/images/forearms.png" },
];

const REST_PRESETS = [30, 60, 90, 120, 180];

/**
 * Names shown under a grid tile. Legs and Back fan out to their sub-groups, and
 * Compound has no EXERCISES_DB key at all — it is its own exported list, which
 * is why the tile came back empty when keyed by id.
 */
function namesForMuscle(id: string): string[] {
  const subs = MUSCLE_SUBCATEGORIES[id];
  const raw = id === "compound"
    ? COMPOUND_EXERCISES
    : subs ? subs.flatMap((s) => s.names) : EXERCISES_DB[id] ?? [];
  // De-duplicate: the Back sub-groups overlap, and Compound repeats big lifts.
  return Array.from(new Set(raw)).filter(isStrengthExercise).sort();
}

const ALL_NAMES = Array.from(
  new Set(Object.values(EXERCISES_DB).flat()),
).filter(isStrengthExercise).sort();

// ── Saved history (localStorage only) ───────────────────────────────────────

interface SavedCalc {
  id: string;
  at: string;
  exercise: string;
  sets: StrengthSet[];
  rest_sec: number;
  duration_min: number;
  low: number;
  high: number;
  chip: string;
  unit: WeightUnit;
}

const HISTORY_KEY = (userId: string) => `calc_history_${userId}`;

function loadHistory(userId: string): SavedCalc[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY(userId));
    return raw ? (JSON.parse(raw) as SavedCalc[]) : [];
  } catch {
    return [];
  }
}

function writeHistory(userId: string, entries: SavedCalc[]): void {
  try {
    localStorage.setItem(HISTORY_KEY(userId), JSON.stringify(entries.slice(0, 100)));
  } catch {
    /* storage full or blocked — the calculation itself still worked */
  }
}

function GatedCalculator() {
  return (
    <WorkoutGate>
      <CalorieCalculator />
    </WorkoutGate>
  );
}

function CalorieCalculator() {
  const { user } = useAuth();
  const navigate = useNavigate();
  // WorkoutGate has already loaded these; reading them here avoids a second fetch.
  const prefs = useGatedWorkoutPrefs();

  // Profile drives both formulas and is never asked for on this page.
  const [bodyWeight, setBodyWeight] = useState(70);
  const [userAge, setUserAge] = useState(25);
  const [userGender, setUserGender] = useState("Male");
  const unit: WeightUnit = (prefs?.weightUnit as WeightUnit) ?? "kg";

  const [exercise, setExercise] = useState<string | null>(null);
  const [openMuscle, setOpenMuscle] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [rows, setRows] = useState<{ reps: string; weight: string; hold: string }[]>([
    { reps: "10", weight: "", hold: "" },
    { reps: "10", weight: "", hold: "" },
    { reps: "10", weight: "", hold: "" },
  ]);
  const [restSec, setRestSec] = useState(60);
  const [bpm, setBpm] = useState("");
  const [showHr, setShowHr] = useState(false);
  const [durationOverride, setDurationOverride] = useState<string | null>(null);

  const [history, setHistory] = useState<SavedCalc[]>([]);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    setHistory(loadHistory(user.id));
    void (async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select("weight_kg, age, gender")
        .eq("id", user.id)
        .maybeSingle();
      if (data?.weight_kg) setBodyWeight(data.weight_kg);
      if (data?.age) setUserAge(data.age);
      if (data?.gender) setUserGender(data.gender);
    })();
  }, [user]);

  const kind = exercise ? exerciseKind(exercise) : "weighted";
  const isHold = kind === "isometric";
  const showsWeight = kind === "weighted" || kind === "assisted";

  // Rows in engine units: the form carries the user's display unit, the engine
  // takes kilograms.
  const sets: StrengthSet[] = useMemo(() => rows.map((r) => ({
    reps: parseInt(r.reps) || 0,
    weight_kg: r.weight ? weightToKg(parseFloat(r.weight) || 0, unit) : null,
    hold_sec: parseInt(r.hold) || 0,
  })), [rows, unit]);

  const session = exercise
    ? summarizeStrength(exercise, sets, restSec, bodyWeight)
    : null;

  const autoMinutes = session ? strengthDurationMin(session) : 0;
  const durationMin = durationOverride != null
    ? parseFloat(durationOverride) || 0
    : autoMinutes;

  const result = exercise && session && durationMin > 0
    ? calculateCalories(exercise, {
        duration_min: durationMin,
        rest_sec: restSec,
        strength_sets: sets,
        hr_bpm: parseInt(bpm) || null,
      }, { weight_kg: bodyWeight, age: userAge, gender: userGender })
    : null;

  const tier = result ? confidenceTier(result.method, session?.met_resolved ?? false) : null;
  const range = result && tier ? calorieRange(result.kcal, tier) : null;
  const chip = tier === "high" ? "Heart-rate adjusted"
    : tier === "medium" ? "Estimated" : "Rough estimate";

  const restMin = session ? session.rest_sec / 60 : 0;
  const activeMin = Math.max(0, durationMin - restMin);

  const clearAll = () => {
    setExercise(null);
    setOpenMuscle(null);
    setQuery("");
    setRows([
      { reps: "10", weight: "", hold: "" },
      { reps: "10", weight: "", hold: "" },
      { reps: "10", weight: "", hold: "" },
    ]);
    setRestSec(60);
    setBpm("");
    setShowHr(false);
    setDurationOverride(null);
  };

  const save = () => {
    if (!user || !exercise || !range) return;
    const entry: SavedCalc = {
      id: `${Date.now()}`,
      at: new Date().toISOString(),
      exercise,
      sets,
      rest_sec: restSec,
      duration_min: Math.round(durationMin),
      low: range.low,
      high: range.high,
      chip,
      unit,
    };
    const next = [entry, ...history];
    setHistory(next);
    writeHistory(user.id, next);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
  };

  const removeEntry = (id: string) => {
    const next = history.filter((h) => h.id !== id);
    setHistory(next);
    if (user) writeHistory(user.id, next);
  };

  const searchHits = query.trim()
    ? ALL_NAMES.filter((n) => n.toLowerCase().includes(query.toLowerCase())).slice(0, 40)
    : [];

  return (
    <div className="min-h-screen bg-background pb-40 selection:bg-accent/20">
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/95 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-3">
          <button
            onClick={() => navigate({ to: "/workout" })}
            aria-label="Back to workout"
            className="-ml-2 rounded-full p-2 transition-transform active:scale-90"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="font-display flex-1 text-base font-bold tracking-wide">
            Calorie Calculator
          </h1>
          <button
            onClick={clearAll}
            className="rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-md p-5 pt-4">
        <Tabs defaultValue="calc" className="w-full max-w-full">
          <TabsList className="flex w-full py-2">
            <TabsTrigger value="calc" className="flex-1 px-2 py-3 text-[11px] font-bold sm:text-sm">
              <Calculator className="mr-1.5 h-3 w-3 sm:h-4 sm:w-4" /> Calculate
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1 px-2 py-3 text-[11px] font-bold sm:text-sm">
              <History className="mr-1.5 h-3 w-3 sm:h-4 sm:w-4" /> History
            </TabsTrigger>
          </TabsList>

          {/* ── CALCULATE ── */}
          <TabsContent value="calc" className="space-y-5 pt-4">
            {/* 1. Exercise */}
            <section className="space-y-3">
              <Label className="text-xs font-bold uppercase text-muted-foreground">
                Exercise
              </Label>

              {exercise ? (
                <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-muted/20 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{exercise}</p>
                    <p className="text-xs text-muted-foreground">
                      {session?.met_resolved ? `${session.met.toFixed(1)} MET` : "MET estimated"}
                      {kind !== "weighted" && ` · ${kind}`}
                    </p>
                  </div>
                  <button
                    onClick={() => { setExercise(null); setOpenMuscle(null); }}
                    className="shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-accent"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search all exercises..."
                      className="h-12 rounded-2xl bg-background/50 pl-10 pr-10"
                    />
                    {query && (
                      <button
                        onClick={() => setQuery("")}
                        aria-label="Clear search"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {query.trim() ? (
                    <div className="space-y-1.5">
                      {searchHits.length === 0 && (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                          No exercises match.
                        </p>
                      )}
                      {searchHits.map((n) => (
                        <button
                          key={n}
                          onClick={() => { setExercise(n); setQuery(""); }}
                          className="w-full rounded-xl border border-border/50 bg-muted/10 px-4 py-3 text-left text-sm font-medium active:scale-[0.98]"
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  ) : openMuscle ? (
                    <div className="space-y-1.5">
                      <button
                        onClick={() => setOpenMuscle(null)}
                        className="flex items-center gap-1 py-1 text-xs font-bold uppercase tracking-wide text-muted-foreground"
                      >
                        <ChevronLeft className="h-3 w-3" /> All muscles
                      </button>
                      {namesForMuscle(openMuscle).map((n) => (
                        <button
                          key={n}
                          onClick={() => setExercise(n)}
                          className="w-full rounded-xl border border-border/50 bg-muted/10 px-4 py-3 text-left text-sm font-medium active:scale-[0.98]"
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {MUSCLES.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setOpenMuscle(m.id)}
                          className="flex flex-col overflow-hidden rounded-2xl transition-transform duration-150 active:scale-95"
                        >
                          <img src={m.img} alt="" className="block h-auto w-full" loading="lazy" />
                          <span className="w-full py-1.5 text-center text-[13px] font-semibold text-foreground">
                            {m.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>

            {exercise && (
              <>
                {/* 2. Set rows */}
                <section className="space-y-2 rounded-2xl border border-border/50 bg-muted/20 p-4">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">
                    {isHold ? "Holds" : "Sets"}
                  </Label>

                  <div className="flex gap-2 px-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    <span className="w-10">Set</span>
                    <span className="flex-1">{isHold ? "Seconds" : "Reps"}</span>
                    {showsWeight && (
                      <span className="flex-1">
                        {kind === "assisted" ? `Assist (${unit})` : `Weight (${unit})`}
                      </span>
                    )}
                    <span className="w-8" />
                  </div>

                  {rows.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-10 text-sm font-bold text-muted-foreground">{i + 1}</span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        aria-label={isHold ? `Set ${i + 1} seconds` : `Set ${i + 1} reps`}
                        value={isHold ? r.hold : r.reps}
                        onChange={(e) => setRows(rows.map((row, j) =>
                          j === i ? { ...row, [isHold ? "hold" : "reps"]: e.target.value } : row))}
                        placeholder={isHold ? "45" : "10"}
                        className="h-11 flex-1 bg-background/60 text-center font-semibold"
                      />
                      {showsWeight && (
                        <Input
                          type="number"
                          inputMode="decimal"
                          aria-label={`Set ${i + 1} weight`}
                          value={r.weight}
                          onChange={(e) => setRows(rows.map((row, j) =>
                            j === i ? { ...row, weight: e.target.value } : row))}
                          placeholder="—"
                          className="h-11 flex-1 bg-background/60 text-center font-semibold"
                        />
                      )}
                      <button
                        onClick={() => setRows(rows.filter((_, j) => j !== i))}
                        disabled={rows.length === 1}
                        aria-label={`Remove set ${i + 1}`}
                        className="w-8 shrink-0 text-muted-foreground disabled:opacity-30"
                      >
                        <Minus className="mx-auto h-4 w-4" />
                      </button>
                    </div>
                  ))}

                  <button
                    // Copying the last row matches how people actually train:
                    // the load repeats, or climbs from what came before.
                    onClick={() => setRows([...rows, { ...rows[rows.length - 1] }])}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground active:scale-[0.98]"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add set
                  </button>
                </section>

                {/* 3. Rest */}
                <section className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">
                    Rest between sets
                  </Label>
                  <div className="flex gap-1.5 rounded-2xl border border-border/50 bg-muted/40 p-1.5">
                    {REST_PRESETS.map((s) => (
                      <button
                        key={s}
                        onClick={() => { setRestSec(s); setDurationOverride(null); }}
                        className={`flex-1 rounded-xl py-2 text-xs font-bold transition-colors ${
                          restSec === s
                            ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                            : "text-muted-foreground"
                        }`}
                      >
                        {s}s
                      </button>
                    ))}
                  </div>
                  <p className="px-1 text-[11px] text-muted-foreground">
                    Rest counts toward total time and adds to the burn.
                  </p>
                </section>

                {/* 4. Duration — derived, overridable */}
                <section className="space-y-2">
                  <Label className="flex items-center justify-between text-xs font-bold uppercase text-muted-foreground">
                    <span>Total workout time</span>
                    {durationOverride != null && (
                      <button
                        onClick={() => setDurationOverride(null)}
                        className="text-[10px] font-bold text-accent"
                      >
                        Reset
                      </button>
                    )}
                  </Label>
                  <div className="relative">
                    <Input
                      type="number"
                      inputMode="decimal"
                      aria-label="Total workout time in minutes"
                      value={durationOverride ?? (autoMinutes ? autoMinutes.toFixed(1) : "")}
                      onChange={(e) => setDurationOverride(e.target.value)}
                      className="h-12 bg-background/50 pr-20 text-center text-lg font-bold"
                    />
                    <span className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                      min
                    </span>
                    <Pencil className="pointer-events-none absolute right-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </section>

                {/* 5. Heart rate */}
                <section className="space-y-2">
                  <button
                    onClick={() => setShowHr(!showHr)}
                    className="flex w-full items-center justify-between rounded-2xl border border-border/50 bg-muted/20 px-4 py-3"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <Heart className="h-4 w-4 text-muted-foreground" /> Improve accuracy
                    </span>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showHr ? "rotate-180" : ""}`} />
                  </button>
                  {showHr && (
                    <div className="space-y-2 rounded-2xl border border-border/50 bg-muted/10 p-4">
                      <Label className="text-xs font-bold uppercase text-muted-foreground">
                        Average BPM
                      </Label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={bpm}
                        onChange={(e) => setBpm(e.target.value)}
                        placeholder="e.g. 130"
                        className="h-12 bg-background/50 text-center font-semibold"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Have a monitor? Enter your average HR for a tighter estimate.
                        Otherwise we'll use the MET formula.
                      </p>
                    </div>
                  )}
                </section>
              </>
            )}
          </TabsContent>

          {/* ── HISTORY ── */}
          <TabsContent value="history" className="space-y-2 pt-4">
            {history.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Nothing saved yet. Calculate a session and tap Save.
              </p>
            ) : (
              <>
                <button
                  onClick={() => { setHistory([]); if (user) writeHistory(user.id, []); }}
                  className="mb-1 ml-auto block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
                >
                  Clear all
                </button>
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-border/50 bg-muted/20 p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{h.exercise}</p>
                      <p className="text-xs text-muted-foreground">
                        {h.sets.length} {h.sets.length === 1 ? "set" : "sets"} ·{" "}
                        {h.sets.reduce((t, s) => t + (s.reps || 0), 0) || "—"} reps ·{" "}
                        {h.rest_sec}s rest · {h.duration_min} min
                      </p>
                      <p className="mt-1 text-sm font-bold text-accent">
                        {h.low} – {h.high} kcal
                      </p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {h.chip} · {new Date(h.at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => removeEntry(h.id)}
                      aria-label={`Delete ${h.exercise} calculation`}
                      className="shrink-0 p-1 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Result — sticky, live */}
      {range && result && (
        <div className="fixed bottom-16 left-0 right-0 z-40 border-t border-border bg-background/95 pb-safe backdrop-blur-xl md:bottom-0">
          <div className="mx-auto max-w-md space-y-3 px-4 py-3">
            <div aria-live="polite">
              <p className="font-display text-2xl font-bold tracking-tight">
                {range.low} – {range.high}
                <span className="ml-1.5 text-sm font-semibold text-muted-foreground">kcal</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                {Math.round(bodyWeight)} kg · {durationMin.toFixed(0)} min ·{" "}
                {session?.met.toFixed(1)} MET · {restSec}s rest
                {session?.mean_load_kg != null && ` · ${session.tier}`}
              </p>
            </div>

            {/* Active vs rest split */}
            <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="bg-accent"
                style={{ width: `${durationMin > 0 ? (activeMin / durationMin) * 100 : 0}%` }}
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {chip}
              </span>
              <Button
                onClick={save}
                variant="outline"
                className="ml-auto h-10 rounded-xl text-xs font-bold"
              >
                {justSaved ? "Saved" : "Save to history"}
              </Button>
              <Button
                onClick={() => navigate({ to: "/workout" })}
                className="h-10 rounded-xl text-xs font-bold"
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
