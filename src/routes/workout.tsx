import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useRef } from "react";
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

export const Route = createFileRoute("/workout")({ component: WorkoutPage });

import { searchYouTube } from "@/lib/youtube";
import { EXERCISES_DB } from "@/lib/exercises";
import { HOME_WORKOUTS } from "@/lib/homeWorkouts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MUSCLES = [
  { id: "chest",     name: "Chest",      color: "from-red-500/20 to-orange-500/20" },
  { id: "back",      name: "Back",       color: "from-indigo-500/20 to-blue-500/20" },
  { id: "shoulders", name: "Shoulders",  color: "from-blue-500/20 to-cyan-500/20" },
  { id: "biceps",    name: "Biceps",     color: "from-rose-500/20 to-red-500/20" },
  { id: "triceps",   name: "Triceps",    color: "from-purple-500/20 to-pink-500/20" },
  { id: "abs",       name: "Core & Abs", color: "from-green-500/20 to-emerald-500/20" },
  { id: "legs",      name: "Legs",       color: "from-lime-500/20 to-yellow-500/20" },
  { id: "forearms",  name: "Forearms",   color: "from-slate-500/20 to-gray-500/20" },
];

const LEGS_CATEGORIES = [
  { id: "quads",      label: "Quads" },
  { id: "hamstrings", label: "Hamstrings" },
  { id: "glutes",     label: "Glutes" },
  { id: "calves",     label: "Calves" },
  { id: "abductors",  label: "Abductors" },
  { id: "adductors",  label: "Adductors" },
] as const;
type LegsCategoryId = typeof LEGS_CATEGORIES[number]["id"];

const BACK_CATEGORIES = [
  { id: "back_lats",  label: "Lats" },
  { id: "back_upper", label: "Upper Back" },
  { id: "lowerback",  label: "Lower Back" },
] as const;
type BackCategoryId = typeof BACK_CATEGORIES[number]["id"];

const CARDIO_ACTIVITIES = [
  "Treadmill running",
  "Outdoor walk",
  "Cycling",
  "Swimming",
  "Jump rope",
  "HIIT",
  "Yoga & Pilates",
];

function WorkoutPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"GYM" | "HOME" | "CARDIO">("GYM");

  // State for sub-views
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [selectedHomeRoutine, setSelectedHomeRoutine] = useState<string | null>(null);
  const [selectedCardio, setSelectedCardio] = useState<string | null>(null);

  // Questionnaire Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);

  // DB States
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentExercises, setRecentExercises] = useState<string[]>([]);
  const [loggedToday, setLoggedToday] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLegsCategory, setSelectedLegsCategory] = useState<LegsCategoryId>("quads");
  const legsChipsRef = useRef<HTMLDivElement>(null);
  const [selectedBackCategory, setSelectedBackCategory] = useState<BackCategoryId>("back_lats");

  // Collect all exercises flattened for searching
  const allExercises = useMemo(() => {
    const all: string[] = [];
    Object.values(EXERCISES_DB).forEach(list => all.push(...list));
    return Array.from(new Set(all));
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    loadUserData();
  }, [user, loading, navigate]);

  const loadUserData = async () => {
    if (!user) return;
    const favs = JSON.parse(localStorage.getItem("workout_favorites") || "[]");
    setFavorites(favs);

    // Load today's logs to show what was logged
    const today = new Date().toISOString().split("T")[0];
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

  const renderMuscleGrid = () => {
    const searchResults = searchQuery
      ? allExercises.filter(ex => ex.toLowerCase().includes(searchQuery.toLowerCase()))
      : [];

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
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
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
          <div className="grid grid-cols-3 gap-3 animate-in fade-in">
            {MUSCLES.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMuscle(m.id)}
                className={`flex flex-col items-center justify-center p-4 rounded-2xl bg-gradient-to-br ${m.color} border border-border/50 shadow-sm transition-transform active:scale-95 hover:shadow-md`}
              >
                <Dumbbell className="h-6 w-6 text-white/80 drop-shadow-sm mb-2" />
                <span className="font-black text-[13px] text-white drop-shadow-md text-center leading-tight">{m.name}</span>
                <span className="text-[10px] font-bold text-white/70 mt-1 uppercase">{m.count} Exercises</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderHomeWorkouts = () => {
    return (
      <div className="space-y-3 pb-20">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
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
              className="flex flex-col items-center justify-center p-4 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 border border-border/50 shadow-sm transition-transform active:scale-95 hover:shadow-md h-32"
            >
              <Flame className="h-8 w-8 text-white/80 drop-shadow-sm mb-2" />
              <span className="font-black text-sm text-white drop-shadow-md text-center leading-tight">{routine.name}</span>
              <span className="text-[11px] font-bold text-white/70 mt-2 uppercase tracking-widest">{routine.exercises.length} Exercises</span>
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

  const renderCardioList = () => (
    <div className="space-y-3">
      {CARDIO_ACTIVITIES.map((act) => (
        <button
          key={act}
          onClick={() => setSelectedCardio(act)}
          className="w-full flex items-center justify-between p-4 rounded-xl bg-card border border-border shadow-sm hover:border-accent/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-accent" />
            <span className="font-semibold">{act}</span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      ))}
      <div className="p-4 mt-6 rounded-xl bg-muted/20 border border-dashed border-border/50 flex flex-col items-center text-center">
        <p className="text-sm font-medium mb-1">Other Activity?</p>
        <p className="text-xs text-muted-foreground">
          Log custom cardio duration to track your burned calories.
        </p>
      </div>
    </div>
  );

  const renderMuscleDetail = () => {
    if (!selectedMuscle) return null;
    const muscleInfo = MUSCLES.find((m) => m.id === selectedMuscle);
    const exercises = EXERCISES_DB[selectedMuscle] || [];

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
            onClick={() => setSelectedMuscle(null)}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-black uppercase tracking-widest text-accent flex items-center gap-2">
            <Dumbbell className="h-5 w-5" />
            {muscleInfo?.name}
          </h2>
          <div className="w-9" /> {/* Spacer */}
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden divide-y divide-border/50">
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

  const renderLegsPage = () => {
    const exercises = EXERCISES_DB[selectedLegsCategory] || [];
    const sorted = [...exercises].sort((a, b) => {
      const aFav = favorites.includes(a), bFav = favorites.includes(b);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      const aLogged = loggedToday.includes(a), bLogged = loggedToday.includes(b);
      if (aLogged && !bLogged) return -1;
      if (!aLogged && bLogged) return 1;
      const aIdx = recentExercises.indexOf(a), bIdx = recentExercises.indexOf(b);
      if (aIdx !== -1 && bIdx === -1) return -1;
      if (aIdx === -1 && bIdx !== -1) return 1;
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      return a.localeCompare(b);
    });

    return (
      <div className="space-y-4 animate-in slide-in-from-right-4">
        {/* Header — identical structure to renderMuscleDetail */}
        <div className="flex items-center justify-between mb-2">
          <Button variant="ghost" size="icon" onClick={() => setSelectedMuscle(null)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-black uppercase tracking-widest text-accent flex items-center gap-2">
            <Dumbbell className="h-5 w-5" />
            Legs
          </h2>
          <div className="w-9" />
        </div>

        {/* Category chips — arrow-navigable single row */}
        <div className="relative flex items-center gap-1">
          <button
            onClick={() => legsChipsRef.current?.scrollBy({ left: -120, behavior: "smooth" })}
            className="hidden md:flex flex-none p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div ref={legsChipsRef} className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 flex-1">
            {LEGS_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedLegsCategory(cat.id)}
                className={`flex-none px-3 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg transition-all duration-200 whitespace-nowrap ${
                  selectedLegsCategory === cat.id
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "bg-muted/40 text-muted-foreground border border-border/50 hover:text-foreground hover:bg-muted/70"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => legsChipsRef.current?.scrollBy({ left: 120, behavior: "smooth" })}
            className="hidden md:flex flex-none p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Exercise list */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden divide-y divide-border/50">
          {sorted.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
              <Dumbbell className="h-10 w-10 mb-3 opacity-20" />
              <p className="font-medium text-sm">No exercises yet.</p>
            </div>
          ) : (
            sorted.map((ex, i) => {
              const isFav = favorites.includes(ex);
              const isLogged = loggedToday.includes(ex);
              return (
                <div
                  key={ex}
                  className="flex items-center justify-between p-4 transition-colors hover:bg-muted/10 cursor-pointer group"
                  onClick={() => setSelectedExercise(ex)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted-foreground/50 w-4">{i + 1}.</span>
                    <span className="font-semibold text-sm group-hover:text-accent transition-colors">{ex}</span>
                    {isLogged && (
                      <span className="text-[9px] uppercase font-bold bg-accent/10 text-accent px-1.5 py-0.5 rounded">
                        Logged
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(ex); }}
                    className="p-2 -mr-2 transition-transform hover:scale-110 active:scale-90"
                  >
                    <Heart className={`h-4 w-4 ${isFav ? "fill-red-500 text-red-500" : "text-muted-foreground hover:text-red-400"}`} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  const renderBackPage = () => {
    const exercises = EXERCISES_DB[selectedBackCategory] || [];
    const sorted = [...exercises].sort((a, b) => {
      const aFav = favorites.includes(a), bFav = favorites.includes(b);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      const aLogged = loggedToday.includes(a), bLogged = loggedToday.includes(b);
      if (aLogged && !bLogged) return -1;
      if (!aLogged && bLogged) return 1;
      const aIdx = recentExercises.indexOf(a), bIdx = recentExercises.indexOf(b);
      if (aIdx !== -1 && bIdx === -1) return -1;
      if (aIdx === -1 && bIdx !== -1) return 1;
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      return a.localeCompare(b);
    });

    return (
      <div className="space-y-4 animate-in slide-in-from-right-4">
        <div className="flex items-center justify-between mb-2">
          <Button variant="ghost" size="icon" onClick={() => setSelectedMuscle(null)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-black uppercase tracking-widest text-accent flex items-center gap-2">
            <Dumbbell className="h-5 w-5" />
            Back
          </h2>
          <div className="w-9" />
        </div>

        <div className="flex gap-2 justify-center">
          {BACK_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedBackCategory(cat.id)}
              className={`flex-none px-3 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg transition-all duration-200 whitespace-nowrap ${
                selectedBackCategory === cat.id
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : "bg-muted/40 text-muted-foreground border border-border/50 hover:text-foreground hover:bg-muted/70"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden divide-y divide-border/50">
          {sorted.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
              <Dumbbell className="h-10 w-10 mb-3 opacity-20" />
              <p className="font-medium text-sm">No exercises yet.</p>
            </div>
          ) : (
            sorted.map((ex, i) => {
              const isFav = favorites.includes(ex);
              const isLogged = loggedToday.includes(ex);
              return (
                <div
                  key={ex}
                  className="flex items-center justify-between p-4 transition-colors hover:bg-muted/10 cursor-pointer group"
                  onClick={() => setSelectedExercise(ex)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted-foreground/50 w-4">{i + 1}.</span>
                    <span className="font-semibold text-sm group-hover:text-accent transition-colors">{ex}</span>
                    {isLogged && (
                      <span className="text-[9px] uppercase font-bold bg-accent/10 text-accent px-1.5 py-0.5 rounded">
                        Logged
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(ex); }}
                    className="p-2 -mr-2 transition-transform hover:scale-110 active:scale-90"
                  >
                    <Heart className={`h-4 w-4 ${isFav ? "fill-red-500 text-red-500" : "text-muted-foreground hover:text-red-400"}`} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  // --- Render Modals ---

  const CardioModal = () => {
    const [duration, setDuration] = useState("30");
    const [kcal, setKcal] = useState("200");
    const [bpm, setBpm] = useState("");

    const handleLog = async () => {
      if (!user) return;
      toast.loading("Logging cardio...");
      const { error } = await supabase.from("workout_logs").insert({
        user_id: user.id,
        date: new Date().toISOString().split("T")[0],
        workout_name: selectedCardio || "",
        duration_min: parseInt(duration) || 30,
        calories_burned: parseInt(kcal) || 0,
        exercises_done: { bpm: parseInt(bpm) || null },
      });
      if (error) {
        toast.error("Failed to log cardio");
      } else {
        toast.success("Cardio logged!");
        loadUserData();
        setSelectedCardio(null);
      }
    };

    return (
      <Dialog open={!!selectedCardio} onOpenChange={() => setSelectedCardio(null)}>
        <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border/50">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-xl font-black uppercase tracking-wider">
              <span className="text-accent">{selectedCardio}</span>
              <Heart className="h-5 w-5 text-red-500 fill-current" />
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 pt-4">
            <div className="flex gap-4 justify-center">
              <Button variant="outline" className="gap-2 flex-1 rounded-xl h-12 hover:bg-accent/10 hover:text-accent hover:border-accent/50 transition-colors"><Play className="h-4 w-4" /> Video</Button>
              <Button variant="outline" className="gap-2 flex-1 rounded-xl h-12 hover:bg-accent/10 hover:text-accent hover:border-accent/50 transition-colors"><LineChart className="h-4 w-4" /> Analytics</Button>
            </div>
            <div className="space-y-4 bg-muted/20 p-5 rounded-2xl border border-border/50">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">Duration (min)</Label>
                <Input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="text-xl font-bold h-14 bg-background/50 text-center"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">Estimated Burn (kcal)</Label>
                <Input
                  type="number"
                  value={kcal}
                  onChange={(e) => setKcal(e.target.value)}
                  className="text-xl font-bold h-14 bg-background/50 text-center"
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
            <Button onClick={handleLog} className="w-full font-bold h-14 text-md rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg shadow-accent/20 transition-all hover:-translate-y-1">
              <Plus className="mr-2 h-5 w-5" /> Log Workout
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  const GymLogModal = () => {
    const [sets, setSets] = useState([{ reps: "10", weight: "20" }]);
    const [history, setHistory] = useState<any[]>([]);
    const [videos, setVideos] = useState<any[]>([]);
    const [loadingMedia, setLoadingMedia] = useState(false);

    useEffect(() => {
      if (selectedExercise && user) {
        supabase
          .from("workout_logs")
          .select("date, exercises_done")
          .eq("user_id", user.id)
          .eq("workout_name", selectedExercise)
          .order("date", { ascending: false })
          .limit(10)
          .then(({ data }) => setHistory(data || []));

        setLoadingMedia(true);
        searchYouTube({ data: selectedExercise })
          .then((res) => {
            setVideos(res || []);
            setLoadingMedia(false);
          })
          .catch(() => setLoadingMedia(false));
      }
    }, [selectedExercise, user]);

    const handleLog = async () => {
      if (!user) return;
      toast.loading("Logging exercise...");
      const { error } = await supabase.from("workout_logs").insert({
        user_id: user.id,
        date: new Date().toISOString().split("T")[0],
        workout_name: selectedExercise || "",
        duration_min: sets.length * 3, // rough estimate
        calories_burned: sets.length * 15,
        exercises_done: sets,
      });
      if (error) {
        toast.error("Failed to log exercise");
      } else {
        toast.success("Exercise logged!");
        loadUserData();
        setSelectedExercise(null);
      }
    };

    return (
      <Dialog open={!!selectedExercise} onOpenChange={() => setSelectedExercise(null)}>
        <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border/50 max-h-[90vh] overflow-y-auto">
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

          <Tabs defaultValue="log" className="w-full mt-2">
            <TabsList className="w-full flex">
              <TabsTrigger value="log" className="flex-1 font-bold"><Plus className="w-4 h-4 mr-2"/> Log</TabsTrigger>
              <TabsTrigger value="history" className="flex-1 font-bold"><LineChart className="w-4 h-4 mr-2"/> History</TabsTrigger>
              <TabsTrigger value="video" className="flex-1 font-bold"><Play className="w-4 h-4 mr-2"/> Tutorial</TabsTrigger>
            </TabsList>

            <TabsContent value="log" className="space-y-6 pt-4">
              <div className="bg-muted/20 p-5 rounded-2xl border border-border/50">
                <div className="flex justify-between items-center mb-4 px-2">
                  <span className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Set</span>
                  <span className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Reps</span>
                  <span className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Lbs / Kg</span>
                </div>
                <div className="space-y-2">
                  {sets.map((s, i) => (
                    <div key={i} className="flex gap-3 items-center bg-card p-2 rounded-xl border border-border shadow-sm">
                      <div className="w-10 text-center font-black text-muted-foreground">{i + 1}.</div>
                      <Input
                        type="number"
                        className="flex-1 text-center font-bold h-10 border-none bg-muted/30 focus-visible:ring-1"
                        value={s.reps}
                        onChange={(e) => {
                          const n = [...sets];
                          n[i].reps = e.target.value;
                          setSets(n);
                        }}
                      />
                      <Input
                        type="number"
                        className="flex-1 text-center font-bold h-10 border-none bg-muted/30 focus-visible:ring-1"
                        value={s.weight}
                        onChange={(e) => {
                          const n = [...sets];
                          n[i].weight = e.target.value;
                          setSets(n);
                        }}
                      />
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  className="w-full mt-4 text-xs font-bold border-dashed border-border/50 rounded-xl h-10 hover:bg-accent/10 hover:text-accent hover:border-accent/50 transition-colors"
                  onClick={() => setSets([...sets, { reps: "10", weight: sets[sets.length - 1].weight }])}
                >
                  <Plus className="mr-2 h-3 w-3" /> Add Set
                </Button>
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
                  {history.map((log, idx) => (
                    <div key={idx} className="bg-muted/20 p-4 rounded-xl border border-border/50">
                      <div className="font-bold text-accent mb-2 border-b border-border/50 pb-2">
                        {new Date(log.date).toLocaleDateString()}
                      </div>
                      <div className="space-y-1">
                        {log.exercises_done?.map((set: any, sIdx: number) => (
                          <div key={sIdx} className="flex justify-between text-sm">
                            <span className="font-semibold text-muted-foreground">Set {sIdx + 1}</span>
                            <span className="font-bold">{set.reps} reps @ {set.weight} kg</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                        allowFullScreen
                      />
                      <div className="bg-card p-3">
                        <div className="text-sm font-bold line-clamp-1">{vid.title}</div>
                        <div className="text-xs text-muted-foreground font-semibold mt-1">{vid.channel}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    );
  };

  const PlanWizard = () => {
    return (
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto bg-card/95 backdrop-blur-xl border-border/50">
          <DialogHeader className="sticky top-0 bg-card/95 backdrop-blur-xl pt-4 pb-2 z-10 -mt-4 -mx-6 px-6 border-b border-border/50">
            <DialogTitle className="text-xl font-black uppercase tracking-wider flex items-center gap-2">
              <Flame className="h-5 w-5 text-accent" /> Plan Wizard
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-8 pt-6 pb-8">
            <div className="space-y-4">
              <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Fitness Level (Experience)</Label>
              <div className="grid grid-cols-2 gap-3">
                {["Beginner <1 yr", "Intermediate 1-2 yr", "Expert >3 yr", "Pro"].map(o => (
                  <Button key={o} variant="outline" className="justify-start h-auto py-3 px-4 whitespace-normal text-left font-semibold rounded-xl hover:border-accent hover:bg-accent/5 transition-colors">{o}</Button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Fitness Goals?</Label>
              <div className="grid grid-cols-1 gap-3">
                {["Build muscle + get toned", "Enhance general fitness", "Improve conditioning", "Get stronger (powerlifting)"].map(o => (
                  <Button key={o} variant="outline" className="justify-start h-auto py-3 px-4 whitespace-normal text-left font-semibold rounded-xl hover:border-accent hover:bg-accent/5 transition-colors">{o}</Button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex justify-between">
                <span>Strongest Lifts</span>
                <span className="text-muted-foreground/50">Optional</span>
              </Label>
              <div className="space-y-3 bg-muted/20 p-4 rounded-2xl border border-border/50">
                <div className="flex gap-3 items-center">
                  <span className="w-24 text-xs font-bold text-right">Bench Press</span>
                  <Input placeholder="Reps" className="flex-1 bg-background/50 h-10" />
                  <Input placeholder="Weight" className="flex-1 bg-background/50 h-10" />
                </div>
                <div className="flex gap-3 items-center">
                  <span className="w-24 text-xs font-bold text-right">Back Squat</span>
                  <Input placeholder="Reps" className="flex-1 bg-background/50 h-10" />
                  <Input placeholder="Weight" className="flex-1 bg-background/50 h-10" />
                </div>
                <div className="flex gap-3 items-center">
                  <span className="w-24 text-xs font-bold text-right">Deadlift</span>
                  <Input placeholder="Reps" className="flex-1 bg-background/50 h-10" />
                  <Input placeholder="Weight" className="flex-1 bg-background/50 h-10" />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">How often do you want to train?</Label>
              <div className="grid grid-cols-2 gap-3">
                {["1 day/week", "2 days/week", "3 days/week", "4 days/week", "5 days/week", "Everyday"].map(o => (
                  <Button key={o} variant="outline" className="justify-start font-semibold rounded-xl hover:border-accent hover:bg-accent/5 transition-colors">{o}</Button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Workout time in gym?</Label>
              <div className="px-4 py-6 bg-muted/20 rounded-2xl border border-border/50">
                <Slider defaultValue={[60]} max={120} min={30} step={15} className="[&_[role=slider]]:h-6 [&_[role=slider]]:w-6 [&_[role=slider]]:bg-accent [&_[role=slider]]:border-none" />
                <div className="flex justify-between text-xs text-muted-foreground mt-4 font-bold tracking-widest">
                  <span>30m</span>
                  <span>1h</span>
                  <span>1.5h</span>
                  <span>2h+</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Preferred Training Plan?</Label>
              <div className="grid grid-cols-1 gap-3">
                <Button variant="default" className="justify-start h-auto py-4 px-5 whitespace-normal text-left font-bold rounded-xl bg-accent text-accent-foreground shadow-lg shadow-accent/20 transition-all hover:-translate-y-1 text-md">
                  Let us pick for you (AI Generated)
                </Button>
                <Button variant="outline" className="justify-start h-auto py-4 px-5 whitespace-normal text-left font-bold rounded-xl hover:border-accent hover:bg-accent/5 transition-all text-md">
                  Pick from our library
                </Button>
                <Button variant="outline" className="justify-start h-auto py-4 px-5 whitespace-normal text-left font-bold rounded-xl hover:border-accent hover:bg-accent/5 transition-all text-md">
                  Build your own custom plan
                </Button>
              </div>
            </div>
            
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-24 selection:bg-accent/20">
      <Header />
      <main className="mx-auto max-w-md p-5 pt-3 space-y-3">


        {/* Custom Tabs */}
        {!selectedMuscle && (
          <div className="flex gap-2 p-1.5 bg-muted/40 rounded-2xl border border-border/50 backdrop-blur-sm">
            {(["GYM", "HOME", "CARDIO"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all duration-300 ${
                  activeTab === tab
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
        <div>
          {selectedMuscle === "legs" ? (
            renderLegsPage()
          ) : selectedMuscle === "back" ? (
            renderBackPage()
          ) : selectedMuscle ? (
            renderMuscleDetail()
          ) : activeTab === "HOME" ? (
            selectedHomeRoutine ? renderHomeRoutineDetail() : renderHomeWorkouts()
          ) : activeTab === "CARDIO" ? (
            renderCardioList()
          ) : (
            renderMuscleGrid()
          )}
        </div>

      </main>

      <CardioModal />
      <GymLogModal />
      <PlanWizard />

    </div>
  );
}
