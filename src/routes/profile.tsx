import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  Linkedin,
  Facebook,
  Twitter,
  Check,
  Sparkles,
  HelpCircle,
  LogOut,
  Download,
  Utensils,
  GlassWater,
  Copy,
  Share2,
  Mail,
  Bug,
  Activity,
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
  AlertTriangle,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";
import { AchievementsPage } from "@/components/Achievements";
import { todayLocal } from "@/lib/dates";
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

export const Route = createFileRoute("/profile")({
  component: Profile,
  validateSearch: (s: Record<string, unknown>): { page?: Page } =>
    s.page === "refer" ? { page: "refer" } : {},
});

const plans = [
  {
    id: "starter",
    name: "Starter",
    price: 299,
    popular: false,
    features: [
      "Food logging (up to 3 meals/day)",
      "Calorie tracking",
      "Basic charts",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 599,
    popular: true,
    features: [
      "Unlimited food logging",
      "Macro tracking (protein, carbs, fats)",
      "Monthly progress graphs",
      "Meal history",
    ],
  },
  {
    id: "elite",
    name: "Elite",
    price: 999,
    popular: false,
    features: [
      "Everything in Pro",
      "AI meal suggestions",
      "Priority support",
      "Export data as PDF",
    ],
  },
];

type Page =
  | "menu"
  | "details"
  | "theme"
  | "transactions"
  | "pricing"
  | "settings"
  | "help"
  | "about"
  | "refer"
  | "achievements";

/* ─── menu items ─── */
const MENU_ITEMS: {
  id: Page;
  icon: React.ReactNode;
  label: string;
}[] = [
  { id: "details",      icon: <User className="h-7 w-7 md:h-[26px] md:w-[26px]" />,          label: "Profile details" },
  { id: "achievements", icon: <Award className="h-7 w-7 md:h-[26px] md:w-[26px]" />,         label: "Achievements" },
  { id: "transactions", icon: <ListOrdered className="h-7 w-7 md:h-[26px] md:w-[26px]" />,   label: "Plan & billing" },
  { id: "theme",        icon: <Palette className="h-7 w-7 md:h-[26px] md:w-[26px]" />,       label: "Theme" },
  { id: "pricing",      icon: <Tag className="h-7 w-7 md:h-[26px] md:w-[26px]" />,           label: "Pricing" },
  { id: "settings",     icon: <Settings className="h-7 w-7 md:h-[26px] md:w-[26px]" />,      label: "Settings" },
  { id: "help",         icon: <MessageCircle className="h-7 w-7 md:h-[26px] md:w-[26px]" />, label: "Help & support" },
  { id: "about",        icon: <Info className="h-7 w-7 md:h-[26px] md:w-[26px]" />,          label: "About us" },
  { id: "refer",        icon: <Gift className="h-7 w-7 md:h-[26px] md:w-[26px]" />,          label: "Invite friends" },
];

const FAQS = [
  {
    q: "How are my calorie and macro targets calculated?",
    a: "We use the Mifflin-St Jeor equation for BMR, multiply by your activity level for TDEE, then apply your goal (e.g. −500 kcal/day for 0.5 kg/week loss). Protein and fat come from g-per-kg bodyweight recommendations, and carbs fill the remainder.",
  },
  {
    q: "How do I log food with a photo or my voice?",
    a: "On the Food page, tap the Photo or Voice button under the search bar. Photo mode analyzes your plate with vision AI; voice mode understands phrases like “2 rotis and a bowl of dal.” You can edit anything before saving.",
  },
  {
    q: "Why is my streak not increasing?",
    a: "A day counts toward your streak when you log at least one food or workout that day. Streaks are checked against your local date, so log before midnight!",
  },
  {
    q: "How do I change my meal names (Breakfast, Lunch…)?",
    a: "Go to Settings → Meal categories, or tap the gear icon next to “Log Food” on the Food page. You can have 2–6 meals with any names you like.",
  },
  {
    q: "Can I change my goal later?",
    a: "Yes — edit your goal any time in Profile details. Your calorie target and macros are recalculated instantly.",
  },
  {
    q: "How do I get my data out?",
    a: "Settings → Data export lets you download all your logs as JSON or your food diary as CSV. Your data is yours.",
  },
];

const DEFAULT_MEALS = ["Breakfast", "Lunch", "Dinner", "Snack"];

/* ═══════════════════════════════════════════════════
   Main component
══════════════════════════════════════════════════════ */
function Profile() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { page: initialPage } = Route.useSearch();
  const [page, setPage] = useState<Page>(initialPage ?? "menu");
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

  useEffect(() => {
    setTheme(localStorage.getItem("theme") || "dark");
  }, []);

  const changeTheme = (newTheme: string) => {
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.classList.remove(
      "dark",
      "theme-ocean",
      "theme-sunset",
      "theme-forest"
    );
    if (newTheme !== "light") {
      document.documentElement.classList.add(newTheme);
    }
  };

  const startPlan = async (planId: string) => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    const { error } = await supabase
      .from("user_profiles")
      .update({
        selected_plan: planId,
        trial_start_date: todayLocal(),
      })
      .eq("id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Free trial started!");
    setProfile((p: any) => ({
      ...p,
      selected_plan: planId,
      trial_start_date: todayLocal(),
    }));
    setPage("menu");
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
        // No profile row means onboarding was never finished — the guard below
        // waits on `profile`, so without this the page spins forever.
        if (!data) {
          navigate({ to: "/quiz" });
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

  const updateProfile = async () => {
    if (!user || !profile) return;
    const w = +weight || 0;
    const h = +height || 0;
    const a = +age || 0;

    if (!w || w <= 0 || !h || h <= 0 || !a || a < 16) {
      toast.error("Age must be at least 16; height and weight must be greater than 0");
      return;
    }

    setSaving(true);
    const bmi = calcBMI(w, h);
    const bmr = calcBMR(w, h, a, gender || profile.gender);
    const tdee = calcTDEE(bmr, activity || profile.activity_level);
    const goalKey = resolveGoalKey(goal || decomposeGoalKey(profile.goal).primary, loseRate);
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
    if (error) { toast.error(error.message); return; }
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

  if (!user || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  /* ─── SUB PAGES ─── */
  if (page === "transactions")
    return (
      <TransactionsPage
        profile={profile}
        onBack={() => setPage("menu")}
        onPricing={() => setPage("pricing")}
      />
    );
  if (page === "settings")
    return (
      <SettingsPage
        userId={user.id}
        onBack={() => setPage("menu")}
        onTheme={() => setPage("theme")}
        onSignOut={async () => {
          await signOut();
          navigate({ to: "/login" });
        }}
      />
    );
  if (page === "help") return <HelpPage onBack={() => setPage("menu")} />;
  if (page === "about") return <AboutPage onBack={() => setPage("menu")} />;
  if (page === "refer")
    return <ReferPage userId={user.id} onBack={() => setPage("menu")} />;
  if (page === "achievements")
    return <AchievementsPage userId={user.id} onBack={() => setPage("menu")} />;

  /* ─── PRICING PAGE ─── */
  if (page === "pricing") {
    return (
      <div className="min-h-screen bg-background pb-24">
        <SubHeader
          title="Pricing"
          onBack={() => setPage("menu")}
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
          <div className="mb-8 rounded-2xl bg-accent text-accent-foreground p-5 text-center shadow-lg glow-accent-sm">
            <div className="mb-1 flex items-center justify-center gap-2 text-base font-bold">
              <Sparkles className="h-5 w-5" /> Try any plan FREE for 2 days
            </div>
            <p className="text-sm font-medium opacity-90">
              No credit card required. After 2 days, choose a plan to continue.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((p) => (
              <Card
                key={p.id}
                className={`card-lift relative border-border/60 ${p.popular ? "border-accent shadow-xl glow-accent-sm" : ""}`}
              >
                {p.popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent font-bold uppercase tracking-wider text-accent-foreground">
                    Most Popular
                  </Badge>
                )}
                {profile.selected_plan === p.id && (
                  <Badge className="absolute -top-3 right-4 bg-foreground text-background">
                    Current
                  </Badge>
                )}
                <CardContent className="p-6">
                  <h3 className="font-display text-xl font-bold">{p.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="font-display text-4xl font-bold">₹{p.price}</span>
                    <span className="text-sm text-muted-foreground">/month</span>
                  </div>
                  <ul className="mt-6 space-y-3 text-sm">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                        <span className="text-muted-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={() => startPlan(p.id)}
                    className={`mt-6 w-full rounded-full font-bold ${p.popular ? "bg-accent text-accent-foreground hover:bg-accent/90" : ""}`}
                    variant={p.popular ? "default" : "outline"}
                    disabled={profile.selected_plan === p.id}
                  >
                    {profile.selected_plan === p.id
                      ? "Your current plan"
                      : "Start Free Trial"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>
    );
  }

  /* ─── THEME PAGE ─── */
  if (page === "theme") {
    return (
      <div className="min-h-screen bg-background pb-24">
        <SubHeader title="Theme" onBack={() => setPage("menu")} />
        <main className="mx-auto max-w-lg px-4 py-8">
          <p className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Appearance
          </p>
          <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
            {[
              { id: "dark",         label: "Carbon (default)", icon: <Moon className="h-5 w-5 text-accent" /> },
              { id: "light",        label: "Light",  icon: <Sun className="h-5 w-5 text-yellow-500" /> },
              { id: "theme-ocean",  label: "Ocean",  icon: <Droplets className="h-5 w-5 text-cyan-400" /> },
              { id: "theme-sunset", label: "Sunset", icon: <Sunset className="h-5 w-5 text-orange-400" /> },
              { id: "theme-forest", label: "Forest", icon: <TreePine className="h-5 w-5 text-green-500" /> },
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
      <div className="min-h-screen bg-background pb-24">
        <SubHeader
          title="Profile details"
          onBack={() => { setIsEditing(false); setPage("menu"); }}
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
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" className="h-8 text-xs" onClick={updateProfile} disabled={saving}>
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
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
                </div>
              ) : (
                <InfoRow label="Name" value={profile.full_name} />
              )}
              <InfoRow label="Email" value={user.email ?? ""} />
              <InfoRow label="User ID" value={user.id} mono />
              <InfoRow label="Plan" value={profile.selected_plan ?? "—"} />
              <InfoRow label="Trial started" value={profile.trial_start_date ?? "—"} />
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
                      <Label className="text-xs text-muted-foreground">Age</Label>
                      <Input type="number" value={age} onChange={(e) => setAge(e.target.value)} className="h-9" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Gender</Label>
                      <Select value={gender} onValueChange={setGender}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Gender" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Height (cm)</Label>
                      <Input type="number" value={height} onChange={(e) => setHeight(e.target.value)} className="h-9" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Weight (kg)</Label>
                      <Input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} className="h-9" />
                    </div>
                    <div className="flex flex-col gap-1 col-span-2">
                      <Label className="text-xs text-muted-foreground">Activity Level</Label>
                      <Select value={activity} onValueChange={setActivity}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Activity level" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Sedentary">Sedentary</SelectItem>
                          <SelectItem value="Lightly Active">Lightly Active</SelectItem>
                          <SelectItem value="Moderately Active">Moderately Active</SelectItem>
                          <SelectItem value="Very Active">Very Active</SelectItem>
                          <SelectItem value="Super Active">Super Active</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1 col-span-2">
                      <Label className="text-xs text-muted-foreground">Goal</Label>
                      <Select value={goal} onValueChange={(v) => { setGoal(v); setLoseRate(v === "gain" ? "gain_0_25kg" : "lose_0_25kg"); }}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Your goal" /></SelectTrigger>
                        <SelectContent>
                          {PRIMARY_GOALS.map(({ value, label, emoji }) => (
                            <SelectItem key={value} value={value}>{emoji} {label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {/* Rate sub-selector — shown when Lose Weight is selected */}
                      {goal === "lose" && (
                        <div className="mt-2 space-y-2">
                          <Label className="text-xs text-muted-foreground">Weight loss rate</Label>
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
                                  loseRate === value ? "border-accent" : "border-muted-foreground/40"
                                }`}
                              >
                                {loseRate === value && (
                                  <div className="h-2 w-2 rounded-full bg-accent" />
                                )}
                              </div>
                              <div>
                                <div className="font-medium text-sm">{label}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{detail}</div>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                      {/* Rate sub-selector — shown when Gain Muscle is selected */}
                      {goal === "gain" && (
                        <div className="mt-2 space-y-2">
                          <Label className="text-xs text-muted-foreground">Weight gain rate</Label>
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
                                  loseRate === value ? "border-accent" : "border-muted-foreground/40"
                                }`}
                              >
                                {loseRate === value && (
                                  <div className="h-2 w-2 rounded-full bg-accent" />
                                )}
                              </div>
                              <div>
                                <div className="font-medium text-sm">{label}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{detail}</div>
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
                    <InfoCell label="Height" value={`${profile.height_cm} cm`} />
                    <InfoCell label="Weight" value={`${profile.weight_kg} kg`} />
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-border">
                    <InfoCell label="BMI" value={String(profile.bmi)} />
                    <InfoCell label="BMR" value={`${profile.bmr} kcal`} />
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-border">
                    <InfoCell label="TDEE" value={`${profile.tdee} kcal`} />
                    <InfoCell label="Daily Target" value={`${profile.daily_calorie_target} kcal`} />
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

  /* ─── MENU PAGE ─── */
  const firstName = profile.full_name?.split(" ")[0] ?? "User";
  const phone = user.phone ?? user.user_metadata?.phone ?? "";

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Top bar */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur px-5 py-5 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 min-h-[44px] min-w-[44px] rounded-full flex-shrink-0"
          onClick={() => navigate({ to: "/dashboard" })}
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
          {MENU_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className="card-lift group flex flex-col justify-between rounded-2xl border border-border bg-card p-4 sm:p-5 text-left min-h-[96px] sm:min-h-[104px]"
            >
              <span className="text-muted-foreground group-hover:text-accent transition-colors mb-4 inline-block">
                {item.icon}
              </span>
              <div className="flex items-center justify-between w-full gap-2">
                <span className="text-[15px] sm:text-[17px] font-semibold leading-tight line-clamp-2">{item.label}</span>
                <ChevronRight className="h-5 w-5 text-muted-foreground/50 flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>

        {/* Sign out */}
        <Button
          variant="outline"
          className="mt-6 h-12 w-full gap-2 rounded-2xl font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={async () => {
            await signOut();
            navigate({ to: "/login" });
          }}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Button>

        {/* Social icons */}
        <div className="mt-8 flex items-center justify-center gap-6">
          {[
            { icon: <Instagram className="h-5 w-5" />, label: "Instagram" },
            { icon: <Linkedin className="h-5 w-5" />,  label: "LinkedIn" },
            { icon: <Facebook className="h-5 w-5" />,  label: "Facebook" },
            { icon: <Twitter className="h-5 w-5" />,   label: "Twitter" },
          ].map((s) => (
            <button
              key={s.label}
              aria-label={s.label}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-accent hover:text-accent transition-all"
            >
              {s.icon}
            </button>
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
  const plan = plans.find((p) => p.id === profile.selected_plan);
  const trialStart = profile.trial_start_date
    ? new Date(profile.trial_start_date + "T00:00:00")
    : null;
  const trialEnd = trialStart
    ? new Date(trialStart.getTime() + 2 * 24 * 60 * 60 * 1000)
    : null;
  const now = new Date();
  const trialDaysLeft = trialEnd
    ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
    : null;
  const trialActive = trialDaysLeft !== null && trialDaysLeft > 0;

  return (
    <div className="min-h-screen bg-background pb-24">
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
                    <h3 className="font-display text-xl font-bold">{plan.name}</h3>
                    <Badge
                      className={
                        trialActive
                          ? "bg-accent text-accent-foreground"
                          : "bg-warn/20 text-warn"
                      }
                    >
                      {trialActive ? "Trial active" : "Trial ended"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    ₹{plan.price}/month after trial
                  </p>
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
                      ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"}`
                      : (trialEnd?.toISOString().slice(0, 10) ?? "—")}
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                className="mt-4 w-full rounded-xl font-semibold"
                onClick={onPricing}
              >
                Change plan
              </Button>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <Tag className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="font-semibold">No plan selected yet</p>
              <p className="mx-auto mt-1 max-w-[240px] text-sm text-muted-foreground">
                Start a free 2-day trial — no credit card required.
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

        {/* Payment history */}
        <section>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Payment history
          </p>
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <ListOrdered className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-semibold">No payments yet</p>
            <p className="mx-auto mt-1 max-w-[260px] text-xs text-muted-foreground">
              Online payments are coming soon. You're on the free trial — enjoy
              full access meanwhile.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Settings
══════════════════════════════════════════════════════ */
function SettingsPage({
  userId,
  onBack,
  onTheme,
  onSignOut,
}: {
  userId: string;
  onBack: () => void;
  onTheme: () => void;
  onSignOut: () => Promise<void>;
}) {
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

  // Water prefs (shared with the WaterStreak widget)
  const [waterGoal, setWaterGoal] = useState(
    () => localStorage.getItem("waterDailyGoal") || "2500",
  );
  const [cupSize, setCupSize] = useState(
    () => localStorage.getItem("waterStep") || "250",
  );

  const [exporting, setExporting] = useState<"json" | "csv" | null>(null);

  // Account deletion (required by Google Play & App Store policies)
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      // 1. Remove progress photos from storage
      const { data: entries } = await supabase
        .from("weight_entries")
        .select("photo_url")
        .eq("user_id", userId)
        .not("photo_url", "is", null);
      const paths = (entries ?? [])
        .map((e: any) => {
          const tail = String(e.photo_url).split("/weight-photos/")[1];
          return tail ? tail.split("?")[0] : null;
        })
        .filter(Boolean) as string[];
      if (paths.length > 0) {
        await supabase.storage.from("weight-photos").remove(paths);
      }

      // 2. Delete every row that belongs to the user
      await Promise.all([
        supabase.from("food_logs").delete().eq("user_id", userId),
        supabase.from("workout_logs").delete().eq("user_id", userId),
        supabase.from("water_logs").delete().eq("user_id", userId),
        supabase.from("weight_entries").delete().eq("user_id", userId),
        supabase.from("saved_meals" as any).delete().eq("user_id", userId),
        supabase.from("workout_plans").delete().eq("user_id", userId),
      ]);
      await supabase.from("user_profiles").delete().eq("id", userId);

      toast.success("Your account and data have been deleted");
      setDeleteOpen(false);
      await onSignOut();
    } catch (e: any) {
      toast.error(e.message ?? "Deletion failed — please email support@dombelz.app");
    } finally {
      setDeleting(false);
    }
  };

  const saveMeals = () => {
    const clean = meals.map((m) => m.trim()).filter(Boolean);
    if (clean.length === 0) {
      toast.error("Keep at least one meal");
      return;
    }
    localStorage.setItem(`meal_prefs_${userId}`, JSON.stringify(clean));
    setMeals(clean);
    toast.success("Meal categories saved");
  };

  const saveWater = () => {
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
    localStorage.setItem("waterDailyGoal", String(goal));
    localStorage.setItem("waterStep", String(cup));
    toast.success("Water preferences saved");
  };

  const download = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = async () => {
    setExporting("json");
    try {
      const [profileRes, food, weightRes, workouts, water, savedMeals] =
        await Promise.all([
          supabase.from("user_profiles").select("*").eq("id", userId).maybeSingle(),
          supabase.from("food_logs").select("*").eq("user_id", userId).order("date"),
          supabase.from("weight_entries").select("*").eq("user_id", userId).order("date"),
          supabase.from("workout_logs").select("*").eq("user_id", userId).order("date"),
          supabase.from("water_logs").select("*").eq("user_id", userId).order("date"),
          supabase.from("saved_meals" as any).select("*").eq("user_id", userId),
        ]);
      const payload = {
        exported_at: new Date().toISOString(),
        profile: profileRes.data,
        food_logs: food.data ?? [],
        weight_entries: weightRes.data ?? [],
        workout_logs: workouts.data ?? [],
        water_logs: water.data ?? [],
        saved_meals: savedMeals.data ?? [],
      };
      download(
        JSON.stringify(payload, null, 2),
        `dombelz-export-${new Date().toISOString().slice(0, 10)}.json`,
        "application/json",
      );
      toast.success("Export downloaded");
    } catch (e: any) {
      toast.error(e.message ?? "Export failed");
    } finally {
      setExporting(null);
    }
  };

  const exportCSV = async () => {
    setExporting("csv");
    try {
      const { data, error } = await supabase
        .from("food_logs")
        .select("date,meal_type,food_name,quantity_g,calories,protein_g,carbs_g,fat_g,fiber_g")
        .eq("user_id", userId)
        .order("date");
      if (error) throw error;
      const rows = data ?? [];
      const esc = (v: unknown) => {
        const s = String(v ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header =
        "date,meal_type,food_name,quantity_g,calories,protein_g,carbs_g,fat_g,fiber_g";
      const body = rows
        .map((r: any) =>
          [
            r.date, r.meal_type, r.food_name, r.quantity_g,
            r.calories, r.protein_g, r.carbs_g, r.fat_g, r.fiber_g,
          ].map(esc).join(","),
        )
        .join("\n");
      download(
        `${header}\n${body}`,
        `dombelz-food-diary-${new Date().toISOString().slice(0, 10)}.csv`,
        "text/csv",
      );
      toast.success("Food diary downloaded");
    } catch (e: any) {
      toast.error(e.message ?? "Export failed");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <SubHeader title="Settings" onBack={onBack} />
      <main className="mx-auto max-w-lg space-y-6 px-4 py-6">
        {/* Appearance */}
        <section>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Appearance
          </p>
          <button
            onClick={onTheme}
            className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 transition-colors hover:bg-muted/40"
          >
            <span className="flex items-center gap-3 text-sm font-medium">
              <Palette className="h-5 w-5 text-accent" /> Theme
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
            <button
              onClick={exportJSON}
              disabled={exporting !== null}
              className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-muted/40 disabled:opacity-60"
            >
              <span className="flex items-center gap-3 text-sm font-medium">
                <Download className="h-5 w-5 text-accent" />
                Export everything (JSON)
              </span>
              {exporting === "json" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
              )}
            </button>
            <button
              onClick={exportCSV}
              disabled={exporting !== null}
              className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-muted/40 disabled:opacity-60"
            >
              <span className="flex items-center gap-3 text-sm font-medium">
                <Download className="h-5 w-5 text-accent" />
                Export food diary (CSV)
              </span>
              {exporting === "csv" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
              )}
            </button>
          </div>
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            Your data belongs to you. Exports include food, weight, workout, and
            water logs.
          </p>
        </section>

        {/* Account */}
        <section>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Account
          </p>
          <Button
            variant="outline"
            className="h-12 w-full gap-2 rounded-2xl font-semibold"
            onClick={onSignOut}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
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
        <Dialog open={deleteOpen} onOpenChange={(o) => !deleting && setDeleteOpen(o)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" /> Delete everything?
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This permanently deletes all your Dombelz data — profile,
                logs, photos, plans, and favorites. Consider exporting your
                data first. Type{" "}
                <span className="font-mono font-bold text-destructive">DELETE</span>{" "}
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
                Your login credential is removed from our auth system within 30
                days of this request.
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
    <div className="min-h-screen bg-background pb-24">
      <SubHeader title="Help & support" onBack={onBack} />
      <main className="mx-auto max-w-lg space-y-6 px-4 py-6">
        <section>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Frequently asked questions
          </p>
          <div className="rounded-2xl border border-border bg-card px-4">
            <Accordion type="single" collapsible className="w-full">
              {FAQS.map((f, i) => (
                <AccordionItem
                  key={i}
                  value={`faq-${i}`}
                  className={i === FAQS.length - 1 ? "border-b-0" : ""}
                >
                  <AccordionTrigger className="text-left text-sm font-semibold">
                    {f.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                    {f.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        <section>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Still stuck?
          </p>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            <a
              href="mailto:support@dombelz.app?subject=Dombelz%20support%20request"
              className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-muted/40"
            >
              <span className="flex items-center gap-3 text-sm font-medium">
                <Mail className="h-5 w-5 text-accent" /> Email support
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
            </a>
            <a
              href="mailto:support@dombelz.app?subject=Dombelz%20bug%20report&body=What%20happened%3A%0A%0ASteps%20to%20reproduce%3A%0A%0ADevice%20%2F%20browser%3A"
              className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-muted/40"
            >
              <span className="flex items-center gap-3 text-sm font-medium">
                <Bug className="h-5 w-5 text-accent" /> Report a bug
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
            </a>
          </div>
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            We usually reply within 1–2 business days.
          </p>
        </section>

        <section>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Legal
          </p>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            <a
              href="/privacy"
              className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-muted/40"
            >
              <span className="text-sm font-medium">Privacy Policy</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
            </a>
            <a
              href="/terms"
              className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-muted/40"
            >
              <span className="text-sm font-medium">Terms of Service</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   About
══════════════════════════════════════════════════════ */
function AboutPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-background pb-24">
      <SubHeader title="About us" onBack={onBack} />
      <main className="mx-auto max-w-lg space-y-6 px-4 py-6">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 text-center">
          <div className="pointer-events-none absolute -top-16 left-1/2 h-40 w-72 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
          <div className="relative">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-accent-foreground glow-accent-sm">
              <Activity className="h-8 w-8" />
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
              { icon: <Camera className="h-5 w-5" />, label: "AI photo & voice logging" },
              { icon: <Utensils className="h-5 w-5" />, label: "IFCT 2017 Indian food data" },
              { icon: <Dumbbell className="h-5 w-5" />, label: "300+ exercise library" },
              { icon: <Trophy className="h-5 w-5" />, label: "Streaks & leaderboard" },
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
            <InfoRow label="Nutrition data" value="IFCT 2017 + Open Food Facts" />
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
   Invite friends (was "Refer & save more")
══════════════════════════════════════════════════════ */
function ReferPage({ userId, onBack }: { userId: string; onBack: () => void }) {
  const code = userId.replace(/-/g, "").slice(0, 8).toUpperCase();
  const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/quiz?ref=${code}`;
  const shareText = "I'm tracking my fitness with Dombelz — AI food logging that takes 10 seconds a meal. Join me:";
  const fullShareMessage = `${shareText} ${shareUrl}`;

  const copy = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(msg);
    } catch {
      toast.error("Couldn't copy — select and copy manually");
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join me on Dombelz",
          text: shareText,
          url: shareUrl,
        });
      } catch {
        /* user cancelled */
      }
    } else {
      copy(fullShareMessage, "Invite message copied!");
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <SubHeader title="Invite friends" onBack={onBack} />
      <main className="mx-auto max-w-lg space-y-6 px-4 py-6">
        <div className="relative overflow-hidden rounded-2xl border border-accent/30 bg-card p-6 text-center">
          <div className="pointer-events-none absolute -top-20 left-1/2 h-48 w-80 -translate-x-1/2 rounded-full bg-accent/15 blur-3xl" />
          <div className="relative">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15 text-accent">
              <Gift className="h-8 w-8" />
            </div>
            <h2 className="font-display text-xl font-bold">
              Training is better together
            </h2>
            <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
              Invite friends to Dombelz and battle it out on the leaderboard.
            </p>

            <div className="mt-6">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Your invite code
              </p>
              <button
                onClick={() => copy(code, "Code copied!")}
                className="group inline-flex items-center gap-3 rounded-2xl border-2 border-dashed border-accent/50 bg-accent/5 px-6 py-3 transition-colors hover:border-accent"
              >
                <span className="font-display text-2xl font-bold tracking-[0.25em] text-accent">
                  {code}
                </span>
                <Copy className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-accent" />
              </button>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={share}
                className="h-12 flex-1 gap-2 rounded-xl bg-accent font-bold text-accent-foreground hover:bg-accent/90"
              >
                <Share2 className="h-4 w-4" /> Share invite
              </Button>
              <Button
                variant="outline"
                onClick={() => copy(shareUrl, "Link copied!")}
                className="h-12 flex-1 gap-2 rounded-xl font-semibold"
              >
                <Copy className="h-4 w-4" /> Copy link
              </Button>
            </div>
          </div>
        </div>

        <section>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            How it works
          </p>
          <div className="space-y-3">
            {[
              { n: "1", text: "Share your invite link with a training partner." },
              { n: "2", text: "They take the quiz and create their account." },
              { n: "3", text: "Find each other on the leaderboard and compete on streaks." },
            ].map((s) => (
              <div
                key={s.n}
                className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 font-display text-sm font-bold text-accent">
                  {s.n}
                </span>
                <p className="text-sm text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Sub-components
══════════════════════════════════════════════════════ */

function SubHeader({
  title,
  onBack,
  action,
}: {
  title: string;
  onBack: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

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
      <span className={`text-sm font-medium text-right max-w-[55%] truncate ${mono ? "font-mono text-xs" : ""}`}>
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
