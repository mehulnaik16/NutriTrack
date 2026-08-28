import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { WorkoutGate } from "@/components/WorkoutGate";
import { useGatedWorkoutPrefs } from "@/hooks/useWorkoutPrefsGate";
import { useEffect, useState, useMemo } from "react";
import { CardioPaceChart } from "@/components/CardioPaceChart";
import {
  LineChart as RechartsLineChart,
  Line,
  ResponsiveContainer,
  YAxis,
  XAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Flame,
  Dumbbell,
  Activity,
  User,
  Heart,
  Play,
  ChevronLeft,
  Calendar as CalendarIcon,
  X,
  Plus,
  RotateCcw,
  LineChart,
  ChevronRight,
  Search,
  Sparkles,
  Trash2,
  ChevronDown,
  PencilRuler,
  Info,
} from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { CustomPlanTable } from "@/components/CustomPlanTable";
import {
  ScrollableDayRow,
} from "@/components/CustomPlanDayPicker";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

type WorkoutTab = "GYM" | "HOME" | "CARDIO";

interface WorkoutSearch {
  tab?: WorkoutTab;
  muscle?: string;
  subcat?: string;
  exercise?: string;
  homeRoutine?: string;
  cardio?: string;
}

export const Route = createFileRoute("/workout")({
  component: GatedWorkoutPage,
  validateSearch: (s: Record<string, unknown>): WorkoutSearch => ({
    tab: s.tab === "GYM" || s.tab === "HOME" || s.tab === "CARDIO" ? s.tab : undefined,
    muscle: typeof s.muscle === "string" ? s.muscle : undefined,
    subcat: typeof s.subcat === "string" ? s.subcat : undefined,
    exercise: typeof s.exercise === "string" ? s.exercise : undefined,
    homeRoutine: typeof s.homeRoutine === "string" ? s.homeRoutine : undefined,
    cardio: typeof s.cardio === "string" ? s.cardio : undefined,
  }),
});

import { searchYouTube } from "@/lib/youtube";
import {
  EXERCISES_DB,
  MUSCLE_SUBCATEGORIES,
  COMPOUND_EXERCISES,
} from "@/lib/exercises";
import { HOME_WORKOUTS } from "@/lib/homeWorkouts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { todayLocal } from "@/lib/dates";
import { exerciseKind } from "@/lib/exerciseKind";
import {
  estimate1RM,
  formatDuration,
  formatSet,
  parseDuration,
  setsOf as readSets,
  setWeightIn,
  summarizeSets,
  type LoggedSet,
} from "@/lib/workoutSets";
import { convWeight, kgToWeight, convDist, round1 } from "@/lib/units";
import {
  type WorkoutPrefs as UserWorkoutPrefs,
  defaultLiftForExercise,
  isRecommendedCardio,
} from "@/lib/workoutPrefs";
import {
  type StandardMuscle,
  isCustomPlan,
  activeMuscles,
  isRestDay,
  cycleDayIndex,
  gridIdsForMuscles,
  updatePlanDay,
} from "@/lib/musclePlan";
import { MuscleIcon } from "@/components/MuscleIcon";

// ── AI Workout Plan types ─────────────────────────────────────
interface PlanExercise {
  name: string;
  sets: number;
  reps: string;
}
interface PlanDay {
  day: string;
  name: string;
  focus: string;
  exercises: PlanExercise[];
  muscles?: string[]; // present on custom (table) plans
}
interface WorkoutPlan {
  goal: string;
  days_per_week: number;
  days: PlanDay[];
  type?: string; // "custom" for table plans
}

/** Which plan day is "today"? Rotate the split across the week. */
function todaysPlanIndex(daysCount: number): number {
  if (daysCount <= 0) return 0;
  const weekday = (new Date().getDay() + 6) % 7; // Mon = 0
  return weekday % daysCount;
}

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

const CARDIO_ACTIVITIES = [
  "Treadmill running",
  "Outdoor run",
  "Outdoor walk",
  "Cycling",
  "Swimming",
  "Jump rope",
  "HIIT",
  "Yoga & Pilates",
  "Stair climbing",
  "Elliptical",
  "Rowing machine",
  "SkiErg",
  "Dancing",
  "Badminton",
  "Cricket",
  "Football",
];

/**
 * MET values from the Compendium of Physical Activities.
 * kcal = MET × body weight (kg) × duration (hours)
 */
const CARDIO_METS: Record<string, number> = {
  "Treadmill running": 8.3,
  "Outdoor run": 9.8,
  "Outdoor walk": 3.8,
  Cycling: 7.5,
  Swimming: 7.0,
  "Jump rope": 11.8,
  HIIT: 8.0,
  "Yoga & Pilates": 3.0,
  "Stair climbing": 8.0,
  Elliptical: 5.0,
  "Rowing machine": 7.0,
  SkiErg: 8.0,
  Dancing: 5.5,
  Badminton: 5.5,
  Cricket: 4.8,
  Football: 7.0,
};

const estimateCardioKcal = (
  activity: string | null,
  minutes: number,
  weightKg: number,
): number => {
  const met = (activity && CARDIO_METS[activity]) || 6.0;
  return Math.round(met * weightKg * (minutes / 60));
};

/** RPE 1-10 → colour band. Purely cosmetic; an unset RPE keeps the default. */
const rpeColor = (rpe?: number) => {
  if (!rpe) return "";
  if (rpe <= 3) return "text-green-500";
  if (rpe <= 6) return "text-yellow-500";
  if (rpe <= 8) return "text-orange-500";
  return "text-red-500";
};

/**
 * Gated: the whole page is tuned by the questionnaire — recommended cardio,
 * default lift weights, the plan itself — so it stays locked until it exists.
 */
function GatedWorkoutPage() {
  return (
    <WorkoutGate>
      <WorkoutPage />
    </WorkoutGate>
  );
}

function WorkoutPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const routeNavigate = Route.useNavigate();
  const router = useRouter();
  const search = Route.useSearch();

  // Drill-down state lives in the URL so the hardware back button and swipe-
  // back gesture retrace it correctly: each level is a real history entry.
  const activeTab = search.tab ?? "GYM";
  const selectedMuscle = search.muscle ?? null;
  const selectedSubcat = search.subcat ?? null;
  const selectedExercise = search.exercise ?? null;
  const selectedHomeRoutine = search.homeRoutine ?? null;
  const selectedCardio = search.cardio ?? null;

  // Setting a value pushes a new history entry (drilling in); clearing one
  // (passing null) pops the existing entry instead of pushing a fresh one,
  // so this always matches what the hardware back button would do.
  const setActiveTab = (tab: WorkoutTab) => routeNavigate({ search: () => ({ tab }) });
  const setSelectedMuscle = (v: string | null) =>
    v === null ? router.history.back() : routeNavigate({ search: (prev) => ({ tab: prev.tab, muscle: v }) });
  const setSelectedSubcat = (v: string | null) =>
    v === null ? router.history.back() : routeNavigate({ search: (prev) => ({ ...prev, subcat: v, exercise: undefined }) });
  const setSelectedExercise = (v: string | null) =>
    v === null ? router.history.back() : routeNavigate({ search: (prev) => ({ ...prev, exercise: v }) });
  const setSelectedHomeRoutine = (v: string | null) =>
    v === null ? router.history.back() : routeNavigate({ search: (prev) => ({ tab: prev.tab, homeRoutine: v }) });
  const setSelectedCardio = (v: string | null) =>
    v === null ? router.history.back() : routeNavigate({ search: (prev) => ({ tab: prev.tab, cardio: v }) });

  // The onboarding flow can hand off a starting tab (library / builder).
  // Read in an effect — sessionStorage doesn't exist during server render.
  // Uses replace: this is a system-seeded default, not a step the user took.
  useEffect(() => {
    const t = sessionStorage.getItem("workout_initial_tab");
    sessionStorage.removeItem("workout_initial_tab");
    if (t === "HOME" || t === "CARDIO") {
      routeNavigate({ search: (prev) => ({ ...prev, tab: t }), replace: true });
    }
  }, []);

  // DB States
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentExercises, setRecentExercises] = useState<string[]>([]);
  const [loggedToday, setLoggedToday] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // AI Plan state
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [planDayIdx, setPlanDayIdx] = useState(0);
  const [planExpanded, setPlanExpanded] = useState(false);
  const [customTableOpen, setCustomTableOpen] = useState(false);
  // Which custom-plan day the user has marked "current" — persisted, so it
  // survives missed days instead of snapping back to the calendar weekday.
  const [customDayIdx, setCustomDayIdx] = useState(0);
  // The date customDayIdx was set on. Index = phase, anchor = clock; together
  // they make the plan a self-advancing cycle (see cycleDayIndex).
  const [customDayAnchor, setCustomDayAnchor] = useState<string | null>(null);

  // Body weight for MET-based calorie estimates
  const [bodyWeight, setBodyWeight] = useState(70);

  // Onboarding preferences (default lift weights, cardio recommendations).
  // WorkoutGate has already loaded and validated these — reading them from it
  // avoids a second identical query on every mount, and guarantees the page
  // never renders a "no preferences" state the gate has already ruled out.
  const prefs = useGatedWorkoutPrefs() as UserWorkoutPrefs | null;

  // Collect all exercises flattened for searching
  const allExercises = useMemo(() => {
    const all: string[] = [];
    Object.values(EXERCISES_DB).forEach(list => all.push(...list));
    return Array.from(new Set(all));
  }, []);

  // Exercises in the user's active plan — pinned to the top of every muscle-group
  // list as "recommended" (matched case-insensitively to tolerate name casing).
  const planExercises = useMemo(
    () =>
      new Set(
        (plan?.days ?? []).flatMap(
          (d) => d.exercises?.map((e) => e.name.toLowerCase()) ?? [],
        ),
      ),
    [plan],
  );

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login", replace: true });
      return;
    }
    loadUserData();
  }, [user, loading, navigate]);

  const loadUserData = async () => {
    if (!user) return;
    const favs = JSON.parse(localStorage.getItem("workout_favorites") || "[]");
    setFavorites(favs);

    // Load today's logs to show what was logged
    const today = todayLocal();
    const { data } = await supabase
      .from("workout_logs")
      .select("workout_name")
      .eq("user_id", user.id)
      .eq("date", today);
    if (data) {
      setLoggedToday(data.map((d) => d.workout_name));
    }

    // Load recent logs to order non-favorite exercises
    const { data: recentLogs } = await supabase
      .from("workout_logs")
      .select("workout_name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (recentLogs) {
      const uniqueRecent = Array.from(new Set(recentLogs.map((d) => d.workout_name)));
      setRecentExercises(uniqueRecent);
    }

    // Body weight (for calorie estimates)
    const { data: prof } = await supabase
      .from("user_profiles")
      .select("weight_kg")
      .eq("id", user.id)
      .maybeSingle();
    if (prof?.weight_kg) setBodyWeight(prof.weight_kg);

    // Load latest AI/custom plan (custom_plan_day_idx lives on this row —
    // it's progress through THIS plan, so it travels with the plan, not the user)
    const { data: wp } = await supabase
      .from("workout_plans")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (wp?.plan_json) {
      const p = wp.plan_json as unknown as WorkoutPlan;
      setPlan(p);
      setPlanId(wp.id);
      setPlanDayIdx(todaysPlanIndex(p.days?.length ?? 0));
      setCustomDayIdx((wp as any).custom_plan_day_idx ?? 0);
      setCustomDayAnchor((wp as any).custom_plan_day_anchor ?? null);
    } else {
      setPlan(null);
      setPlanId(null);
    }
  };

  const deletePlan = async () => {
    if (!planId) return;
    const { error } = await supabase
      .from("workout_plans")
      .delete()
      .eq("id", planId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPlan(null);
    setPlanId(null);
    toast.success("Plan removed");
    // No redirect — the user stays on /workout. Once workout_profile
    // exists, the empty state already shows a "Create a custom weekly
    // plan" card (renderPlanCard's `prefs`-gated branch) as an explicit
    // next action, so an automatic jump here would just be a second,
    // unwanted deviation.
  };

  /**
   * Re-phase the cycle: the picked day becomes today, anchored to today's
   * date so it rolls forward from here. Only called from the explicit confirm
   * control — tapping a pill alone stages the choice, it never writes.
   */
  const confirmCustomDay = async (i: number) => {
    if (!planId) return false;
    const anchor = todayLocal();
    const { error } = await supabase
      .from("workout_plans")
      .update({ custom_plan_day_idx: i, custom_plan_day_anchor: anchor } as any)
      .eq("id", planId);
    if (error) {
      toast.error(error.message);
      return false;
    }
    // State updates only after the write lands — the old version set state
    // first and left the UI showing a day the database had rejected.
    setCustomDayIdx(i);
    setCustomDayAnchor(anchor);
    toast.success("Day updated");
    return true;
  };

  /** Patch one day's muscles in place — no need to delete/rebuild the whole plan. */
  const saveCustomDay = async (dayIdx: number, muscles: StandardMuscle[]) => {
    if (!plan || !planId || !isCustomPlan(plan)) return;
    const updated = updatePlanDay(plan, dayIdx, muscles);
    const { error } = await supabase
      .from("workout_plans")
      .update({ plan_json: updated as any })
      .eq("id", planId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPlan(updated);
    toast.success(`Day ${dayIdx + 1} updated`);
  };

  const toggleFavorite = (exercise: string) => {
    const isFav = favorites.includes(exercise);
    let newFavs;
    if (isFav) {
      newFavs = favorites.filter((f) => f !== exercise);
    } else {
      newFavs = [...favorites, exercise];
    }
    setFavorites(newFavs);
    localStorage.setItem("workout_favorites", JSON.stringify(newFavs));
  };

  // --- UI Components ---

  const renderPlanCard = () => {
    if (!plan) {
      // WorkoutGate guarantees a workout_profile exists by the time this page
      // renders, so the old "Set up my training" branch here is unreachable and
      // has been removed. Editing those answers lives on Profile → Workout
      // details; this page only offers building a new custom weekly plan.
      return (
        <button
          onClick={() => navigate({ to: "/choose-plan" })}
          className="card-lift group flex w-full items-center gap-2.5 rounded-xl border border-accent/30 bg-card px-4 py-3 text-left"
        >
          <PencilRuler className="h-4 w-4 shrink-0 text-accent" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            Choose your workout plan
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-accent" />
        </button>
      );
    }

    // ── Custom (table) plan ──
    if (isCustomPlan(plan)) {
      // The cycle: the user's chosen day, rolled forward by the days elapsed
      // since they chose it. Never consults the weekday — Day 1 is wherever
      // the user started, not Monday.
      const todayIdx = cycleDayIndex(
        customDayIdx,
        customDayAnchor,
        todayLocal(),
        plan.days.length,
      );
      const todayDay = plan.days[todayIdx];
      const todayRest = isRestDay(todayDay);
      const todayMuscles = activeMuscles(todayDay);

      return (
        <div className="overflow-hidden rounded-2xl border border-accent/25 bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 bg-accent/5 px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <PencilRuler className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-bold uppercase tracking-wider">
                  My Custom Plan
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {plan.days_per_week} training day
                  {plan.days_per_week === 1 ? "" : "s"}/week
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-accent"
                title="Edit my plan"
                onClick={() => navigate({ to: "/custom-plan-edit" })}
              >
                <PencilRuler className="h-4 w-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title="Delete plan"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete custom plan?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete your custom workout plan. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={deletePlan}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <div className="px-5 py-4 space-y-0">
            {/* Today summary + toggle on same row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">
                  Today:
                </span>
                {todayRest ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                    <MuscleIcon muscle="Rest Day" className="h-4 w-4" /> Rest Day — recover well
                  </span>
                ) : (
                  todayMuscles.map((m) => (
                    <span
                      key={m}
                      className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-foreground glow-accent-sm"
                    >
                      <MuscleIcon muscle={m} className="h-4 w-4" /> {m}
                    </span>
                  ))
                )}
              </div>
              <button
                onClick={() => setCustomTableOpen((p) => !p)}
                aria-label={customTableOpen ? "Hide my custom plan" : "Show my custom plan"}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted/20 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-300 ${customTableOpen ? "rotate-180" : ""}`}
                />
              </button>
            </div>

            {/* Dynamic-column table */}
            {customTableOpen && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300 pt-4">
                <CustomPlanTable
                  plan={plan}
                  todayIdx={todayIdx}
                  onSaveDay={saveCustomDay}
                />
              </div>
            )}
          </div>
        </div>
      );
    }

    const todayIdx = todaysPlanIndex(plan.days.length);
    const day = plan.days[planDayIdx] ?? plan.days[0];

    return (
      <div className="overflow-hidden rounded-2xl border border-accent/25 bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border/60 bg-accent/5 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <Flame className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold uppercase tracking-wider">
                My Plan
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {plan.goal} · {plan.days_per_week} days/week
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-accent"
              title="Redo setup & regenerate plan"
              onClick={() => navigate({ to: "/workout-setup" })}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  title="Delete plan"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete plan?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete your workout plan. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={deletePlan}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {/* Day selector */}
          <ScrollableDayRow activeIdx={planDayIdx}>
            {plan.days.map((d, i) => (
              <button
                key={i}
                onClick={() => setPlanDayIdx(i)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${i === planDayIdx
                    ? "bg-accent text-accent-foreground glow-accent-sm"
                    : i === todayIdx
                      ? "border border-accent/50 text-accent"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
              >
                {d.day}
                {i === todayIdx && " · Today"}
              </button>
            ))}
          </ScrollableDayRow>

          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-bold">{day?.name}</p>
              <p className="truncate text-sm text-muted-foreground">{day?.focus}</p>
            </div>
            <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-accent">
              {day?.exercises?.length ?? 0} exercises
            </span>
          </div>

          <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
            {(planExpanded ? day?.exercises : day?.exercises?.slice(0, 4))?.map(
              (ex, i) => {
                const isLogged = loggedToday.includes(ex.name);
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedExercise(ex.name)}
                    className="group flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/20"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${isLogged
                            ? "bg-accent text-accent-foreground"
                            : "bg-muted text-muted-foreground"
                          }`}
                      >
                        {isLogged ? "✓" : i + 1}
                      </span>
                      <span className="truncate text-sm font-semibold transition-colors group-hover:text-accent">
                        {ex.name}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-muted-foreground">
                      {ex.sets} × {ex.reps}
                    </span>
                  </button>
                );
              },
            )}
          </div>

          {(day?.exercises?.length ?? 0) > 4 && (
            <button
              onClick={() => setPlanExpanded((p) => !p)}
              className="w-full text-center text-xs font-bold uppercase tracking-wider text-accent hover:underline"
            >
              {planExpanded
                ? "Show less"
                : `Show all ${day?.exercises.length} exercises`}
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderMuscleGrid = () => {
    const searchResults = searchQuery
      ? allExercises.filter(ex => ex.toLowerCase().includes(searchQuery.toLowerCase()))
      : [];

    // Auto-highlight today's targets when a custom plan is active
    const todayGridIds: Set<string> =
      plan && isCustomPlan(plan)
        ? gridIdsForMuscles(
          activeMuscles(
            plan.days[
              cycleDayIndex(
                customDayIdx,
                customDayAnchor,
                todayLocal(),
                plan.days.length,
              )
            ],
          ) as StandardMuscle[],
        )
        : new Set<string>();

    if (searchQuery) {
      searchResults.sort((a, b) => {
        // 0. Recommended (in the active plan)
        const aPlanned = planExercises.has(a.toLowerCase());
        const bPlanned = planExercises.has(b.toLowerCase());
        if (aPlanned && !bPlanned) return -1;
        if (!aPlanned && bPlanned) return 1;

        // 1. Favorites
        const aFav = favorites.includes(a);
        const bFav = favorites.includes(b);
        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;

        // 2. Logged Today
        const aLogged = loggedToday.includes(a);
        const bLogged = loggedToday.includes(b);
        if (aLogged && !bLogged) return -1;
        if (!aLogged && bLogged) return 1;

        // 3. Recently used
        const aRecentIdx = recentExercises.indexOf(a);
        const bRecentIdx = recentExercises.indexOf(b);
        const aRecent = aRecentIdx !== -1;
        const bRecent = bRecentIdx !== -1;

        if (aRecent && !bRecent) return -1;
        if (!aRecent && bRecent) return 1;
        if (aRecent && bRecent) return aRecentIdx - bRecentIdx;

        // 4. Alphabetical
        return a.localeCompare(b);
      });
    }

    return (
      <div className="space-y-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground z-10" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search all exercises..."
            className="pl-10 h-14 text-md bg-card/50 backdrop-blur-sm border-border/50 shadow-sm rounded-2xl transition-all focus-visible:ring-accent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-foreground bg-muted/50 rounded-full transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {searchQuery ? (
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden divide-y divide-border/50 animate-in fade-in slide-in-from-bottom-2">
            {searchResults.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
                <Dumbbell className="h-10 w-10 mb-3 opacity-20" />
                <p className="font-medium text-sm">No exercises found.</p>
                <p className="text-xs opacity-60">Try checking spelling or using a different term.</p>
              </div>
            ) : (
              searchResults.map((ex, i) => {
                const isFav = favorites.includes(ex);
                const isLogged = loggedToday.includes(ex);
                return (
                  <div
                    key={ex}
                    className="flex items-center justify-between p-4 transition-colors hover:bg-muted/10 cursor-pointer group"
                    onClick={() => setSelectedExercise(ex)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-sm group-hover:text-accent transition-colors">{ex}</span>
                      {isLogged && (
                        <span className="text-[9px] uppercase font-bold bg-accent/10 text-accent px-1.5 py-0.5 rounded">
                          Logged
                        </span>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(ex);
                      }}
                      className="p-2 -mr-2 transition-transform hover:scale-110 active:scale-90"
                    >
                      <Heart
                        className={`h-4 w-4 ${isFav ? "fill-red-500 text-red-500" : "text-muted-foreground hover:text-red-400"}`}
                      />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 animate-in fade-in">
            {MUSCLES.map((m) => {
              const isTodayTarget = todayGridIds.has(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelectedMuscle(m.id);
                    window.scrollTo(0, 0);
                  }}
                  className={`flex flex-col overflow-hidden rounded-2xl active:scale-95 transition-transform duration-150 ${
                    isTodayTarget ? "ring-2 ring-accent" : ""
                  }`}
                >
                  <div className="relative w-full">
                    <img
                      src={m.img}
                      alt={m.name}
                      className="w-full h-auto block"
                      loading="lazy"
                    />
                    {isTodayTarget && (
                      <span className="absolute top-2 left-2 rounded-full bg-accent px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-accent-foreground shadow">
                        Today
                      </span>
                    )}
                  </div>
                  <span className="w-full py-1.5 text-center text-[14.5px] font-semibold tracking-wide text-foreground" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                    {m.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderHomeWorkouts = () => {
    return (
      <div className="space-y-6 pb-20">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground z-10" />
          <Input
            placeholder="Search home routines..."
            className="pl-10 h-14 text-md bg-card/50 backdrop-blur-sm border-border/50 shadow-sm rounded-2xl transition-all focus-visible:ring-accent"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 animate-in fade-in">
          {HOME_WORKOUTS.map((routine) => (
            <button
              key={routine.name}
              onClick={() => setSelectedHomeRoutine(routine.name)}
              className="flex flex-col items-center justify-center p-4 rounded-2xl bg-accent text-accent-foreground border border-border/50 shadow-sm transition-transform active:scale-95 hover:shadow-md h-32"
            >
              <Flame className="h-8 w-8 opacity-80 drop-shadow-sm mb-2" />
              <span className="font-black text-sm drop-shadow-md text-center leading-tight">{routine.name}</span>
              <span className="text-[11px] font-bold opacity-70 mt-2 uppercase tracking-widest">{routine.exercises.length} Exercises</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderHomeRoutineDetail = () => {
    const routine = HOME_WORKOUTS.find(r => r.name === selectedHomeRoutine);
    if (!routine) return null;

    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-right-4 pb-20">
        <div className="flex items-center justify-between bg-card p-4 rounded-2xl border border-border shadow-sm sticky top-0 z-10 backdrop-blur-xl">
          <button
            onClick={() => setSelectedHomeRoutine(null)}
            className="p-2 -ml-2 rounded-xl hover:bg-muted/50 transition-colors"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <span className="font-black text-lg tracking-widest uppercase">{routine.name}</span>
          <div className="w-10"></div>
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden divide-y divide-border/50">
          {routine.exercises.map((ex, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-4 transition-colors hover:bg-muted/10"
            >
              <span className="font-semibold text-sm">{ex.name}</span>
              <span className="text-xs font-bold bg-accent/10 text-accent px-2 py-1 rounded">
                {ex.sets}
              </span>
            </div>
          ))}
        </div>

        <Button
          onClick={() => setSelectedExercise(routine.name)}
          className="w-full mt-4 font-bold h-14 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg shadow-accent/20 transition-all hover:-translate-y-1">
          <Play className="mr-2 h-5 w-5" /> Start Routine
        </Button>
      </div>
    );
  };

  const renderCardioList = () => {
    // Preferred activities from onboarding float to the top with a badge
    const sorted = [...CARDIO_ACTIVITIES].sort((a, b) => {
      const ra = isRecommendedCardio(a, prefs) ? 0 : 1;
      const rb = isRecommendedCardio(b, prefs) ? 0 : 1;
      return ra - rb;
    });
    return (
      <div className="space-y-3">
        {sorted.map((act) => {
          const recommended = isRecommendedCardio(act, prefs);
          return (
            <button
              key={act}
              onClick={() => setSelectedCardio(act)}
              className={`w-full flex items-center justify-between p-4 rounded-xl bg-card border shadow-sm transition-colors ${recommended
                  ? "border-accent/50 bg-accent/5 hover:border-accent"
                  : "border-border hover:border-accent/50"
                }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <Activity className={`h-5 w-5 shrink-0 ${recommended ? "text-accent" : "text-muted-foreground"}`} />
                <span className="truncate font-semibold">{act}</span>
                {recommended && (
                  <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent-foreground">
                    Recommended
                  </span>
                )}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          );
        })}
        <div className="p-4 mt-6 rounded-xl bg-muted/20 border border-dashed border-border/50 flex flex-col items-center text-center">
          <p className="text-sm font-medium mb-1">Other Activity?</p>
          <p className="text-xs text-muted-foreground">
            Log custom cardio duration to track your burned calories.
          </p>
        </div>
      </div>
    );
  };

  const renderMuscleDetail = () => {
    if (!selectedMuscle) return null;
    const muscleInfo = MUSCLES.find((m) => m.id === selectedMuscle);

    // Parent categories (Legs, Back) show sub-category pills;
    // the exercise lists are references into EXERCISES_DB — never copies.
    const subcats = MUSCLE_SUBCATEGORIES[selectedMuscle];
    const activeSubcat = subcats
      ? (subcats.find((s) => s.label === selectedSubcat) ?? subcats[0])
      : null;
    const exercises = activeSubcat
      ? activeSubcat.names
      : selectedMuscle === "compound"
        ? COMPOUND_EXERCISES
        : EXERCISES_DB[selectedMuscle] || [];

    // Sort: favorites first, then logged today, then recent, then alphabetical
    const sorted = [...exercises].sort((a, b) => {
      // 0. Recommended (in the active plan)
      const aPlanned = planExercises.has(a.toLowerCase());
      const bPlanned = planExercises.has(b.toLowerCase());
      if (aPlanned && !bPlanned) return -1;
      if (!aPlanned && bPlanned) return 1;

      // 1. Favorites
      const aFav = favorites.includes(a);
      const bFav = favorites.includes(b);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;

      // 2. Logged Today
      const aLogged = loggedToday.includes(a);
      const bLogged = loggedToday.includes(b);
      if (aLogged && !bLogged) return -1;
      if (!aLogged && bLogged) return 1;

      // 3. Recently used
      const aRecentIdx = recentExercises.indexOf(a);
      const bRecentIdx = recentExercises.indexOf(b);
      const aRecent = aRecentIdx !== -1;
      const bRecent = bRecentIdx !== -1;

      if (aRecent && !bRecent) return -1;
      if (!aRecent && bRecent) return 1;
      if (aRecent && bRecent) return aRecentIdx - bRecentIdx;

      // 4. Alphabetical
      return a.localeCompare(b);
    });

    return (
      <div className="space-y-4 animate-in slide-in-from-right-4">
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.history.back()}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-black uppercase tracking-widest text-accent flex items-center gap-2">
            <Dumbbell className="h-5 w-5" />
            {muscleInfo?.name}
          </h2>
          <div className="w-9" /> {/* Spacer */}
        </div>

        {/* Sub-category pills (Legs / Back parent pages) */}
        {subcats && (
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {subcats.map((s) => {
              const active = s.label === activeSubcat?.label;
              return (
                <button
                  key={s.label}
                  onClick={() => setSelectedSubcat(s.label)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all duration-200 ${active
                      ? "bg-accent text-accent-foreground glow-accent-sm"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        )}

        <div
          key={activeSubcat?.label ?? selectedMuscle}
          className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden divide-y divide-border/50 animate-in fade-in duration-200">
          {sorted.map((ex, i) => {
            const isFav = favorites.includes(ex);
            const isLogged = loggedToday.includes(ex);
            const isPlanned = planExercises.has(ex.toLowerCase());
            return (
              <div
                key={ex}
                className="flex items-center justify-between p-4 transition-colors hover:bg-muted/10 cursor-pointer group"
                onClick={() => setSelectedExercise(ex)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground/50 w-4">
                    {i + 1}.
                  </span>
                  <span className="font-semibold text-sm group-hover:text-accent transition-colors">{ex}</span>
                  {isPlanned && !isLogged && (
                    <span className="text-[9px] uppercase font-bold bg-accent text-accent-foreground px-1.5 py-0.5 rounded">
                      In plan
                    </span>
                  )}
                  {isLogged && (
                    <span className="text-[9px] uppercase font-bold bg-accent/10 text-accent px-1.5 py-0.5 rounded">
                      Logged
                    </span>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(ex);
                  }}
                  className="p-2 -mr-2 transition-transform hover:scale-110 active:scale-90"
                >
                  <Heart
                    className={`h-4 w-4 ${isFav ? "fill-red-500 text-red-500" : "text-muted-foreground hover:text-red-400"}`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // --- Render Modals ---

  const CardioModal = () => {
    const distanceUnit = prefs?.distanceUnit ?? "km";
    const origDistanceUnit = prefs?.origDistanceUnit ?? "km";
    const [duration, setDuration] = useState("30");
    const [kcal, setKcal] = useState(() =>
      String(estimateCardioKcal(selectedCardio, 30, bodyWeight)),
    );
    const [kcalTouched, setKcalTouched] = useState(false);
    const [bpm, setBpm] = useState("");
    const [distance, setDistance] = useState("");
    const [history, setHistory] = useState<any[]>([]);

    const fetchHistory = () => {
      if (!selectedCardio || !user) return;
      supabase
        .from("workout_logs")
        .select("id, date, logged_at, duration_min, calories_burned, exercises_done")
        .eq("user_id", user.id)
        .eq("workout_name", selectedCardio)
        .order("date", { ascending: false })
        .order("logged_at", { ascending: false })
        .then(({ data }) => {
          setHistory(data || []);
        });
    };

    useEffect(() => {
      fetchHistory();
    }, [selectedCardio, user]);

    const handleDeleteHistory = async (logId: string) => {
      const t = toast.loading("Deleting log...");
      const { error } = await supabase.from("workout_logs").delete().eq("id", logId);
      if (error) {
        toast.error(`Failed to delete: ${error.message}`, { id: t });
      } else {
        toast.success("Log deleted", { id: t });
        fetchHistory();
        loadUserData();
      }
    };

    const met = (selectedCardio && CARDIO_METS[selectedCardio]) || 6.0;

    const handleDuration = (v: string) => {
      setDuration(v);
      if (!kcalTouched) {
        setKcal(
          String(estimateCardioKcal(selectedCardio, parseInt(v) || 0, bodyWeight)),
        );
      }
    };

    const handleLog = async () => {
      if (!user) return;
      const t = toast.loading("Logging cardio...");
      const { error } = await supabase.from("workout_logs").insert({
        user_id: user.id,
        date: todayLocal(),
        workout_name: selectedCardio || "",
        duration_min: parseInt(duration) || 30,
        calories_burned: parseInt(kcal) || 0,
        exercises_done: { bpm: parseInt(bpm) || null, distance: distance ? convDist(parseFloat(distance) || 0, distanceUnit, origDistanceUnit) : null },
      });
      if (error) {
        toast.error(`Failed to log: ${error.message}`, { id: t });
      } else {
        toast.success("Cardio logged!", { id: t });
        loadUserData();
        setSelectedCardio(null);
      }
    };

    const durationNum = parseInt(duration) || 0;
    const distanceNum = parseFloat(distance) || 0;
    const showPace = durationNum > 0 && distanceNum > 0;
    const paceMinPerKm = showPace ? durationNum / distanceNum : 0;
    const paceMin = Math.floor(paceMinPerKm);
    const paceSec = Math.round((paceMinPerKm - paceMin) * 60);
    const paceDisplay = paceSec === 60
      ? `${paceMin + 1}:00`
      : `${paceMin}:${String(paceSec).padStart(2, '0')}`;

    return (
      <Dialog open={!!selectedCardio} onOpenChange={() => setSelectedCardio(null)}>
        <DialogContent className="w-full h-[100dvh] max-w-none max-h-none sm:max-w-2xl sm:h-[92vh] rounded-none sm:rounded-3xl border-border/50 bg-background/98 backdrop-blur-2xl px-4 pb-4 pt-[10vh] sm:px-6 sm:pb-6 sm:pt-[8vh] overflow-y-auto flex flex-col gap-0">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase text-center tracking-widest text-accent flex items-center justify-center gap-2">
              <span>{selectedCardio}</span>
              <Heart className="h-5 w-5 text-red-500 fill-current" />
            </DialogTitle>
            {history.length > 0 && (
              <p className="text-xs text-center text-muted-foreground font-semibold mt-1">
                Last performed: {new Date(history[0].date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </DialogHeader>

          <Tabs defaultValue="log" className="w-full mt-2 max-w-full">
            <TabsList className="w-full flex overflow-x-auto no-scrollbar py-2">
              <TabsTrigger value="log" className="flex-1 whitespace-nowrap text-[11px] sm:text-sm font-bold px-2 sm:px-3 py-3"><Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1.5" /> Log</TabsTrigger>
              <TabsTrigger value="history" className="flex-1 whitespace-nowrap text-[11px] sm:text-sm font-bold px-2 sm:px-3 py-3"><LineChart className="w-3 h-3 sm:w-4 sm:h-4 mr-1.5" /> History</TabsTrigger>
              <TabsTrigger value="analytics" className="flex-1 whitespace-nowrap text-[11px] sm:text-sm font-bold px-2 sm:px-3 py-3"><Activity className="w-3 h-3 sm:w-4 sm:h-4 mr-1.5" /> Analytics</TabsTrigger>
              <TabsTrigger value="timer" className="flex-1 whitespace-nowrap text-[11px] sm:text-sm font-bold px-2 sm:px-3 py-3"><RotateCcw className="w-3 h-3 sm:w-4 sm:h-4 mr-1.5" /> Timer</TabsTrigger>
            </TabsList>

            <TabsContent value="log" className="space-y-6 pt-4">
            <div className="space-y-4 bg-muted/20 p-5 rounded-2xl border border-border/50">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">Duration (min)</Label>
                <Input
                  type="number"
                  value={duration}
                  onChange={(e) => handleDuration(e.target.value)}
                  className="text-xl font-bold h-14 bg-background/50 text-center"
                />
                <div className="flex gap-2">
                  {[15, 30, 45, 60].map((m) => (
                    <button
                      key={m}
                      onClick={() => handleDuration(String(m))}
                      className={`flex-1 rounded-lg border py-1.5 text-xs font-bold transition-colors ${parseInt(duration) === m
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="flex justify-between text-xs uppercase font-bold text-muted-foreground">
                  <span>Calories burned</span>
                  <span className="normal-case text-accent">
                    {kcalTouched ? "manual" : "auto-estimated"}
                  </span>
                </Label>
                <Input
                  type="number"
                  value={kcal}
                  onChange={(e) => {
                    setKcal(e.target.value);
                    setKcalTouched(true);
                  }}
                  className="text-xl font-bold h-14 bg-background/50 text-center"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground flex justify-between">
                  <span>Distance ({distanceUnit})</span>
                  <span className="text-muted-foreground/50">Optional</span>
                </Label>
                <Input
                  type="number"
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                  placeholder="e.g. 5.2"
                  className="h-12 bg-background/50 text-center font-semibold"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground flex justify-between">
                  <span>BPM (Heart Rate)</span>
                  <span className="text-muted-foreground/50">Optional</span>
                </Label>
                <Input
                  type="number"
                  value={bpm}
                  onChange={(e) => setBpm(e.target.value)}
                  placeholder="e.g. 120"
                  className="h-12 bg-background/50 text-center font-semibold"
                />
              </div>
            </div>
            {showPace && (
              <div className="flex items-center justify-center gap-2 text-xs font-bold text-muted-foreground">
                <span className="rounded-full bg-accent/10 px-3 py-1 text-accent">
                  Est. pace: {paceDisplay} min/{distanceUnit}
                </span>
              </div>
            )}
            <div className="flex items-center justify-center gap-2 text-xs font-bold text-muted-foreground">
              <span className="rounded-full bg-accent/10 px-3 py-1 text-accent">
                {met} METs
              </span>
              <span className="rounded-full bg-muted px-3 py-1">
                ~{Math.round(met * bodyWeight * (1 / 60))} kcal / min at {round1(kgToWeight(bodyWeight, prefs?.weightUnit ?? "kg"))} {prefs?.weightUnit ?? "kg"}
              </span>
            </div>
            <Button onClick={handleLog} className="w-full font-bold h-14 text-md rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg shadow-accent/20 transition-all hover:-translate-y-1">
              <Plus className="mr-2 h-5 w-5" /> Log Workout
            </Button>
            </TabsContent>

            <TabsContent value="history" className="space-y-4 pt-4">
              {history.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground font-semibold">
                  No history logged yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((log, idx) => {
                    const dateObj = new Date(log.date);
                    dateObj.setMinutes(dateObj.getMinutes() + dateObj.getTimezoneOffset());
                    
                    const ex = log.exercises_done || {};
                    // Stored in the original unit; show in the current unit.
                    const dist = ex.distance ? round1(convDist(parseFloat(ex.distance), origDistanceUnit, distanceUnit)) : null;
                    const logBpm = ex.bpm ? parseInt(ex.bpm) : null;
                    
                    let paceDisplay = null;
                    if (log.duration_min > 0 && dist && dist > 0) {
                      const paceMinPerKm = log.duration_min / dist;
                      const paceMin = Math.floor(paceMinPerKm);
                      const paceSec = Math.round((paceMinPerKm - paceMin) * 60);
                      paceDisplay = paceSec === 60
                        ? `${paceMin + 1}:00`
                        : `${paceMin}:${String(paceSec).padStart(2, '0')}`;
                    }

                    return (
                      <div key={log.id || idx} className="bg-muted/20 p-4 rounded-xl border border-border/50">
                        <div className="mb-2 flex flex-row items-center justify-between border-b border-border/50 pb-2">
                          <div className="flex flex-col">
                            <span className="font-bold text-accent">
                              {dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDeleteHistory(log.id)}
                              className="text-muted-foreground hover:text-destructive p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="font-semibold text-muted-foreground">Duration</span>
                            <span className="font-bold">{log.duration_min} min</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="font-semibold text-muted-foreground">Calories Burned</span>
                            <span className="font-bold">{log.calories_burned} kcal</span>
                          </div>
                          {dist !== null && (
                            <div className="flex justify-between text-sm">
                              <span className="font-semibold text-muted-foreground">Distance</span>
                              <span className="font-bold">{dist} {distanceUnit}</span>
                            </div>
                          )}
                          {logBpm !== null && (
                            <div className="flex justify-between text-sm">
                              <span className="font-semibold text-muted-foreground">BPM</span>
                              <span className="font-bold">{logBpm}</span>
                            </div>
                          )}
                          {paceDisplay !== null && (
                            <div className="flex justify-between text-sm">
                              <span className="font-semibold text-muted-foreground">Est. Pace</span>
                              <span className="font-bold">{paceDisplay} min/{distanceUnit}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="analytics" className="pt-4">
              {selectedCardio && <CardioPaceChart activityName={selectedCardio} />}
            </TabsContent>

            <TabsContent value="timer" className="pt-4">
              <div className="text-center py-12 text-muted-foreground font-semibold">
                Coming soon
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    );
  };

  const GymLogModal = () => {
    // Current display unit (editable) and the original unit the DB stores in.
    const weightUnit = prefs?.weightUnit ?? "kg";
    const origUnit = prefs?.origWeightUnit ?? "kg";
    const [sets, setSets] = useState<LoggedSet[]>([{ reps: "10", weight: "20" }]);
    const [history, setHistory] = useState<any[]>([]);
    const [videos, setVideos] = useState<any[]>([]);
    const [loadingMedia, setLoadingMedia] = useState(false);

    /* Which columns this exercise needs. Anything unclassified is "weighted",
       which is the table that existed before this feature. */
    const kind = exerciseKind(selectedExercise);
    const canAddWeight = kind === "bodyweight" || kind === "isometric";

    /* Remembered per exercise, same convention as workout_favorites. The modal
       remounts per exercise (selectedExercise drives the Dialog's open), so the
       lazy initialiser re-reads on every open. */
    const [addWeight, setAddWeight] = useState(() => {
      try {
        const raw = localStorage.getItem("workout_addweight");
        return !!(raw && JSON.parse(raw)[selectedExercise ?? ""]);
      } catch {
        return false;
      }
    });

    useEffect(() => {
      if (!selectedExercise) return;
      try {
        const raw = localStorage.getItem("workout_addweight");
        const map = raw ? JSON.parse(raw) : {};
        map[selectedExercise] = addWeight;
        localStorage.setItem("workout_addweight", JSON.stringify(map));
      } catch {
        /* private mode — the toggle just won't persist */
      }
    }, [addWeight, selectedExercise]);

    const showWeight = kind === "weighted" || kind === "assisted" || (canAddWeight && addWeight);
    const showRpe = canAddWeight;

    // Rest timer
    const [restLeft, setRestLeft] = useState(0);
    const [restTotal, setRestTotal] = useState(0);

    useEffect(() => {
      if (restLeft <= 0) return;
      const id = setInterval(() => {
        setRestLeft((s) => {
          if (s <= 1) {
            clearInterval(id);
            // Beep when rest is over
            try {
              const Ctx =
                window.AudioContext ||
                (window as any).webkitAudioContext;
              const ctx = new Ctx();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.frequency.value = 880;
              gain.gain.setValueAtTime(0.25, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
              osc.start();
              osc.stop(ctx.currentTime + 0.6);
            } catch {
              /* audio unavailable */
            }
            toast.success("Rest over — next set! 💪");
            return 0;
          }
          return s - 1;
        });
      }, 1000);
      return () => clearInterval(id);
    }, [restTotal]); // restart interval each time a new timer begins

    const startRest = (seconds: number) => {
      setRestLeft(seconds);
      setRestTotal(seconds + Math.random()); // unique value re-triggers effect
    };


    const fetchHistory = () => {
      if (!selectedExercise || !user) return;
      supabase
        .from("workout_logs")
        .select("id, date, logged_at, exercises_done")
        .eq("user_id", user.id)
        .eq("workout_name", selectedExercise)
        .order("date", { ascending: false })
        .order("logged_at", { ascending: false })
        .then(({ data }) => {
          setHistory(data || []);
          // Prefill from the last session, carrying whatever fields that kind
          // uses. Falling back per kind matters: seeding a Plank with reps
          // would leave the duration input empty.
          const prior = readSets(data?.[0]?.exercises_done);
          if (prior.length > 0) {
            // Prior sets are stored in their own unit; show them in the current unit.
            setSets(
              prior.map((s) => ({
                ...s,
                unit: undefined,
                weight:
                  s.weight != null && s.weight !== ""
                    ? String(round1(setWeightIn(s, weightUnit)))
                    : s.weight,
              })),
            );
          } else if (kind === "isometric") {
            setSets([{ duration_seconds: 30 }]);
          } else if (kind === "bodyweight") {
            setSets([{ reps: "10" }]);
          } else {
            const lift = defaultLiftForExercise(selectedExercise, prefs);
            if (lift?.weight) {
              // defaultLiftForExercise returns kg — show in the current unit.
              setSets([{ reps: String(lift.reps ?? 8), weight: String(round1(kgToWeight(lift.weight, weightUnit))) }]);
            } else {
              setSets([{ reps: "10", weight: weightUnit === "lbs" ? "45" : "20" }]);
            }
          }
        });
    };

    useEffect(() => {
      fetchHistory();
      if (selectedExercise) {
        setLoadingMedia(true);
        searchYouTube({ data: selectedExercise })
          .then((res) => {
            setVideos(res || []);
            setLoadingMedia(false);
          })
          .catch(() => setLoadingMedia(false));
      }
    }, [selectedExercise, user]);

    const handleDeleteHistory = async (logId: string) => {
      const t = toast.loading("Deleting log...");
      const { error } = await supabase.from("workout_logs").delete().eq("id", logId);
      if (error) {
        toast.error(`Failed to delete: ${error.message}`, { id: t });
      } else {
        toast.success("Log deleted", { id: t });
        fetchHistory();
        loadUserData();
      }
    };

    const handleLog = async () => {
      if (!user) return;
      const t = toast.loading("Logging exercise...");
      // Only the fields this kind actually uses are written, so readers can
      // tell a weightless bodyweight set from a 0kg one.
      const payload: LoggedSet[] = sets.map((s) => ({
        ...(kind === "isometric"
          ? { duration_seconds: s.duration_seconds ?? 0 }
          : { reps: s.reps }),
        // Store in the original unit (what the DB + graphs use); input is current unit.
        ...(showWeight && s.weight
          ? { weight: String(round1(convWeight(parseFloat(s.weight) || 0, weightUnit, origUnit))), unit: origUnit }
          : {}),
        ...(showRpe && s.rpe ? { rpe: s.rpe } : {}),
        kind,
      }));
      const holdSec = payload.reduce((total, s) => total + (s.duration_seconds ?? 0), 0);
      const { error } = await supabase.from("workout_logs").insert({
        user_id: user.id,
        date: todayLocal(),
        workout_name: selectedExercise || "",
        // Isometrics know their real duration; everything else stays a guess.
        duration_min:
          kind === "isometric" ? Math.max(1, Math.round(holdSec / 60)) : sets.length * 3,
        calories_burned: sets.length * 15,
        // LoggedSet is a closed interface, so it lacks the index signature the
        // generated Json type wants. The shape is checked above.
        exercises_done: payload as any,
      });
      if (error) {
        toast.error(`Failed to log: ${error.message}`, { id: t });
      } else {
        toast.success("Exercise logged!", { id: t });
        loadUserData();
        setSelectedExercise(null);
      }
    };

    return (
      <Dialog open={!!selectedExercise} onOpenChange={() => setSelectedExercise(null)}>
        <DialogContent className="w-full h-[100dvh] max-w-none max-h-none sm:max-w-2xl sm:h-[92vh] rounded-none sm:rounded-3xl border-border/50 bg-background/98 backdrop-blur-2xl px-4 pb-4 pt-[10vh] sm:px-6 sm:pb-6 sm:pt-[8vh] overflow-y-auto overflow-x-hidden flex flex-col gap-0">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase text-center tracking-widest text-accent">
              {selectedExercise}
            </DialogTitle>
            {history.length > 0 && (
              <p className="text-xs text-center text-muted-foreground font-semibold mt-1">
                Last performed: {new Date(history[0].date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </DialogHeader>

          <Tabs defaultValue="log" className="w-full mt-2 max-w-full">
            <TabsList className="w-full flex overflow-x-auto no-scrollbar">
              <TabsTrigger value="log" className="flex-1 whitespace-nowrap text-[11px] sm:text-sm font-bold px-2 sm:px-3"><Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1.5" /> Log</TabsTrigger>
              <TabsTrigger value="history" className="flex-1 whitespace-nowrap text-[11px] sm:text-sm font-bold px-2 sm:px-3"><LineChart className="w-3 h-3 sm:w-4 sm:h-4 mr-1.5" /> History</TabsTrigger>
              <TabsTrigger value="analytics" className="flex-1 whitespace-nowrap text-[11px] sm:text-sm font-bold px-2 sm:px-3"><Activity className="w-3 h-3 sm:w-4 sm:h-4 mr-1.5" /> Analytics</TabsTrigger>
              <TabsTrigger value="video" className="flex-1 whitespace-nowrap text-[11px] sm:text-sm font-bold px-2 sm:px-3"><Play className="w-3 h-3 sm:w-4 sm:h-4 mr-1.5" /> Tutorial</TabsTrigger>
            </TabsList>

            <TabsContent value="log" className="space-y-6 pt-4">
              {/* Bodyweight and isometric work has no load by default. The
                  toggle opts into an ADDED weight — a vest, a belt, a dumbbell. */}
              {canAddWeight && (
                <div className="-mb-1 flex items-center justify-end gap-2">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      addWeight ? "text-accent" : "text-muted-foreground"
                    }`}
                  >
                    {addWeight ? "+ Weight" : "Bodyweight"}
                  </span>
                  <button
                    role="switch"
                    aria-checked={addWeight}
                    aria-label="Add weight"
                    onClick={() => setAddWeight((v) => !v)}
                    className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors ${
                      addWeight
                        ? "justify-end bg-accent"
                        : "justify-start bg-background ring-1 ring-inset ring-border"
                    }`}
                  >
                    <span
                      className={`h-5 w-5 rounded-full shadow ${
                        addWeight ? "bg-background" : "bg-muted-foreground/60"
                      }`}
                    />
                  </button>
                </div>
              )}
              <div className="bg-muted/20 p-5 rounded-2xl border border-border/50">
                <div className="flex gap-2 items-center mb-2 px-2">
                  <div className="w-8 text-center text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Set</div>
                  <div className="flex-1 text-center text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                    {kind === "isometric" ? "Time" : "Reps"}
                  </div>
                  {showWeight && (
                    <div className="flex-1 flex flex-col justify-center">
                      <div className="text-center text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                        Weight ({weightUnit})
                      </div>
                      {/* Without this the number reads as load, when it is the
                          opposite — assistance that makes the rep easier. */}
                      {kind === "assisted" && (
                        <span className="mt-0.5 block text-center text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
                          Assist
                        </span>
                      )}
                    </div>
                  )}
                  {showRpe && (
                    <div className="w-14 inline-flex items-center justify-center gap-1 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                      RPE
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label="What is RPE?"
                            className="text-muted-foreground transition-colors hover:text-accent"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-52 p-3">
                          <p className="mb-1.5 text-[11px] font-bold normal-case tracking-normal text-foreground">
                            RPE — how hard it felt
                          </p>
                          <ul className="space-y-0.5 text-[11px] normal-case tracking-normal text-muted-foreground">
                            <li><span className="font-semibold text-foreground">1–4</span> Very Easy</li>
                            <li><span className="font-semibold text-foreground">5–6</span> Easy</li>
                            <li><span className="font-semibold text-foreground">7–8</span> Hard</li>
                            <li><span className="font-semibold text-foreground">9</span> Very Hard</li>
                            <li><span className="font-semibold text-foreground">10</span> Maximum</li>
                          </ul>
                          <p className="mt-2 border-t border-border/60 pt-2 text-[10px] normal-case font-normal tracking-normal leading-snug text-muted-foreground">
                            RPE (Rate of Perceived Exertion) rates how hard a set felt — pick the number that matches your effort.
                          </p>
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                  <div className="w-8"></div>
                </div>
                <div className="space-y-2">
                  {sets.map((s, i) => (
                    <div key={i} className="flex gap-2 items-center bg-card p-2 rounded-xl border border-border shadow-sm">
                      <div className="w-8 text-center text-sm font-black text-muted-foreground">{i + 1}.</div>
                      {kind === "isometric" ? (
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder="0:30"
                          className="flex-1 text-center text-sm font-bold h-10 border-none bg-muted/30 focus-visible:ring-1"
                          value={formatDuration(s.duration_seconds ?? 0)}
                          onChange={(e) => {
                            const n = [...sets];
                            n[i] = { ...n[i], duration_seconds: parseDuration(e.target.value) };
                            setSets(n);
                          }}
                        />
                      ) : (
                        <Input
                          type="number"
                          className="flex-1 text-center text-sm font-bold h-10 border-none bg-muted/30 focus-visible:ring-1"
                          value={s.reps ?? ""}
                          onChange={(e) => {
                            const n = [...sets];
                            n[i] = { ...n[i], reps: e.target.value };
                            setSets(n);
                          }}
                        />
                      )}
                      {showWeight && (
                        <Input
                          type="number"
                          className="flex-1 text-center text-sm font-bold h-10 border-none bg-muted/30 focus-visible:ring-1"
                          value={s.weight ?? ""}
                          onChange={(e) => {
                            const n = [...sets];
                            n[i] = { ...n[i], weight: e.target.value };
                            setSets(n);
                          }}
                        />
                      )}
                      {showRpe && (
                        <Input
                          type="number"
                          min={1}
                          max={10}
                          placeholder="–"
                          className={`w-14 text-center text-sm font-bold h-10 border-none bg-muted/30 focus-visible:ring-1 ${rpeColor(s.rpe)}`}
                          value={s.rpe ?? ""}
                          onChange={(e) => {
                            const n = [...sets];
                            const v = parseInt(e.target.value);
                            n[i] = { ...n[i], rpe: isNaN(v) ? undefined : Math.min(10, Math.max(1, v)) };
                            setSets(n);
                          }}
                        />
                      )}
                      <button
                        onClick={() => {
                          if (sets.length > 1) {
                            setSets(sets.filter((_, idx) => idx !== i));
                          } else {
                            toast.error("You must log at least 1 set.");
                          }
                        }}
                        className="text-muted-foreground hover:text-destructive p-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {kind === "isometric" && (
                  <div className="mt-2 flex gap-2">
                    {[5, 10, 30, 60].map((inc) => (
                      <button
                        key={inc}
                        onClick={() => {
                          const n = [...sets];
                          const last = n.length - 1;
                          n[last] = { ...n[last], duration_seconds: (n[last].duration_seconds ?? 0) + inc };
                          setSets(n);
                        }}
                        className="flex-1 rounded-xl border border-border py-2 text-[11px] font-bold text-muted-foreground transition-colors hover:border-accent hover:bg-accent/10 hover:text-accent"
                      >
                        +{inc < 60 ? `${inc}s` : "1m"}
                      </button>
                    ))}
                  </div>
                )}

                <Button
                  variant="outline"
                  className="w-full mt-4 text-[11px] font-bold border-dashed border-border/50 rounded-xl h-10 hover:bg-accent/10 hover:text-accent hover:border-accent/50 transition-colors"
                  onClick={() => {
                    const prev = sets[sets.length - 1];
                    setSets([
                      ...sets,
                      kind === "isometric"
                        ? { duration_seconds: prev.duration_seconds ?? 30, weight: prev.weight, rpe: prev.rpe }
                        : { reps: "10", weight: prev.weight, rpe: prev.rpe },
                    ]);
                  }}
                >
                  <Plus className="mr-2 h-3 w-3" /> Add Set
                </Button>

                {(() => {
                  // Working sets are already in the current unit; stamp it so the
                  // reader treats the numbers as-is (not as kg).
                  const summary = summarizeSets(
                    kind,
                    sets.map((s) => ({ ...s, unit: weightUnit })),
                    weightUnit,
                  );
                  return (
                    <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-accent/10 px-3 py-2 text-[11px] font-bold text-accent">
                      <LineChart className="h-3.5 w-3.5" />
                      {summary.label}: {summary.value}
                    </div>
                  );
                })()}
              </div>

              {/* ── Rest timer ── */}
              <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Rest Timer
                  </span>
                  {restLeft > 0 && (
                    <button
                      onClick={() => {
                        setRestLeft(0);
                        setRestTotal(0); // cancels the interval without the beep
                      }}
                      className="p-2 -m-2 text-[9px] font-bold uppercase text-muted-foreground hover:text-destructive"
                    >
                      Skip
                    </button>
                  )}
                </div>
                {restLeft > 0 ? (
                  <div className="space-y-2">
                    <div className="text-center font-display text-3xl font-bold text-accent">
                      {Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, "0")}
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-1000 ease-linear"
                        style={{
                          width: `${(restLeft / Math.floor(restTotal)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {[60, 90, 120, 180].map((s) => (
                      <button
                        key={s}
                        onClick={() => startRest(s)}
                        className="flex-1 rounded-xl border border-border py-2.5 text-[11px] font-bold text-muted-foreground transition-colors hover:border-accent hover:bg-accent/10 hover:text-accent"
                      >
                        {s < 120 ? `${s}s` : `${s / 60}m`}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Button onClick={handleLog} className="w-full font-bold h-14 text-sm rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg shadow-accent/20 transition-all hover:-translate-y-1">
                <Plus className="mr-2 h-5 w-5" /> Log Workout
              </Button>
            </TabsContent>

            <TabsContent value="history" className="space-y-4 pt-4">
              {history.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground font-semibold">
                  No history logged yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((log, idx) => {
                    const logSets = readSets(log.exercises_done);
                    // History list is shown in the CURRENT unit.
                    const logUnit = weightUnit;
                    const dateObj = new Date(log.date);
                    dateObj.setMinutes(dateObj.getMinutes() + dateObj.getTimezoneOffset());

                    // Volume and 1RM only mean anything when the weight is load.
                    // On an assisted machine it is the opposite, so both stay hidden.
                    const showLoadStats = kind === "weighted";
                    const rm = showLoadStats
                      ? round1(
                          logSets.reduce(
                            (b, s) => Math.max(b, estimate1RM(setWeightIn(s, weightUnit), parseInt(s.reps ?? "") || 0)),
                            0,
                          ),
                        )
                      : 0;
                    const vol = showLoadStats
                      ? round1(
                          logSets.reduce(
                            (acc, s) => acc + setWeightIn(s, weightUnit) * (parseInt(s.reps ?? "") || 0),
                            0,
                          ),
                        )
                      : 0;

                    return (
                      <div key={idx} className="bg-muted/20 p-4 rounded-xl border border-border/50">
                        <div className="mb-2 flex flex-row items-center justify-between border-b border-border/50 pb-2">
                          <div className="flex flex-col">
                            <span className="font-bold text-accent">
                              {dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            {vol > 0 && <span className="text-[10px] font-bold text-muted-foreground uppercase mt-0.5">Vol: {vol} {logUnit}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            {rm > 0 && (
                              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent">
                                e1RM {rm} {logUnit}
                              </span>
                            )}
                            <button
                              onClick={() => handleDeleteHistory(log.id)}
                              className="text-muted-foreground hover:text-destructive p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1">
                          {logSets.map((set, sIdx) => (
                            <div key={sIdx} className="flex justify-between text-sm">
                              <span className="font-semibold text-muted-foreground">Set {sIdx + 1}</span>
                              <span className="font-bold">{formatSet(set, logUnit)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="analytics" className="space-y-4 pt-4">
              {history.length < 2 ? (
                <div className="text-center py-8 text-muted-foreground font-semibold">
                  Log this exercise at least twice to see progress.
                </div>
              ) : (() => {
                // ── Compute chart data: reverse history to oldest→newest ──
                const chronological = [...history].reverse();

                /* What "progress" means depends on the exercise: heavier for a
                   barbell, more reps for a push-up, longer for a plank. */
                const isLoad = kind === "weighted";
                const repsOf = (s: LoggedSet) => parseInt(s.reps ?? "") || 0;
                // Graphs stay in the ORIGINAL unit so the axis is stable when the
                // user switches their display unit; each set is normalized to it.
                const weightOf = (s: LoggedSet) => setWeightIn(s, origUnit);

                const strengthData = chronological.map((log) => {
                  const sets = readSets(log.exercises_done);
                  const date = log.date.slice(5);
                  if (kind === "isometric")
                    return { date, best: Math.max(0, ...sets.map((s) => s.duration_seconds ?? 0)) };
                  if (!isLoad) return { date, best: Math.max(0, ...sets.map(repsOf)) };
                  return {
                    date,
                    maxWeight: Math.max(0, ...sets.map(weightOf)),
                    e1rm: sets.reduce((b, s) => Math.max(b, estimate1RM(weightOf(s), repsOf(s))), 0),
                  };
                });

                const volumeData = chronological.map((log) => {
                  const sets = readSets(log.exercises_done);
                  const date = log.date.slice(5);
                  if (kind === "isometric")
                    return { date, volume: sets.reduce((v, s) => v + (s.duration_seconds ?? 0), 0) };
                  if (!isLoad) return { date, volume: sets.reduce((v, s) => v + repsOf(s), 0) };
                  return { date, volume: sets.reduce((v, s) => v + weightOf(s) * repsOf(s), 0) };
                });

                const allSets = chronological.flatMap((log) => readSets(log.exercises_done));
                const unit = origUnit;
                const peakE1RM = Math.max(
                  0,
                  ...strengthData.map((d) => ("e1rm" in d ? (d.e1rm ?? 0) : 0)),
                );

                const progressTitle =
                  kind === "isometric" ? "Longest Hold" : isLoad ? "Strength Progress" : "Best Set";
                const volumeTitle =
                  kind === "isometric" ? "Total time per session" : isLoad ? `Volume over time (${unit})` : "Total reps per session";
                const record =
                  kind === "isometric"
                    ? { label: "Longest Hold", value: formatDuration(Math.max(0, ...allSets.map((s) => s.duration_seconds ?? 0))) }
                    : !isLoad
                      ? { label: "Most Reps in a Set", value: `${Math.max(0, ...allSets.map(repsOf))} reps` }
                      : { label: "Peak Est. 1RM", value: `${peakE1RM} ${unit}` };
                const fmtY = (v: any) =>
                  kind === "isometric" ? formatDuration(Number(v) || 0) : String(v);

                return (
                  <div className="space-y-6">
                    {/* ── Chart 1: Strength Progress ── */}
                    <div className="bg-muted/20 p-4 rounded-xl border border-border/50">
                      <h3 className="text-xs font-bold text-muted-foreground mb-4 uppercase tracking-wider">
                        {progressTitle}
                      </h3>
                      <div className="h-[180px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsLineChart data={strengthData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} padding={{ left: 10, right: 10 }} />
                            <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} domain={['auto', 'auto']} tickFormatter={fmtY} />
                            <Tooltip
                              contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px', fontSize: 12 }}
                              itemStyle={{ fontWeight: 'bold' }}
                              formatter={(v: any, name: string) =>
                                isLoad
                                  ? [`${v} ${unit}`, name]
                                  : [kind === "isometric" ? formatDuration(Number(v) || 0) : `${v} reps`, name]
                              }
                            />
                            {isLoad ? (
                              <>
                                <Line type="monotone" dataKey="maxWeight" name="Max Weight" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 2.5 }} />
                                <Line type="monotone" dataKey="e1rm" name="Est. 1RM" stroke="var(--muted-foreground)" strokeDasharray="5 4" strokeWidth={2} dot={{ r: 2.5 }} />
                              </>
                            ) : (
                              <Line type="monotone" dataKey="best" name={kind === "isometric" ? "Longest Hold" : "Best Set"} stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 2.5 }} />
                            )}
                          </RechartsLineChart>
                        </ResponsiveContainer>
                      </div>
                      {isLoad && (
                        <div className="flex gap-4 mt-3 text-[10px] font-bold uppercase tracking-wider">
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block h-0.5 w-5 rounded bg-accent" /> Max Weight
                          </span>
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="inline-block h-0.5 w-5 rounded border-dashed border-t-2 border-muted-foreground" /> Est. 1RM
                          </span>
                        </div>
                      )}
                    </div>

                    {/* ── Chart 2: Volume Over Time ── */}
                    <div className="bg-muted/20 p-4 rounded-xl border border-border/50">
                      <h3 className="text-xs font-bold text-muted-foreground mb-4 uppercase tracking-wider">
                        {volumeTitle}
                      </h3>
                      <div className="h-[180px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsLineChart data={volumeData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} padding={{ left: 10, right: 10 }} />
                            <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} domain={['auto', 'auto']} tickFormatter={fmtY} />
                            <Tooltip
                              contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px', fontSize: 12 }}
                              itemStyle={{ fontWeight: 'bold' }}
                              formatter={(v: any) => [
                                isLoad
                                  ? `${v} ${unit}`
                                  : kind === "isometric"
                                    ? formatDuration(Number(v) || 0)
                                    : `${v} reps`,
                                isLoad ? 'Volume' : kind === "isometric" ? 'Total Time' : 'Total Reps',
                              ]}
                            />
                            <Line type="monotone" dataKey="volume" name="Volume" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 2.5 }} />
                          </RechartsLineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* ── All-time best for this exercise ── */}
                    <div className="text-center pb-2">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{record.label}</p>
                      <p className="text-2xl font-black text-accent mt-1">{record.value}</p>
                    </div>
                  </div>
                );
              })()}
            </TabsContent>

            <TabsContent value="video" className="space-y-4 pt-4">
              {loadingMedia ? (
                <div className="text-center py-8 text-muted-foreground font-semibold animate-pulse">
                  Loading tutorials...
                </div>
              ) : videos.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground font-semibold">
                  No tutorials found.
                </div>
              ) : (
                <div className="space-y-4">
                  {videos.map((vid, idx) => (
                    <div key={idx} className="rounded-xl overflow-hidden shadow-sm border border-border/50">
                      <iframe
                        src={vid.embed_url}
                        title={vid.title}
                        className="w-full aspect-video"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                      <div className="bg-card p-3">
                        <div className="text-sm font-bold line-clamp-1">{vid.title}</div>
                        <div className="text-xs text-muted-foreground font-semibold mt-1">{vid.channel}</div>
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    className="w-full font-bold mt-4 border-dashed border-border/50 rounded-xl"
                    onClick={() => window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent((selectedExercise || "") + " form tutorial")}`, "_blank")}
                  >
                    Search on YouTube instead
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-24 selection:bg-accent/20">
      <Header />
      <main className="mx-auto max-w-md p-5 pt-8 space-y-3">


        {/* Custom Tabs */}
        {!selectedMuscle && (
          <div className="flex gap-2 p-1.5 bg-muted/40 rounded-2xl border border-border/50 backdrop-blur-sm">
            {(["GYM", "HOME", "CARDIO"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all duration-300 ${activeTab === tab
                    ? "bg-background text-foreground shadow-sm scale-100 ring-1 ring-border/50"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50 scale-95"
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>
        )}

        {/* Content Area */}
        <div className="space-y-3 pt-0">
          {selectedMuscle ? (
            renderMuscleDetail()
          ) : activeTab === "HOME" ? (
            selectedHomeRoutine ? renderHomeRoutineDetail() : renderHomeWorkouts()
          ) : activeTab === "CARDIO" ? (
            renderCardioList()
          ) : (
            <>
              {renderPlanCard()}
              {renderMuscleGrid()}
            </>
          )}
        </div>

      </main>

      <CardioModal />
      <GymLogModal />

    </div>
  );
}
