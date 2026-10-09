import { LogoLoader } from "@/components/LogoLoader";
import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Moon,
  Sun,
  Droplets,
  Sunset,
  TreePine,
  ChevronRight,
  ArrowLeft,
  User,
  ListOrdered,
  Palette,
  Tag,
  Settings,
  MessageCircle,
  Info,
  Gift,
  Instagram,
  Youtube,
  Compass,
  Scale,
  Facebook,
  Mail,
  HelpCircle,
  LogOut,
  Download,
  Utensils,
  GlassWater,
  Copy,
  Share2,
  Building2,
  Dumbbell,
  Camera,
  Trophy,
  ShieldCheck,
  CalendarDays,
  BadgeCheck,
  Loader2,
  Plus,
  X,
  Award,
  Ruler,
  AlertTriangle,
  Trash2,
  Bell,
  Terminal,
  Zap,
  Rocket,
  Heart,
  Droplet,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { isNativeApp } from "@/lib/platform";
import {
  AGE_YEARS,
  HEIGHT_CM,
  WEIGHT_KG,
  validateMeasurement,
} from "@/lib/measurements";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { applyTheme, getLocalTheme } from "@/lib/theme";
import { supabase } from "@/integrations/client";
import { getHistory, getProfileRow } from "@/lib/historyCache";
import { loadMealNames, saveMealNames } from "@/lib/meals";
import { loadWaterPrefs, saveWaterPrefs } from "@/lib/water";
import { serverDeleteAccount } from "@/lib/delete-account";
import {
  cancelSubscription,
  getBillingSummary,
  requestRefund,
  type BillingCharge,
  type BillingSummary,
} from "@/lib/billing";
import { invalidateAccess } from "@/hooks/useAccessGate";
import { AchievementsPage } from "@/components/Achievements";
import { BodyMeasurementsPage } from "@/components/BodyMeasurements";
import { HealthLogPage } from "@/components/HealthLog";
import { ReferAndEarnPage } from "@/components/ReferAndEarn";
import { GymLinkPage } from "@/components/GymLink";
import { setTour } from "@/components/Tour";
import { SubHeader } from "@/components/SubHeader";
import { BrandLogo } from "@/components/BrandLogo";
import { HelpCenter } from "@/components/HelpCenter";
import { emailLink, LEGAL } from "@/lib/legal";
import { PricingPlans } from "@/components/PricingPlans";
import {
  activeGift,
  findPlan,
  giftLabel,
  periodLabel,
  PRICE_TAX_NOTE,
} from "@/lib/plans";
import { useGift } from "@/hooks/useReferralGift";
import {
  BASE_TRIAL_DAYS,
  isTrialActive,
  trialDaysLeft,
  trialEndDate,
} from "@/lib/trial";
import {
  calcBMI,
  calcBMR,
  calcCalorieTarget,
  calcMacros,
  calcTDEE,
  PRIMARY_GOALS,
  LOSE_RATE_OPTIONS,
  GAIN_RATE_OPTIONS,
  resolveGoalKey,
  decomposeGoalKey,
} from "@/lib/nutrition";
import {
  type WorkoutPrefs,
  FITNESS_LEVELS,
  FITNESS_GOALS,
  CARDIO_OPTIONS,
  saveWorkoutPrefs,
  loadWorkoutPrefs,
  getCachedWorkoutPrefs,
} from "@/lib/workoutPrefs";
import { resolvePlanTypeLabel } from "@/lib/planType";
import {
  type WeightUnit,
  type DistanceUnit,
  weightToKg,
  kgToWeight,
  round1,
} from "@/lib/units";

type ExportKind = "json" | "csv" | "weight_pdf";

/** "2026-10-15T…" → "15 Oct" (with the year only when it isn't this year). */
function formatExportDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== new Date().getFullYear() && { year: "numeric" }),
  });
}

/** WorkoutPrefs -> the profile page's wp* draft-field values (edit form + cache seed). */
function wpFieldValues(p: WorkoutPrefs) {
  // Lifts are stored in kg; edit them in the user's chosen weight unit.
  const wu = p.weightUnit ?? "kg";
  const w = (kg: number | null) =>
    kg ? String(round1(kgToWeight(kg, wu))) : "";
  return {
    level: p.fitnessLevel,
    goal: p.fitnessGoal,
    benchW: w(p.strongestLifts.benchPress.weight),
    benchR: p.strongestLifts.benchPress.reps
      ? String(p.strongestLifts.benchPress.reps)
      : "",
    squatW: w(p.strongestLifts.squat.weight),
    squatR: p.strongestLifts.squat.reps
      ? String(p.strongestLifts.squat.reps)
      : "",
    deadliftW: w(p.strongestLifts.deadlift.weight),
    deadliftR: p.strongestLifts.deadlift.reps
      ? String(p.strongestLifts.deadlift.reps)
      : "",
    days: p.trainingDaysPerWeek,
    cardio: p.cardioActivities.join(", "),
    muscles: p.musclesPerWorkout,
    duration: p.preferredWorkoutTime,
    planChoice: p.preferredTrainingPlan,
    weightUnit: p.weightUnit ?? "kg",
    distanceUnit: p.distanceUnit ?? "km",
  };
}

const PAGE_VALUES: readonly Page[] = [
  "menu",
  "details",
  "workout-details",
  "theme",
  "transactions",
  "pricing",
  "settings",
  "help",
  "about",
  "refer",
  "gym",
  "achievements",
  "measurements",
  "tours",
];

export const Route = createFileRoute("/profile")({
  component: Profile,
  validateSearch: (s: Record<string, unknown>): { page?: Page } =>
    PAGE_VALUES.includes(s.page as Page) ? { page: s.page as Page } : {},
});

type Page =
  | "menu"
  | "details"
  | "workout-details"
  | "theme"
  | "transactions"
  | "pricing"
  | "settings"
  | "help"
  | "about"
  | "refer"
  | "gym"
  | "achievements"
  | "measurements"
  | "health-log"
  | "tours";

/* ─── menu items ─── */
const MENU_ITEMS: {
  id: Page | "notifications";
  icon: React.ReactNode;
  label: string;
  to?: "/notifications";
}[] = [
  {
    id: "details",
    icon: <User className="h-7 w-7 md:h-[26px] md:w-[26px]" />,
    label: "Profile details",
  },
  {
    id: "workout-details",
    icon: <Dumbbell className="h-7 w-7 md:h-[26px] md:w-[26px]" />,
    label: "Workout details",
  },
  {
    id: "achievements",
    icon: <Award className="h-7 w-7 md:h-[26px] md:w-[26px]" />,
    label: "Achievements",
  },
  {
    id: "measurements",
    icon: <Ruler className="h-7 w-7 md:h-[26px] md:w-[26px]" />,
    label: "Body measurements",
  },
  {
    id: "health-log",
    icon: (
      <span className="relative inline-flex items-center justify-center">
        <Heart className="h-7 w-7 md:h-[26px] md:w-[26px]" />
        <Droplet className="absolute -bottom-1 -right-1 h-3.5 w-3.5 fill-current text-accent" />
      </span>
    ),
    label: "Health Log",
  },
  {
    id: "transactions",
    icon: <ListOrdered className="h-7 w-7 md:h-[26px] md:w-[26px]" />,
    label: "Plan & billing",
  },
  {
    id: "theme",
    icon: <Palette className="h-7 w-7 md:h-[26px] md:w-[26px]" />,
    label: "Theme",
  },
  {
    id: "settings",
    icon: <Settings className="h-7 w-7 md:h-[26px] md:w-[26px]" />,
    label: "Settings",
  },
  {
    id: "help",
    icon: <MessageCircle className="h-7 w-7 md:h-[26px] md:w-[26px]" />,
    label: "Help & support",
  },
  {
    id: "about",
    icon: <Info className="h-7 w-7 md:h-[26px] md:w-[26px]" />,
    label: "About us",
  },
  {
    id: "refer",
    icon: <Gift className="h-7 w-7 md:h-[26px] md:w-[26px]" />,
    label: "Refer & Earn",
  },
  {
    id: "gym",
    icon: <Building2 className="h-7 w-7 md:h-[26px] md:w-[26px]" />,
    label: "Your Gym",
  },
  {
    id: "notifications",
    icon: <Bell className="h-7 w-7 md:h-[26px] md:w-[26px]" />,
    label: "Notifications",
    to: "/notifications",
  },
];

