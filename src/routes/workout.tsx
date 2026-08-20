import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
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
  Loader2,
  Trash2,
  ChevronDown,
  PencilRuler,
} from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/Header";
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
  component: WorkoutPage,
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
import {
  type WorkoutPrefs as UserWorkoutPrefs,
  getCachedWorkoutPrefs,
  loadWorkoutPrefs,
  defaultLiftForExercise,
  isRecommendedCardio,
} from "@/lib/workoutPrefs";
import {
  type StandardMuscle,
  isCustomPlan,
  activeMuscles,
  isRestDay,
  tableColumnCount,
  gridIdsForMuscles,
  MUSCLE_EMOJI,
} from "@/lib/musclePlan";

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

/** Epley formula — estimated one-rep max. */
const estimate1RM = (weight: number, reps: number): number => {
  if (!weight || !reps) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
};

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

  // Body weight for MET-based calorie estimates
  const [bodyWeight, setBodyWeight] = useState(70);

  // Onboarding preferences (default lift weights, cardio recommendations)
  const [prefs, setPrefs] = useState<UserWorkoutPrefs | null>(() =>
    user ? getCachedWorkoutPrefs(user.id) : null,
  );

  useEffect(() => {
    if (!user) return;
    loadWorkoutPrefs(user.id).then((p) => {
      if (p) setPrefs(p);
    });
  }, [user]);

  // Collect all exercises flattened for searching
  const allExercises = useMemo(() => {
    const all: string[] = [];
    Object.values(EXERCISES_DB).forEach(list => all.push(...list));
    return Array.from(new Set(all));
  }, []);

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

    // Load latest AI plan
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
      return (
        <div className="space-y-2">
          <button
            onClick={() => navigate({ to: "/workout-setup" })}
            className="card-lift group relative w-full overflow-hidden rounded-2xl border border-accent/30 bg-card p-5 text-left"
          >
            <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-accent/10 blur-2xl" />
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground glow-accent-sm">
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold">Set up my training</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  2-minute questionnaire — AI plan, library, or build your own.
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-accent" />
            </div>
          </button>
          <button
            onClick={() => navigate({ to: "/custom-plan" })}
            className="w-full py-1 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-accent"
          >
            or create a custom weekly plan →
          </button>
        </div>
      );
    }

    // ── Custom (table) plan ──
    if (isCustomPlan(plan)) {
      const todayIdx = todaysPlanIndex(plan.days.length);
      const todayDay = plan.days[todayIdx];
      const todayRest = isRestDay(todayDay);
      const todayMuscles = activeMuscles(todayDay);
      const colCount = tableColumnCount(plan.days);

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
                title="Edit custom plan"
                onClick={() => navigate({ to: "/custom-plan" })}
              >
                <PencilRuler className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                title="Delete plan"
                onClick={deletePlan}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-4 p-5">
            {/* Today summary */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Today:
              </span>
              {todayRest ? (
                <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                  {MUSCLE_EMOJI["Rest Day"]} Rest Day — recover well
                </span>
              ) : (
                todayMuscles.map((m) => (
                  <span
                    key={m}
                    className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-foreground glow-accent-sm"
                  >
                    {MUSCLE_EMOJI[m]} {m}
                  </span>
                ))
              )}
            </div>

            {/* Toggle */}
            <button
              onClick={() => setCustomTableOpen((p) => !p)}
              className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              {customTableOpen ? "Hide my custom plan" : "Show my custom plan"}
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-300 ${customTableOpen ? "rotate-180" : ""
                  }`}
              />
            </button>

            {/* Dynamic-column table */}
            {customTableOpen && (
              <div className="animate-in fade-in slide-in-from-top-2 overflow-hidden rounded-xl border border-border duration-300">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-muted-foreground">
                        Days
                      </th>
                      {Array.from({ length: colCount }, (_, i) => (
                        <th
                          key={i}
                          className="px-3 py-2.5 font-bold uppercase tracking-wider text-muted-foreground"
                        >
                          Muscle {i + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {plan.days.map((d, i) => {
                      const act = activeMuscles(d);
                      const rest = isRestDay(d);
                      const isToday = i === todayIdx;
                      return (
                        <tr
                          key={d.day}
                          className={`border-b border-border/50 transition-colors last:border-b-0 ${isToday ? "bg-accent/10" : ""
                            }`}
                        >
                          <td
                            className={`px-3 py-2.5 font-semibold ${isToday ? "text-accent" : ""
                              }`}
                          >
                            {d.day}
                            {isToday && (
                              <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[8px] font-bold uppercase text-accent-foreground">
                                Today
                              </span>
                            )}
                          </td>
                          {Array.from({ length: colCount }, (_, c) => (
                            <td key={c} className="px-3 py-2.5">
                              {rest ? (
                                c === 0 ? (
                                  <span className="italic text-muted-foreground">
                                    Rest Day
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/40">
                                    -
                                  </span>
                                )
                              ) : act[c] ? (
                                <span className="font-medium">{act[c]}</span>
                              ) : (
                                <span className="text-muted-foreground/40">
                                  -
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              title="Delete plan"
              onClick={deletePlan}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {/* Day selector */}
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
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
          </div>

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
            plan.days[todaysPlanIndex(plan.days.length)],
          ) as StandardMuscle[],
        )
        : new Set<string>();

    if (searchQuery) {
      searchResults.sort((a, b) => {
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
        exercises_done: { bpm: parseInt(bpm) || null, distance: parseFloat(distance) || null },
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
                  <span>Distance (km)</span>
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
                  Est. pace: {paceDisplay} min/km
                </span>
              </div>
            )}
            <div className="flex items-center justify-center gap-2 text-xs font-bold text-muted-foreground">
              <span className="rounded-full bg-accent/10 px-3 py-1 text-accent">
                {met} METs
              </span>
              <span className="rounded-full bg-muted px-3 py-1">
                ~{Math.round(met * bodyWeight * (1 / 60))} kcal / min at {bodyWeight} kg
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
                    const dist = ex.distance ? parseFloat(ex.distance) : null;
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
                              <span className="font-bold">{dist} km</span>
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
                              <span className="font-bold">{paceDisplay} min/km</span>
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
    const [sets, setSets] = useState([{ reps: "10", weight: "20" }]);
    const [currentUnit, setCurrentUnit] = useState<'kg' | 'lbs'>('kg');
    const [history, setHistory] = useState<any[]>([]);
    const [videos, setVideos] = useState<any[]>([]);
    const [loadingMedia, setLoadingMedia] = useState(false);

    const toggleUnit = (toUnit: 'kg' | 'lbs') => {
      if (toUnit === currentUnit) return;
      setSets(prev => prev.map(s => {
        const w = parseFloat(s.weight) || 0;
        const converted = toUnit === 'lbs' ? Math.round(w * 2.2) : Math.round(w / 2.2);
        return { ...s, weight: String(converted) };
      }));
      setCurrentUnit(toUnit);
    };

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

    // Best estimated 1RM from the sets currently entered
    const currentBest1RM = sets.reduce((best, s) => {
      const rm = estimate1RM(parseFloat(s.weight) || 0, parseInt(s.reps) || 0);
      return rm > best ? rm : best;
    }, 0);

    const best1RMForLog = (log: any): number => {
      const exSets = Array.isArray(log?.exercises_done) ? log.exercises_done : [];
      return exSets.reduce((best: number, s: any) => {
        const rm = estimate1RM(parseFloat(s.weight) || 0, parseInt(s.reps) || 0);
        return rm > best ? rm : best;
      }, 0);
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
          const last = data?.[0]?.exercises_done as any[] | undefined;
          if (Array.isArray(last) && last.length > 0 && last[0]?.reps) {
            setSets(
              last.map((s: any) => ({
                reps: String(s.reps ?? "10"),
                weight: String(s.weight ?? "20"),
              }))
            );
          } else {
            const lift = defaultLiftForExercise(selectedExercise, prefs);
            if (lift?.weight) {
              setSets([{ reps: String(lift.reps ?? 8), weight: String(lift.weight) }]);
            } else {
              setSets([{ reps: "10", weight: currentUnit === "lbs" ? "45" : "20" }]);
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
      const { error } = await supabase.from("workout_logs").insert({
        user_id: user.id,
        date: todayLocal(),
        workout_name: selectedExercise || "",
        duration_min: sets.length * 3, // rough estimate
        calories_burned: sets.length * 15,
        exercises_done: sets.map(s => ({ ...s, unit: currentUnit })),
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
              <div className="bg-muted/20 p-5 rounded-2xl border border-border/50">
                <div className="flex gap-2 items-center mb-2 px-2">
                  <div className="w-8 text-center text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Set</div>
                  <div className="flex-1 text-center text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Reps</div>
                  <div className="flex-1 flex justify-center">
                    <div className="flex bg-muted/50 rounded-md p-0.5 gap-0.5">
                      {(['kg', 'lbs'] as const).map(u => (
                        <button
                          key={u}
                          onClick={() => toggleUnit(u)}
                          className={`px-2 py-0.5 text-[9px] font-bold rounded uppercase transition-all ${
                            currentUnit === u
                              ? 'bg-accent text-accent-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="w-8"></div>
                </div>
                <div className="space-y-2">
                  {sets.map((s, i) => (
                    <div key={i} className="flex gap-2 items-center bg-card p-2 rounded-xl border border-border shadow-sm">
                      <div className="w-8 text-center text-sm font-black text-muted-foreground">{i + 1}.</div>
                      <Input
                        type="number"
                        className="flex-1 text-center text-sm font-bold h-10 border-none bg-muted/30 focus-visible:ring-1"
                        value={s.reps}
                        onChange={(e) => {
                          const n = [...sets];
                          n[i].reps = e.target.value;
                          setSets(n);
                        }}
                      />
                      <Input
                        type="number"
                        className="flex-1 text-center text-sm font-bold h-10 border-none bg-muted/30 focus-visible:ring-1"
                        value={s.weight}
                        onChange={(e) => {
                          const n = [...sets];
                          n[i].weight = e.target.value;
                          setSets(n);
                        }}
                      />
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
                <Button
                  variant="outline"
                  className="w-full mt-4 text-[11px] font-bold border-dashed border-border/50 rounded-xl h-10 hover:bg-accent/10 hover:text-accent hover:border-accent/50 transition-colors"
                  onClick={() => setSets([...sets, { reps: "10", weight: sets[sets.length - 1].weight }])}
                >
                  <Plus className="mr-2 h-3 w-3" /> Add Set
                </Button>

                {currentBest1RM > 0 && (
                  <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-accent/10 px-3 py-2 text-[11px] font-bold text-accent">
                    <LineChart className="h-3.5 w-3.5" />
                    Est. 1RM from these sets: {currentBest1RM} kg
                  </div>
                )}
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
                    const logUnit = Array.isArray(log.exercises_done) && log.exercises_done[0]?.unit ? log.exercises_done[0].unit : currentUnit;
                    const rm = best1RMForLog(log);
                    const dateObj = new Date(log.date);
                    dateObj.setMinutes(dateObj.getMinutes() + dateObj.getTimezoneOffset());
                    
                    let vol = 0;
                    if (Array.isArray(log.exercises_done)) {
                      vol = log.exercises_done.reduce((acc: number, s: any) => acc + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0), 0);
                    }

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
                          {Array.isArray(log.exercises_done) &&
                            log.exercises_done.map((set: any, sIdx: number) => (
                              <div key={sIdx} className="flex justify-between text-sm">
                                <span className="font-semibold text-muted-foreground">Set {sIdx + 1}</span>
                                <span className="font-bold">{set.reps} reps @ {set.weight} {set.unit || logUnit}</span>
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

                const strengthData = chronological.map((log) => {
                  const sets = Array.isArray(log.exercises_done)
                    ? log.exercises_done.filter((s: any) => s && typeof s === "object" && "weight" in s)
                    : [];
                  const maxW = sets.reduce((m: number, s: any) => {
                    const w = parseFloat(s.weight);
                    if (isNaN(w)) { console.warn('[analytics] bad weight value:', s.weight, 'in log', log.id); return m; }
                    return Math.max(m, w);
                  }, 0);
                  const e1rm = sets.reduce((b: number, s: any) => {
                    const w = parseFloat(s.weight), r = parseInt(s.reps);
                    if (isNaN(w) || isNaN(r)) { console.warn('[analytics] bad set data:', s, 'in log', log.id); return b; }
                    const rm = estimate1RM(w, r);
                    return rm > b ? rm : b;
                  }, 0);
                  return { date: log.date.slice(5), maxWeight: maxW, e1rm };
                });

                const volumeData = chronological.map((log) => {
                  const sets = Array.isArray(log.exercises_done)
                    ? log.exercises_done.filter((s: any) => s && typeof s === "object" && "weight" in s)
                    : [];
                  const vol = sets.reduce((v: number, s: any) => {
                    const w = parseFloat(s.weight), r = parseInt(s.reps);
                    if (isNaN(w) || isNaN(r)) { console.warn('[analytics] bad set data:', s, 'in log', log.id); return v; }
                    return v + w * r;
                  }, 0);
                  return { date: log.date.slice(5), volume: vol };
                });

                const unit = currentUnit;
                const peakE1RM = Math.max(...strengthData.map((d) => d.e1rm), 0);

                return (
                  <div className="space-y-6">
                    {/* ── Chart 1: Strength Progress ── */}
                    <div className="bg-muted/20 p-4 rounded-xl border border-border/50">
                      <h3 className="text-xs font-bold text-muted-foreground mb-4 uppercase tracking-wider">
                        Strength Progress
                      </h3>
                      <div className="h-[180px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsLineChart data={strengthData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} padding={{ left: 10, right: 10 }} />
                            <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                            <Tooltip
                              contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px', fontSize: 12 }}
                              itemStyle={{ fontWeight: 'bold' }}
                              formatter={(v: any, name: string) => [`${v} ${unit}`, name]}
                            />
                            <Line type="monotone" dataKey="maxWeight" name="Max Weight" stroke="var(--accent)" strokeWidth={2.5} dot={false} />
                            <Line type="monotone" dataKey="e1rm" name="Est. 1RM" stroke="var(--muted-foreground)" strokeDasharray="5 4" strokeWidth={2} dot={false} />
                          </RechartsLineChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex gap-4 mt-3 text-[10px] font-bold uppercase tracking-wider">
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block h-0.5 w-5 rounded bg-accent" /> Max Weight
                        </span>
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="inline-block h-0.5 w-5 rounded border-dashed border-t-2 border-muted-foreground" /> Est. 1RM
                        </span>
                      </div>
                    </div>

                    {/* ── Chart 2: Volume Over Time ── */}
                    <div className="bg-muted/20 p-4 rounded-xl border border-border/50">
                      <h3 className="text-xs font-bold text-muted-foreground mb-4 uppercase tracking-wider">
                        Volume over time ({unit})
                      </h3>
                      <div className="h-[180px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsLineChart data={volumeData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} padding={{ left: 10, right: 10 }} />
                            <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                            <Tooltip
                              contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px', fontSize: 12 }}
                              itemStyle={{ fontWeight: 'bold' }}
                              formatter={(v: any) => [`${v} ${unit}`, 'Volume']}
                            />
                            <Line type="monotone" dataKey="volume" name="Volume" stroke="var(--accent)" strokeWidth={2.5} dot={false} />
                          </RechartsLineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* ── Peak e1RM summary ── */}
                    <div className="text-center pb-2">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Peak Est. 1RM</p>
                      <p className="text-2xl font-black text-accent mt-1">{peakE1RM} {unit}</p>
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
      <main className="mx-auto max-w-md p-5 pt-8 space-y-8">


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
        <div className="space-y-6 pt-2">
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