const DEFAULT_MEALS = ["Breakfast", "Lunch", "Dinner", "Snack"];

/* ═══════════════════════════════════════════════════
   Main component
══════════════════════════════════════════════════════ */
function Profile() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const routeNavigate = Route.useNavigate();
  const router = useRouter();
  const { page: searchPage } = Route.useSearch();
  const page = searchPage ?? "menu";
  // Drilling into a sub-page pushes a history entry; the in-page back arrows
  // call goBack() so hardware back and the on-screen arrow can never disagree.
  const setPage = (p: Page) =>
    routeNavigate({ search: (prev) => ({ ...prev, page: p }) });
  const goBack = () => router.history.back();
  const [profile, setProfile] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [goal, setGoal] = useState("");
  const [activity, setActivity] = useState("");
  const [loseRate, setLoseRate] = useState("lose_0_25kg");
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<string>("dark");
  const [wp, setWp] = useState<WorkoutPrefs | null>(() =>
    user ? getCachedWorkoutPrefs(user.id) : null,
  );
  const wpInit = wp ? wpFieldValues(wp) : null;
  // Plan type is DERIVED from the real workout_plans row (not the stored
  // preference), so deleting a plan on the Workout page shows here as "No
  // plan" with no manual edit. Read-only — the gym Workout page owns it.
  // null until resolved: never say "No plan" before we know.
  const [planTypeLabel, setPlanTypeLabel] = useState<string | null>(null);
  const [isEditingWp, setIsEditingWp] = useState(false);
  const [savingWp, setSavingWp] = useState(false);
  const [wpLevel, setWpLevel] = useState<WorkoutPrefs["fitnessLevel"]>(
    wpInit?.level ?? "beginner",
  );
  const [wpGoal, setWpGoal] = useState<WorkoutPrefs["fitnessGoal"]>(
    wpInit?.goal ?? "build_muscle",
  );
  const [wpBenchW, setWpBenchW] = useState(wpInit?.benchW ?? "");
  const [wpBenchR, setWpBenchR] = useState(wpInit?.benchR ?? "");
  const [wpSquatW, setWpSquatW] = useState(wpInit?.squatW ?? "");
  const [wpSquatR, setWpSquatR] = useState(wpInit?.squatR ?? "");
  const [wpDeadliftW, setWpDeadliftW] = useState(wpInit?.deadliftW ?? "");
  const [wpDeadliftR, setWpDeadliftR] = useState(wpInit?.deadliftR ?? "");
  const [wpDays, setWpDays] = useState(wpInit?.days ?? 3);
  const [wpCardio, setWpCardio] = useState(wpInit?.cardio ?? "");
  const [wpMuscles, setWpMuscles] = useState<WorkoutPrefs["musclesPerWorkout"]>(
    wpInit?.muscles ?? "not_sure",
  );
  const [wpDuration, setWpDuration] = useState(wpInit?.duration ?? 60);
  const [wpPlanChoice, setWpPlanChoice] = useState<
    WorkoutPrefs["preferredTrainingPlan"]
  >(wpInit?.planChoice ?? "ai_generated");
  const [wpWeightUnit, setWpWeightUnit] = useState<WeightUnit>(
    wpInit?.weightUnit ?? "kg",
  );
  const [wpDistanceUnit, setWpDistanceUnit] = useState<DistanceUnit>(
    wpInit?.distanceUnit ?? "km",
  );

  useEffect(() => {
    setTheme(getLocalTheme());
  }, []);

  const changeTheme = (newTheme: string) => {
    setTheme(newTheme);
    applyTheme(newTheme);
    // The account's copy, so every other device switches on its next load.
    if (user)
      supabase
        .from("user_profiles")
        .update({ theme: newTheme })
        .eq("id", user.id)
        .then(({ error }) => {
          if (error) console.error("Saving theme failed", error);
        });
  };

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    getProfileRow(user.id).then(({ data }) => {
      // No profile row means onboarding was never finished — the guard below
      // waits on `profile`, so without this the page spins forever.
      if (!data) {
        navigate({ to: "/quiz", replace: true });
        return;
      }
      setProfile(data);
      if (data?.weight_kg) setWeight(String(data.weight_kg));
      if (data?.height_cm) setHeight(String(data.height_cm));
      if (data?.full_name) setName(data.full_name);
      if (data?.age) setAge(String(data.age));
      if (data?.gender) setGender(data.gender);
      if (data?.goal) {
        const { primary, loseRate: rate } = decomposeGoalKey(data.goal);
        setGoal(primary);
        if (rate) setLoseRate(rate);
      }
      if (data?.activity_level) setActivity(data.activity_level);
    });
  }, [user, navigate]);

  useEffect(() => {
    if (!user) return;
    loadWorkoutPrefs(user.id).then((p) => {
      if (!p) return;
      setWp(p);
      const f = wpFieldValues(p);
      setWpLevel(f.level);
      setWpGoal(f.goal);
      setWpBenchW(f.benchW);
      setWpBenchR(f.benchR);
      setWpSquatW(f.squatW);
      setWpSquatR(f.squatR);
      setWpDeadliftW(f.deadliftW);
      setWpDeadliftR(f.deadliftR);
      setWpDays(f.days);
      setWpCardio(f.cardio);
      setWpMuscles(f.muscles);
      setWpDuration(f.duration);
      setWpPlanChoice(f.planChoice);
      setWpWeightUnit(f.weightUnit);
      setWpDistanceUnit(f.distanceUnit);
    });
  }, [user]);

  // Refresh the derived plan-type label whenever the workout-details page
  // opens, so a plan deleted elsewhere (e.g. the Workout page) is reflected on
  // return without a manual edit.
  useEffect(() => {
    if (!user || page !== "workout-details") return;
    resolvePlanTypeLabel(user.id, wp?.preferredTrainingPlan ?? "none").then(
      setPlanTypeLabel,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, page, wp?.preferredTrainingPlan]);

  const updateProfile = async () => {
    if (!user || !profile) return;
    // Shared bounds, so this page, the Weight page and the quiz sliders all
    // agree. The old check here only required "greater than 0", which let a
    // 1 kg weight through and then fed it into BMI, BMR and the calorie target.
    const weightCheck = validateMeasurement(weight, WEIGHT_KG);
    const heightCheck = validateMeasurement(height, HEIGHT_CM);
    const ageCheck = validateMeasurement(age, AGE_YEARS);
    const failed = [weightCheck, heightCheck, ageCheck].find((c) => !c.ok);
    if (failed && !failed.ok) {
      toast.error(failed.error);
      return;
    }
    if (!weightCheck.ok || !heightCheck.ok || !ageCheck.ok) return;
    const w = weightCheck.value;
    const h = heightCheck.value;
    const a = Math.round(ageCheck.value);

    setSaving(true);
    const bmi = calcBMI(w, h);
    const bmr = calcBMR(w, h, a, gender || profile.gender);
    const tdee = calcTDEE(bmr, activity || profile.activity_level);
    const goalKey = resolveGoalKey(
      goal || decomposeGoalKey(profile.goal).primary,
      loseRate,
    );
    const target = calcCalorieTarget(tdee, goalKey, gender || profile.gender);
    const m = calcMacros(target, goalKey, w);
    const { error } = await supabase
      .from("user_profiles")
      .update({
        full_name: name,
        height_cm: h,
        weight_kg: w,
        age: a,
        gender: gender || profile.gender,
        goal: goalKey,
        activity_level: activity || profile.activity_level,
        bmi,
        bmr,
        tdee,
        daily_calorie_target: target,
        protein_target_g: m.protein,
        carbs_target_g: m.carbs,
        fat_target_g: m.fat,
        fiber_target_g: m.fiber,
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
      goal: goalKey,
      activity_level: activity || profile.activity_level,
      bmi,
      bmr,
      tdee,
      daily_calorie_target: target,
      protein_target_g: m.protein,
      carbs_target_g: m.carbs,
      fat_target_g: m.fat,
      fiber_target_g: m.fiber,
    });
    setIsEditing(false);
  };

  const updateWorkoutProfile = async () => {
    if (!user) return;
    setSavingWp(true);
    // Inputs are in the chosen unit; store lifts canonically in kg.
    const lift = (w: string, r: string) => ({
      weight: w ? round1(weightToKg(+w, wpWeightUnit)) : null,
      reps: r ? +r : null,
    });
    const prefs: WorkoutPrefs = {
      fitnessLevel: wpLevel,
      fitnessGoal: wpGoal,
      strongestLifts: {
        benchPress: lift(wpBenchW, wpBenchR),
        squat: lift(wpSquatW, wpSquatR),
        deadlift: lift(wpDeadliftW, wpDeadliftR),
      },
      trainingDaysPerWeek: wpDays,
      cardioActivities: wpCardio
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
      musclesPerWorkout: wpMuscles,
      preferredWorkoutTime: wpDuration,
      preferredTrainingPlan: wpPlanChoice,
      weightUnit: wpWeightUnit,
      distanceUnit: wpDistanceUnit,
      // Original unit is set once at first setup — never changed from here.
      origWeightUnit: wp?.origWeightUnit ?? "kg",
      origDistanceUnit: wp?.origDistanceUnit ?? "km",
    };
    const { dbSaved } = await saveWorkoutPrefs(user.id, prefs);
    setSavingWp(false);
    if (!dbSaved) {
      toast.error("Could not save — check your connection");
      return;
    }
    toast.success("Workout details updated");
    setWp(prefs);
    setIsEditingWp(false);
  };

  if (!user || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LogoLoader className="h-10 w-10 text-accent" />
      </div>
    );
  }

  /* ─── SUB PAGES ─── */
  if (page === "transactions")
    return (
      <TransactionsPage
        profile={profile}
        onBack={goBack}
        onPricing={() => setPage("pricing")}
      />
    );
  if (page === "settings")
    return (
      <SettingsPage
        userId={user.id}
        onBack={goBack}
        onTours={() => setPage("tours")}
        onSignOut={async () => {
          await signOut();
          navigate({ to: "/login", replace: true });
        }}
      />
    );
  if (page === "help") return <HelpPage onBack={goBack} />;
  if (page === "about") return <AboutPage onBack={goBack} />;
  if (page === "tours") return <ToursPage userId={user.id} onBack={goBack} />;
  if (page === "refer")
    return <ReferAndEarnPage userId={user.id} onBack={goBack} />;
  if (page === "gym") return <GymLinkPage userId={user.id} onBack={goBack} />;
  if (page === "achievements")
    return <AchievementsPage userId={user.id} onBack={goBack} />;
  if (page === "measurements")
    return <BodyMeasurementsPage userId={user.id} onBack={goBack} />;
  if (page === "health-log")
    return <HealthLogPage userId={user.id} onBack={goBack} />;

  /* ─── PRICING PAGE ─── */
  if (page === "pricing") {
    return (
      <div className="min-h-screen bg-background pb-nav">
        <SubHeader
          title="Pricing"
          onBack={goBack}
          action={
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => setPage("help")}
            >
              <HelpCircle className="h-5 w-5" />
            </Button>
          }
        />
        <main className="mx-auto max-w-6xl px-4 py-8">
          <PricingPlans
            // The trial is spent whether it is running or lapsed, so from here
            // on the cards sell the plan instead of offering a second trial.
            trialUsed={!!profile.trial_start_date}
            selectedPlan={profile.selected_plan}
            onTrialStarted={(state) => {
              setProfile({ ...profile, ...state });
              goBack();
            }}
            onBought={goBack}
          />
        </main>
      </div>
    );
  }

  /* ─── THEME PAGE ─── */
  if (page === "theme") {
    return (
      <div className="min-h-screen bg-background pb-nav">
        <SubHeader title="Theme" onBack={goBack} />
        <main className="mx-auto max-w-lg px-4 py-8">
          <p className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Appearance
          </p>
          <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
            {[
              {
                id: "dark",
                label: "Carbon (default)",
                icon: <Moon className="h-5 w-5 text-accent" />,
              },
              {
                id: "light",
                label: "Light",
                icon: <Sun className="h-5 w-5 text-yellow-500" />,
              },
              {
                id: "theme-ocean",
                label: "Ocean",
                icon: <Droplets className="h-5 w-5 text-cyan-400" />,
              },
              {
                id: "theme-sunset",
                label: "Sunset",
                icon: <Sunset className="h-5 w-5 text-orange-400" />,
              },
              {
                id: "theme-forest",
                label: "Forest",
                icon: <TreePine className="h-5 w-5 text-green-500" />,
              },
              {
                id: "theme-cyber",
                label: "Retro Cyber",
                icon: (
                  <Terminal className="h-5 w-5 text-white [:root:not(.dark):not([class*=theme-])_&]:text-black" />
                ),
              },
              {
                id: "theme-cyberdeck",
                label: "Cyberware HUD",
                icon: <Zap className="h-5 w-5 text-yellow-400" />,
              },
              {
                id: "theme-isro",
                label: "ISRO Mission Operations",
                icon: <Rocket className="h-5 w-5 text-[#FF671F]" />,
              },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => changeTheme(t.id)}
                className="flex w-full items-center justify-between px-5 py-4 hover:bg-muted/40 transition-colors"
              >
                <span className="flex items-center gap-3 text-sm font-medium">
                  {t.icon} {t.label}
                </span>
                <span
                  className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all ${
                    theme === t.id
                      ? "border-accent bg-accent"
                      : "border-border bg-transparent"
                  }`}
                >
                  {theme === t.id && (
                    <span className="h-2 w-2 rounded-full bg-accent-foreground" />
                  )}
                </span>
              </button>
            ))}
          </div>
        </main>
      </div>
    );
  }

  /* ─── PROFILE DETAILS PAGE ─── */
  if (page === "details") {
    return (
      <div className="min-h-screen bg-background pb-nav">
        <SubHeader
          title="Profile details"
          onBack={() => {
            setIsEditing(false);
            goBack();
          }}
          action={
            !isEditing ? (
              <Button
                size="sm"
                onClick={() => setIsEditing(true)}
                className="h-8 rounded-xl bg-foreground text-background text-xs font-semibold px-4 hover:opacity-90"
              >
                Edit Profile
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={updateProfile}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            )
          }
        />
        <main className="mx-auto max-w-lg px-4 py-6 space-y-6">
          {/* Account */}
          <section>
            <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Account
            </p>
            <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
              {isEditing ? (
                <div className="p-4 flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-9"
                  />
                </div>
              ) : (
                <InfoRow label="Name" value={profile.full_name} />
              )}
              <InfoRow label="Email" value={user.email ?? ""} />
              <InfoRow label="User ID" value={user.id} mono />
              <InfoRow label="Plan" value={profile.selected_plan ?? "—"} />
              <InfoRow
                label="Trial started"
                value={profile.trial_start_date ?? "—"}
              />
            </div>
          </section>

          {/* Metrics */}
          <section>
            <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Metrics
            </p>
            <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
              {isEditing ? (
                <>
                  <div className="p-4 grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">
                        Age
                      </Label>
                      <Input
                        type="number"
                        min={AGE_YEARS.min}
                        max={AGE_YEARS.max}
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">
                        Gender
                      </Label>
                      <Select value={gender} onValueChange={setGender}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">
                        Height (cm)
                      </Label>
                      <Input
                        type="number"
                        min={HEIGHT_CM.min}
                        max={HEIGHT_CM.max}
                        value={height}
                        onChange={(e) => setHeight(e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">
                        Weight (kg)
                      </Label>
                      <Input
                        type="number"
                        step="0.1"
                        min={WEIGHT_KG.min}
                        max={WEIGHT_KG.max}
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div className="flex flex-col gap-1 col-span-2">
                      <Label className="text-xs text-muted-foreground">
                        Activity Level
                      </Label>
                      <Select value={activity} onValueChange={setActivity}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Activity level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Sedentary">Sedentary</SelectItem>
                          <SelectItem value="Lightly Active">
                            Lightly Active
                          </SelectItem>
                          <SelectItem value="Moderately Active">
                            Moderately Active
                          </SelectItem>
                          <SelectItem value="Very Active">
                            Very Active
                          </SelectItem>
                          <SelectItem value="Super Active">
                            Super Active
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1 col-span-2">
                      <Label className="text-xs text-muted-foreground">
                        Goal
                      </Label>
                      <Select
                        value={goal}
                        onValueChange={(v) => {
                          setGoal(v);
                          setLoseRate(
                            v === "gain" ? "gain_0_25kg" : "lose_0_25kg",
                          );
                        }}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Your goal" />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIMARY_GOALS.map(({ value, label, emoji }) => (
                            <SelectItem key={value} value={value}>
                              {emoji} {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {/* Rate sub-selector — shown when Lose Weight is selected */}
                      {goal === "lose" && (
                        <div className="mt-2 space-y-2">
                          <Label className="text-xs text-muted-foreground">
                            Weight loss rate
                          </Label>
                          {LOSE_RATE_OPTIONS.map(({ value, label, detail }) => (
                            <label
                              key={value}
                              className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 transition-colors ${
                                loseRate === value
                                  ? "border-accent bg-accent/10"
                                  : "border-border bg-muted/30 hover:border-border/80"
                              }`}
                              onClick={() => setLoseRate(value)}
                            >
                              <div
                                className={`h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                                  loseRate === value
                                    ? "border-accent"
                                    : "border-muted-foreground/40"
                                }`}
                              >
                                {loseRate === value && (
                                  <div className="h-2 w-2 rounded-full bg-accent" />
                                )}
                              </div>
                              <div>
                                <div className="font-medium text-sm">
                                  {label}
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {detail}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                      {/* Rate sub-selector — shown when Gain Muscle is selected */}
                      {goal === "gain" && (
                        <div className="mt-2 space-y-2">
                          <Label className="text-xs text-muted-foreground">
                            Weight gain rate
                          </Label>
                          {GAIN_RATE_OPTIONS.map(({ value, label, detail }) => (
                            <label
                              key={value}
                              className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 transition-colors ${
                                loseRate === value
                                  ? "border-accent bg-accent/10"
                                  : "border-border bg-muted/30 hover:border-border/80"
                              }`}
                              onClick={() => setLoseRate(value)}
                            >
                              <div
                                className={`h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                                  loseRate === value
                                    ? "border-accent"
                                    : "border-muted-foreground/40"
                                }`}
                              >
                                {loseRate === value && (
                                  <div className="h-2 w-2 rounded-full bg-accent" />
                                )}
                              </div>
                              <div>
                                <div className="font-medium text-sm">
                                  {label}
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {detail}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 divide-x divide-border">
                    <InfoCell label="Age" value={String(profile.age)} />
                    <InfoCell label="Gender" value={profile.gender} />
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-border">
                    <InfoCell
                      label="Height"
                      value={`${profile.height_cm} cm`}
                    />
                    <InfoCell
                      label="Weight"
                      value={`${profile.weight_kg} kg`}
                    />
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-border">
                    <InfoCell label="BMI" value={String(profile.bmi)} />
                    <InfoCell label="BMR" value={`${profile.bmr} kcal`} />
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-border">
                    <InfoCell label="TDEE" value={`${profile.tdee} kcal`} />
                    <InfoCell
                      label="Daily Target"
                      value={`${profile.daily_calorie_target} kcal`}
                    />
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-border">
                    <InfoCell label="Activity" value={profile.activity_level} />
                    <InfoCell label="Goal" value={profile.goal} />
                  </div>
                </>
              )}
            </div>
          </section>
        </main>
      </div>
    );
  }

  /* ─── WORKOUT DETAILS PAGE ─── */
  if (page === "workout-details") {
    return (
      <div className="min-h-screen bg-background pb-nav">
        <SubHeader
          title="Workout details"
          onBack={() => {
            setIsEditingWp(false);
            goBack();
          }}
          action={
            !wp ? null : !isEditingWp ? (
              <Button
                size="sm"
                onClick={() => setIsEditingWp(true)}
                className="h-8 rounded-xl bg-foreground text-background text-xs font-semibold px-4 hover:opacity-90"
              >
                Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setIsEditingWp(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={updateWorkoutProfile}
                  disabled={savingWp}
                >
                  {savingWp ? "Saving…" : "Save"}
                </Button>
              </div>
            )
          }
        />
        <main className="mx-auto max-w-lg px-4 py-6 space-y-6">
          {!wp ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
              <Dumbbell className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="mb-1 text-sm font-semibold">
                You haven't set up your training yet
              </p>
              <p className="mb-4 text-xs text-muted-foreground">
                Answer a few questions on the Workout page to get a personalized
                plan.
              </p>
              <Button
                size="sm"
                onClick={() => navigate({ to: "/workout-setup" })}
                className="rounded-xl"
              >
                Set up my training
              </Button>
            </div>
          ) : (
            <>
              {/* Training profile */}
              <section>
                <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  Training profile
                </p>
                <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
                  {isEditingWp ? (
                    <div className="p-4 grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1 col-span-2">
                        <Label className="text-xs text-muted-foreground">
                          Fitness level
                        </Label>
                        <Select
                          value={wpLevel}
                          onValueChange={(v) =>
                            setWpLevel(v as WorkoutPrefs["fitnessLevel"])
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Fitness level" />
                          </SelectTrigger>
                          <SelectContent>
                            {FITNESS_LEVELS.map(({ value, label }) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1 col-span-2">
                        <Label className="text-xs text-muted-foreground">
                          Goal
                        </Label>
                        <Select
                          value={wpGoal}
                          onValueChange={(v) =>
                            setWpGoal(v as WorkoutPrefs["fitnessGoal"])
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Goal" />
                          </SelectTrigger>
                          <SelectContent>
                            {FITNESS_GOALS.map(({ value, label, emoji }) => (
                              <SelectItem key={value} value={value}>
                                {emoji} {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">
                          Training days/week
                        </Label>
                        <Select
                          value={String(wpDays)}
                          onValueChange={(v) => setWpDays(+v)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                              <SelectItem key={n} value={String(n)}>
                                {n} {n === 1 ? "day" : "days"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">
                          Session length
                        </Label>
                        <Select
                          value={String(wpDuration)}
                          onValueChange={(v) => setWpDuration(+v)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[30, 40, 50, 60, 70, 80, 90, 100, 110, 120].map(
                              (m) => (
                                <SelectItem key={m} value={String(m)}>
                                  {m} min
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1 col-span-2">
                        <Label className="text-xs text-muted-foreground">
                          Muscles per session
                        </Label>
                        <Select
                          value={String(wpMuscles)}
                          onValueChange={(v) =>
                            setWpMuscles(
                              (v === "not_sure"
                                ? "not_sure"
                                : +v) as WorkoutPrefs["musclesPerWorkout"],
                            )
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">One</SelectItem>
                            <SelectItem value="2">Two</SelectItem>
                            <SelectItem value="3">Three</SelectItem>
                            <SelectItem value="not_sure">Not sure</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">
                          Weight unit
                        </Label>
                        <Select
                          value={wpWeightUnit}
                          onValueChange={(v) =>
                            setWpWeightUnit(v as WeightUnit)
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="kg">Kilograms (kg)</SelectItem>
                            <SelectItem value="lbs">Pounds (lbs)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">
                          Cardio distance
                        </Label>
                        <Select
                          value={wpDistanceUnit}
                          onValueChange={(v) =>
                            setWpDistanceUnit(v as DistanceUnit)
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="km">Kilometres (km)</SelectItem>
                            <SelectItem value="mile">Miles</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1 col-span-2">
                        <Label className="text-xs text-muted-foreground">
                          Plan type
                        </Label>
                        <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                          {planTypeLabel ?? (
                            <span className="h-3 w-28 animate-pulse rounded bg-muted" />
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Synced with your Workout page — change it there.
                        </p>
                      </div>
                      <div className="flex flex-col gap-1 col-span-2">
                        <Label className="text-xs text-muted-foreground">
                          Cardio you enjoy (comma-separated)
                        </Label>
                        <Input
                          value={wpCardio}
                          onChange={(e) => setWpCardio(e.target.value)}
                          placeholder={CARDIO_OPTIONS.slice(0, 3).join(", ")}
                          className="h-9"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <InfoRow
                        label="Fitness level"
                        value={
                          FITNESS_LEVELS.find(
                            (l) => l.value === wp.fitnessLevel,
                          )?.label ?? wp.fitnessLevel
                        }
                      />
                      <InfoRow
                        label="Goal"
                        value={
                          FITNESS_GOALS.find((g) => g.value === wp.fitnessGoal)
                            ?.label ?? wp.fitnessGoal
                        }
                      />
                      <div className="grid grid-cols-2 divide-x divide-border">
                        <InfoCell
                          label="Training days"
                          value={`${wp.trainingDaysPerWeek}/week`}
                        />
                        <InfoCell
                          label="Session length"
                          value={`${wp.preferredWorkoutTime} min`}
                        />
                      </div>
                      <InfoRow
                        label="Muscles/session"
                        value={
                          wp.musclesPerWorkout === "not_sure"
                            ? "Not sure"
                            : String(wp.musclesPerWorkout)
                        }
                      />
                      <InfoRow label="Plan type" value={planTypeLabel ?? "…"} />
                      <div className="grid grid-cols-2 divide-x divide-border">
                        <InfoCell label="Weight unit" value={wpWeightUnit} />
                        <InfoCell
                          label="Cardio distance"
                          value={wpDistanceUnit}
                        />
                      </div>
                      <InfoRow
                        label="Cardio"
                        value={
                          wp.cardioActivities.length
                            ? wp.cardioActivities.join(", ")
                            : "None set"
                        }
                      />
                    </>
                  )}
                </div>
              </section>

              {/* Strongest lifts */}
              <section>
                <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  Strongest lifts
                </p>
                <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
                  {isEditingWp ? (
                    <div className="p-4 grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">
                          Bench ({wpWeightUnit})
                        </Label>
                        <Input
                          type="number"
                          value={wpBenchW}
                          onChange={(e) => setWpBenchW(e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">
                          Bench reps
                        </Label>
                        <Input
                          type="number"
                          value={wpBenchR}
                          onChange={(e) => setWpBenchR(e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">
                          Squat ({wpWeightUnit})
                        </Label>
                        <Input
                          type="number"
                          value={wpSquatW}
                          onChange={(e) => setWpSquatW(e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">
                          Squat reps
                        </Label>
                        <Input
                          type="number"
                          value={wpSquatR}
                          onChange={(e) => setWpSquatR(e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">
                          Deadlift ({wpWeightUnit})
                        </Label>
                        <Input
                          type="number"
                          value={wpDeadliftW}
                          onChange={(e) => setWpDeadliftW(e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">
                          Deadlift reps
                        </Label>
                        <Input
                          type="number"
                          value={wpDeadliftR}
                          onChange={(e) => setWpDeadliftR(e.target.value)}
                          className="h-9"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 divide-x divide-border">
                        <InfoCell
                          label="Bench"
                          value={
                            wp.strongestLifts.benchPress.weight
                              ? `${round1(kgToWeight(wp.strongestLifts.benchPress.weight, wpWeightUnit))}${wpWeightUnit} × ${wp.strongestLifts.benchPress.reps ?? "?"}`
                              : "Not set"
                          }
                        />
                        <InfoCell
                          label="Squat"
                          value={
                            wp.strongestLifts.squat.weight
                              ? `${round1(kgToWeight(wp.strongestLifts.squat.weight, wpWeightUnit))}${wpWeightUnit} × ${wp.strongestLifts.squat.reps ?? "?"}`
                              : "Not set"
                          }
                        />
                      </div>
                      <InfoCell
                        label="Deadlift"
                        value={
                          wp.strongestLifts.deadlift.weight
                            ? `${round1(kgToWeight(wp.strongestLifts.deadlift.weight, wpWeightUnit))}${wpWeightUnit} × ${wp.strongestLifts.deadlift.reps ?? "?"}`
                            : "Not set"
                        }
                      />
                    </>
                  )}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    );
  }

  /* ─── MENU PAGE ─── */
  const firstName = profile.full_name?.split(" ")[0] ?? "User";
  const phone = user.phone ?? user.user_metadata?.phone ?? "";

  return (
    <div className="min-h-screen bg-background pb-nav">
      {/* Top bar */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur px-5 py-5 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 min-h-[44px] min-w-[44px] rounded-full flex-shrink-0"
          onClick={goBack}
        >
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <div className="flex flex-1 min-w-0 items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent font-display text-xl font-bold text-accent-foreground glow-accent-sm">
            {firstName[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-bold leading-tight sm:text-3xl">
              {firstName}
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              {phone || user.email}
            </p>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-lg px-4 py-6">
        {/* 2-column grid */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {MENU_ITEMS.map((item) => {
            const cardContent = (
              <>
                <span className="text-muted-foreground group-hover:text-accent transition-colors mb-4 inline-block">
                  {item.icon}
                </span>
                <div className="flex items-center justify-between w-full gap-2">
                  <span className="text-[15px] sm:text-[17px] font-semibold leading-tight line-clamp-2">
                    {item.label}
                  </span>
                  <ChevronRight className="h-5 w-5 text-muted-foreground/50 flex-shrink-0" />
                </div>
              </>
            );

            if (item.to) {
              return (
                <Link
                  key={item.id}
                  to={item.to}
                  className="card-lift group flex flex-col justify-between rounded-2xl border border-border bg-card p-4 sm:p-5 text-left min-h-[96px] sm:min-h-[104px]"
                >
                  {cardContent}
                </Link>
              );
            }

            return (
              <button
                key={item.id}
                onClick={() => setPage(item.id as Page)}
                className="card-lift group flex flex-col justify-between rounded-2xl border border-border bg-card p-4 sm:p-5 text-left min-h-[96px] sm:min-h-[104px]"
              >
                {cardContent}
              </button>
            );
          })}
        </div>

        {/* Sign out */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              className="mt-6 h-12 w-full gap-2 rounded-2xl font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Log out?</AlertDialogTitle>
              <AlertDialogDescription>
                You'll need to sign in again to get back to your account.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/login", replace: true });
                }}
              >
                Log out
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Social icons */}
        <div className="mt-8 flex items-center justify-center gap-6">
          {[
            {
              icon: <Instagram className="h-5 w-5" />,
              label: "Instagram",
              href: "https://instagram.com/usedombelz",
            },
            {
              icon: <Facebook className="h-5 w-5" />,
              label: "Facebook",
              href: "https://facebook.com/Usedombelz",
            },
            {
              icon: <Youtube className="h-5 w-5" />,
              label: "YouTube",
              href: "https://youtube.com/@usedombelz",
            },
            // TODO: switch to LEGAL.supportEmail once that inbox is live.
            {
              icon: <Mail className="h-5 w-5" />,
              label: "Email",
              href: emailLink("usedombelz@gmail.com").href,
            },
          ].map((s) => (
            <a
              key={s.label}
              href={s.href}
              aria-label={s.label}
              {...(s.href.startsWith("http") && {
                target: "_blank",
                rel: "noopener noreferrer",
              })}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-accent hover:text-accent transition-all"
            >
              {s.icon}
            </a>
          ))}
        </div>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Plan & billing (was "Transactions")
══════════════════════════════════════════════════════ */
function TransactionsPage({
  profile,
  onBack,
  onPricing,
}: {
  profile: any;
  onBack: () => void;
  onPricing: () => void;
}) {
  const plan = findPlan(profile.selected_plan);
  // A referred user still pays the list price; their gift is extra days, shown
  // as a label under it.
  const { status: referralStatus, gymLink, loading: giftLoading } = useGift();
  const giftKind =
    plan && !giftLoading
      ? activeGift({ referralStatus, gymLink, planId: plan.id })
      : null;
  // Referral rewards extend the trial, so the length is no longer a constant —
  // see src/lib/trial.ts, which the Refer & Earn page shares.
  const bonusDays = profile.bonus_trial_days ?? 0;
  const daysLeft = trialDaysLeft(profile.trial_start_date, bonusDays);
  const trialActive = isTrialActive(profile.trial_start_date, bonusDays);

  // Everything below the trial card comes from get_billing_summary(), which
  // recomputes access before returning — so opening this page is also what
  // makes a referral bonus whose 3-day hold has elapsed appear.
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loadingBilling, setLoadingBilling] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refundFor, setRefundFor] = useState<BillingCharge | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadingBilling(true);
    getBillingSummary()
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch((e) => {
        if (!cancelled)
          toast.error(
            e instanceof Error ? e.message : "Could not load billing",
          );
      })
      .finally(() => {
        if (!cancelled) setLoadingBilling(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const sub = summary?.subscription ?? null;
  const subLive =
    !!sub &&
    !sub.cancelled_at &&
    ["authenticated", "active", "pending", "halted"].includes(sub.status);
  // undefined while the summary loads: no "Ended" / "Buy" until we know. A
  // failed load falls back to the trial dates, as before.
  const hasAccessNow: boolean | undefined =
    summary?.has_access ?? (loadingBilling ? undefined : trialActive);
  const billingSkeleton = (w: string) => (
    <span
      className={`inline-block h-5 ${w} animate-pulse rounded-md bg-muted`}
    />
  );

  async function doCancel() {
    setBusy(true);
    try {
      await cancelSubscription();
      // Access is not shortened. The days already paid for keep counting.
      toast.success("Subscription cancelled. Your paid days stay yours.");
      invalidateAccess(profile.id);
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel");
    } finally {
      setBusy(false);
    }
  }

  async function doRefund() {
    if (!refundFor) return;
    setBusy(true);
    try {
      await requestRefund(refundFor.id, refundReason);
      toast.success("Refund request sent. We'll email you once it's settled.");
      setRefundFor(null);
      setRefundReason("");
      invalidateAccess(profile.id);
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not request a refund",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-nav">
      <SubHeader title="Plan & billing" onBack={onBack} />
      <main className="mx-auto max-w-lg space-y-6 px-4 py-6">
        {/* Current plan */}
        <section>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Current plan
          </p>
          {plan ? (
            <div className="relative overflow-hidden rounded-2xl border border-accent/30 bg-card p-5">
              <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-accent/10 blur-2xl" />
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-xl font-bold">
                      {plan.name}
                    </h3>
                    {hasAccessNow === undefined ? (
                      billingSkeleton("w-16")
                    ) : (
                      <Badge
                        className={
                          hasAccessNow
                            ? "bg-accent text-accent-foreground"
                            : "bg-warn/20 text-warn"
                        }
                      >
                        {hasAccessNow
                          ? trialActive
                            ? "Trial active"
                            : "Active"
                          : "Ended"}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    ₹{plan.price}
                    {periodLabel(plan.months)}
                    {trialActive ? " after trial" : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {PRICE_TAX_NOTE}
                  </p>
                  {giftKind && (
                    <p className="mt-1 text-xs font-semibold text-accent">
                      {giftLabel(giftKind)}
                    </p>
                  )}
                </div>
                <BadgeCheck className="h-6 w-6 text-accent" />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" /> Trial started
                  </div>
                  <p className="mt-1 text-sm font-semibold">
                    {profile.trial_start_date ?? "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {trialActive ? "Days left" : "Ended on"}
                  </div>
                  <p className="mt-1 text-sm font-semibold">
                    {trialActive
                      ? `${daysLeft} day${daysLeft === 1 ? "" : "s"}`
                      : (trialEndDate(profile.trial_start_date, bonusDays)
                          ?.toISOString()
                          .slice(0, 10) ?? "—")}
                  </p>
                  {bonusDays > 0 && (
                    <p className="mt-0.5 text-[11px] font-medium text-accent">
                      +{bonusDays} from referrals
                    </p>
                  )}
                </div>
              </div>

              {summary?.access_until && (
                <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {hasAccessNow ? "Access until" : "Access ended"}
                  </div>
                  <p className="mt-1 text-sm font-semibold">
                    {formatBillingDate(summary.access_until)}
                  </p>
                  {summary.bonus_premium_days > 0 && (
                    <p className="mt-0.5 text-[11px] font-medium text-accent">
                      includes {summary.bonus_premium_days} premium days from
                      referrals
                    </p>
                  )}
                </div>
              )}

              <Button
                variant="outline"
                className="mt-4 w-full rounded-xl font-semibold"
                onClick={onPricing}
                disabled={hasAccessNow === undefined}
              >
                {/* Once access has lapsed the only useful move is paying, so
                    the button says that rather than "View plans". */}
                {hasAccessNow === undefined
                  ? billingSkeleton("w-24")
                  : hasAccessNow
                    ? "View plans"
                    : `Buy · ₹${plan.price}`}
              </Button>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <Tag className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="font-semibold">No plan selected yet</p>
              <p className="mx-auto mt-1 max-w-[240px] text-sm text-muted-foreground">
                {profile.trial_start_date
                  ? "Your free trial is over. Choose a plan to keep going."
                  : `Start a free ${BASE_TRIAL_DAYS}-day trial — no credit card required.`}
              </p>
              <Button
                className="mt-4 rounded-full bg-accent px-6 font-bold text-accent-foreground hover:bg-accent/90"
                onClick={onPricing}
              >
                View plans
              </Button>
            </div>
          )}
        </section>

        {/* Subscription */}
        {subLive && (
          <section>
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Subscription
            </p>
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold capitalize">{sub!.tier} plan</p>
                  <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                    {sub!.status} · started {formatBillingDate(sub!.created_at)}
                  </p>
                </div>
                <Badge className="bg-accent/15 text-accent">Renews</Badge>
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={busy}
                    className="mt-4 w-full rounded-xl font-semibold"
                  >
                    Cancel subscription
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Cancel your subscription?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      It stops renewing. The days you have already paid for stay
                      yours until{" "}
                      {formatBillingDate(summary?.access_until ?? null)} —
                      nothing is cut short.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep it</AlertDialogCancel>
                    <AlertDialogAction onClick={doCancel}>
                      Cancel subscription
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </section>
        )}

        {/* Payment history */}
        <section>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Payment history
          </p>

          {loadingBilling ? (
            <div className="flex justify-center rounded-2xl border border-border bg-card p-8">
              <LogoLoader className="h-8 w-8 text-accent" />
            </div>
          ) : !summary?.charges.length ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center">
              <ListOrdered className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-semibold">No payments yet</p>
              <p className="mx-auto mt-1 max-w-[260px] text-xs text-muted-foreground">
                You're on the free trial — enjoy full access meanwhile.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {summary.charges.map((c) => {
                const open = summary.refund_requests.find(
                  (r) => r.charge_id === c.id && r.status === "open",
                );
                return (
                  <div
                    key={c.id}
                    className="rounded-2xl border border-border bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">
                          {formatRupees(c.amount_paise)}{" "}
                          <span className="text-xs font-medium capitalize text-muted-foreground">
                            · {c.tier}
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatBillingDate(c.charged_at)} · {c.period_days}{" "}
                          days
                        </p>
                      </div>
                      {c.refunded_at ? (
                        <Badge className="bg-muted text-muted-foreground">
                          Refunded
                        </Badge>
                      ) : open ? (
                        <Badge className="bg-warn/20 text-warn">
                          Refund requested
                        </Badge>
                      ) : null}
                    </div>

                    {/* refundable is computed in SQL, by the same rules
                        request_refund() re-checks — so the button and the
                        guard behind it cannot drift apart. */}
                    {c.refundable && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setRefundFor(c);
                          setRefundReason("");
                        }}
                        className="mt-3 w-full rounded-xl font-semibold"
                      >
                        Request refund
                      </Button>
                    )}
                  </div>
                );
              })}
              <p className="px-1 pt-1 text-[11px] text-muted-foreground">
                Refunds can be requested within 2 days of a payment.
              </p>
            </div>
          )}
        </section>
      </main>

      <Dialog
        open={!!refundFor}
        onOpenChange={(o) => {
          if (!o) setRefundFor(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a refund</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {refundFor && formatRupees(refundFor.amount_paise)} paid on{" "}
            {refundFor && formatBillingDate(refundFor.charged_at)}. Tell us what
            went wrong and we'll take it from there.
          </p>
          <Input
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value)}
            placeholder="Reason (optional)"
            maxLength={300}
          />
          <Button
            onClick={doRefund}
            disabled={busy}
            className="w-full rounded-xl bg-accent font-bold text-accent-foreground hover:bg-accent/90"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Send request"
            )}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** ₹ with Indian digit grouping, from the paise the charge row stores. */
function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

function formatBillingDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* ═══════════════════════════════════════════════════
   Settings
══════════════════════════════════════════════════════ */
function SettingsPage({
  userId,
  onBack,
  onTours,
  onSignOut,
}: {
  userId: string;
  onBack: () => void;
  onTours: () => void;
  onSignOut: () => Promise<void>;
}) {
  const navigate = useNavigate();
  // Meal categories
  const [meals, setMeals] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`meal_prefs_${userId}`);
      const parsed = saved ? JSON.parse(saved) : null;
      return Array.isArray(parsed) && parsed.length > 0
        ? parsed
        : [...DEFAULT_MEALS];
    } catch {
      return [...DEFAULT_MEALS];
    }
  });

  useEffect(() => {
    // DB-first so custom names survive a cache clear; falls back to the
    // localStorage-seeded initial state above for a brand-new user.
    loadMealNames(userId).then((names) => {
      if (names) setMeals(names);
    });
  }, [userId]);

  // Water prefs (shared with the WaterStreak widget via src/lib/water.ts)
  const [waterGoal, setWaterGoal] = useState("2500");
  const [cupSize, setCupSize] = useState("250");

  useEffect(() => {
    loadWaterPrefs(userId, (p) => {
      setWaterGoal(String(p.goalMl));
      setCupSize(String(p.cupMl));
    });
  }, [userId]);

  const [exporting, setExporting] = useState<ExportKind | null>(null);
  // When each export may next run (null = now); loaded from the server, which
  // also enforces it (migration 20261008180000_data_export_limits).
  const [exportNext, setExportNext] = useState<Record<
    ExportKind,
    string | null
  > | null>(null);
  const loadExportStatus = async () => {
    const { data } = await supabase.rpc("data_export_status");
    const next = (data as { next?: Record<ExportKind, string | null> } | null)
      ?.next;
    if (next) setExportNext(next);
    return next ?? null;
  };
  useEffect(() => {
    loadExportStatus();
  }, [userId]);

  /**
   * Run one export under its limit: ask the server first, build and download,
   * and only then count it, so a failed export does not use up the turn.
   */
  const runExport = async (
    kind: ExportKind,
    build: () => Promise<boolean>,
    done: string,
  ) => {
    setExporting(kind);
    try {
      const next = (await loadExportStatus())?.[kind];
      if (next) {
        toast.info(
          `You've already downloaded this recently. It's available again on ${formatExportDate(next)}.`,
        );
        return;
      }
      if (!(await build())) return;
      await supabase.rpc("record_data_export", { p_kind: kind });
      await loadExportStatus();
      toast.success(done);
    } catch {
      toast.error("Export failed. Please try again; it wasn't counted.");
    } finally {
      setExporting(null);
    }
  };

  // Account deletion (required by Google Play & App Store policies)
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await serverDeleteAccount();
    } catch (e) {
      toast.error(
        (e as Error).message ??
          `Deletion failed — please email ${LEGAL.supportEmail}`,
      );
      setDeleting(false);
      return;
    }

    toast.success("Your account and data have been deleted");
    setDeleteOpen(false);
    setDeleteConfirm("");
    setDeleting(false);

    // Outside the try: the account is already gone, so signing out is cleanup.
    // It calls /auth/v1/logout with a token whose user no longer exists, and a
    // rejection there used to surface as "Deletion failed" right after the
    // success toast.
    try {
      await onSignOut();
    } catch {
      // Session is dead either way; the redirect below is what matters.
    }
  };

  const saveMeals = () => {
    const clean = meals.map((m) => m.trim()).filter(Boolean);
    if (clean.length === 0) {
      toast.error("Keep at least one meal");
      return;
    }
    saveMealNames(userId, clean);
    setMeals(clean);
    toast.success("Meal categories saved");
  };

  const saveWater = async () => {
    const goal = parseInt(waterGoal, 10);
    const cup = parseInt(cupSize, 10);
    if (!Number.isFinite(goal) || goal < 1500) {
      toast.error("Daily goal must be at least 1500 ml");
      return;
    }
    if (!Number.isFinite(cup) || cup < 25) {
      toast.error("Cup size must be at least 25 ml");
      return;
    }
    await saveWaterPrefs(userId, { goalMl: goal, cupMl: cup });
    toast.success("Water preferences saved");
  };

  const download = (content: string | Blob, filename: string, type: string) => {
    const blob =
      content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stamp = () => new Date().toISOString().slice(0, 10);
  const byDate = <T extends { date: string | null }>(rows: T[]) =>
    rows.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  // Log tables come through getHistory: every row (paged past PostgREST's
  // 1000-row cap) and no download at all when the browser cache is current.
  const exportJSON = () =>
    runExport(
      "json",
      async () => {
        const [profileRes, food, weight, workouts, water, savedMeals] =
          await Promise.all([
            supabase
              .from("user_profiles")
              .select("*")
              .eq("id", userId)
              .maybeSingle(),
            getHistory(userId, "food_logs"),
            getHistory(userId, "weight_entries"),
            getHistory(userId, "workout_logs"),
            supabase
              .from("water_logs")
              .select("*")
              .eq("user_id", userId)
              .order("date"),
            supabase.from("saved_meals").select("*").eq("user_id", userId),
          ]);
        // A partial file must not count as this week's export.
        if (profileRes.error || water.error || savedMeals.error)
          throw new Error("read failed");
        const payload = {
          exported_at: new Date().toISOString(),
          profile: profileRes.data,
          food_logs: byDate(food),
          weight_entries: byDate(weight),
          workout_logs: byDate(workouts),
          water_logs: water.data ?? [],
          saved_meals: savedMeals.data ?? [],
        };
        download(
          JSON.stringify(payload, null, 2),
          `dombelz-export-${stamp()}.json`,
          "application/json",
        );
        return true;
      },
      "Export downloaded",
    );

  const exportCSV = () =>
    runExport(
      "csv",
      async () => {
        const rows = byDate(await getHistory(userId, "food_logs"));
        const esc = (v: unknown) => {
          const s = String(v ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const header =
          "date,meal_type,food_name,quantity_g,calories,protein_g,carbs_g,fat_g,fiber_g";
        const body = rows
          .map((r) =>
            [
              r.date,
              r.meal_type,
              r.food_name,
              r.quantity_g,
              r.calories,
              r.protein_g,
              r.carbs_g,
              r.fat_g,
              r.fiber_g,
            ]
              .map(esc)
              .join(","),
          )
          .join("\n");
        download(
          `${header}\n${body}`,
          `dombelz-food-diary-${stamp()}.csv`,
          "text/csv",
        );
        return true;
      },
      "Food diary downloaded",
    );

  const exportWeightPdf = () =>
    runExport(
      "weight_pdf",
      async () => {
        const entries = await getHistory(userId, "weight_entries");
        if (entries.length === 0) {
          toast.info("No weight entries yet. Log your weight first.");
          return false;
        }
        const { buildWeightReport } = await import("@/lib/weightReport");
        const unit = getCachedWorkoutPrefs(userId)?.weightUnit ?? "kg";
        download(
          await buildWeightReport(entries, unit),
          `dombelz-weight-report-${stamp()}.pdf`,
          "application/pdf",
        );
        return true;
      },
      "Weight report downloaded",
    );

  return (
    <div className="min-h-screen bg-background pb-nav">
      <SubHeader title="Settings" onBack={onBack} />
      <main className="mx-auto max-w-lg space-y-6 px-4 py-6">
        {/* General — Theme lives on its own Profile card */}
        <section>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            General
          </p>
          <button
            onClick={onTours}
            className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 transition-colors hover:bg-muted/40"
          >
            <span className="flex items-center gap-3 text-sm font-medium">
              <Compass className="h-5 w-5 text-accent" /> App tour
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
          </button>
        </section>

        {/* Meal categories */}
        <section>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Meal categories
          </p>
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Utensils className="h-4 w-4 text-accent" />
              Your daily meals ({meals.length}/6)
            </div>
            <div className="space-y-2">
              {meals.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-5 text-center text-xs font-bold text-muted-foreground/60">
                    {i + 1}.
                  </span>
                  <Input
                    value={m}
                    onChange={(e) => {
                      const copy = [...meals];
                      copy[i] = e.target.value;
                      setMeals(copy);
                    }}
                    className="h-10"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={meals.length <= 1}
                    onClick={() => setMeals(meals.filter((_, j) => j !== i))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 rounded-xl border-dashed"
                disabled={meals.length >= 6}
                onClick={() => setMeals([...meals, `Meal ${meals.length + 1}`])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add meal
              </Button>
              <Button
                size="sm"
                className="flex-1 rounded-xl bg-accent font-bold text-accent-foreground hover:bg-accent/90"
                onClick={saveMeals}
              >
                Save
              </Button>
            </div>
          </div>
        </section>

        {/* Water */}
        <section>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Water tracking
          </p>
          <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <GlassWater className="h-3.5 w-3.5" /> Daily goal (ml)
                </Label>
                <Input
                  type="number"
                  value={waterGoal}
                  onChange={(e) => setWaterGoal(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Droplets className="h-3.5 w-3.5" /> Cup size (ml)
                </Label>
                <Input
                  type="number"
                  value={cupSize}
                  onChange={(e) => setCupSize(e.target.value)}
                  className="h-10"
                />
              </div>
            </div>
            <Button
              size="sm"
              className="w-full rounded-xl bg-accent font-bold text-accent-foreground hover:bg-accent/90"
              onClick={saveWater}
            >
              Save water preferences
            </Button>
          </div>
        </section>

        {/* Data export */}
        <section>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Data export
          </p>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {(
              [
                ["json", "Export everything (JSON)", exportJSON],
                ["csv", "Export food diary (CSV)", exportCSV],
                // Web and installed web app only for now; the phone app's
                // WebView can't save a generated file without a share sheet.
                ...(isNativeApp()
                  ? []
                  : [
                      [
                        "weight_pdf",
                        "Export weight & photos (PDF)",
                        exportWeightPdf,
                      ] as const,
                    ]),
              ] as const
            ).map(([kind, label, run]) => (
              <button
                key={kind}
                onClick={run}
                disabled={exporting !== null}
                className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-muted/40 disabled:opacity-60"
              >
                <span className="flex items-center gap-3 text-sm font-medium">
                  <Download className="h-5 w-5 shrink-0 text-accent" />
                  <span>
                    {label}
                    {exportNext?.[kind] && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        Available again on {formatExportDate(exportNext[kind]!)}
                      </span>
                    )}
                  </span>
                </span>
                {exporting === kind ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                )}
              </button>
            ))}
          </div>
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            Your data belongs to you. Exports include food, weight, workout, and
            water logs. Everything (JSON) is once a week. The food diary is once
            a week (once a month on the free plan). The weight report is once a
            month; single photos can be downloaded from each weight entry.
          </p>
        </section>

        {/* Account */}
        <section>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Account
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="h-12 w-full gap-2 rounded-2xl font-semibold"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Log out?</AlertDialogTitle>
                <AlertDialogDescription>
                  You'll need to sign in again to get back to your account.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onSignOut}>
                  Log out
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>

        {/* Danger zone */}
        <section>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-destructive">
            Danger zone
          </p>
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <div className="mb-3 flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-semibold">Delete account & data</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Permanently erases your profile, food diary, workouts, weight
                  history, photos, and water logs. This cannot be undone.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="h-11 w-full gap-2 rounded-xl border-destructive/40 font-semibold text-destructive hover:bg-destructive hover:text-white"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4" /> Delete my account
            </Button>
          </div>
        </section>

        {/* Delete confirmation dialog */}
        <Dialog
          open={deleteOpen}
          onOpenChange={(o) => {
            if (deleting) return;
            // Clear on every close, not just Cancel — otherwise dismissing with
            // Escape reopens the dialog with DELETE still typed and the
            // destructive button already armed.
            if (!o) setDeleteConfirm("");
            setDeleteOpen(o);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" /> Delete everything?
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This permanently deletes all your Dombelz data — profile, logs,
                photos, plans, and favorites. Consider exporting your data
                first. It also cancels a subscription bought on our website —
                request any refund before deleting. App Store or Google Play
                subscriptions are not cancelled; cancel them in the store. Type{" "}
                <span className="font-mono font-bold text-destructive">
                  DELETE
                </span>{" "}
                to confirm.
              </p>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="Type DELETE"
                className="h-11 text-center font-mono font-bold tracking-widest"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  disabled={deleting}
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeleteConfirm("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 rounded-xl font-bold"
                  disabled={deleteConfirm !== "DELETE" || deleting}
                  onClick={deleteAccount}
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Delete forever"
                  )}
                </Button>
              </div>
              <p className="text-center text-[11px] text-muted-foreground">
                Your account and all associated data are permanently deleted
                immediately.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Help & support
══════════════════════════════════════════════════════ */
function HelpPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-background pb-nav">
      <SubHeader title="Help & support" onBack={onBack} />
      <main className="mx-auto max-w-lg px-4 py-6">
        <HelpCenter />
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   About
══════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════
   App tours — opened from Settings. Each button starts its tour directly;
   only the home & food tour is ever offered at onboarding.
══════════════════════════════════════════════════════ */
function ToursPage({ userId, onBack }: { userId: string; onBack: () => void }) {
  const navigate = useNavigate();
  const tours = [
    {
      icon: Compass,
      label: "Home & food tour",
      start: () => {
        setTour(userId, "dashboard");
        navigate({ to: "/dashboard" });
      },
    },
    {
      icon: Scale,
      label: "Weight logging tour",
      start: () => navigate({ to: "/weight", search: { tour: 1 } }),
    },
  ];
  return (
    <div className="min-h-screen bg-background pb-nav">
      <SubHeader title="App tours" onBack={onBack} />
      <main className="mx-auto max-w-lg space-y-2 px-4 py-6">
        {tours.map(({ icon: Icon, label, start }) => (
          <button
            key={label}
            onClick={start}
            className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 transition-colors hover:bg-muted/40"
          >
            <span className="flex items-center gap-3 text-sm font-medium">
              <Icon className="h-5 w-5 text-accent" /> {label}
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
          </button>
        ))}
      </main>
    </div>
  );
}

function AboutPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-background pb-nav">
      <SubHeader title="About us" onBack={onBack} />
      <main className="mx-auto max-w-lg space-y-6 px-4 py-6">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 text-center">
          <div className="pointer-events-none absolute -top-16 left-1/2 h-40 w-72 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
          <div className="relative">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-accent-foreground glow-accent-sm">
              <BrandLogo className="h-9 w-9" />
            </div>
            <h2 className="font-display text-2xl font-bold">Dombelz</h2>
            <p className="mt-1 text-xs font-bold uppercase tracking-widest text-accent">
              Train. Track. Transform.
            </p>
            <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Dombelz was built on a simple idea: tracking should take seconds,
              not minutes. When logging is effortless, consistency follows — and
              consistency is what transforms bodies.
            </p>
          </div>
        </div>

        <section>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            What's inside
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                icon: <Camera className="h-5 w-5" />,
                label: "AI photo & voice logging",
              },
              {
                icon: <Utensils className="h-5 w-5" />,
                label: "IFCT 2017 Indian food data",
              },
              {
                icon: <Dumbbell className="h-5 w-5" />,
                label: "300+ exercise library",
              },
              {
                icon: <Trophy className="h-5 w-5" />,
                label: "Streaks & leaderboard",
              },
            ].map((f) => (
              <div
                key={f.label}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"
              >
                <span className="text-accent">{f.icon}</span>
                <span className="text-xs font-semibold leading-tight">
                  {f.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            App info
          </p>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            <InfoRow label="Version" value="2.0.0" />
            <InfoRow
              label="Nutrition data"
              value="IFCT 2017 + Open Food Facts"
            />
            <InfoRow label="AI engine" value="Groq · GPT-OSS 120B" />
          </div>
        </section>

        <p className="px-4 text-center text-xs leading-relaxed text-muted-foreground">
          Dombelz provides general fitness information and is not a substitute
          for professional medical advice. Consult a healthcare provider before
          starting any diet or exercise program.
        </p>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Sub-components
══════════════════════════════════════════════════════ */

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={`text-sm font-medium text-right max-w-[55%] truncate ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col px-4 py-3">
      <span className="text-xs text-muted-foreground mb-0.5">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}
